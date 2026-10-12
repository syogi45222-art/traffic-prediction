import React, { useState, useEffect, useRef } from 'react';
import { useTraffic } from '../context/TrafficContext';
import { predictTraffic, getAccidentInfo, saveHistory, getTrainInfo, reverseGeocode, getUpcomingEvents } from '../api/api';
import { useNavigate } from 'react-router-dom';
import LocationSearch from '../components/LocationSearch';
import RouteMap from '../components/RouteMap';
import NavigationPanel from '../components/NavigationPanel';
import useNavigation from '../hooks/useNavigation';
import { SpeedChart, TimeChart } from '../components/TrafficCharts';
import { Panel, StatTile, RouteBar } from '../components/ui';
import { round1 } from '../components/chartTheme';
import WeatherCard from '../components/WeatherCard';
import AccidentCard from '../components/AccidentCard';


const ACCIDENT_POLL_INTERVAL = 30000;

/* =============================================
   DASHBOARD PAGE
   ===================================== */
export default function DashboardPage() {
  const {
    sourceLocation, setSourceLocation,
    destinationLocation, setDestinationLocation,
    predictionData, setPredictionData,
    accidentData, setAccidentData,
    selectedTime, setSelectedTime,
    selectedDate, setSelectedDate,
    dashboardView, setDashboardView,
    isJourneyActive, setIsJourneyActive
  } = useTraffic();

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [accidentAlert, setAccidentAlert] = useState(null);
  const [trainData, setTrainData] = useState(null); // Train State for Dashboard Alert
  const [allTrains, setAllTrains] = useState([]); // All trains for Dashboard Map Icons
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  const navApi = useNavigation({
    predictionData,
    destinationName: destinationLocation?.name,
    accidents: accidentData?.accidents,
    trains: allTrains,
    events: predictionData?.events,
    schools: predictionData?.school_zones
  });

  useEffect(() => {
    getUpcomingEvents(7).then((list) => { if (mountedRef.current) setUpcomingEvents(list); }).catch(() => {});
  }, []);

  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const view = dashboardView;

  const hasAccident = accidentData?.has_accident === true;
  const hasHazard = accidentData?.has_hazard === true;
  const hasTraffic = accidentData?.has_traffic === true;
  const hasAnyIncident = hasAccident || hasHazard || hasTraffic;

  /* =====================================
     MOUNT TRACKING
     ===================================== */
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* =====================================
     TRAIN INFO FETCH (For Dashboard Alert & Map Icons)
     ===================================== */
  useEffect(() => {
    const src = sourceLocation?.name?.split(',')[0];
    const dest = destinationLocation?.name?.split(',')[0];

    if (src && dest) {
      getTrainInfo(src, dest, time || null, date || null).then(data => {
        if (mountedRef.current) {
          if (data?.trains?.length > 0) {
            setAllTrains(data.trains); // Store all trains for Dashboard Map
            setTrainData(data.trains[0]); // First train for alert banner
          } else {
            setAllTrains([]);
            setTrainData(null);
          }
        }
      }).catch(err => {
        console.error("Train fetch error:", err);
        if (mountedRef.current) {
          setAllTrains([]);
          setTrainData(null);
        }
      });
    } else {
      setAllTrains([]);
      setTrainData(null); 
    }
  }, [sourceLocation, destinationLocation, time, date]);

  /* =====================================
     ACCIDENT POLLING (EVERY 30 SECONDS)
     ===================================== */
  async function fetchAccidentData() {
    const src = sourceLocation?.name || '';
    const dest = destinationLocation?.name || '';
    if (!src || !dest) return;
    try {
      const data = await getAccidentInfo(src, dest);
      if (!mountedRef.current) return;
      setAccidentData(data);

      const hasAcc = data?.has_accident === true;
      const hasHaz = data?.has_hazard === true;
      const hasTraf = data?.has_traffic === true;
      const hasAny = hasAcc || hasHaz || hasTraf || (data?.accidents && data.accidents.length > 0);

      if (hasAny) {
        setAccidentAlert({
          type: hasAcc ? 'accident' : 'warning',
          title: hasAcc ? '⚠️ Accident Detected!' : '⚠️ Incident Alert',
          message: `${data.status || 'Incident Detected'} on route ${src} → ${dest}. Click to view details.`,
          route: `${src} → ${dest}`
        });
      }
    } catch (err) { console.error('Accident poll error:', err); }
  }

  useEffect(() => {
    if (predictionData && sourceLocation && destinationLocation) {
      fetchAccidentData();
      pollRef.current = setInterval(fetchAccidentData, ACCIDENT_POLL_INTERVAL);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [predictionData, sourceLocation, destinationLocation]);

  useEffect(() => {
    if (accidentAlert) {
      const t = setTimeout(() => { if (mountedRef.current) setAccidentAlert(null); }, 10000);
      return () => clearTimeout(t);
    }
  }, [accidentAlert]);

  /* =====================================
     USE MY CURRENT LOCATION AS SOURCE
     ===================================== */
  function handleUseMyLocation() {
    if (!navigator.geolocation) { setLocateError('Location is not supported by this browser.'); return; }
    setLocating(true);
    setLocateError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        let place = null;
        for (let attempt = 0; attempt < 2 && !place?.city; attempt++) {
          try { place = await reverseGeocode(lat, lon); } catch (err) { console.error('Reverse geocode error:', err); }
        }
        if (!mountedRef.current) return;
        // "name" feeds weather + train lookups, so use the city; keep the exact spot in lat/lon
        setSourceLocation({
          name: place?.city || place?.name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          address: place?.address || '',
          placeName: place?.city && place?.name && place.name !== place.city ? `${place.name}, ${place.city}` : (place?.name || ''),
          lat, lon, accuracy,
          isCurrentLocation: true
        });
        setLocating(false);
      },
      (err) => {
        if (!mountedRef.current) return;
        setLocating(false);
        setLocateError(err.code === 1
          ? 'Location permission denied. Allow location for this site in your browser settings.'
          : 'Could not get your location. Try again or type the place.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  const coordsOf = (loc) => (loc && isFinite(loc.lat) && isFinite(loc.lon) ? { lat: loc.lat, lon: loc.lon } : null);

  /* =====================================
     PREDICT
     ===================================== */
  async function handlePredict() {
    const src = sourceLocation?.name || '';
    const dest = destinationLocation?.name || '';
    if (!src || !dest) { alert('Please select both Source and Destination.'); return; }
    setLoading(true);
    try {
      setSelectedTime(time || '');
      setSelectedDate(date || '');
      const data = await predictTraffic(src, dest, date, time, null, {
        source: coordsOf(sourceLocation),
        destination: coordsOf(destinationLocation)
      });
      if (!mountedRef.current) return;
      setPredictionData(data);

      // SAVE TO SQLITE DATABASE
      saveHistory({
        user_id: localStorage.getItem('user_id'),
        source: src,
        destination: dest,
        prediction: data.traffic_prediction,
        delay: data.traffic_metrics?.delay || 0,
        distance: data.traffic_metrics?.distance || 0
      });

      try {
        const accData = await getAccidentInfo(src, dest);
        if (mountedRef.current && accData) {
          setAccidentData(accData);
          const hasAcc = accData.has_accident === true;
          const hasHaz = accData.has_hazard === true;
          const hasTraf = accData.has_traffic === true;
          const hasAny = hasAcc || hasHaz || hasTraf || (accData.accidents && accData.accidents.length > 0);

          if (hasAny) {
            setAccidentAlert({
              type: hasAcc ? 'accident' : 'warning',
              title: hasAcc ? '⚠️ Accident Detected!' : '⚠️ Incident Alert',
              message: `${accData.status || 'Incident Detected'} on route ${src} → ${dest}. Click to view details.`,
              route: `${src} → ${dest}`
            });
          } else {
            setAccidentAlert(null);
          }
        }
      } catch (err) { console.error('Accident Error:', err); }
      
      setDashboardView('results');
    } catch (err) {
      if (mountedRef.current) alert(err?.response?.data?.error || 'Prediction failed.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function handleReset() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    navApi.stop();
    setDashboardView('search');
    setPredictionData(null);
    setAccidentData(null);
    setSourceLocation(null);
    setDestinationLocation(null);
    setDate('');
    setTime('');
    setIsJourneyActive(false);
    setAccidentAlert(null);
    setTrainData(null); // Reset train data
  }

  function handleStartJourney() {
    if (!predictionData?.route) { alert('No active route.'); return; }
    setIsJourneyActive(true);
    setDashboardView('journey');
  }

  function handleExitJourney() {
    navApi.stop();
    setIsJourneyActive(false);
    setDashboardView('results');
  }

  return (
    <div className="dashboard-view">

      {/* ACCIDENT ALERT POPUP */}
      {accidentAlert && view !== 'search' && predictionData && (
        <div
          className="accident-toast"
          style={{
            position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
            background: accidentAlert.type === 'accident' 
              ? 'linear-gradient(135deg, rgba(239,68,68,0.95), rgba(185,28,28,0.98))' 
              : 'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(180,83,9,0.98))',
            color: '#fff', padding: '18px 24px', borderRadius: '16px',
            boxShadow: '0 15px 40px rgba(0,0,0,0.5)', maxWidth: '440px',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)',
            animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: 'default'
          }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.25)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 2px 5px rgba(255,255,255,0.2)' }}>
              <i className={`fa-solid ${accidentAlert.type === 'accident' ? 'fa-triangle-exclamation fa-beat' : 'fa-car-burst'}`} style={{ fontSize: '22px' }}></i>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h4 style={{ fontWeight: 800, fontSize: '16px', margin: 0, letterSpacing: '0.3px' }}>{accidentAlert.title || '⚠️ Critical Alert'}</h4>
                <button onClick={() => setAccidentAlert(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '16px', padding: 0 }}><i className="fa-solid fa-xmark"></i></button>
              </div>
              <p style={{ fontSize: '13px', opacity: 0.95, lineHeight: 1.5, margin: '0 0 10px 0' }}>{accidentAlert.message}</p>
              <button 
                onClick={() => navigate('/accident')}
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
              >
                View Detailed Accident Report <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
          <style>
            {`
              @keyframes slideInRight {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
            `}
          </style>
        </div>
      )}

      {/* ==================== SEARCH STATE ==================== */}
      {view === 'search' && (
        <section className="route-card">
          <h2><i className="fa-solid fa-location-dot"></i> Route Prediction</h2>
          <div className="form-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <LocationSearch id="source" label="Source" placeholder="Search city, town or place..." value={sourceLocation} onSelect={(loc) => setSourceLocation(loc)} />
              <button type="button" className="locate-btn" onClick={handleUseMyLocation} disabled={locating}>
                <i className={`fa-solid ${locating ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`}></i>
                {locating ? 'Finding you…' : 'Use my current location'}
              </button>
              {sourceLocation?.isCurrentLocation && (
                <div className="locate-hint">
                  <i className="fa-solid fa-location-dot" style={{ color: '#10b981' }}></i>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>{sourceLocation.placeName || 'Location name not found'}</strong>
                    {sourceLocation.address && <><br />{sourceLocation.address}</>}
                    {!sourceLocation.placeName && <><br />{sourceLocation.lat.toFixed(5)}, {sourceLocation.lon.toFixed(5)}</>}
                  </span>
                </div>
              )}
              {locateError && <div className="locate-hint error"><i className="fa-solid fa-circle-exclamation"></i> {locateError}</div>}
            </div>
            <LocationSearch id="destination" label="Destination" placeholder="Search city, town or place..." value={destinationLocation} onSelect={(loc) => setDestinationLocation(loc)} />
            <div><label htmlFor="date">Travel Date</label><input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label htmlFor="time">Travel Time</label><input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <button className="predict-btn" onClick={handlePredict} disabled={loading}>
            {loading ? <><i className="fa-solid fa-spinner fa-spin"></i> Predicting...</> : <><i className="fa-solid fa-bolt"></i> Predict Traffic</>}
          </button>
        </section>
      )}

      {/* ==================== RESULTS STATE ==================== */}
      {view === 'results' && predictionData && (
        <section>
          <div style={{ marginBottom: '20px' }}>
            <RouteBar
              source={sourceLocation?.name}
              destination={destinationLocation?.name}
              level={predictionData.traffic_prediction}
              meta={predictionData.date && `${predictionData.date}${predictionData.time ? ` · ${predictionData.time}` : ''}`}
              actions={<button className="btn" onClick={handleReset}><i className="fa-solid fa-rotate-left"></i> New route</button>}
            />
          </div>

          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <StatTile label="Travel time" icon="fa-clock" color="#3b82f6"
              value={round1(predictionData.traffic_metrics?.travel_time ?? predictionData.route?.travel_time_min)} unit="min"
              hint={`Includes ${round1(predictionData.traffic_metrics?.delay)} min traffic delay`} />
            <StatTile label="Current speed" icon="fa-gauge-high" color="#10b981"
              value={round1(predictionData.traffic_metrics?.average_speed)} unit="km/h"
              hint={`Free-flow ${round1(predictionData.traffic_metrics?.free_flow_speed)} km/h`} />
            <StatTile label="Distance" icon="fa-route" color="#8b5cf6"
              value={round1(predictionData.traffic_metrics?.distance ?? predictionData.route?.distance_km)} unit="km" />
            <StatTile label="Vehicles on route" icon="fa-car-side" color="#f59e0b"
              value={predictionData.traffic_metrics?.vehicle_count?.toLocaleString()}
              hint="Estimated from live flow" />
          </div>

          {predictionData.suggested_departure && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '14px', padding: '18px 22px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', gap: '15px'
            }}>
              <div style={{ width: '48px', height: '48px', background: 'rgba(59,130,246,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: '#3b82f6' }}>
                <i className="fa-regular fa-clock"></i>
              </div>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#60a5fa', margin: '0 0 4px 0' }}>Departure Time Optimizer</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{predictionData.traffic_prediction} traffic is expected at your chosen time. We suggest leaving at <strong>{predictionData.suggested_departure}</strong> to minimize delay.</p>
              </div>
            </div>
          )}


          {predictionData.events?.length > 0 && (
            <div className="event-banner">
              <i className="fa-solid fa-champagne-glasses"></i>
              <div>
                <h4>{predictionData.events.length === 1 ? 'Festival / event on your route' : `${predictionData.events.length} events on your route`}</h4>
                {predictionData.events.map((ev) => (
                  <p key={ev.id}><strong style={{ color: 'var(--text-primary)' }}>{ev.name}</strong> near {ev.location_name || 'the route'} · {ev.start_time && ev.end_time ? `${ev.start_time}–${ev.end_time}` : 'all day'} · <span style={{ color: ev.impact === 'High' ? '#ef4444' : ev.impact === 'Moderate' ? '#f59e0b' : '#3b82f6' }}>{ev.impact} impact</span>{ev.notes ? ` — ${ev.notes}` : ''}</p>
                ))}
              </div>
            </div>
          )}

          {predictionData.school_zones?.some((z) => z.active_at_travel_time) && (
            <div className="event-banner school">
              <i className="fa-solid fa-children"></i>
              <div>
                <h4>School zone on your route at this time</h4>
                {predictionData.school_zones.filter((z) => z.active_at_travel_time).map((z) => (
                  <p key={z.id}><strong style={{ color: 'var(--text-primary)' }}>{z.name}</strong> near {z.location_name || 'the route'} · children arriving/leaving · slow to <strong>{z.speed_limit} km/h</strong></p>
                ))}
              </div>
            </div>
          )}

          {predictionData.cause_analysis && (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px', padding: '18px 22px', marginBottom: '20px'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>
                <i className="fa-solid fa-chart-pie" style={{color: '#3b82f6', marginRight: '8px'}}></i>
                Traffic Factor Analysis
              </h3>
              
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div style={{ flex: '1 1 300px', background: 'rgba(59, 130, 246, 0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: 0 }}>🎯 Main Contributing Cause</h4>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>
                    {predictionData.cause_analysis.main_cause.icon} {predictionData.cause_analysis.main_cause.label}
                  </div>
                  <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }}>
                    {predictionData.cause_analysis.explanation}
                  </p>
                </div>
              </div>

              <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Contributing Factors:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {predictionData.cause_analysis.factors.map((f, i) => {
                  const width = Math.max(0, f.score) + '%';
                  const color = f.impact === 'HIGH' ? '#ef4444' : f.impact === 'MEDIUM' ? '#f59e0b' : f.impact === 'LOW' ? '#3b82f6' : '#64748b';
                  
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                      <div style={{ width: '160px', fontSize: '13px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{f.icon}</span> {f.label}
                      </div>
                      <div style={{ width: '70px', fontSize: '12px', fontWeight: 'bold', color }}>
                        {f.impact}
                      </div>
                      <div style={{ flex: '1 1 150px', background: 'rgba(255,255,255,0.05)', height: '10px', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                        {f.status === 'available' ? (
                          <div style={{ width, background: color, height: '100%', borderRadius: '5px', transition: 'width 1s ease' }}></div>
                        ) : (
                          <div style={{ fontSize: '10px', color: '#64748b', paddingLeft: '5px', lineHeight: '10px', position: 'absolute', top: 0 }}>Data unavailable</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {accidentData && (
            <div style={{
              background: hasAnyIncident ? (hasAccident ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))' : 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.05))') : 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))',
              border: `1px solid ${hasAnyIncident ? (hasAccident ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)') : 'rgba(16,185,129,0.25)'}`,
              borderRadius: '14px', padding: '18px 22px', marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '48px', height: '48px', background: hasAccident ? 'rgba(239,68,68,0.2)' : hasHazard ? 'rgba(245,158,11,0.2)' : hasTraffic ? 'rgba(249,115,22,0.2)' : 'rgba(16,185,129,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: hasAccident ? '#ef4444' : hasHazard ? '#f59e0b' : hasTraffic ? '#f97316' : '#10b981' }}>
                    <i className={`fa-solid ${hasAccident ? 'fa-triangle-exclamation' : hasHazard ? 'fa-cloud-rain' : hasTraffic ? 'fa-road-barrier' : 'fa-circle-check'}`}></i>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: hasAccident ? '#ef4444' : hasHazard ? '#f59e0b' : hasTraffic ? '#f97316' : '#10b981' }}>{accidentData?.status || 'No Accident Detected'}</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{hasAnyIncident ? `${accidentData?.count || 0} incident(s) ${accidentData?.nearest_area ? `— ${accidentData.nearest_area}` : ''} — Speed: ${accidentData?.speed || 60} km/h` : 'Route is clear — No incidents detected'}</p>
                  </div>
                </div>
                <button onClick={() => navigate('/accident')} style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-arrow-right"></i> View Details
                </button>
              </div>
            </div>
          )}

          {/* TRAIN ARRIVAL ALERT BOX (Dashboard Short Popup) */}
          {trainData && (
            <div 
              onClick={() => navigate('/train')} 
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))', 
                border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '14px', 
                padding: '15px 20px', marginBottom: '20px', cursor: 'pointer' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <i className="fa-solid fa-train" style={{ fontSize: '24px', color: '#3b82f6' }}></i>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#f8fafc' }}>Train Arrival Alert!</h4>
                  <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    {trainData.train_name} departs {trainData.from_station} at {trainData.depart_time}
                  </p>
                </div>
              </div>
              <button style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                View Details
              </button>
            </div>
          )}

          <section className="map-section" style={{ marginTop: '0' }}>
            <h2><i className="fa-solid fa-map-location-dot"></i> Live Route Map</h2>
            <RouteMap source={sourceLocation} destination={destinationLocation} routePoints={predictionData.route?.points} prediction={predictionData.traffic_prediction} trains={allTrains} accidents={accidentData?.accidents} />
          </section>

          <div style={{ marginTop: '25px', textAlign: 'center' }}>
            <button className="predict-btn" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} onClick={handleStartJourney}><i className="fa-solid fa-play"></i> Start My Journey</button>
          </div>

          <div className="grid-2" style={{ marginTop: '25px' }}>
            <Panel title="Speed vs free-flow" icon="fa-gauge-high">
              <SpeedChart metrics={predictionData.traffic_metrics} />
            </Panel>
            <Panel title="Where the travel time goes" icon="fa-hourglass-half">
              <TimeChart rows={[{ label: 'This trip', metrics: predictionData.traffic_metrics, level: predictionData.traffic_prediction }]} />
            </Panel>
          </div>

          <div className="grid-2" style={{ marginTop: '20px' }}>
            <WeatherCard weather={predictionData.weather} />
            <AccidentCard accident={accidentData} />
          </div>
        </section>
      )}

      {/* ==================== LIVE NAVIGATION ==================== */}
      {view === 'journey' && predictionData && (
        <NavigationPanel
          api={navApi}
          source={sourceLocation?.isCurrentLocation ? 'My location' : sourceLocation?.name}
          destination={destinationLocation?.name}
          prediction={predictionData}
          onExit={handleExitJourney}
        />
      )}

      {/* ==================== UPCOMING FESTIVALS / EVENTS ==================== */}
      {view === 'search' && upcomingEvents.length > 0 && (
        <Panel title="Festivals & events this week" icon="fa-calendar-days" className="upcoming-events">
          <div className="event-list">
            {upcomingEvents.slice(0, 6).map((ev) => (
              <div key={ev.id} className="event-row">
                <div className="event-icon" style={{ color: '#f472b6', background: 'rgba(236,72,153,0.12)' }}><i className="fa-solid fa-champagne-glasses"></i></div>
                <div className="event-main">
                  <div className="event-name">{ev.name} <span className="event-tag" style={{ color: ev.impact === 'High' ? '#ef4444' : ev.impact === 'Moderate' ? '#f59e0b' : '#3b82f6' }}>{ev.impact}</span></div>
                  <div className="event-meta"><i className="fa-solid fa-location-dot"></i> {ev.location_name} · {new Date(`${ev.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {ev.start_time && ev.end_time ? `${ev.start_time}–${ev.end_time}` : 'all day'}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ==================== EMPTY STATE ==================== */}
      {view === 'search' && (
        <div className="feature-grid">
          <div className="feature"><i className="fa-solid fa-brain"></i><h4>ML traffic level</h4><p>Low, moderate or high traffic for your date and time, with the main cause explained.</p></div>
          <div className="feature"><i className="fa-solid fa-map-location-dot"></i><h4>Live route map</h4><p>Fastest road route with live incidents and trains crossing your path.</p></div>
          <div className="feature"><i className="fa-solid fa-clock"></i><h4>Best departure time</h4><p>Suggests when to leave to avoid delay, and forecasts later times on ML Prediction.</p></div>
          <div className="feature"><i className="fa-solid fa-cloud-sun"></i><h4>Weather & safety</h4><p>Weather along the route and a safe-speed suggestion near incidents.</p></div>
        </div>
      )}
      

    </div>
  );
}