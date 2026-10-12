/* =============================================
   NAVIGATION ENGINE
   Pure route math + bilingual (English / Tamil) instruction phrases.
   No React here so it can be reasoned about and tested on its own.
   ============================================= */

const R = 6371000; // Earth radius, metres
const toRad = (d) => (d * Math.PI) / 180;

export function distM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearing(a, b) {
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* =============================================
   MANEUVERS: icon + English + Tamil wording
   ============================================= */
const MANEUVERS = {
  DEPART:        { icon: 'fa-location-arrow', en: 'Head out',            ta: 'பயணத்தை தொடங்கவும்' },
  STRAIGHT:      { icon: 'fa-arrow-up',       en: 'Continue straight',   ta: 'நேராக செல்லவும்' },
  FOLLOW:        { icon: 'fa-arrow-up',       en: 'Follow the road',     ta: 'சாலையை பின்பற்றி செல்லவும்' },
  TURN_LEFT:     { icon: 'fa-arrow-left',     en: 'Turn left',           ta: 'இடதுபுறம் திரும்பவும்' },
  TURN_RIGHT:    { icon: 'fa-arrow-right',    en: 'Turn right',          ta: 'வலதுபுறம் திரும்பவும்' },
  SHARP_LEFT:    { icon: 'fa-arrow-left',     en: 'Take a sharp left',   ta: 'கூர்மையாக இடதுபுறம் திரும்பவும்' },
  SHARP_RIGHT:   { icon: 'fa-arrow-right',    en: 'Take a sharp right',  ta: 'கூர்மையாக வலதுபுறம் திரும்பவும்' },
  BEAR_LEFT:     { icon: 'fa-arrow-up-long',  en: 'Bear left',           ta: 'சற்று இடதுபுறமாக செல்லவும்', tilt: -35 },
  BEAR_RIGHT:    { icon: 'fa-arrow-up-long',  en: 'Bear right',          ta: 'சற்று வலதுபுறமாக செல்லவும்', tilt: 35 },
  KEEP_LEFT:     { icon: 'fa-arrow-up-long',  en: 'Keep left',           ta: 'இடதுபுறமாகவே செல்லவும்', tilt: -25 },
  KEEP_RIGHT:    { icon: 'fa-arrow-up-long',  en: 'Keep right',          ta: 'வலதுபுறமாகவே செல்லவும்', tilt: 25 },
  MAKE_UTURN:    { icon: 'fa-rotate-left',    en: 'Make a U-turn',       ta: 'யூ-டர்ன் எடுக்கவும்' },
  TRY_MAKE_UTURN:{ icon: 'fa-rotate-left',    en: 'Make a U-turn when possible', ta: 'முடிந்தவுடன் யூ-டர்ன் எடுக்கவும்' },
  ROUNDABOUT:    { icon: 'fa-arrows-spin',    en: 'At the roundabout',   ta: 'ரவுண்டானாவில்' },
  TAKE_EXIT:     { icon: 'fa-arrow-up-right-from-square', en: 'Take the exit', ta: 'வெளியேறும் வழியில் செல்லவும்' },
  ENTER_HIGHWAY: { icon: 'fa-road',           en: 'Join the highway',    ta: 'நெடுஞ்சாலையில் இணையவும்' },
  SWITCH_ROAD:   { icon: 'fa-code-branch',    en: 'Switch to the other road', ta: 'மற்ற சாலைக்கு மாறவும்' },
  ARRIVE:        { icon: 'fa-flag-checkered', en: 'You have arrived at your destination', ta: 'நீங்கள் சேருமிடத்தை அடைந்துவிட்டீர்கள்' },
};

// TomTom has ~40 maneuver codes; fold them into the groups above
function normalizeManeuver(code = '') {
  const c = code.toUpperCase();
  if (MANEUVERS[c]) return c;
  if (c.startsWith('ARRIVE')) return 'ARRIVE';
  if (c.startsWith('ROUNDABOUT')) return 'ROUNDABOUT';
  if (c.includes('EXIT')) return 'TAKE_EXIT';
  if (c.startsWith('ENTER_') || c.includes('MOTORWAY') || c.includes('FREEWAY') || c.includes('HIGHWAY')) return 'ENTER_HIGHWAY';
  if (c.startsWith('SWITCH')) return 'SWITCH_ROAD';
  if (c.includes('UTURN')) return 'MAKE_UTURN';
  return 'STRAIGHT';
}

export function maneuverInfo(m) {
  return MANEUVERS[m] || MANEUVERS.STRAIGHT;
}

function ordinalEn(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* Rounded distance the way a driver hears it: 50 m steps, then km */
export function spokenDistance(m, lang) {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    return lang === 'ta' ? `${km} கிலோமீட்டரில், ` : `In ${km} kilometre${km === 1 ? '' : 's'}, `;
  }
  const rounded = Math.max(50, Math.round(m / 50) * 50);
  return lang === 'ta' ? `${rounded} மீட்டரில், ` : `In ${rounded} metres, `;
}

export function formatDistance(m) {
  if (m == null || !isFinite(m)) return '--';
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.max(0, Math.round(m / 10) * 10)} m`;
}

/* Text for one instruction.  distance = null means "do it now". */
export function instructionText(ins, lang, distance = undefined) {
  const info = maneuverInfo(ins.maneuver);
  const street = ins.street || (ins.roadNumbers && ins.roadNumbers[0]) || '';

  if (ins.maneuver === 'ARRIVE') {
    if (distance === undefined || distance === null) return info[lang];
    return lang === 'ta' ? `${spokenDistance(distance, 'ta')}நீங்கள் சேருமிடத்தை அடைவீர்கள்` : `${spokenDistance(distance, 'en')}you will arrive at your destination`;
  }

  let action;
  if (ins.maneuver === 'ROUNDABOUT' && ins.exit) {
    action = lang === 'ta'
      ? `ரவுண்டானாவில் ${ins.exit}-வது வெளியேறும் வழியில் செல்லவும்`
      : `At the roundabout, take the ${ordinalEn(ins.exit)} exit`;
  } else if (lang === 'ta') {
    action = street ? `${street} சாலையில் ${info.ta}` : info.ta;
  } else {
    action = info.en;
    if (street) action += ins.maneuver === 'STRAIGHT' || ins.maneuver === 'FOLLOW' ? ` on ${street}` : ` onto ${street}`;
  }

  if (distance === undefined) return action;
  if (distance === null) return lang === 'ta' ? `இப்போது ${action}` : `${action} now`;
  const prefix = spokenDistance(distance, lang);
  return lang === 'ta' ? prefix + action : prefix + action.charAt(0).toLowerCase() + action.slice(1);
}

/* =============================================
   ROUTE MODEL
   ============================================= */
export function buildRoute(rawPoints, rawInstructions, travelTimeMin) {
  const pts = (rawPoints || [])
    .map((p) => ({ lat: p.latitude ?? p.lat, lon: p.longitude ?? p.lon }))
    .filter((p) => isFinite(p.lat) && isFinite(p.lon));

  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 0;

  let instructions = (rawInstructions || []).map((ins) => ({
    offset: ins.offset_m ?? cum[Math.min(ins.point_index || 0, cum.length - 1)] ?? 0,
    idx: ins.point_index || 0,
    maneuver: normalizeManeuver(ins.maneuver),
    street: ins.street || '',
    roadNumbers: ins.road_numbers || [],
    exit: ins.exit_number || null,
  }));

  if (instructions.length < 2) instructions = deriveInstructions(pts, cum);
  // Always end with an arrival step at the true end of the line
  if (!instructions.length || instructions[instructions.length - 1].maneuver !== 'ARRIVE') {
    instructions.push({ offset: total, idx: pts.length - 1, maneuver: 'ARRIVE', street: '', roadNumbers: [], exit: null });
  }
  instructions.forEach((ins, i) => { ins.id = i; });

  return { pts, cum, total, instructions, timeMin: travelTimeMin || (total / 1000 / 40) * 60 };
}

/* Fallback when the routing API returns no guidance: read turns off the line's shape */
function deriveInstructions(pts, cum) {
  const out = [{ offset: 0, idx: 0, maneuver: 'DEPART', street: '', roadNumbers: [], exit: null }];
  const look = 40; // metres before/after a vertex used to measure the angle
  let lastOffset = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] - lastOffset < 80) continue;
    let a = i; while (a > 0 && cum[i] - cum[a] < look) a--;
    let b = i; while (b < pts.length - 1 && cum[b] - cum[i] < look) b++;
    let diff = bearing(pts[i], pts[b]) - bearing(pts[a], pts[i]);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const abs = Math.abs(diff);
    if (abs < 30) continue;
    const right = diff > 0;
    const maneuver = abs > 150 ? 'MAKE_UTURN' : abs > 110 ? (right ? 'SHARP_RIGHT' : 'SHARP_LEFT') : abs > 55 ? (right ? 'TURN_RIGHT' : 'TURN_LEFT') : (right ? 'BEAR_RIGHT' : 'BEAR_LEFT');
    out.push({ offset: cum[i], idx: i, maneuver, street: '', roadNumbers: [], exit: null });
    lastOffset = cum[i];
  }
  return out;
}

/* Project a position onto the route line.
   Returns distance along the route (s), sideways distance (d) and the segment. */
export function snapToRoute(route, pos, prevS = null) {
  const { pts, cum } = route;
  if (pts.length < 2) return null;
  const kx = Math.cos(toRad(pos.lat)) * 111320;
  const ky = 110540;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = (pts[i].lon - pos.lon) * kx, ay = (pts[i].lat - pos.lat) * ky;
    const bx = (pts[i + 1].lon - pos.lon) * kx, by = (pts[i + 1].lat - pos.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    const s = cum[i] + t * (cum[i + 1] - cum[i]);
    // Where the road doubles back near itself, prefer the part just ahead of us
    const score = d + (prevS != null && (s < prevS - 50 || s > prevS + 3000) ? 40 : 0);
    if (!best || score < best.score) best = { score, d, s, seg: i };
  }
  return best;
}

export function pointAt(route, s) {
  const { pts, cum, total } = route;
  if (s <= 0) return { ...pts[0], heading: bearing(pts[0], pts[1] || pts[0]), seg: 0 };
  if (s >= total) {
    const n = pts.length;
    return { ...pts[n - 1], heading: bearing(pts[n - 2] || pts[n - 1], pts[n - 1]), seg: n - 2 };
  }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const segLen = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / segLen;
  return {
    lat: pts[lo].lat + t * (pts[hi].lat - pts[lo].lat),
    lon: pts[lo].lon + t * (pts[hi].lon - pts[lo].lon),
    heading: bearing(pts[lo], pts[hi]),
    seg: lo,
  };
}

/* Safe-speed rule shared with backend accident_service.suggest_speed */
export function safeSpeedForDistance(m) {
  if (m <= 500) return 20;
  if (m <= 1000) return 30;
  return 40;
}

/* =============================================
   EXTRA ANNOUNCEMENTS (features beyond Google Maps)
   ============================================= */
const LEVEL_TA = { high: 'அதிக', moderate: 'மிதமான', medium: 'மிதமான', low: 'குறைந்த' };
const CAUSE_TA = {
  weather: 'மோசமான வானிலை', accident: 'சாலை விபத்து', traffic: 'சாலை தாமதம்',
  train: 'ரயில் கடப்பு', historical: 'இந்த நேரத்தின் வழக்கமான நெரிசல்',
};

export function briefingText(lang, { destination, distanceKm, minutes, level, cause }) {
  const lvl = (level || '').toLowerCase();
  const dist = Math.round(distanceKm * 10) / 10;
  const mins = Math.max(1, Math.round(minutes));
  if (lang === 'ta') {
    let t = `${destination} நோக்கி பயணம் தொடங்குகிறது. தூரம் ${dist} கிலோமீட்டர், சுமார் ${mins} நிமிடங்கள். `;
    if (LEVEL_TA[lvl]) t += `எங்கள் இயந்திர கற்றல் மாதிரி ${LEVEL_TA[lvl]} போக்குவரத்தை கணிக்கிறது. `;
    if (cause && CAUSE_TA[cause.type]) t += `முக்கிய காரணம்: ${CAUSE_TA[cause.type]}.`;
    return t;
  }
  let t = `Starting navigation to ${destination}. ${dist} kilometres, about ${mins} minutes. `;
  if (lvl) t += `Our model predicts ${lvl} traffic`;
  if (cause && cause.type && cause.type !== 'none') t += `, mainly due to ${cause.label.toLowerCase()}`;
  return lvl ? `${t}.` : t;
}

const INCIDENT_TEXT = {
  Accident: { en: 'Accident reported', ta: 'விபத்து நடந்துள்ளது' },
  Hazard: { en: 'Road hazard reported', ta: 'சாலை அபாயம் உள்ளது' },
  'Traffic Jam': { en: 'Traffic jam', ta: 'போக்குவரத்து நெரிசல்' },
};

/* "1.5 kilometres" / "300 metres" spelled out for the speech engine */
function spokenAmount(m, lang) {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    return lang === 'ta' ? `${km} கிலோமீட்டர்` : `${km} kilometre${km === 1 ? '' : 's'}`;
  }
  const rounded = Math.max(50, Math.round(m / 50) * 50);
  return lang === 'ta' ? `${rounded} மீட்டர்` : `${rounded} metres`;
}

export function incidentText(lang, type, aheadM, speed) {
  const t = INCIDENT_TEXT[type] || INCIDENT_TEXT['Traffic Jam'];
  const d = spokenAmount(aheadM, lang);
  return lang === 'ta'
    ? `கவனம்! ${d} முன்னால் ${t.ta}. வேகத்தை மணிக்கு ${speed} கிலோமீட்டராக குறைக்கவும்.`
    : `Caution. ${t.en} ${d} ahead. Slow down to ${speed} kilometres per hour.`;
}

export function eventText(lang, { name, location, until }) {
  return lang === 'ta'
    ? `கவனம். ${location} அருகே ${name} நடைபெறுகிறது${until ? `, ${until} வரை` : ''}. அதிக கூட்டமும் மெதுவான போக்குவரத்தும் இருக்கும்.`
    : `Heads up. ${name} near ${location}${until ? ` until ${until}` : ''}. Expect crowds and slow traffic.`;
}

/* School zone is live only on school days inside a bell-time window
   (same rule as backend school_service.is_active_at) */
export function schoolActiveAt(zone, when) {
  const weekday = (when.getDay() + 6) % 7; // JS Sunday=0 -> Monday=0
  if (!String(zone.school_days || '').split(',').map(Number).includes(weekday)) return false;
  const t = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  return Boolean((zone.morning_start && zone.morning_start <= t && t <= zone.morning_end)
    || (zone.afternoon_start && zone.afternoon_start <= t && t <= zone.afternoon_end));
}

export function schoolText(lang, speed) {
  return lang === 'ta'
    ? `பள்ளி மண்டலம் முன்னால் உள்ளது. குழந்தைகள் சாலையை கடக்கலாம். வேகத்தை மணிக்கு ${speed} கிலோமீட்டராக குறைக்கவும்.`
    : `School zone ahead. Children may be crossing. Slow down to ${speed} kilometres per hour.`;
}

export function overspeedText(lang, limit) {
  return lang === 'ta'
    ? `நீங்கள் பாதுகாப்பான வேகத்தை மீறுகிறீர்கள். மணிக்கு ${limit} கிலோமீட்டருக்கு குறைக்கவும்.`
    : `You are above the safe speed. Slow down to ${limit} kilometres per hour.`;
}

export function trainText(lang, { trainName, station, time }) {
  return lang === 'ta'
    ? `ரயில் எச்சரிக்கை. ${trainName} ரயில் ${station} அருகே சுமார் ${time} மணிக்கு வருகிறது. ரயில்வே கேட்டில் தாமதம் இருக்கலாம்.`
    : `Train alert. ${trainName} is due near ${station} around ${time}. Expect a possible delay at the level crossing.`;
}

export function breakText(lang, hours) {
  return lang === 'ta'
    ? `நீங்கள் ${hours} மணி நேரமாக வாகனம் ஓட்டுகிறீர்கள். சிறிது ஓய்வு எடுக்கவும்.`
    : `You have been driving for ${hours} hours. Please consider a short break.`;
}

export function continueText(lang, m) {
  const d = spokenAmount(m, lang);
  return lang === 'ta' ? `${d} தூரம் நேராக செல்லவும்.` : `Continue for ${d}.`;
}

export const PHRASES = {
  rerouting: { en: 'You are off the route. Rerouting.', ta: 'நீங்கள் வழியை விட்டு விலகிவிட்டீர்கள். புதிய வழி கணக்கிடப்படுகிறது.' },
  rerouted: { en: 'New route found.', ta: 'புதிய வழி கிடைத்தது.' },
  schoolEnd: { en: 'School zone ended.', ta: 'பள்ளி மண்டலம் முடிந்தது.' },
  gpsWeak: { en: 'GPS signal is weak.', ta: 'ஜிபிஎஸ் சிக்னல் பலவீனமாக உள்ளது.' },
};
