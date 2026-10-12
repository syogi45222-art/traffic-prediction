import React, { useState, useEffect, useCallback } from 'react';
import { useTraffic } from '../context/TrafficContext';
import { getAccidentInfo, predictTraffic, API_BASE } from '../api/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet/dist/images/marker-shadow.png'
});

const accidentIcon = new L.divIcon({
  className: 'accident-marker',
  html: '<div style="background:#ef4444;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 15px rgba(239,68,68,0.6);border:3px solid white;font-size:16px;"><i class="fa-solid fa-triangle-exclamation"></i></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const hazardIcon = new L.divIcon({
  className: 'hazard-marker',
  html: '<div style="background:#f59e0b;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(245,158,11,0.5);border:2px solid white;font-size:14px;"><i class="fa-solid fa-cloud-rain"></i></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const trafficIcon = new L.divIcon({
  className: 'traffic-marker',
  html: '<div style="background:#f97316;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(249,115,22,0.5);border:2px solid white;font-size:14px;"><i class="fa-solid fa-road-barrier"></i></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

function isValidCoord(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' &&
    isFinite(lat) && isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180;
}

function getIncidentIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('accident') || t.includes('crash')) return accidentIcon;
  if (t.includes('hazard') || t.includes('rain') || t.includes('fog') || t.includes('ice')) return hazardIcon;
  return trafficIcon;
}

