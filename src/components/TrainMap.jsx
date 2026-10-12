import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet/dist/images/marker-shadow.png'
});

function isValidCoord(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Custom animated small train icon with ETA badge
function createTrainIcon(trainName, trainNo, departTime, arriveTime, liveStatus) {
  return L.divIcon({
    className: 'leaflet-train-icon-marker',
    html: `
      <div style="
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -50%);
        pointer-events: auto;
      ">
        <!-- Floating Time to Arrive / ETA Badge -->
        <div style="
          background: rgba(11, 15, 25, 0.95);
          border: 1.5px solid #3b82f6;
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.5);
          border-radius: 18px;
          padding: 5px 12px;
          white-space: nowrap;
          color: #f8fafc;
          font-family: Inter, sans-serif;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        ">
          <span style="color: #3b82f6;"><i class="fa-solid fa-clock"></i> ${departTime} → ${arriveTime}</span>
          <span style="
            background: #10b981;
            color: #ffffff;
            font-size: 9px;
            padding: 1px 6px;
            border-radius: 8px;
            text-transform: uppercase;
          ">${liveStatus || 'ON TIME'}</span>
        </div>

        <!-- Small Circular Train Icon -->
        <div style="
          background: linear-gradient(135deg, #1d4ed8, #3b82f6);
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.8), 0 4px 10px rgba(0, 0, 0, 0.5);
          border: 3px solid #ffffff;
        ">
          <i class="fa-solid fa-train" style="font-size: 18px;"></i>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}

// Custom Station Dot Icon
function createStationIcon(stationName, isTerminus) {
  const color = isTerminus ? '#ef4444' : '#3b82f6';
  return L.divIcon({
    className: 'leaflet-station-marker',
    html: `
      <div style="
        display: flex;
        align-items: center;
        gap: 6px;
        transform: translate(-50%, -50%);
        pointer-events: auto;
      ">
        <div style="
          width: ${isTerminus ? '14px' : '10px'};
          height: ${isTerminus ? '14px' : '10px'};
          background-color: ${color};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        "></div>
        <div style="
          background: rgba(15, 23, 42, 0.9);
          color: #f8fafc;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
        ">${stationName}</div>
      </div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    let timer = setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function FitBounds({ stopCoords }) {
  const map = useMap();
  useEffect(() => {
    if (!stopCoords || stopCoords.length < 2) return;
    let timer = setTimeout(() => {
      try {
        map.invalidateSize();
        map.fitBounds(stopCoords, { padding: [50, 50], maxZoom: 12 });
      } catch (e) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [stopCoords, map]);
  return null;
}

export default function TrainMap({ train }) {
  if (!train || !train.stops || train.stops.length === 0) return null;

  // Filter valid stop coordinates
  const validStops = train.stops.filter(s => isValidCoord(s.lat, s.lon));
  const stopCoords = validStops.map(s => [s.lat, s.lon]);

  if (stopCoords.length === 0) return null;

  // Calculate midpoint for train icon position
  const midIdx = Math.floor(validStops.length / 2);
  const trainPos = validStops[midIdx] || validStops[0];

  const mapKey = `train-map-${train.train_no}-${validStops.length}`;

  return (
    <div style={{ marginTop: '15px', marginBottom: '20px' }}>
      <div style={{
        fontSize: '13px',
        color: '#94a3b8',
        fontWeight: '600',
        marginBottom: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <i className="fa-solid fa-map" style={{ color: '#3b82f6' }}></i> Live Route Map & Travel Time
      </div>

      <MapContainer
        key={mapKey}
        center={[trainPos.lat, trainPos.lon]}
        zoom={9}
        style={{
          height: '350px',
          width: '100%',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.12)'
        }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <ResizeMap />
        <FitBounds stopCoords={stopCoords} />

        {/* Train Track Polyline */}
        <Polyline
          positions={stopCoords}
          color="#3b82f6"
          weight={5}
          opacity={0.85}
          dashArray="10, 8"
        />

        {/* Station Markers */}
        {validStops.map((stop, idx) => {
          const isTerminus = idx === 0 || idx === validStops.length - 1;
          return (
            <Marker
              key={idx}
              position={[stop.lat, stop.lon]}
              icon={createStationIcon(stop.station, isTerminus)}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>{stop.station}</strong> ({stop.station_code})<br />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Arr: {stop.arrival} | Dep: {stop.departure}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Small Train Icon with Time to Arrive Badge */}
        {isValidCoord(trainPos.lat, trainPos.lon) && (
          <Marker
            position={[trainPos.lat, trainPos.lon]}
            icon={createTrainIcon(
              train.train_name,
              train.train_no,
              train.depart_time,
              train.arrive_time,
              train.realtime?.live_status
            )}
            zIndexOffset={1000}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif' }}>
                <strong style={{ color: '#1d4ed8' }}>🚆 {train.train_name} (#{train.train_no})</strong><br />
                Route: {train.from_station} ➔ {train.to_station}<br />
                Departure: <b>{train.depart_time}</b> | Arrival: <b>{train.arrive_time}</b><br />
                Status: <span style={{ color: train.realtime?.status_color || '#10b981', fontWeight: 'bold' }}>{train.realtime?.live_status || 'On Time'}</span>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
