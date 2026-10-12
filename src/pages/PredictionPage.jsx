import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTraffic } from '../context/TrafficContext';
import { predictTraffic } from '../api/api';
import { Panel, RouteBar, EmptyState } from '../components/ui';
import { TimeChart, EmptyChart } from '../components/TrafficCharts';
import { levelColor, round1 } from '../components/chartTheme';

const OFFSETS = [
  { hours: 1, label: 'In 1 hour' },
  { hours: 3, label: 'In 3 hours' },
  { hours: 6, label: 'In 6 hours' },
  { hours: 24, label: 'Tomorrow' }
];

function futureSlot(hours) {
  const d = new Date(Date.now() + hours * 3600 * 1000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date, time: d.toTimeString().substring(0, 5) };
}

function Delta({ now, future, unit, lowerIsBetter = true }) {
  const diff = round1(future - now);
  if (!diff) return null;
  const worse = lowerIsBetter ? diff > 0 : diff < 0;
  return <span className={worse ? 'delta-up' : 'delta-down'}>{diff > 0 ? '+' : ''}{diff}{unit}</span>;
}

function CompareCard({ when, data, base }) {
  const m = data.traffic_metrics || {};
  const b = base?.traffic_metrics;
  const color = levelColor(data.traffic_prediction);
  return (
    <div className="compare-card" style={{ borderColor: `${color}66` }}>
      <div className="compare-when">{when}</div>
      <div className="compare-level" style={{ color }}>{data.traffic_prediction || '--'} traffic</div>
      <div className="compare-rows">
        <div><span>Travel time</span><strong>{round1(m.travel_time)} min</strong>{b && <Delta now={b.travel_time} future={m.travel_time} unit=" min" />}</div>
        <div><span>Delay</span><strong>{round1(m.delay)} min</strong>{b && <Delta now={b.delay} future={m.delay} unit=" min" />}</div>
        <div><span>Speed</span><strong>{round1(m.average_speed)} km/h</strong>{b && <Delta now={b.average_speed} future={m.average_speed} unit="" lowerIsBetter={false} />}</div>
      </div>
    </div>
  );
}

export default function PredictionPage() {
  const navigate = useNavigate();
  const { sourceLocation, destinationLocation, predictionData: baseData } = useTraffic();

  const [forecasts, setForecasts] = useState({}); // hours -> prediction response
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!baseData || !sourceLocation || !destinationLocation) {
    return (
      <div className="page">
        <EmptyState
          icon="fa-brain"
          title="No route to forecast"
          text="Run a route prediction on the Dashboard first. This page then re-runs the ML model for later departure times."
        >
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            <i className="fa-solid fa-gauge-high"></i> Go to Dashboard
          </button>
        </EmptyState>
      </div>
    );
  }

  const fetchOffset = async (hours) => {
    const { date, time } = futureSlot(hours);
    const data = await predictTraffic(sourceLocation.name, destinationLocation.name, date, time);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const runOne = async (hours) => {
    setSelected(hours);
    if (forecasts[hours]) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchOffset(hours);
      setForecasts(f => ({ ...f, [hours]: data }));
    } catch (err) {
      setError(err.message || 'Forecast failed. Check the backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const runAll = async () => {
    setLoading(true);
    setError('');
    const missing = OFFSETS.filter(o => !forecasts[o.hours]);
    const results = await Promise.allSettled(missing.map(o => fetchOffset(o.hours)));
    const next = { ...forecasts };
    results.forEach((r, i) => { if (r.status === 'fulfilled') next[missing[i].hours] = r.value; });
    setForecasts(next);
    if (results.some(r => r.status === 'rejected')) setError('Some forecasts could not be loaded.');
    if (selected == null) setSelected(OFFSETS[0].hours);
    setLoading(false);
  };

  const baseLabel = baseData.time ? `Your search (${baseData.time})` : 'Your search';
  const future = selected != null ? forecasts[selected] : null;
  const futureLabel = OFFSETS.find(o => o.hours === selected)?.label;

  // Every loaded option, for the comparison chart and the best-time pick
  const rows = [
    { label: baseLabel, metrics: baseData.traffic_metrics, level: baseData.traffic_prediction },
    ...OFFSETS.filter(o => forecasts[o.hours]).map(o => ({
      label: `${o.label} (${forecasts[o.hours].time})`,
      metrics: forecasts[o.hours].traffic_metrics,
      level: forecasts[o.hours].traffic_prediction
    }))
  ];
  const best = rows.length > 1
    ? rows.reduce((a, b) => (b.metrics.travel_time < a.metrics.travel_time ? b : a))
    : null;

  let advice = null;
  if (future) {
    const saved = round1(baseData.traffic_metrics.delay - future.traffic_metrics.delay);
    if (saved >= 1) advice = { tone: 'good', text: `Leaving ${futureLabel.toLowerCase()} saves about ${saved} min of traffic delay.` };
    else if (saved <= -1) advice = { tone: 'warn', text: `Delay grows by about ${-saved} min ${futureLabel.toLowerCase()}. Leaving at your searched time is better.` };
    else advice = { tone: '', text: `Traffic ${futureLabel.toLowerCase()} is about the same as at your searched time.` };
  }

  return (
    <div className="page">
      <RouteBar
        source={sourceLocation.name}
        destination={destinationLocation.name}
        level={baseData.traffic_prediction}
        meta={baseData.date && `Searched for ${baseData.date} ${baseData.time || ''}`}
      />

      <Panel
        title="When do you want to leave?"
        icon="fa-clock-rotate-left"
        actions={
          <button className="btn" onClick={runAll} disabled={loading}>
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-layer-group'}`}></i> Forecast all
          </button>
        }
      >
        <div className="segmented">
          {OFFSETS.map(o => (
            <button key={o.hours} className={selected === o.hours ? 'active' : ''} disabled={loading} onClick={() => runOne(o.hours)}>
              {o.label}
            </button>
          ))}
        </div>
        {error && <div className="note error" style={{ marginTop: 14 }}><i className="fa-solid fa-triangle-exclamation"></i>{error}</div>}
      </Panel>

      {future ? (
        <>
          <div className="compare">
            <CompareCard when={baseLabel} data={baseData} />
            <div className="compare-arrow"><i className="fa-solid fa-arrow-right-long"></i></div>
            <CompareCard when={`${futureLabel} · ${future.date} ${future.time}`} data={future} base={baseData} />
          </div>
          {advice && (
            <div className={`note ${advice.tone}`}>
              <i className="fa-solid fa-lightbulb"></i>
              <span>{advice.text}{future.weather?.weather_main && ` Expected weather: ${future.weather.weather_main}.`}</span>
            </div>
          )}
        </>
      ) : (
        <Panel>
          <EmptyChart message={loading ? 'Running the ML model…' : 'Pick a departure time above to compare it with your search.'} />
        </Panel>
      )}

      {rows.length > 1 && (
        <Panel
          title="Travel time by departure"
          icon="fa-chart-bar"
          actions={best && <span className="route-meta">Fastest: <strong style={{ color: '#10b981' }}>{best.label}</strong> · {round1(best.metrics.travel_time)} min</span>}
        >
          <TimeChart rows={rows} height={Math.max(200, rows.length * 56)} />
        </Panel>
      )}
    </div>
  );
}
