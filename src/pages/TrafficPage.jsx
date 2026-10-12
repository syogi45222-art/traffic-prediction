import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import { getTrafficHistory, predictTraffic } from '../api/api';
import { useTraffic } from '../context/TrafficContext';
import { Panel, StatTile, RouteBar, LiveBadge } from '../components/ui';
import { CongestionGauge, EmptyChart } from '../components/TrafficCharts';
import { COLORS, levelColor, round1 } from '../components/chartTheme';

const REFRESH_SECONDS = 60;
const fmtHour = (h) => `${String(h).padStart(2, '0')}:00`;

export default function TrafficPage() {
  const { predictionData, setPredictionData, sourceLocation, destinationLocation } = useTraffic();

  const [hourly, setHourly] = useState(null);
  const [loadingHourly, setLoadingHourly] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const hasRoute = Boolean(sourceLocation && destinationLocation);

  const fetchHourly = useCallback(async () => {
    try {
      const data = await getTrafficHistory();
      if (data?.hours?.length) setHourly(data);
      else if (data?.error) setError(data.error);
    } catch (err) {
      console.error(err);
      setError('Could not load the hourly traffic pattern.');
    } finally {
      setLoadingHourly(false);
    }
  }, []);

  const syncRoute = useCallback(async () => {
    if (!sourceLocation || !destinationLocation) return;
    setSyncing(true);
    try {
      const res = await predictTraffic(sourceLocation.name, destinationLocation.name);
      if (res?.traffic_metrics) {
        setPredictionData(res);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err) {
      console.error('Route sync error:', err);
    } finally {
      setSyncing(false);
    }
  }, [sourceLocation, destinationLocation, setPredictionData]);

  useEffect(() => { fetchHourly(); }, [fetchHourly]);

  const countRef = useRef(REFRESH_SECONDS);
  const syncRef = useRef(null);
  syncRef.current = () => { syncRoute(); fetchHourly(); };

  useEffect(() => {
    if (!autoRefresh || !hasRoute) return;
    const timer = setInterval(() => {
      countRef.current -= 1;
      if (countRef.current <= 0) {
        countRef.current = REFRESH_SECONDS;
        syncRef.current();
      }
      setCountdown(countRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, hasRoute]);

  const refreshNow = () => {
    countRef.current = REFRESH_SECONDS;
    setCountdown(REFRESH_SECONDS);
    fetchHourly();
    syncRoute();
  };

  // Hourly pattern figures
  const peakHour = hourly?.peak_hour;
  const peakVolume = hourly?.peak_volume;
  const currentHour = hourly?.current_hour ?? new Date().getHours();
  const currentVolume = hourly?.traffic?.[currentHour];
  const nowVsPeak = peakVolume ? Math.round((currentVolume / peakVolume) * 100) : null;

  const hourlyChart = hourly && {
    labels: hourly.hours.map(fmtHour),
    datasets: [{
      label: 'Vehicles per hour',
      data: hourly.traffic,
      backgroundColor: hourly.hours.map(h =>
        h === currentHour ? COLORS.blue : h === peakHour ? COLORS.red : 'rgba(148, 163, 184, 0.28)'
      ),
      borderRadius: 4,
      barPercentage: 0.8
    }]
  };
  const hourlyOptions = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const h = hourly.hours[items[0].dataIndex];
            return `${fmtHour(h)}${h === currentHour ? ' · now' : ''}${h === peakHour ? ' · peak' : ''}`;
          },
          label: (c) => ` ${c.raw.toLocaleString()} vehicles/hour`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
      y: { beginAtZero: true, title: { display: true, text: 'vehicles / hour' } }
    }
  };

  // Route congestion figures
  const m = predictionData?.traffic_metrics;
  const level = predictionData?.traffic_prediction;
  const speedLoss = m && m.free_flow_speed > 0
    ? Math.max(0, Math.round((1 - m.average_speed / m.free_flow_speed) * 100))
    : null;

  return (
    <div className="page">
      <div className="toolbar">
        <LiveBadge active={hasRoute && autoRefresh}>
          {!hasRoute ? 'No active route' : syncing ? 'Syncing route…' : autoRefresh ? `Route sync in ${countdown}s` : 'Auto-sync paused'}
        </LiveBadge>
        <div className="toolbar-group">
          {hasRoute && (
            <button className="btn" onClick={() => setAutoRefresh(a => !a)}>
              <i className={`fa-solid ${autoRefresh ? 'fa-pause' : 'fa-play'}`}></i>
              {autoRefresh ? 'Pause' : 'Resume'}
            </button>
          )}
          <button className="btn btn-primary" onClick={refreshNow} disabled={syncing}>
            <i className={`fa-solid fa-arrows-rotate ${syncing ? 'fa-spin' : ''}`}></i> Refresh
          </button>
        </div>
      </div>

      {hasRoute ? (
        <RouteBar
          source={sourceLocation.name}
          destination={destinationLocation.name}
          level={level}
          meta={lastUpdated && `Synced ${lastUpdated}`}
        />
      ) : (
        <div className="note"><i className="fa-solid fa-circle-info"></i>
          Search a route on the Dashboard to see congestion for your own route. The hourly pattern below works without one.
        </div>
      )}

      <div className="stat-grid">
        <StatTile label="Vehicles on route" icon="fa-car-side" color="#8b5cf6"
          value={m?.vehicle_count != null ? m.vehicle_count.toLocaleString() : null}
          hint={m ? 'Estimated for the current trip' : 'Needs an active route'} />
        <StatTile label="Speed lost to traffic" icon="fa-gauge-simple-high" color={levelColor(level)}
          value={speedLoss} unit="%"
          hint={m && `${round1(m.average_speed)} of ${round1(m.free_flow_speed)} km/h`} />
        <StatTile label="Busiest hour" icon="fa-clock" color="#ef4444"
          value={peakHour != null ? fmtHour(peakHour) : null}
          hint={peakVolume && `${peakVolume.toLocaleString()} vehicles/hour`} />
        <StatTile label="This hour vs peak" icon="fa-chart-simple" color="#3b82f6"
          value={nowVsPeak} unit="%"
          hint={currentVolume != null && `${currentVolume.toLocaleString()} vehicles/hour at ${fmtHour(currentHour)}`} />
      </div>

      <div className="grid-3">
        <Panel
          title="Typical traffic by hour"
          icon="fa-chart-column"
          actions={<span className="route-meta"><span style={{ color: COLORS.blue }}>■</span> now &nbsp; <span style={{ color: COLORS.red }}>■</span> peak</span>}
        >
          {loadingHourly ? (
            <EmptyChart message="Loading hourly pattern…" />
          ) : error ? (
            <EmptyChart message={error} />
          ) : (
            <div className="chart-box" style={{ height: 280 }}><Bar data={hourlyChart} options={hourlyOptions} /></div>
          )}
        </Panel>

        <Panel title="Route congestion" icon="fa-gauge">
          {m ? (
            <>
              <CongestionGauge value={m.traffic_index} level={m.congestion_level} />
              <div className="kv-list" style={{ marginTop: 12 }}>
                <div className="kv"><span>Traffic delay</span><strong>{round1(m.delay)} min</strong></div>
                <div className="kv"><span>Travel time</span><strong>{round1(m.travel_time)} min</strong></div>
              </div>
            </>
          ) : (
            <EmptyChart message="Search a route on the Dashboard to see its congestion." />
          )}
        </Panel>
      </div>

      <div className="note">
        <i className="fa-solid fa-database"></i>
        The hourly pattern is based on average volumes from the I-94 traffic dataset. It shows the typical daily rhythm,
        not a live count for your road. Route figures come from live TomTom routing.
      </div>
    </div>
  );
}
