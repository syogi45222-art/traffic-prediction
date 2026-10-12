import React from 'react';
import NavigationMap from './NavigationMap';
import { instructionText, maneuverInfo, formatDistance } from '../nav/navEngine';
import { levelColor, round1 } from './chartTheme';

const T = {
  en: {
    start: 'Start navigation', gps: 'Live GPS', gpsHint: 'Follows your phone / laptop location in real time',
    demo: 'Demo drive', demoHint: 'Simulated drive along the route — for presentations and testing',
    voice: 'Voice', then: 'Then', left: 'left', eta: 'arrival', min: 'min', speed: 'km/h',
    locating: 'Getting your GPS position…', rerouting: 'Rerouting from your position…', weak: 'Weak GPS signal',
    upcoming: 'Upcoming directions', exit: 'Exit', done: 'Done', repeat: 'Repeat', safe: 'Safe speed',
    limit: 'Speed alert', off: 'Off', arrived: 'You have arrived', ahead: 'ahead', slow: 'slow to',
    train: 'Train due', near: 'near', until: 'until', school: 'School zone',
  },
  ta: {
    start: 'வழிகாட்டலைத் தொடங்கு', gps: 'நேரடி GPS', gpsHint: 'உங்கள் இருப்பிடத்தை நேரடியாக பின்தொடரும்',
    demo: 'டெமோ பயணம்', demoHint: 'வழியில் உருவகப்படுத்தப்பட்ட பயணம் — விளக்கக்காட்சிக்கு',
    voice: 'குரல்', then: 'பிறகு', left: 'மீதம்', eta: 'சேரும் நேரம்', min: 'நிமி', speed: 'கி.மீ/ம',
    locating: 'GPS இருப்பிடம் பெறப்படுகிறது…', rerouting: 'புதிய வழி கணக்கிடப்படுகிறது…', weak: 'GPS சிக்னல் பலவீனம்',
    upcoming: 'அடுத்த திசைகள்', exit: 'வெளியேறு', done: 'முடிந்தது', repeat: 'மீண்டும்', safe: 'பாதுகாப்பான வேகம்',
    limit: 'வேக எச்சரிக்கை', off: 'இல்லை', arrived: 'நீங்கள் வந்துவிட்டீர்கள்', ahead: 'முன்னால்', slow: 'வேகம்',
    train: 'ரயில் வருகை', near: 'அருகே', until: 'வரை', school: 'பள்ளி மண்டலம்',
  },
};

function TurnIcon({ maneuver, size = 30 }) {
  const info = maneuverInfo(maneuver);
  return <i className={`fa-solid ${info.icon}`} style={{ fontSize: size, transform: info.tilt ? `rotate(${info.tilt}deg)` : undefined }}></i>;
}

function LangToggle({ lang, setLang }) {
  return (
    <div className="nav-lang">
      <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
      <button className={lang === 'ta' ? 'active' : ''} onClick={() => setLang('ta')}>தமிழ்</button>
    </div>
  );
}

function StartSheet({ api, t, source, destination, prediction, onExit }) {
  return (
    <div className="nav-start">
      <div className="nav-start-route">
        <i className="fa-solid fa-circle-dot" style={{ color: '#10b981' }}></i> {source}
        <i className="fa-solid fa-arrow-right" style={{ color: '#64748b', margin: '0 8px' }}></i>
        <i className="fa-solid fa-flag-checkered" style={{ color: '#ef4444' }}></i> {destination}
      </div>
      <div className="nav-start-meta">
        {round1(prediction.route?.distance_km)} km · {Math.round(prediction.route?.travel_time_min || 0)} min ·{' '}
        <span style={{ color: levelColor(prediction.traffic_prediction) }}>{prediction.traffic_prediction} traffic</span>
      </div>
      <LangToggle lang={api.lang} setLang={api.setLang} />
      <div className="nav-start-modes">
        <button className="nav-mode" onClick={() => api.start('gps')}>
          <i className="fa-solid fa-location-crosshairs"></i>
          <strong>{t.gps}</strong><span>{t.gpsHint}</span>
        </button>
        <button className="nav-mode" onClick={() => api.start('demo')}>
          <i className="fa-solid fa-car-side"></i>
          <strong>{t.demo}</strong><span>{t.demoHint}</span>
        </button>
      </div>
      <button className="btn" onClick={onExit}><i className="fa-solid fa-arrow-left"></i> Back to results</button>
    </div>
  );
}

