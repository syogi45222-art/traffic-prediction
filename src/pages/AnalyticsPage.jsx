import React, { useState, useEffect, useCallback, useRef } from 'react';
import { predictTraffic } from '../api/api';
import { useTraffic } from '../context/TrafficContext';
import { Panel, StatTile, RouteBar, LiveBadge, EmptyState } from '../components/ui';
import { LiveTrendChart, SpeedChart, TimeChart } from '../components/TrafficCharts';
import { levelColor, round1 } from '../components/chartTheme';

const REFRESH_SECONDS = 30;
const MAX_POINTS = 12;

export default function AnalyticsPage() {
  const {
    predictionData: contextPrediction,
    sourceLocation,
    destinationLocation,
    setPredictionData,
    setSourceLocation,
    setDestinationLocation
  } = useTraffic();

  const [sourceName, setSourceName] = useState(sourceLocation?.name || '');
  const [destName, setDestName] = useState(destinationLocation?.name || '');
  const [srcInput, setSrcInput] = useState('');
  const [dstInput, setDstInput] = useState('');
  const [showRouteForm, setShowRouteForm] = useState(false);

  const [liveData, setLiveData] = useState(contextPrediction || null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [history, setHistory] = useState([]);

  const fetchLive = useCallback(async (src, dst) => {
    if (!src || !dst) return;
    setLoading(true);
    setError('');
    try {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().substring(0, 5);
      const res = await predictTraffic(src, dst, date, time);
      if (res?.traffic_metrics) {
        setLiveData(res);
        setPredictionData(res);
        setLastUpdated(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setHistory(prev => [...prev, {
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          speed: round1(res.traffic_metrics.average_speed),
          delay: round1(res.traffic_metrics.delay)
        }].slice(-MAX_POINTS));
      } else if (res?.error) {
        setError(res.error);
      }
    } catch (err) {
      console.error('Analytics live fetch error:', err);
      setError('Could not load live analytics. Will retry on the next refresh.');
    } finally {
      setLoading(false);
    }
  }, [setPredictionData]);

  // First load and whenever the route changes
  useEffect(() => {
    if (sourceName && destName) fetchLive(sourceName, destName);
  }, [sourceName, destName, fetchLive]);

  // Countdown lives in a ref so the timer can trigger a refresh without side effects inside setState
  const countRef = useRef(REFRESH_SECONDS);
  const refreshRef = useRef(null);
  refreshRef.current = () => fetchLive(sourceName, destName);

  useEffect(() => {
    if (!autoRefresh || !sourceName || !destName) return;
    const timer = setInterval(() => {
      countRef.current -= 1;
      if (countRef.current <= 0) {
        countRef.current = REFRESH_SECONDS;
        refreshRef.current();
      }
      setCountdown(countRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, sourceName, destName]);

  const resetCountdown = () => {
    countRef.current = REFRESH_SECONDS;
    setCountdown(REFRESH_SECONDS);
  };

  const refreshNow = () => {
    resetCountdown();
    fetchLive(sourceName, destName);
  };

  const applyRoute = (e) => {
    e.preventDefault();
    const src = srcInput.trim();
    const dst = dstInput.trim();
    if (!src || !dst) return;
    setSourceLocation({ name: src });
    setDestinationLocation({ name: dst });
    setHistory([]);
    resetCountdown();
    setShowRouteForm(false);
    setSourceName(src);
    setDestName(dst);
  };

  const routeForm = (
    <form className="inline-form" onSubmit={applyRoute}>
      <input placeholder="From (e.g. Theni)" value={srcInput} onChange={(e) => setSrcInput(e.target.value)} />
      <input placeholder="To (e.g. Madurai)" value={dstInput} onChange={(e) => setDstInput(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={loading}>
        <i className="fa-solid fa-chart-line"></i> {loading ? 'Analyzing…' : 'Analyze route'}
      </button>
    </form>
  );

  if (!sourceName || !destName) {
    return (
      <div className="page">
        <EmptyState
          icon="fa-chart-line"
          title="No route selected"
          text="Search a route on the Dashboard, or enter one below to start live analytics."
        >
          {routeForm}
        </EmptyState>
      </div>
    );
  }

  const m = liveData?.traffic_metrics;
  const level = liveData?.traffic_prediction;

  return (
    <div className="page">
      <div className="toolbar">
        <LiveBadge active={autoRefresh}>
          {autoRefresh ? `Live · next update in ${countdown}s` : 'Auto-refresh paused'}
        </LiveBadge>
        <div className="toolbar-group">
          <button className="btn" onClick={() => setAutoRefresh(a => !a)}>
            <i className={`fa-solid ${autoRefresh ? 'fa-pause' : 'fa-play'}`}></i>
            {autoRefresh ? 'Pause' : 'Resume'}
          </button>
          <button className="btn btn-primary" onClick={refreshNow} disabled={loading}>
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`}></i>
            {loading ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </div>

      <RouteBar
        source={sourceName}
        destination={destName}
        level={level}
        meta={lastUpdated && `Updated ${lastUpdated}`}
        actions={
          <button className="btn btn-ghost" onClick={() => setShowRouteForm(s => !s)}>
            <i className="fa-solid fa-pen-to-square"></i> Change route
          </button>
        }
      />
      {showRouteForm && routeForm}

      {error && <div className="note error"><i className="fa-solid fa-triangle-exclamation"></i>{error}</div>}

      <div className="stat-grid">
        <StatTile label="Travel time" icon="fa-clock" color="#3b82f6"
          value={m ? round1(m.travel_time) : null} unit="min"
          hint={m && `${round1(m.delay)} min of it is traffic delay`} />
        <StatTile label="Current speed" icon="fa-gauge-high" color="#10b981"
          value={m ? round1(m.average_speed) : null} unit="km/h"
          hint={m && `Free-flow ${round1(m.free_flow_speed)} km/h`} />
        <StatTile label="Traffic index" icon="fa-chart-pie" color={levelColor(level)}
          value={m ? Math.round(m.traffic_index) : null} unit="%"
          hint="Share of the route slowed by traffic" />
        <StatTile label="Distance" icon="fa-route" color="#8b5cf6"
          value={m ? round1(m.distance) : null} unit="km"
          hint={m && `${round1(m.no_traffic_time)} min with empty roads`} />
      </div>

      <div className="grid-3">
        <Panel title="Speed & delay while this page is open" icon="fa-wave-square">
          <LiveTrendChart history={history} />
        </Panel>
        <Panel title="Speed vs free-flow" icon="fa-gauge-high">
          <SpeedChart metrics={m} />
        </Panel>
      </div>

      <Panel title="Where the travel time goes" icon="fa-hourglass-half">
        <TimeChart rows={[{ label: 'This trip', metrics: m, level }]} />
      </Panel>
    </div>
  );
}
