import { useCallback, useEffect, useRef, useState } from 'react';
import { rerouteFrom } from '../api/api';
import { speak, stopVoice } from '../nav/voice';
import {
  buildRoute, snapToRoute, pointAt, distM, instructionText, safeSpeedForDistance,
  briefingText, incidentText, overspeedText, trainText, breakText, continueText, eventText, schoolText, schoolActiveAt, PHRASES,
} from '../nav/navEngine';

const OFF_ROUTE_M = 45;          // sideways distance that counts as "left the road"
const OFF_ROUTE_FIXES = 3;       // consecutive fixes before rerouting
const REROUTE_COOLDOWN_MS = 15000;
const INCIDENT_WARN_M = 2000;
const TRAIN_WARN_M = 3000;
const TRAIN_WINDOW_MIN = 15;
const BREAK_EVERY_SEC = 2 * 3600;
const ARRIVE_M = 30;

function parseClock(str) {
  const m = String(str || '').replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins === 0 ? null : mins; // "00:00:00" marks "no time" in the dataset
}

const clockLabel = (mins) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/* Put incidents and train stops onto the route as "distance along the route" */
function projectIncidents(route, accidents) {
  return (accidents || [])
    .filter((a) => isFinite(a.lat) && isFinite(a.lon))
    .map((a) => ({ ...a, snap: snapToRoute(route, { lat: a.lat, lon: a.lon }) }))
    .filter((a) => a.snap && a.snap.d <= 150)
    .map((a) => ({ id: a.id, type: a.type, lat: a.lat, lon: a.lon, s: a.snap.s, description: a.description }));
}

function projectTrainStops(route, trains) {
  const out = [];
  (trains || []).forEach((t) => {
    (t.stops || []).forEach((stop) => {
      if (!isFinite(stop.lat) || !isFinite(stop.lon)) return;
      const time = parseClock(stop.departure) ?? parseClock(stop.arrival);
      if (time == null) return;
      const snap = snapToRoute(route, { lat: stop.lat, lon: stop.lon });
      if (!snap || snap.d > 1500) return;
      out.push({
        key: `${t.train_no}-${stop.station_code}`, trainName: t.train_name, station: stop.station,
        lat: stop.lat, lon: stop.lon, s: snap.s, time,
      });
    });
  });
  return out;
}

/* Festival zones: where along the route we enter each crowd circle */
function projectEvents(route, events) {
  return (events || [])
    .filter((ev) => isFinite(ev.lat) && isFinite(ev.lon))
    .map((ev) => {
      const snap = snapToRoute(route, { lat: ev.lat, lon: ev.lon });
      const r = (ev.radius_km || 1) * 1000;
      if (!snap || snap.d > r) return null;
      const halfChord = Math.sqrt(r * r - snap.d * snap.d);
      return {
        id: ev.id, name: ev.name, location: ev.location_name || 'the route', until: ev.end_time || null,
        lat: ev.lat, lon: ev.lon, radiusM: r, impact: ev.impact,
        sIn: Math.max(0, snap.s - halfChord), sOut: snap.s + halfChord,
      };
    })
    .filter(Boolean);
}

/* School zones: where along the route we enter and leave each circle */
function projectSchools(route, zones) {
  return (zones || [])
    .filter((z) => isFinite(z.lat) && isFinite(z.lon))
    .map((z) => {
      const snap = snapToRoute(route, { lat: z.lat, lon: z.lon });
      const r = z.radius_m || 300;
      if (!snap || snap.d > r) return null;
      const halfChord = Math.sqrt(r * r - snap.d * snap.d);
      return { ...z, radiusM: r, sIn: Math.max(0, snap.s - halfChord), sOut: snap.s + halfChord };
    })
    .filter(Boolean);
}

const IDLE = { status: 'idle' };