function ArrivalReport({ report, t, onExit }) {
  const diff = report.actualMin - report.predictedMin;
  return (
    <div className="nav-report">
      <div className="nav-report-head"><i className="fa-solid fa-flag-checkered"></i> {t.arrived}</div>
      <div className="nav-report-grid">
        <div><span>Predicted time</span><strong>{Math.round(report.predictedMin)} min</strong></div>
        <div><span>Actual time</span><strong>{Math.round(report.actualMin)} min</strong>
          <em className={diff > 0 ? 'delta-up' : 'delta-down'}>{diff > 0 ? '+' : ''}{Math.round(diff)} min</em></div>
        <div><span>Distance</span><strong>{round1(report.distanceKm)} km</strong></div>
        <div><span>Average speed</span><strong>{Math.round(report.avgKmh)} km/h</strong></div>
        <div><span>Top speed</span><strong>{Math.round(report.maxKmh)} km/h</strong></div>
        <div><span>Over-speed warnings</span><strong>{report.overspeedWarnings}</strong></div>
        <div><span>Reroutes</span><strong>{report.reroutes}</strong></div>
        <div><span>Incident / train / event / school alerts</span><strong>{report.incidentsWarned} / {report.trainsWarned} / {report.eventsWarned} / {report.schoolsWarned}</strong></div>
      </div>
      {report.demo && <p className="nav-report-note">Demo drive — times are simulated.</p>}
      <button className="btn btn-primary" onClick={onExit}><i className="fa-solid fa-check"></i> {t.done}</button>
    </div>
  );
}

