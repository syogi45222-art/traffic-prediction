import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet/dist/images/marker-shadow.png'
});

function getTrafficColor(prediction) {
  if (!prediction) return '#2563eb';
  const p = prediction.toLowerCase();
  if (p.includes('low')) return '#16a34a';
  if (p.includes('medium')) return '#ca8a04';
  if (p.includes('high')) return '#dc2626';
  return '#2563eb';
}

function isValidCoord(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    let timer = null;
    function onReady() {
      timer = setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);
    }
    if (map._loaded) { onReady(); } else { map.whenReady(onReady); }
    return () => { if (timer) { clearTimeout(timer); timer = null; } };
  }, [map]);
  return null;
}

function FitBounds({ source, destination, points }) {
  const map = useMap();
  useEffect(() => {
    let timer = null;
    function onReady() {
      timer = setTimeout(() => {
        try {
          const bounds = [];
          if (source && isValidCoord(source.lat, source.lon)) bounds.push([source.lat, source.lon]);
          if (destination && isValidCoord(destination.lat, destination.lon)) bounds.push([destination.lat, destination.lon]);
          if (Array.isArray(points)) points.forEach((p) => { if (isValidCoord(p.latitude, p.longitude)) bounds.push([p.latitude, p.longitude]); });
          if (bounds.length >= 2) { map.invalidateSize(); map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 }); }
        } catch (e) {}
      }, 300);
    }
    if (map._loaded) { onReady(); } else { map.whenReady(onReady); }
    return () => { if (timer) { clearTimeout(timer); timer = null; } };
  }, [source, destination, points, map]);
  return null;
}

