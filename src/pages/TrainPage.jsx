import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTraffic } from '../context/TrafficContext';
import { getTrainInfo } from '../api/api';
import TrainMap from '../components/TrainMap';

export default function TrainPage() {
  const navigate = useNavigate();
  const { sourceLocation, destinationLocation, selectedTime, selectedDate } = useTraffic();
  const [trainData, setTrainData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false); // Fallback for image
  const [customTime, setCustomTime] = useState(selectedTime || '');

  const fetchTrains = async (timeOverride = null) => {
    if (!sourceLocation?.name || !destinationLocation?.name) {
      setLoading(false);
      setTrainData(null);
      return;
    }
    setLoading(true);
    const srcName = sourceLocation.name.split(',')[0];
    const destName = destinationLocation.name.split(',')[0];
    const timeQuery = timeOverride !== null ? timeOverride : (customTime || selectedTime || null);
    const data = await getTrainInfo(srcName, destName, timeQuery, selectedDate || null);
    setTrainData(data);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedTime) {
      setCustomTime(selectedTime);
      fetchTrains(selectedTime);
    } else {
      fetchTrains();
    }
  }, [sourceLocation, destinationLocation, selectedTime, selectedDate]);

  const styles = {
    container: { padding: '25px 35px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' },
    headerImg: {
      width: '100%', height: '220px', borderRadius: '16px', marginBottom: '25px',
      backgroundImage: 'url("https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1400&q=80")',
      backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
    },
    overlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
      background: 'linear-gradient(180deg, rgba(11,15,25,0) 0%, rgba(11,15,25,0.9) 100%)',
      borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      padding: '25px'
    },
    title: { color: '#fff', fontSize: '24px', fontWeight: '800', margin: 0 },
    subtitle: { color: '#94a3b8', fontSize: '14px', marginTop: '5px' },
    
    summaryCard: {
      backgroundColor: '#131b2e', border: '1px solid rgba(59, 130, 246, 0.3)',
      borderRadius: '12px', padding: '20px', marginBottom: '25px', textAlign: 'center'
    },
    summaryText: { color: '#f8fafc', fontSize: '16px', fontWeight: '600', margin: 0 },

    trainCard: {
      backgroundColor: '#131b2e', border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '12px', padding: '20px', marginBottom: '15px'
    },
    trainHeaderRow: { 
      display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', 
      borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px'
    },
    trainImage: { 
      width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', 
      boxShadow: '0 4px 10px rgba(0,0,0,0.3)', flexShrink: 0,
      backgroundColor: '#0b0f19' // Fallback bg color
    },
    trainIconFallback: {
      width: '60px', height: '60px', borderRadius: '10px', 
      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 10px rgba(0,0,0,0.3)', flexShrink: 0
    },
    trainInfo: { flex: 1 },
    trainName: { fontSize: '16px', fontWeight: '700', color: '#f8fafc' },
    trainNo: { fontSize: '13px', color: '#94a3b8', marginTop: '2px' },
    
    timeBox: {
      backgroundColor: '#0b0f19', padding: '8px 12px', borderRadius: '8px', textAlign: 'center', minWidth: '80px'
    },
    timeLabel: { color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
    timeValue: { color: '#f8fafc', fontSize: '15px', fontWeight: '700' },
    
    typeBadge: { 
      fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '12px', 
      backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', marginTop: '5px', display: 'inline-block'
    },
    typeBadgeHub: { backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },

    // Timeline styles for exact track points
    timelineTitle: { fontSize: '13px', color: '#64748b', margin: '15px 0 15px 5px', fontWeight: '600' },
    timeline: { display: 'flex', flexDirection: 'column', marginLeft: '10px' },
    timelineItem: { display: 'flex', gap: '20px', position: 'relative', paddingBottom: '20px' },
    timelineIcon: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
    timelineDot: { width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6', zIndex: 2, marginTop: '5px' },
    timelineLine: { position: 'absolute', left: '5px', top: '17px', bottom: '-8px', width: '2px', backgroundColor: 'rgba(59, 130, 246, 0.3)' },
    timelineContent: { flex: 1, backgroundColor: '#0b0f19', padding: '10px 15px', borderRadius: '8px', marginLeft: '15px' },
    stationName: { color: '#f8fafc', fontSize: '14px', fontWeight: '600' },
    timeText: { color: '#94a3b8', fontSize: '12px', marginTop: '4px' },

    emptyText: { textAlign: 'center', color: '#94a3b8', padding: '40px' }
  };

  const trains = trainData?.trains || [];

  return (
    <div style={styles.container}>
      
      <div style={styles.headerImg}>
        <div style={styles.overlay}>
          <h1 style={styles.title}>Train Schedules & Arrivals</h1>
          <p style={styles.subtitle}>
            {sourceLocation?.name && destinationLocation?.name 
              ? <>Showing trains from <strong style={{ color: '#3b82f6' }}>{sourceLocation.name.split(',')[0]}</strong> to <strong style={{ color: '#3b82f6' }}>{destinationLocation.name.split(',')[0]}</strong></>
              : <>Please select a route on the Dashboard to view trains.</>
            }
          </p>
        </div>
      </div>

      {loading ? (
        <div style={styles.trainCard}>
          <p style={styles.emptyText}><i className="fa-solid fa-spinner fa-spin"></i> Fetching train data...</p>
        </div>
      ) : !sourceLocation || !destinationLocation ? (
        <div style={styles.trainCard}>
          <p style={styles.emptyText}>You haven't selected a route yet.</p>
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => navigate('/')} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontWeight: '600' }}>
              Go to Dashboard
            </button>
          </div>
        </div>
      ) : trains.length === 0 ? (
        <div style={styles.trainCard}>
          <p style={styles.emptyText}>No trains found between {sourceLocation.name.split(',')[0]} and {destinationLocation.name.split(',')[0]}.</p>
        </div>
      ) : (
        <>
          {/* Time Filter Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', backgroundColor: '#131b2e', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '12px 18px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>
                <i className="fa-solid fa-clock" style={{ marginRight: '6px', color: '#3b82f6' }}></i>
                Departure Time Filter:
              </span>
              <input 
                type="time" 
                value={customTime} 
                onChange={(e) => {
                  setCustomTime(e.target.value);
                  fetchTrains(e.target.value);
                }}
                style={{ background: '#0b0f19', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '13px' }}
              />
              {customTime && (
                <button 
                  onClick={() => {
                    setCustomTime('');
                    fetchTrains('');
                  }}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Clear Filter (Show All)
                </button>
              )}
            </div>
            
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Source: Official IRCTC Schedule Dataset
            </div>
          </div>

          {/* Journey Summary */}
          <div style={styles.summaryCard}>
            <p style={styles.summaryText}>
              <i className="fa-solid fa-route" style={{ marginRight: '8px', color: '#3b82f6' }}></i>
              {trainData?.summary}
            </p>
          </div>

          {/* Train Cards with Timeline */}
          {trains.map((train, index) => (
            <div key={index} style={styles.trainCard}>
                
              {/* Top Section: Image, Name, Times */}
              <div style={styles.trainHeaderRow}>
                {/* Render Image if no error, else render Icon Fallback */}
                {!imgError ? (
                  <img 
                    src="https://images.unsplash.com/photo-1513407030348-c983a97b98d8?auto=format&fit=crop&w=100&h=100&q=80" 
                    alt="Train" 
                    style={styles.trainImage}
                    onError={() => setImgError(true)} // Fallback if image breaks
                  />
                ) : (
                  <div style={styles.trainIconFallback}>
                    <i className="fa-solid fa-train" style={{ color: '#fff', fontSize: '24px' }}></i>
                  </div>
                )}

                <div style={styles.trainInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={styles.trainName}>{train.train_name}</span>
                    {train.realtime && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: `${train.realtime.status_color}22`,
                        color: train.realtime.status_color,
                        border: `1px solid ${train.realtime.status_color}55`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <i className="fa-solid fa-signal" style={{ fontSize: '10px' }}></i>
                        {train.realtime.live_status}
                      </span>
                    )}
                  </div>
                  <div style={styles.trainNo}>
                    Train No: {train.train_no} {train.realtime?.platform && `• ${train.realtime.platform}`}
                  </div>
                  <div style={{...styles.typeBadge, ...(train.type !== 'Direct' ? styles.typeBadgeHub : {})}}>
                    {train.type} {train.from_station} → {train.to_station}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={styles.timeBox}>
                    <div style={styles.timeLabel}>Depart</div>
                    <div style={styles.timeValue}>{train.depart_time}</div>
                  </div>
                  <div style={styles.timeBox}>
                    <div style={styles.timeLabel}>Arrive</div>
                    <div style={styles.timeValue}>{train.arrive_time}</div>
                  </div>
                </div>
              </div>
              
              {/* Interactive Leaflet Map with Small Train Icon & Travel Time Badge */}
              <TrainMap train={train} />

              {/* Bottom Section: Track Points (Midpoints) */}
              <div style={styles.timelineTitle}>
                <i className="fa-solid fa-map-location-dot" style={{ marginRight: '6px' }}></i>
                Track Points (Intermediate Stations)
              </div>
              <div style={styles.timeline}>
                {train.stops.map((stop, i) => (
                  <div key={i} style={styles.timelineItem}>
                    <div style={styles.timelineIcon}>
                      <div style={styles.timelineDot}></div>
                      {i < train.stops.length - 1 && <div style={styles.timelineLine}></div>}
                    </div>
                    <div style={styles.timelineContent}>
                      <div style={styles.stationName}>{stop.station}</div>
                      <div style={styles.timeText}>
                        Arr: {stop.arrival} | Dep: {stop.departure}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ))}
        </>
      )}
    </div>
  );
}