export default function NavigationPanel({ api, source, destination, prediction, onExit }) {
  const { nav, lang } = api;
  const t = T[lang];
  const exit = () => { api.stop(); onExit(); };

  if (nav.status === 'idle') {
    return <StartSheet api={api} t={t} source={source} destination={destination} prediction={prediction} onExit={onExit} />;
  }

  const next = nav.next;
  const arrived = nav.status === 'arrived';

  return (
    <section className="nav-shell">
      {/* TOP: big instruction card */}
      <div className={`nav-instruction ${arrived ? 'arrived' : ''}`}>
        <div className="nav-turn">{arrived ? <i className="fa-solid fa-flag-checkered" style={{ fontSize: 32 }}></i> : next && <TurnIcon maneuver={next.maneuver} />}</div>
        <div className="nav-instruction-body">
          {!arrived && next && <div className="nav-dist">{formatDistance(nav.toNext)}</div>}
          <div className="nav-text">
            {arrived ? t.arrived
              : nav.status === 'locating' ? t.locating
              : nav.status === 'rerouting' ? t.rerouting
              : next ? instructionText(next, lang) : ''}
          </div>
          {!arrived && nav.then && nav.status === 'navigating' && (
            <div className="nav-then">{t.then}: <TurnIcon maneuver={nav.then.maneuver} size={12} /> {instructionText(nav.then, lang)}</div>
          )}
        </div>
        <div className="nav-controls">
          <LangToggle lang={lang} setLang={api.setLang} />
          <div className="nav-control-row">
            <button className="nav-icon-btn" title={t.repeat} onClick={api.repeat} disabled={arrived}><i className="fa-solid fa-rotate-right"></i></button>
            <button className="nav-icon-btn" title={t.voice} onClick={() => api.setMuted(!api.muted)}>
              <i className={`fa-solid ${api.muted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
            </button>
            <button className="nav-exit" onClick={exit}><i className="fa-solid fa-xmark"></i> {t.exit}</button>
          </div>
        </div>
      </div>

      {nav.error && <div className="nav-banner danger"><i className="fa-solid fa-circle-exclamation"></i>{nav.error}</div>}
      {nav.weakGps && !nav.error && <div className="nav-banner warn"><i className="fa-solid fa-satellite-dish"></i>{t.weak} (±{Math.round(nav.accuracy)} m)</div>}
      {nav.banner && !arrived && (
        <div className={`nav-banner ${nav.banner.kind}`}>
          <i className={`fa-solid ${nav.banner.icon}`}></i>
          {nav.banner.type} {formatDistance(nav.banner.ahead)} {t.ahead} — {t.slow} {nav.banner.limit} km/h
        </div>
      )}
      {nav.schoolBanner && !arrived && (
        <div className="nav-banner school">
          <i className="fa-solid fa-children"></i>
          {t.school}: {nav.schoolBanner.name}{nav.schoolBanner.ahead > 0 ? ` (${formatDistance(nav.schoolBanner.ahead)} ${t.ahead})` : ''} — {t.slow} {nav.schoolBanner.speed} km/h
        </div>
      )}
      {nav.eventBanner && !arrived && (
        <div className="nav-banner event">
          <i className="fa-solid fa-champagne-glasses"></i>
          {nav.eventBanner.name} — {nav.eventBanner.location}{nav.eventBanner.ahead > 0 ? ` (${formatDistance(nav.eventBanner.ahead)} ${t.ahead})` : ''}{nav.eventBanner.until ? ` · ${t.until} ${nav.eventBanner.until}` : ''}
        </div>
      )}
      {nav.trainBanner && !arrived && (
        <div className="nav-banner train">
          <i className="fa-solid fa-train"></i>
          {t.train}: {nav.trainBanner.trainName} {t.near} {nav.trainBanner.station} ~{nav.trainBanner.time}
        </div>
      )}

      {arrived && nav.report ? (
        <ArrivalReport report={nav.report} t={t} onExit={exit} />
      ) : (
        <>
          <div className="nav-map-area">
            <NavigationMap nav={nav} routeColor={levelColor(prediction.traffic_prediction)} />
            <div className={`nav-speedo ${nav.limit && nav.speedKmh > nav.limit + 5 ? 'over' : ''}`}>
              <strong>{Math.round(nav.speedKmh || 0)}</strong><span>{t.speed}</span>
            </div>
            {nav.limit && <div className="nav-limit-sign">{nav.limit}</div>}
            <div className="nav-progress"><div style={{ width: `${nav.progress || 0}%` }}></div></div>
          </div>

          <div className="nav-stats">
            <div><strong>{nav.arrivalClock || '--:--'}</strong><span>{t.eta}</span></div>
            <div><strong>{Math.round(nav.remainingMin || 0)}</strong><span>{t.min}</span></div>
            <div><strong>{formatDistance(nav.remaining)}</strong><span>{t.left}</span></div>
            <div>
              <select value={api.speedLimit} onChange={(e) => api.setSpeedLimit(Number(e.target.value))}>
                <option value={0}>{t.off}</option>
                {[40, 60, 80, 100, 120].map((v) => <option key={v} value={v}>{v} km/h</option>)}
              </select>
              <span>{t.limit}</span>
            </div>
          </div>

          {nav.mode === 'demo' && (
            <div className="nav-demo">
              <span><i className="fa-solid fa-flask"></i> {t.demo}</span>
              <label>Speed
                <select value={api.demoKmh} onChange={(e) => api.setDemoKmh(Number(e.target.value))}>
                  {[20, 30, 50, 80, 100].map((v) => <option key={v} value={v}>{v} km/h</option>)}
                </select>
              </label>
              <label>Fast-forward
                <select value={api.demoFast} onChange={(e) => api.setDemoFast(Number(e.target.value))}>
                  {[1, 2, 4, 8, 16].map((v) => <option key={v} value={v}>{v}×</option>)}
                </select>
              </label>
            </div>
          )}

          {nav.upcoming?.length > 0 && (
            <div className="nav-upcoming">
              <h4><i className="fa-solid fa-list-ol"></i> {t.upcoming}</h4>
              {nav.upcoming.map((ins, i) => (
                <div key={`${nav.routeVersion}-${ins.id}`} className={`nav-step ${i === 0 ? 'active' : ''}`}>
                  <div className="nav-step-icon"><TurnIcon maneuver={ins.maneuver} size={13} /></div>
                  <div className="nav-step-text">{instructionText(ins, lang)}</div>
                  <div className="nav-step-dist">{formatDistance(ins.dist)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