function createDashboardTrainIcon(trainName, trainNo, departTime, arriveTime, liveStatus, index) {
  const colors = [
    'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    'linear-gradient(135deg, #0d9488, #14b8a6)',
    'linear-gradient(135deg, #7c3aed, #8b5cf6)',
    'linear-gradient(135deg, #c026d3, #e879f9)',
    'linear-gradient(135deg, #ea580c, #f97316)'
  ];
  const bgGradient = colors[index % colors.length];

  return L.divIcon({
    className: 'dashboard-train-marker',
    html: `
      <div style="
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -50%);
        pointer-events: auto;
        cursor: pointer;
        z-index: ${1000 + index};
      ">
        <!-- Floating Time to Arrive / ETA Badge -->
        <div style="
          background: rgba(11, 15, 25, 0.95);
          border: 1.5px solid #3b82f6;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.6);
          border-radius: 14px;
          padding: 4px 10px;
          white-space: nowrap;
          color: #f8fafc;
          font-family: Inter, sans-serif;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 4px;
        ">
          <span style="color: #60a5fa;"><i class="fa-solid fa-train"></i> #${trainNo}</span>
          <span style="color: #cbd5e1;">${departTime} → ${arriveTime}</span>
          <span style="
            background: ${liveStatus === 'ON_TIME' || liveStatus === 'On Time' ? '#10b981' : '#f59e0b'};
            color: #ffffff;
            font-size: 8px;
            padding: 1px 5px;
            border-radius: 6px;
            text-transform: uppercase;
          ">${liveStatus || 'ON TIME'}</span>
        </div>

        <!-- Small Circular Train Icon -->
        <div style="
          background: ${bgGradient};
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.7), 0 4px 8px rgba(0, 0, 0, 0.4);
          border: 2px solid #ffffff;
        ">
          <i class="fa-solid fa-train" style="font-size: 16px;"></i>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function getTrainCoordinates(train, index, totalTrains, source, destination, routePoints) {
  // 1. Try stop coordinates from train object
  if (train?.stops && train.stops.length > 0) {
    const validStops = train.stops.filter(s => isValidCoord(s.lat, s.lon));
    if (validStops.length > 0) {
      if (validStops.length === 1) return [validStops[0].lat, validStops[0].lon];
      // Distribute multiple trains across different stop indices
      const stopIdx = Math.floor(((index + 1) / (totalTrains + 1)) * (validStops.length - 1));
      const targetStop = validStops[stopIdx] || validStops[Math.floor(validStops.length / 2)];
      return [targetStop.lat, targetStop.lon];
    }
  }

  // 2. Try points along road/rail route points
  if (Array.isArray(routePoints) && routePoints.length > 0) {
    const validPts = routePoints.filter(p => isValidCoord(p.latitude, p.longitude));
    if (validPts.length > 0) {
      const ptIdx = Math.floor(((index + 1) / (totalTrains + 1)) * (validPts.length - 1));
      const pt = validPts[ptIdx] || validPts[Math.floor(validPts.length / 2)];
      return [pt.latitude, pt.longitude];
    }
  }

  // 3. Interpolate between source and destination
  if (source && destination && isValidCoord(source.lat, source.lon) && isValidCoord(destination.lat, destination.lon)) {
    const fraction = (index + 1) / (totalTrains + 1);
    const lat = source.lat + (destination.lat - source.lat) * fraction;
    const lon = source.lon + (destination.lon - source.lon) * fraction;
    return [lat, lon];
  }

  return null;
}

function AccidentLayer({ accidents }) {
  const map = useMap();
  const [activeAccidentId, setActiveAccidentId] = useState(null);

  if (!accidents || accidents.length === 0) return null;

  return (
    <>
      {accidents.map((acc, idx) => {
        if (!isValidCoord(acc.lat, acc.lon)) return null;

        const isHazard = acc.type === 'Hazard';
        const isJam = acc.type === 'Traffic Jam';
        
        let iconHtml = `<div style="background:#ef4444; color:white; width:28px; height:28px; border-radius:50%; display:flex; justify-content:center; align-items:center; border:2px solid white; box-shadow:0 0 10px rgba(239,68,68,0.8); font-size:14px;"><i class="fa-solid fa-car-burst"></i></div>`;
        if (isHazard) iconHtml = `<div style="background:#f59e0b; color:white; width:28px; height:28px; border-radius:50%; display:flex; justify-content:center; align-items:center; border:2px solid white; box-shadow:0 0 10px rgba(245,158,11,0.8); font-size:14px;"><i class="fa-solid fa-triangle-exclamation"></i></div>`;
        if (isJam) iconHtml = `<div style="background:#f97316; color:white; width:28px; height:28px; border-radius:50%; display:flex; justify-content:center; align-items:center; border:2px solid white; box-shadow:0 0 10px rgba(249,115,22,0.8); font-size:14px;"><i class="fa-solid fa-road-barrier"></i></div>`;

        const icon = L.divIcon({ className: 'accident-marker', html: iconHtml, iconSize: [28, 28], iconAnchor: [14, 14] });

        let polylinePositions = [];
        if (acc.geometry && acc.geometry.coordinates) {
            // TomTom sometimes returns [lon, lat]
            if (acc.geometry.type === 'LineString') {
                polylinePositions = acc.geometry.coordinates.map(c => [c[1], c[0]]);
            } else if (acc.geometry.type === 'MultiLineString') {
                polylinePositions = acc.geometry.coordinates.map(line => line.map(c => [c[1], c[0]]));
            }
        }

        const isActive = activeAccidentId === acc.id;

        return (
          <React.Fragment key={`acc-${acc.id || idx}`}>
            {isActive && polylinePositions.length > 0 && (
                <Polyline positions={polylinePositions} color="#ef4444" weight={8} opacity={0.7} />
            )}
            
            <Marker 
              position={[acc.lat, acc.lon]} 
              icon={icon} 
              zIndexOffset={isActive ? 2000 : 1000}
              eventHandlers={{
                click: () => {
                  setActiveAccidentId(acc.id);
                  map.setView([acc.lat, acc.lon], 15, { animate: true });
                }
              }}
            >
              <Popup onClose={() => setActiveAccidentId(null)}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.5', minWidth: '220px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: isHazard ? '#f59e0b' : isJam ? '#f97316' : '#ef4444' }}>
                    {isHazard ? '⚠️ Hazard' : isJam ? '🚧 Traffic Jam' : '🚨 Traffic Incident'}
                  </h4>
                  {acc.roadName && <div style={{marginBottom:'4px'}}><b>Road:</b> {acc.roadName}</div>}
                  <div style={{marginBottom:'4px'}}><b>Incident:</b> {acc.description || 'Traffic Incident'}</div>
                  {acc.magnitudeOfDelay > 0 && <div style={{marginBottom:'4px'}}><b>Severity:</b> Level {acc.magnitudeOfDelay}</div>}
                  {acc.delay > 0 && <div style={{marginBottom:'4px'}}><b>Delay:</b> {Math.round(acc.delay/60)} min</div>}
                  <div style={{marginBottom:'4px'}}><b>Distance from Route:</b> {acc.distance_from_source} km</div>
                  {acc.numberOfReports > 0 && <div style={{marginBottom:'4px'}}><b>Reports:</b> {acc.numberOfReports}</div>}
                  {acc.probabilityOfOccurrence && <div style={{marginBottom:'4px'}}><b>Probability:</b> {acc.probabilityOfOccurrence}</div>}
                  {acc.startTime && <div style={{marginBottom:'4px'}}><b>Last Reported:</b> {new Date(acc.startTime).toLocaleTimeString()}</div>}
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button onClick={() => map.setView([acc.lat, acc.lon], 16, {animate:true})} style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}>Zoom</button>
                    <button onClick={() => { map.closePopup(); setActiveAccidentId(null); }} style={{ flex: 1, background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
                  </div>
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}

export default function RouteMap({ source, destination, routePoints, prediction, trains = [], accidents = [] }) {
  const routeColor = getTrafficColor(prediction);
  const latLngs = (routePoints || []).filter((p) => isValidCoord(p.latitude, p.longitude)).map((p) => [p.latitude, p.longitude]);
  const mapKey = source && destination ? `route-${source.lat}-${source.lon}-${destination.lat}-${destination.lon}` : 'route-default';

  return (
    <MapContainer className="app-map" key={mapKey} center={source && isValidCoord(source.lat, source.lon) ? [source.lat, source.lon] : [10.0104, 77.4768]} zoom={8} style={{ height: '450px', width: '100%', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <ResizeMap />
      <FitBounds source={source} destination={destination} points={routePoints} />
      {source && isValidCoord(source.lat, source.lon) && <Marker position={[source.lat, source.lon]}><Popup>Source: {source.name}</Popup></Marker>}
      {destination && isValidCoord(destination.lat, destination.lon) && <Marker position={[destination.lat, destination.lon]}><Popup>Destination: {destination.name}</Popup></Marker>}
      {latLngs.length > 0 && <Polyline positions={latLngs} color={routeColor} weight={6} opacity={0.9} />}
      <AccidentLayer accidents={accidents} />

      {/* Render Small Train Icons for all trains on Dashboard Map */}
      {Array.isArray(trains) && trains.map((train, idx) => {
        const coords = getTrainCoordinates(train, idx, trains.length, source, destination, routePoints);
        if (!coords) return null;

        return (
          <Marker
            key={`dash-train-${idx}-${train.train_no}`}
            position={coords}
            icon={createDashboardTrainIcon(
              train.train_name,
              train.train_no,
              train.depart_time,
              train.arrive_time,
              train.realtime?.live_status,
              idx
            )}
            zIndexOffset={1500 + idx}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif' }}>
                <strong style={{ color: '#1d4ed8' }}>🚆 {train.train_name} (#{train.train_no})</strong><br />
                From: <b>{train.from_station}</b> ➔ To: <b>{train.to_station}</b><br />
                Departure: <b>{train.depart_time}</b> | Arrival: <b>{train.arrive_time}</b><br />
                Type: <b>{train.type}</b><br />
                Status: <span style={{ color: train.realtime?.status_color || '#10b981', fontWeight: 'bold' }}>{train.realtime?.live_status || 'On Time'}</span>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