export default function useNavigation({ predictionData, destinationName, accidents, trains, events, schools }) {
  const [nav, setNav] = useState(IDLE);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('nav_lang') || 'en'; } catch { return 'en'; } });
  const [muted, setMuted] = useState(false);
  const [demoKmh, setDemoKmh] = useState(50);
  const [demoFast, setDemoFast] = useState(4);
  const [speedLimit, setSpeedLimit] = useState(80);

  const langRef = useRef(lang);
  const mutedRef = useRef(muted);
  const demoRef = useRef({ kmh: demoKmh, fast: demoFast });
  const limitRef = useRef(speedLimit);
  useEffect(() => { langRef.current = lang; try { localStorage.setItem('nav_lang', lang); } catch { /* private mode */ } }, [lang]);
  useEffect(() => { mutedRef.current = muted; if (muted) stopVoice(); }, [muted]);
  useEffect(() => { demoRef.current = { kmh: demoKmh, fast: demoFast }; }, [demoKmh, demoFast]);
  useEffect(() => { limitRef.current = speedLimit; }, [speedLimit]);

  const routeRef = useRef(null);
  const st = useRef(null);         // mutable engine state for the running trip
  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const wakeRef = useRef(null);
  const inputsRef = useRef({ accidents, trains, events, schools });
  inputsRef.current = { accidents, trains, events, schools };

  const say = useCallback((textFor, opts) => {
    if (mutedRef.current) return;
    speak(textFor(langRef.current), langRef.current, opts);
  }, []);

  const teardown = useCallback(() => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (wakeRef.current) { wakeRef.current.release().catch(() => {}); wakeRef.current = null; }
  }, []);

  const loadRoute = useCallback((raw) => {
    const route = buildRoute(raw.points, raw.instructions, raw.travel_time_min);
    routeRef.current = route;
    const s = st.current;
    s.routeVersion += 1;
    s.s = 0;
    s.offCount = 0;
    s.prevInsId = null;
    s.announced = new Set();
    s.incidents = projectIncidents(route, inputsRef.current.accidents);
    s.trainStops = projectTrainStops(route, inputsRef.current.trains);
    s.eventZones = projectEvents(route, inputsRef.current.events);
    s.schoolZones = projectSchools(route, inputsRef.current.schools);
    return route;
  }, []);

  /* Re-project when the 30-second accident poll brings new incidents */
  useEffect(() => {
    if (routeRef.current && st.current) st.current.incidents = projectIncidents(routeRef.current, accidents);
  }, [accidents]);
  useEffect(() => {
    if (routeRef.current && st.current) st.current.trainStops = projectTrainStops(routeRef.current, trains);
  }, [trains]);

  const finish = useCallback(() => {
    const s = st.current;
    teardown();
    say((l) => instructionText({ maneuver: 'ARRIVE' }, l, null), { urgent: true });
    const virtMin = s.virtSec / 60;
    const report = {
      predictedMin: s.predictedMin,
      actualMin: virtMin,
      distanceKm: s.distTravelled / 1000,
      avgKmh: s.virtSec > 0 ? (s.distTravelled / s.virtSec) * 3.6 : 0,
      maxKmh: s.maxKmh,
      overspeedWarnings: s.overspeedWarnings,
      reroutes: s.reroutes,
      incidentsWarned: s.incidentAnnounced.size,
      trainsWarned: s.trainAnnounced.size,
      eventsWarned: s.eventAnnounced.size,
      schoolsWarned: s.schoolAnnounced.size,
      demo: s.mode === 'demo',
    };
    setNav((n) => ({ ...n, status: 'arrived', report, banner: null, remaining: 0, progress: 100 }));
  }, [say, teardown]);

  const reroute = useCallback(async (pos) => {
    const s = st.current;
    s.rerouting = true;
    s.lastReroute = Date.now();
    setNav((n) => ({ ...n, status: 'rerouting' }));
    say((l) => PHRASES.rerouting[l], { urgent: true });
    try {
      const raw = await rerouteFrom(pos.lat, pos.lon, s.destination);
      if (st.current !== s) return; // trip ended meanwhile
      if (raw?.points?.length > 1) {
        loadRoute(raw);
        s.reroutes += 1;
        say((l) => PHRASES.rerouted[l]);
      }
    } catch (err) {
      console.error('Reroute failed:', err);
    } finally {
      if (st.current === s) {
        s.rerouting = false;
        s.lastReroute = Date.now();
        setNav((n) => (n.status === 'rerouting' ? { ...n, status: 'navigating' } : n));
      }
    }
  }, [loadRoute, say]);

  /* =============================================
     ONE POSITION FIX -> everything the driver sees and hears
     ============================================= */
  const handleFix = useCallback((fix) => {
    const s = st.current;
    const route = routeRef.current;
    if (!s || !route || s.done) return;
    const pos = { lat: fix.lat, lon: fix.lon };
    const dt = Math.max(0, Math.min(fix.dt ?? 1, 30));

    // Speed: trust the GPS when it reports one, else derive it from movement
    let mps = fix.speedMps;
    const moved = s.prevPos ? distM(s.prevPos, pos) : 0;
    if (mps == null || !isFinite(mps)) mps = dt > 0 ? moved / dt : 0;
    s.kmh = s.kmh == null ? mps * 3.6 : s.kmh * 0.5 + mps * 3.6 * 0.5;
    s.prevPos = pos;
    s.virtSec += dt;
    if (moved < 200) s.distTravelled += moved;
    if (mps > 1.5) s.drivingSec += dt;
    s.maxKmh = Math.max(s.maxKmh, s.kmh);

    const snap = snapToRoute(route, pos, s.firstFix ? null : s.s);
    if (!snap) return;

    // Off-route detection (only with a usable live GPS fix)
    const goodFix = (fix.accuracy ?? 999) <= 100;
    if (s.mode === 'gps' && goodFix && !s.rerouting) {
      const far = snap.d > Math.max(OFF_ROUTE_M, fix.accuracy || 0);
      s.offCount = far ? s.offCount + 1 : 0;
      const startFarAway = s.firstFix && snap.d > 300;
      if ((startFarAway || s.offCount >= OFF_ROUTE_FIXES) && Date.now() - s.lastReroute > REROUTE_COOLDOWN_MS) {
        s.firstFix = false;
        reroute(pos);
        return;
      }
    }
    s.firstFix = false;
    if (snap.d <= 80 || s.mode === 'demo') s.s = snap.s;

    const v = Math.max(mps, 0);
    const remaining = Math.max(0, route.total - s.s);
    if (remaining <= ARRIVE_M) { s.done = true; finish(); return; }

    // Next maneuver ahead of us
    const ins = route.instructions;
    const nextIdx = ins.findIndex((i) => i.offset > s.s + 3);
    const next = nextIdx >= 0 ? ins[nextIdx] : ins[ins.length - 1];
    const then = nextIdx >= 0 ? ins[nextIdx + 1] || null : null;
    const toNext = Math.max(0, next.offset - s.s);

    // Turn-by-turn voice: far (1 km on fast roads), near (~12 s away), now
    const key = `${s.routeVersion}:${next.id}`;
    if (s.prevInsId !== null && s.prevInsId !== next.id && toNext > 1500 && !s.announced.has(`${key}:cont`)) {
      s.announced.add(`${key}:cont`);
      say((l) => continueText(l, toNext));
    }
    s.prevInsId = next.id;
    const nowM = Math.max(30, v * 4);
    const nearM = Math.max(200, v * 12);
    let stage = null;
    if (toNext <= nowM) stage = 'now';
    else if (toNext <= nearM) stage = 'near';
    else if (toNext <= 1000 && toNext > 600 && v > 8) stage = 'far';
    if (stage && !s.announced.has(`${key}:${stage}`)) {
      // Mark this stage and every farther one, so a skipped prompt never plays late
      const order = ['far', 'near', 'now'];
      order.slice(0, order.indexOf(stage) + 1).forEach((x) => s.announced.add(`${key}:${x}`));
      if (next.maneuver !== 'ARRIVE' || stage !== 'now') {
        say((l) => instructionText(next, l, stage === 'now' ? null : toNext), { urgent: stage !== 'far' });
      }
    }

    // Extra 1: incidents ahead + safe speed
    let safeLimit = null;
    let banner = null;
    s.incidents.forEach((inc) => {
      const ahead = inc.s - s.s;
      if (ahead > -100 && ahead <= INCIDENT_WARN_M) {
        const lim = safeSpeedForDistance(Math.max(ahead, 0));
        safeLimit = safeLimit == null ? lim : Math.min(safeLimit, lim);
        if (ahead > 0 && !banner) banner = { kind: inc.type === 'Accident' ? 'danger' : 'warn', icon: inc.type === 'Accident' ? 'fa-car-burst' : 'fa-triangle-exclamation', ahead, type: inc.type, limit: lim };
        if (ahead > 0 && !s.incidentAnnounced.has(inc.id)) {
          s.incidentAnnounced.add(inc.id);
          say((l) => incidentText(l, inc.type, ahead, lim));
        }
      }
    });

    // Extra 1b: school zones, only inside bell times (checked against the trip clock)
    let schoolBanner = null;
    const tripNow = new Date(s.startMs + s.virtSec * 1000);
    s.schoolZones.forEach((z) => {
      const key = `${s.routeVersion}:${z.id}`;
      if (s.s > z.sOut) {
        if (s.schoolInside.has(key)) {
          s.schoolInside.delete(key);
          say((l) => PHRASES.schoolEnd[l]);
        }
        return;
      }
      if (!schoolActiveAt(z, tripNow)) return;
      const ahead = z.sIn - s.s;
      if (ahead > Math.max(300, v * 15)) return;
      if (!s.schoolAnnounced.has(key)) {
        s.schoolAnnounced.add(key);
        say((l) => schoolText(l, z.speed_limit), { urgent: true });
      }
      if (ahead <= 0) {
        s.schoolInside.add(key);
        safeLimit = safeLimit == null ? z.speed_limit : Math.min(safeLimit, z.speed_limit);
      }
      if (!schoolBanner) schoolBanner = { name: z.name, speed: z.speed_limit, ahead: Math.max(0, ahead) };
    });

    // Extra 2: over-speed warning against the safe limit / chosen limit
    const limits = [safeLimit, limitRef.current || null].filter((x) => x != null);
    const limit = limits.length ? Math.min(...limits) : null;
    if (limit != null && s.kmh > limit + 5) {
      s.overCount += 1;
      if (s.overCount >= 2 && s.virtSec - s.lastOverspeed > 20) {
        s.lastOverspeed = s.virtSec;
        s.overspeedWarnings += 1;
        say((l) => overspeedText(l, limit));
      }
    } else s.overCount = 0;

    // Extra 3: a train due at a station near the road when we get there
    const routeMps = route.total / Math.max(60, route.timeMin * 60);
    const clockNow = s.clockStartMin + s.virtSec / 60;
    let trainBanner = null;
    s.trainStops.forEach((stop) => {
      const ahead = stop.s - s.s;
      if (ahead <= 0 || ahead > TRAIN_WARN_M) return;
      const etaMin = clockNow + ahead / Math.max(v, routeMps) / 60;
      let diff = Math.abs((etaMin % 1440) - stop.time);
      diff = Math.min(diff, 1440 - diff);
      if (diff > TRAIN_WINDOW_MIN) return;
      trainBanner = { trainName: stop.trainName, station: stop.station, time: clockLabel(stop.time), ahead };
      if (!s.trainAnnounced.has(stop.key)) {
        s.trainAnnounced.add(stop.key);
        say((l) => trainText(l, { trainName: stop.trainName, station: stop.station, time: clockLabel(stop.time) }));
      }
    });

    // Extra 4: festival / market crowd zones from our events calendar
    let eventBanner = null;
    s.eventZones.forEach((z) => {
      const ahead = z.sIn - s.s;
      if (s.s > z.sOut || ahead > 1500) return;
      if (!eventBanner) eventBanner = { name: z.name, location: z.location, until: z.until, ahead: Math.max(0, ahead), impact: z.impact };
      if (!s.eventAnnounced.has(z.id)) {
        s.eventAnnounced.add(z.id);
        say((l) => eventText(l, z));
      }
    });

    // Extra 5: break reminder
    if (s.drivingSec >= s.nextBreakAt) {
      say((l) => breakText(l, Math.round(s.nextBreakAt / 3600)));
      s.nextBreakAt += BREAK_EVERY_SEC;
    }

    const remainingMin = route.timeMin * (remaining / Math.max(route.total, 1));
    const heading = fix.heading != null && isFinite(fix.heading) && v > 2 ? fix.heading : pointAt(route, s.s).heading;
    const upcoming = ins.filter((i) => i.offset > s.s + 3).slice(0, 8).map((i) => ({ ...i, dist: i.offset - s.s }));

    setNav((n) => ({
      ...n,
      status: s.rerouting ? 'rerouting' : 'navigating',
      pos, heading, accuracy: fix.accuracy,
      speedKmh: s.kmh,
      s: s.s, seg: snap.seg,
      routePts: route.pts, routeVersion: s.routeVersion,
      next, then, toNext, upcoming,
      remaining, remainingMin,
      arrivalClock: clockLabel(clockNow + remainingMin),
      progress: Math.min(100, Math.round((1 - remaining / Math.max(route.total, 1)) * 100)),
      banner, trainBanner, eventBanner, schoolBanner, safeLimit, limit,
      incidents: s.incidents, trainStops: s.trainStops, eventZones: s.eventZones, schoolZones: s.schoolZones,
      weakGps: s.mode === 'gps' && !goodFix,
    }));
  }, [finish, reroute, say]);

  /* =============================================
     START / STOP
     ============================================= */
  const start = useCallback((mode) => {
    const raw = predictionData?.route;
    if (!raw?.points?.length) return;
    teardown();
    stopVoice();
    const last = raw.points[raw.points.length - 1];
    const now = new Date();
    st.current = {
      mode, routeVersion: 0, s: 0, offCount: 0, rerouting: false, lastReroute: 0, firstFix: true, done: false,
      announced: new Set(), incidentAnnounced: new Set(), trainAnnounced: new Set(), eventAnnounced: new Set(),
      schoolAnnounced: new Set(), schoolInside: new Set(), startMs: now.getTime(),
      incidents: [], trainStops: [], eventZones: [], schoolZones: [],
      prevPos: null, prevInsId: null, kmh: null, maxKmh: 0, virtSec: 0, drivingSec: 0, distTravelled: 0,
      overCount: 0, lastOverspeed: -999, overspeedWarnings: 0, reroutes: 0, nextBreakAt: BREAK_EVERY_SEC,
      clockStartMin: now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60,
      destination: { lat: last.latitude, lon: last.longitude },
      predictedMin: raw.travel_time_min,
    };
    const route = loadRoute(raw);
    const startPt = pointAt(route, 0);
    setNav({
      status: mode === 'gps' ? 'locating' : 'navigating', mode,
      pos: { lat: startPt.lat, lon: startPt.lon }, heading: startPt.heading, speedKmh: 0,
      routePts: route.pts, routeVersion: 1, s: 0, seg: 0,
      next: route.instructions[1] || route.instructions[0], then: route.instructions[2] || null,
      toNext: route.instructions[1]?.offset ?? 0,
      upcoming: route.instructions.slice(1, 9).map((i) => ({ ...i, dist: i.offset })),
      remaining: route.total, remainingMin: route.timeMin, progress: 0,
      incidents: st.current.incidents, trainStops: st.current.trainStops, eventZones: st.current.eventZones,
      schoolZones: st.current.schoolZones,
    });

    say((l) => briefingText(l, {
      destination: destinationName || 'your destination',
      distanceKm: route.total / 1000,
      minutes: route.timeMin,
      level: predictionData.traffic_prediction,
      cause: predictionData.cause_analysis?.main_cause,
    }));

    if (navigator.wakeLock?.request) navigator.wakeLock.request('screen').then((w) => { wakeRef.current = w; }).catch(() => {});

    if (mode === 'demo') {
      let simS = 0;
      timerRef.current = setInterval(() => {
        const r = routeRef.current;
        const { kmh, fast } = demoRef.current;
        simS = Math.min(r.total, simS + (kmh / 3.6) * fast);
        const p = pointAt(r, simS);
        handleFix({ lat: p.lat, lon: p.lon, speedMps: kmh / 3.6, heading: p.heading, accuracy: 5, dt: fast });
      }, 1000);
      return;
    }

    if (!navigator.geolocation) {
      setNav((n) => ({ ...n, status: 'error', error: 'This browser has no GPS / location support. Use Demo drive instead.' }));
      return;
    }
    let lastTs = null;
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const dt = lastTs ? (p.timestamp - lastTs) / 1000 : 1;
        lastTs = p.timestamp;
        handleFix({
          lat: p.coords.latitude, lon: p.coords.longitude,
          speedMps: p.coords.speed, heading: p.coords.heading, accuracy: p.coords.accuracy, dt,
        });
      },
      (err) => {
        const msg = err.code === 1
          ? 'Location permission was denied. Allow location for this site in the browser, or use Demo drive.'
          : 'Could not get your GPS position. Move to open sky, or use Demo drive.';
        setNav((n) => ({ ...n, status: n.status === 'locating' ? 'error' : n.status, error: msg }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }, [predictionData, destinationName, handleFix, loadRoute, say, teardown]);

  const stop = useCallback(() => {
    teardown();
    stopVoice();
    st.current = null;
    routeRef.current = null;
    setNav(IDLE);
  }, [teardown]);

  useEffect(() => () => { teardown(); stopVoice(); }, [teardown]);

  return {
    nav, start, stop,
    lang, setLang, muted, setMuted,
    demoKmh, setDemoKmh, demoFast, setDemoFast,
    speedLimit, setSpeedLimit,
    repeat: () => {
      if (nav.next) say((l) => instructionText(nav.next, l, nav.toNext > 30 ? nav.toNext : null), { urgent: true });
    },
  };
}