function getIncidentColor(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('accident') || t.includes('crash')) return '#ef4444';
  if (t.includes('hazard') || t.includes('rain') || t.includes('fog') || t.includes('ice')) return '#f59e0b';
  return '#f97316';
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    let timer = setTimeout(() => {
      try { map.invalidateSize(); } catch (e) {}
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function FitBounds({ source, destination, points, incidentPoints }) {
  const map = useMap();
  useEffect(() => {
    let timer = setTimeout(() => {
      try {
        const bounds = [];
        if (source && isValidCoord(source.lat, source.lon)) bounds.push([source.lat, source.lon]);
        if (destination && isValidCoord(destination.lat, destination.lon)) bounds.push([destination.lat, destination.lon]);
        if (Array.isArray(points)) {
          points.forEach((p) => {
            const lat = p.latitude || p.lat;
            const lon = p.longitude || p.lon;
            if (isValidCoord(lat, lon)) bounds.push([lat, lon]);
          });
        }
        if (Array.isArray(incidentPoints)) {
          incidentPoints.forEach((p) => {
            if (isValidCoord(p.lat, p.lon)) bounds.push([p.lat, p.lon]);
          });
        }
        if (bounds.length >= 2) {
          map.invalidateSize();
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        }
      } catch (e) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [source, destination, points, incidentPoints, map]);
  return null;
}

// --- Advanced Clear Voice Helper ---
const playClearVoice = async (text, langCode) => {
  // Cancel any existing Web Speech API in case it was running
  window.speechSynthesis.cancel();
  
  // Use the ultra-clear Google TTS API running on the backend!
  try {
    const url = `${API_BASE}/api/tts?text=${encodeURIComponent(text)}&lang=${langCode}`;
    const audio = new Audio(url);
    await audio.play();
  } catch (err) {
    console.error("Failed to play HQ voice, falling back to basic browser TTS", err);
    // Fallback to basic browser TTS if backend fails
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    window.speechSynthesis.speak(utterance);
  }
};

export default function AccidentPage() {
  const { 
    accidentData: contextAccident, 
    sourceLocation, 
    destinationLocation, 
    predictionData: contextPrediction,
    setAccidentData,
    setPredictionData,
    setSourceLocation,
    setDestinationLocation
  } = useTraffic();

  const [sourceName, setSourceName] = useState(sourceLocation?.name || '');
  const [destName, setDestName] = useState(destinationLocation?.name || '');
  const [customSrc, setCustomSrc] = useState('');
  const [customDst, setCustomDst] = useState('');
  const [showRouteForm, setShowRouteForm] = useState(false);

  const [accidentResult, setLocalAccidentResult] = useState(contextAccident || null);
  const [predictionResult, setLocalPredictionResult] = useState(contextPrediction || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Auto-refresh (30s) state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  // Fetch real accident & route data from backend API
  const fetchAccidentData = useCallback(async (src = sourceName, dst = destName) => {
    if (!src || !dst) return;
    setLoading(true);
    setError('');
    try {
      const now = new Date();
      // 1. Fetch Accident Info from backend
      const accRes = await getAccidentInfo(src, dst);
      if (accRes) {
        setLocalAccidentResult(accRes);
        setAccidentData(accRes);
        setLastSyncTime(now.toLocaleTimeString());
      }

      // 2. Fetch Route Points if prediction isn't already present
      if (!contextPrediction || sourceLocation?.name !== src || destinationLocation?.name !== dst) {
        const predRes = await predictTraffic(src, dst, now.toISOString().split('T')[0], now.toTimeString().substring(0, 5));
        if (predRes) {
          setLocalPredictionResult(predRes);
          setPredictionData(predRes);
          if (predRes.route?.points && predRes.route.points.length > 0) {
            const first = predRes.route.points[0];
            const last = predRes.route.points[predRes.route.points.length - 1];
            setSourceLocation({ name: src, lat: first.latitude, lon: first.longitude });
            setDestinationLocation({ name: dst, lat: last.latitude, lon: last.longitude });
          }
        }
      }
    } catch (err) {
      console.error('Accident Fetch Error:', err);
      setError('Failed to query accident alerts for route.');
    } finally {
      setLoading(false);
    }
  }, [sourceName, destName, contextPrediction, sourceLocation, destinationLocation, setAccidentData, setPredictionData, setSourceLocation, setDestinationLocation]);

  // Initial load ONLY if route exists
  useEffect(() => {
    if (sourceName && destName) {
      fetchAccidentData(sourceName, destName);
    }
  }, [sourceName, destName]);

  // 30-Second Countdown & Auto-Polling Timer
  useEffect(() => {
    if (!autoRefresh || !sourceName || !destName) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchAccidentData(sourceName, destName);
          return 30; // Reset
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, sourceName, destName, fetchAccidentData]);

  const handleManualRefresh = () => {
    if (!sourceName || !destName) return;
    setCountdown(30);
    fetchAccidentData(sourceName, destName);
  };

  const handleRouteSubmit = (e) => {
    e.preventDefault();
    if (!customSrc.trim() || !customDst.trim()) return;
    const newSrc = customSrc.trim();
    const newDst = customDst.trim();
    setSourceName(newSrc);
    setDestName(newDst);
    setShowRouteForm(false);
    setCountdown(30);
    fetchAccidentData(newSrc, newDst);
  };

  // IF NO ROUTE HAS BEEN SEARCHED OR SELECTED
  if (!sourceName || !destName) {
    return (
      <div style={{ marginTop: '20px', padding: '0 10px', maxWidth: '1200px', margin: '20px auto', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '60px 30px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
          <i className="fa-solid fa-car-burst" style={{ fontSize: '56px', color: '#ef4444', marginBottom: '20px', display: 'block' }}></i>
          <h2 style={{ fontSize: '22px', color: 'var(--text-primary)', marginBottom: '10px' }}>Accident Alert Module</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '25px' }}>
            No active route selected. Search a route on the Dashboard (e.g. <strong>Theni to Periyakulam</strong>) or enter a route below to check accident alerts.
          </p>

          <form onSubmit={handleRouteSubmit} style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <input 
              type="text" 
              placeholder="Source City (e.g. Theni)" 
              value={customSrc} 
              onChange={(e) => setCustomSrc(e.target.value)} 
              style={{ flex: 1, minWidth: '180px', padding: '12px 16px', background: '#0b0f19', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontSize: '14px' }} 
            />
            <input 
              type="text" 
              placeholder="Destination City (e.g. Periyakulam)" 
              value={customDst} 
              onChange={(e) => setCustomDst(e.target.value)} 
              style={{ flex: 1, minWidth: '180px', padding: '12px 16px', background: '#0b0f19', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontSize: '14px' }} 
            />
            <button type="submit" disabled={loading} style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              {loading ? 'Scanning...' : 'Check Accidents'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const routePoints = predictionResult?.route?.points || contextPrediction?.route?.points || [];
  const primaryLatLngs = routePoints
    .filter((p) => isValidCoord(p.latitude, p.longitude))
    .map((p) => [p.latitude, p.longitude]);

  const hasAccident = accidentResult?.has_accident === true;
  const hasHazard = accidentResult?.has_hazard === true;
  const hasTraffic = accidentResult?.has_traffic === true;
  const hasAnyIncident = (accidentResult?.accidents && accidentResult.accidents.length > 0) || hasAccident || hasHazard || hasTraffic;

  const incidentMarkers = accidentResult?.accidents || [];
  const altRoute = accidentResult?.alternate_route;
  const altPoints = altRoute?.points || [];
  const altLatLngs = altPoints
    .filter((p) => isValidCoord(p.latitude || p.lat, p.longitude || p.lon))
    .map((p) => [p.latitude || p.lat, p.longitude || p.lon]);

  let statusColor = '#10b981';
  let statusIcon = 'fa-circle-check';
  let statusText = 'No Accident Detected';

  if (hasAccident) {
    statusColor = '#ef4444';
    statusIcon = 'fa-triangle-exclamation';
    statusText = accidentResult?.status || 'Accident Detected';
  } else if (hasHazard) {
    statusColor = '#f59e0b';
    statusIcon = 'fa-cloud-rain';
    statusText = accidentResult?.status || 'Weather Hazard';
  } else if (hasTraffic) {
    statusColor = '#f97316';
    statusIcon = 'fa-road-barrier';
    statusText = accidentResult?.status || 'Traffic Congestion';
  }

  const cards = [
    { icon: statusIcon, color: statusColor, title: 'Status', value: statusText },
    { icon: 'fa-location-dot', color: '#3b82f6', title: 'Incident Distance', value: accidentResult?.distance || 'Clear' },
    { icon: 'fa-gauge-high', color: '#f59e0b', title: 'Suggested Speed', value: `${accidentResult?.speed || 60} km/h` },
    { icon: 'fa-shield-halved', color: '#8b5cf6', title: 'Safety Advice', value: accidentResult?.advice || 'Drive Safely' },
  ];

  if (hasAnyIncident) {
    cards.push({ icon: 'fa-list', color: '#06b6d4', title: 'Incident Count', value: accidentResult?.count || incidentMarkers.length });
  }

  return (
    <div style={{ padding: '20px 10px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      {/* ROUTE & STATUS BAR WITH 30S LIVE POLLING BADGE */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-car-burst" style={{ color: '#ef4444' }}></i> Live Accident & Incident Alerts
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0 0' }}>
            {sourceName} → {destName} {lastSyncTime ? `(Last sync: ${lastSyncTime})` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Live Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: autoRefresh ? 'rgba(239, 68, 68, 0.12)' : 'rgba(100, 116, 139, 0.12)',
            border: `1px solid ${autoRefresh ? 'rgba(239, 68, 68, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 600,
            color: autoRefresh ? '#ef4444' : '#94a3b8'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: autoRefresh ? '#ef4444' : '#64748b',
              boxShadow: autoRefresh ? '0 0 8px #ef4444' : 'none'
            }}></span>
            {autoRefresh ? `LIVE (Polling in ${countdown}s)` : 'Polling Paused'}
          </div>

          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ background: '#0b0f19', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <i className={`fa-solid ${autoRefresh ? 'fa-pause' : 'fa-play'}`} style={{ marginRight: '5px' }}></i>
            {autoRefresh ? 'Pause' : 'Resume'}
          </button>

          <button 
            onClick={handleManualRefresh}
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`}></i>
            {loading ? 'Scanning...' : 'Refresh Now'}
          </button>

          <button 
            onClick={() => setShowRouteForm(!showRouteForm)}
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#3b82f6', padding: '6px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <i className="fa-solid fa-pen-to-square" style={{ marginRight: '5px' }}></i> Change Route
          </button>
        </div>
      </div>

      {showRouteForm && (
        <form onSubmit={handleRouteSubmit} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Source City (e.g. Theni)" value={customSrc} onChange={(e) => setCustomSrc(e.target.value)} style={{ flex: 1, minWidth: '180px', padding: '10px 14px', background: '#0b0f19', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontSize: '13px' }} />
          <input type="text" placeholder="Destination City (e.g. Periyakulam)" value={customDst} onChange={(e) => setCustomDst(e.target.value)} style={{ flex: 1, minWidth: '180px', padding: '10px 14px', background: '#0b0f19', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontSize: '13px' }} />
          <button type="submit" disabled={loading} style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Scanning...' : 'Check Accidents'}
          </button>
        </form>
      )}

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '12px', padding: '14px', marginBottom: '20px', fontSize: '14px', textAlign: 'center' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '8px' }}></i> {error}
        </div>
      )}

      {/* ADVANCED KPI & ANALYTICS DASHBOARD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '20px', marginBottom: '25px' }}>
        
        {/* Severity Gauge */}
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${hasAccident ? 'rgba(239,68,68,0.4)' : hasHazard ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.3)'}`, borderRadius: '16px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: 'var(--text-secondary)', alignSelf: 'flex-start' }}><i className="fa-solid fa-gauge-high"></i> Threat Level</h3>
          <div style={{ width: '140px', height: '140px', position: 'relative' }}>
            <Doughnut 
              data={{
                labels: ['Risk', 'Safe'],
                datasets: [{
                  data: [hasAccident ? 85 : hasHazard ? 50 : 10, hasAccident ? 15 : hasHazard ? 50 : 90],
                  backgroundColor: [hasAccident ? '#ef4444' : hasHazard ? '#f59e0b' : '#10b981', 'rgba(255,255,255,0.05)'],
                  borderWidth: 0,
                  circumference: 270,
                  rotation: 225
                }]
              }}
              options={{ cutout: '75%', plugins: { tooltip: { enabled: true }, legend: { display: false } }, maintainAspectRatio: false }}
            />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '24px', fontWeight: 900, color: hasAccident ? '#ef4444' : hasHazard ? '#f59e0b' : '#10b981' }}>
                {hasAccident ? 'HIGH' : hasHazard ? 'MODERATE' : 'LOW'}
              </span>
            </div>
          </div>
        </div>

        {/* Action & Advice Card */}
        <div style={{ background: hasAnyIncident ? 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(0,0,0,0))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(0,0,0,0))', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: 'var(--text-secondary)' }}><i className="fa-solid fa-shield-halved"></i> Action Required</h3>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px' }}>
            {statusText}
          </div>
          <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '15px' }}>
            {accidentResult?.advice || (hasAnyIncident ? 'Please reduce speed and prepare for potential delays or detours ahead.' : 'The route is currently clear. Maintain normal safe driving practices.')}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Suggested Speed Limit</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: hasAnyIncident ? '#f59e0b' : '#10b981' }}>{accidentResult?.speed || (hasAnyIncident ? 40 : 60)} km/h</span>
          </div>
        </div>

        {/* Live Event Trend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: 'var(--text-secondary)' }}><i className="fa-solid fa-chart-line"></i> Risk Trend (Past 6 Hrs)</h3>
          <div style={{ flex: 1, minHeight: '120px' }}>
            <Line 
              data={{
                labels: ['-5h', '-4h', '-3h', '-2h', '-1h', 'Now'],
                datasets: [{
                  label: 'Risk Level',
                  data: hasAccident ? [10, 15, 20, 80, 95, 100] : hasHazard ? [20, 30, 45, 55, 60, 65] : [10, 15, 10, 5, 8, 5],
                  borderColor: hasAccident ? '#ef4444' : hasHazard ? '#f59e0b' : '#10b981',
                  backgroundColor: hasAccident ? 'rgba(239,68,68,0.25)' : hasHazard ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)',
                  fill: true,
                  tension: 0.5,
                  pointRadius: 0,
                  pointHoverRadius: 6
                }]
              }}
              options={{ 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', intersect: false } }, 
                scales: { 
                  x: { display: true, grid: { display: false, drawBorder: false }, ticks: { color: '#64748b', font: { size: 11 } } }, 
                  y: { display: false, min: 0, max: 100 } 
                },
                animation: {
                  duration: 1500,
                  easing: 'easeInOutQuart'
                }
              }}
            />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>
            {hasAccident ? 'Risk spiking due to recent incident.' : 'Conditions are stable.'}
          </div>
        </div>
      </div>

      {/* MAP 1: PRIMARY ROUTE MAP */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', marginBottom: '25px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-map-location-dot" style={{ color: 'var(--accent-blue)' }}></i>
          Primary Route Map {hasAnyIncident ? `— ${incidentMarkers.length} Incident(s) Detected` : '— Clear Path'}
        </h3>
        <MapContainer className="app-map" center={[10.0104, 77.4768]} zoom={10} style={{ height: '420px', width: '100%', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <ResizeMap />
          <FitBounds source={sourceLocation} destination={destinationLocation} points={routePoints} incidentPoints={incidentMarkers} />

          {sourceLocation && isValidCoord(sourceLocation.lat, sourceLocation.lon) && (
            <Marker position={[sourceLocation.lat, sourceLocation.lon]}>
              <Popup>
                <div style={{ padding: '4px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#334155' }}>Source: {sourceName}</div>
                  <button 
                    onClick={() => {
                      const lang = window.confirm("Press OK for Tamil voice response. Press Cancel for English.");
                      if (lang) {
                        playClearVoice(`புறப்படும் இடம்: ${sourceName}.`, 'ta-IN');
                      } else {
                        playClearVoice(`Starting location is ${sourceName}.`, 'en-US');
                      }
                    }}
                    style={{ width: '100%', padding: '6px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-volume-high"></i> Play Voice
                  </button>
                </div>
              </Popup>
            </Marker>
          )}
          {destinationLocation && isValidCoord(destinationLocation.lat, destinationLocation.lon) && (
            <Marker position={[destinationLocation.lat, destinationLocation.lon]}>
              <Popup>
                <div style={{ padding: '4px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#334155' }}>Destination: {destName}</div>
                  <button 
                    onClick={() => {
                      const lang = window.confirm("Press OK for Tamil voice response. Press Cancel for English.");
                      if (lang) {
                        playClearVoice(`செல்லும் இடம்: ${destName}.`, 'ta-IN');
                      } else {
                        playClearVoice(`Destination is ${destName}.`, 'en-US');
                      }
                    }}
                    style={{ width: '100%', padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-volume-high"></i> Play Voice
                  </button>
                </div>
              </Popup>
            </Marker>
          )}

            {/* Render primary route path */}
            {primaryLatLngs.length > 0 && (
              <Polyline
                positions={primaryLatLngs}
                color={hasAnyIncident ? (hasAccident ? '#ef4444' : '#f59e0b') : '#10b981'}
                weight={5}
                opacity={0.85}
                dashArray={hasAccident ? '8, 8' : null}
              />
            )}

            {incidentMarkers.map((marker, index) => (
              <React.Fragment key={index}>
                <Circle
                  center={[marker.lat, marker.lon]}
                  radius={700}
                  pathOptions={{
                    color: getIncidentColor(marker.type),
                    fillColor: getIncidentColor(marker.type),
                    fillOpacity: 0.25,
                    weight: 2,
                    dashArray: '4, 4'
                  }}
                />
                <Marker position={[marker.lat, marker.lon]} icon={getIncidentIcon(marker.type)}>
                  <Popup>
                    <div style={{ minWidth: '180px', padding: '4px' }}>
                      <strong style={{ color: getIncidentColor(marker.type), fontSize: '14px' }}>⚠️ {marker.type} Zone</strong>
                      <div style={{ fontSize: '12px', marginTop: '6px', color: '#334155' }}>
                        {marker.description && <div><b>Details:</b> {marker.description}</div>}
                        {marker.distance_from_source > 0 && <div><b>Distance:</b> {marker.distance_from_source} km ahead</div>}
                        <div style={{ marginTop: '4px', color: '#ef4444', fontWeight: 600 }}>🛑 Main lane blocked / congested</div>
                        <button 
                          onClick={() => {
                            const lang = window.confirm("Press OK for Tamil voice response. Press Cancel for English.");
                            
                            const type = marker.type || '';
                            const desc = marker.description || '';
                            
                            if (lang) {
                              const exactReason = desc ? desc : `${type} zone`;
                              // Send the exact English reason to the backend! The backend will translate it to pure Tamil using Google Translate automatically.
                              playClearVoice(`கவனம். இந்த பகுதியில் ஆபத்து. ${exactReason}.`, 'ta-IN');
                            } else {
                              const exactReason = desc ? desc : `A ${type} has been reported.`;
                              playClearVoice(`Warning. The exact reason is: ${exactReason}.`, 'en-US');
                            }
                          }}
                          style={{
                            marginTop: '10px', width: '100%', padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                          }}>
                          <i className="fa-solid fa-volume-high"></i> Play Voice
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}
        </MapContainer>

        {/* Primary Map Legend */}
        <div style={{ display: 'flex', gap: '15px', marginTop: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '4px', backgroundColor: hasAccident ? '#ef4444' : '#10b981', display: 'inline-block', borderRadius: '2px' }}></span>
            <span>{hasAccident ? 'Blocked Primary Route (Incident ahead)' : 'Clear Primary Road'}</span>
          </div>
          {hasAnyIncident && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span>
              <span>Accident Exclusion Zone (Avoid)</span>
            </div>
          )}
        </div>
      </div>

      {/* MANDATORY RULE ENFORCEMENT: ONLY SHOW ALTERNATE MAP IF INCIDENT IS DETECTED! */}
      {hasAnyIncident && (
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))', 
          border: '1px solid rgba(16, 185, 129, 0.3)', 
          borderRadius: '16px', 
          padding: '22px', 
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', 
          marginBottom: '25px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#10b981', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-solid fa-route" style={{ fontSize: '20px' }}></i> Recommended Alternate Detour Map (Bypasses Incident Zone)
            </h3>
            <span style={{ fontSize: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '4px 12px', borderRadius: '12px', fontWeight: 700 }}>
              INCIDENT DETECTED — DETOUR ACTIVE
            </span>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
            The green route shows your path maintaining the main road with an exact <strong>safe side-lane bypass diversion</strong> around the accident spot ({incidentMarkers[0]?.lat?.toFixed(4)}, {incidentMarkers[0]?.lon?.toFixed(4)}).
            Look for the <strong style={{ color: '#f59e0b' }}>🟡 DETOUR START</strong> and <strong style={{ color: '#3b82f6' }}>🔵 DETOUR END</strong> markers to see exactly where the route changes.
          </p>

          {/* DETOUR COMPARISON STATS */}
          {altRoute && (
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <div style={{ background: '#0b0f19', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Detour Distance: <strong style={{ color: '#10b981' }}>{altRoute.distance_km} km</strong>
              </div>
              <div style={{ background: '#0b0f19', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Detour Travel Time: <strong style={{ color: '#10b981' }}>{altRoute.travel_time_min} min</strong>
              </div>
              <div style={{ background: '#0b0f19', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', color: '#10b981' }}>
                <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i>
                <strong>Zero Delay Service Road Bypass</strong>
              </div>
            </div>
          )}

          {/* MAP 2: ALTERNATE ROUTE MAP WITH EXPLICIT DIVERSION CALLOUT */}
          <MapContainer className="app-map" center={[10.0104, 77.4768]} zoom={10} style={{ height: '420px', width: '100%', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <ResizeMap />
            <FitBounds source={sourceLocation} destination={destinationLocation} points={altLatLngs.length > 0 ? altPoints : routePoints} incidentPoints={incidentMarkers} />

            {sourceLocation && isValidCoord(sourceLocation.lat, sourceLocation.lon) && (
              <Marker position={[sourceLocation.lat, sourceLocation.lon]}>
                <Popup>
                  <div style={{ padding: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#334155' }}>Source: {sourceName}</div>
                    <button 
                      onClick={() => {
                        const lang = window.confirm("Press OK for Tamil voice response. Press Cancel for English.");
                        if (lang) {
                          playClearVoice(`புறப்படும் இடம்: ${sourceName}.`, 'ta-IN');
                        } else {
                          playClearVoice(`Starting location is ${sourceName}.`, 'en-US');
                        }
                      }}
                      style={{ width: '100%', padding: '6px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-volume-high"></i> Play Voice
                    </button>
                  </div>
                </Popup>
              </Marker>
            )}
            {destinationLocation && isValidCoord(destinationLocation.lat, destinationLocation.lon) && (
              <Marker position={[destinationLocation.lat, destinationLocation.lon]}>
                <Popup>
                  <div style={{ padding: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#334155' }}>Destination: {destName}</div>
                    <button 
                      onClick={() => {
                        const lang = window.confirm("Press OK for Tamil voice response. Press Cancel for English.");
                        if (lang) {
                          playClearVoice(`செல்லும் இடம்: ${destName}.`, 'ta-IN');
                        } else {
                          playClearVoice(`Destination is ${destName}.`, 'en-US');
                        }
                      }}
                      style={{ width: '100%', padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-volume-high"></i> Play Voice
                    </button>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Original blocked segment underlay in transparent red */}
            {primaryLatLngs.length > 0 && (
              <Polyline
                positions={primaryLatLngs}
                color="#ef4444"
                weight={4}
                opacity={0.35}
                dashArray="6, 6"
              />
            )}

            {/* Render clear detour path in bright green */}
            {altLatLngs.length > 0 && (
              <Polyline
                positions={altLatLngs}
                color="#10b981"
                weight={6}
                opacity={0.95}
              />
            )}

            {/* ========== DETOUR START MARKER (where route leaves main road) ========== */}
            {altLatLngs.length > 0 && (() => {
              // Find where the alternate route first diverges from the primary route
              // This is where the detour begins
              const detourStart = altLatLngs[0];
              const detourEnd = altLatLngs[altLatLngs.length - 1];

              // Find the point on the alternate route closest to the incident (detour apex)
              let splitIdx = 0;
              let mergeIdx = altLatLngs.length - 1;

              if (incidentMarkers.length > 0) {
                const accLat = incidentMarkers[0].lat;
                const accLon = incidentMarkers[0].lon;

                // Walk from start to find where route diverges (split point)
                let minDistBefore = Infinity;
                for (let i = 0; i < Math.floor(altLatLngs.length / 2); i++) {
                  const d = Math.sqrt((altLatLngs[i][0] - accLat) ** 2 + (altLatLngs[i][1] - accLon) ** 2);
                  if (d < minDistBefore) {
                    minDistBefore = d;
                    splitIdx = Math.max(0, i - Math.floor(altLatLngs.length * 0.08));
                  }
                }

                // Walk from end to find where route merges back (merge point)
                let minDistAfter = Infinity;
                for (let i = altLatLngs.length - 1; i > Math.floor(altLatLngs.length / 2); i--) {
                  const d = Math.sqrt((altLatLngs[i][0] - accLat) ** 2 + (altLatLngs[i][1] - accLon) ** 2);
                  if (d < minDistAfter) {
                    minDistAfter = d;
                    mergeIdx = Math.min(altLatLngs.length - 1, i + Math.floor(altLatLngs.length * 0.08));
                  }
                }
              }

              splitIdx = Math.max(0, splitIdx);
              mergeIdx = Math.min(altLatLngs.length - 1, mergeIdx);

              const splitPoint = altLatLngs[splitIdx];
              const mergePoint = altLatLngs[mergeIdx];

              const detourStartIcon = new L.divIcon({
                className: 'detour-start-marker',
                html: `<div style="
                  display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);
                ">
                  <div style="
                    background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;
                    padding:4px 10px;border-radius:8px;font-size:11px;font-weight:800;
                    white-space:nowrap;box-shadow:0 4px 12px rgba(245,158,11,0.5);
                    border:2px solid #fff;letter-spacing:0.5px;
                  ">⚡ DETOUR START</div>
                  <div style="
                    width:0;height:0;border-left:8px solid transparent;
                    border-right:8px solid transparent;border-top:10px solid #d97706;
                  "></div>
                </div>`,
                iconSize: [100, 45],
                iconAnchor: [50, 45]
              });

              const detourEndIcon = new L.divIcon({
                className: 'detour-end-marker',
                html: `<div style="
                  display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);
                ">
                  <div style="
                    background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;
                    padding:4px 10px;border-radius:8px;font-size:11px;font-weight:800;
                    white-space:nowrap;box-shadow:0 4px 12px rgba(59,130,246,0.5);
                    border:2px solid #fff;letter-spacing:0.5px;
                  ">✅ DETOUR END</div>
                  <div style="
                    width:0;height:0;border-left:8px solid transparent;
                    border-right:8px solid transparent;border-top:10px solid #1d4ed8;
                  "></div>
                </div>`,
                iconSize: [100, 45],
                iconAnchor: [50, 45]
              });

              const dangerZoneIcon = new L.divIcon({
                className: 'danger-zone-marker',
                html: `<div style="
                  display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);
                ">
                  <div style="
                    background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;
                    padding:5px 12px;border-radius:8px;font-size:12px;font-weight:900;
                    white-space:nowrap;box-shadow:0 4px 15px rgba(239,68,68,0.6);
                    border:2px solid #fff;animation:pulse 2s infinite;
                  ">🚫 DANGER ZONE</div>
                  <div style="
                    width:0;height:0;border-left:8px solid transparent;
                    border-right:8px solid transparent;border-top:10px solid #b91c1c;
                  "></div>
                </div>`,
                iconSize: [120, 48],
                iconAnchor: [60, 48]
              });

              return (
                <>
                  <Marker position={splitPoint} icon={detourStartIcon} zIndexOffset={2000}>
                    <Popup>
                      <div style={{ minWidth: '200px', padding: '6px' }}>
                        <strong style={{ color: '#f59e0b', fontSize: '14px' }}>⚡ Detour Starts Here</strong>
                        <div style={{ fontSize: '12px', marginTop: '6px', color: '#334155' }}>
                          <div>Route leaves the main road here to avoid the accident zone ahead.</div>
                          <div style={{ marginTop: '4px' }}><b>Coordinates:</b> {splitPoint[0].toFixed(5)}, {splitPoint[1].toFixed(5)}</div>
                          <div style={{ marginTop: '4px', color: '#f59e0b', fontWeight: 600 }}>➡️ Follow the green bypass lane</div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>

                  <Marker position={mergePoint} icon={detourEndIcon} zIndexOffset={2000}>
                    <Popup>
                      <div style={{ minWidth: '200px', padding: '6px' }}>
                        <strong style={{ color: '#3b82f6', fontSize: '14px' }}>✅ Detour Ends Here</strong>
                        <div style={{ fontSize: '12px', marginTop: '6px', color: '#334155' }}>
                          <div>Route merges back onto the main road here. Incident zone is behind you.</div>
                          <div style={{ marginTop: '4px' }}><b>Coordinates:</b> {mergePoint[0].toFixed(5)}, {mergePoint[1].toFixed(5)}</div>
                          <div style={{ marginTop: '4px', color: '#10b981', fontWeight: 600 }}>✅ Safe to continue on main road</div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>

                  {incidentMarkers.length > 0 && (
                    <Marker position={[incidentMarkers[0].lat, incidentMarkers[0].lon]} icon={dangerZoneIcon} zIndexOffset={2500}>
                      <Popup>
                        <div style={{ minWidth: '220px', padding: '6px' }}>
                          <strong style={{ color: '#ef4444', fontSize: '15px' }}>🚫 DANGER ZONE — DO NOT ENTER</strong>
                          <div style={{ fontSize: '12px', marginTop: '8px', color: '#334155' }}>
                            <div><b>Type:</b> {incidentMarkers[0].type}</div>
                            {incidentMarkers[0].description && <div><b>Details:</b> {incidentMarkers[0].description}</div>}
                            <div><b>Location:</b> {incidentMarkers[0].lat?.toFixed(5)}, {incidentMarkers[0].lon?.toFixed(5)}</div>
                            <div style={{ marginTop: '6px', color: '#ef4444', fontWeight: 700 }}>🛑 Main lane BLOCKED — Use green bypass</div>
                            <button 
                              onClick={() => {
                                const lang = window.confirm("Press OK for Tamil voice response. Press Cancel for English.");
                                
                                const type = incidentMarkers[0].type || '';
                                const desc = incidentMarkers[0].description || '';
                                
                                if (lang) {
                                  const exactReason = desc ? desc : `${type} zone`;
                                  // Send the exact English reason to the backend! The backend will translate it to pure Tamil using Google Translate automatically.
                                  playClearVoice(`கவனம். இந்த பகுதியில் ஆபத்து. ${exactReason}. மாற்றுப் பாதையை பயன்படுத்தவும்.`, 'ta-IN');
                                } else {
                                  const exactReason = desc ? desc : `A ${type} has been reported.`;
                                  playClearVoice(`Warning. Danger zone ahead. The exact reason is: ${exactReason}. Please use the green bypass lane.`, 'en-US');
                                }
                              }}
                              style={{
                                marginTop: '10px', width: '100%', padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                              }}>
                              <i className="fa-solid fa-volume-high"></i> Play Voice Alert
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </>
              );
            })()}

            {/* Incident danger circles */}
            {incidentMarkers.map((marker, index) => (
              <React.Fragment key={`detour-circle-${index}`}>
                <Circle
                  center={[marker.lat, marker.lon]}
                  radius={600}
                  pathOptions={{
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.15,
                    weight: 2,
                    dashArray: '5, 5'
                  }}
                />
                {/* Outer warning halo */}
                <Circle
                  center={[marker.lat, marker.lon]}
                  radius={1000}
                  pathOptions={{
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.05,
                    weight: 1,
                    dashArray: '8, 8'
                  }}
                />
              </React.Fragment>
            ))}
          </MapContainer>

          {/* Alternate Map Legend */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '20px', height: '5px', backgroundColor: '#10b981', display: 'inline-block', borderRadius: '3px' }}></span>
              <strong style={{ color: '#10b981' }}>Active Green Route</strong>: Safe Bypass & Main Road
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '20px', height: '3px', borderTop: '3px dashed #ef4444', display: 'inline-block' }}></span>
              <strong style={{ color: '#ef4444' }}>Dashed Red Line</strong>: Blocked Incident Area
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>⚡</span>
              <strong style={{ color: '#f59e0b' }}>DETOUR START</strong>: Where route leaves main road
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>✅</span>
              <strong style={{ color: '#3b82f6' }}>DETOUR END</strong>: Where route merges back
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>🚫</span>
              <strong style={{ color: '#ef4444' }}>DANGER ZONE</strong>: Accident spot (avoid)
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
