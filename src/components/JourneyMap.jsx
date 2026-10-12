 import React, { useEffect, useRef } from 'react';
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

function calcBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getTrafficColor(prediction) {
  if (!prediction) return '#2563eb';
  const p = prediction.toLowerCase();
  if (p.includes('low')) return '#16a34a';
  if (p.includes('medium')) return '#ca8a04';
  if (p.includes('high')) return '#dc2626';
  return '#2563eb';
}

function createCarIcon(bearing) {
  return L.divIcon({
    className: 'nav-car-live',
    html: `<div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 25px rgba(59,130,246,0.7),0 4px 12px rgba(0,0,0,0.4);border:3px solid white;transform:rotate(${bearing}deg);"><i class="fa-solid fa-arrow-up" style="font-size:18px;margin-left:-1px;"></i></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23]
  });
}

/* =============================================
   MAP FOLLOWS THE CAR
   ============================================= */
function MapFollower({ points, currentIndex }) {
  const map = useMap();
  const prevRef = useRef(-1);

  useEffect(() => {
    if (!points || currentIndex >= points.length || !map._loaded) return;
    const p = points[currentIndex];
    if (!isValidCoord(p.latitude, p.longitude)) return;
    if (prevRef.current === currentIndex) return;
    prevRef.current = currentIndex;
    try {
      map.panTo([p.latitude, p.longitude], { animate: true, duration: 0.3 });
    } catch (e) {}
  }, [currentIndex, points, map]);

  return null;
}

/* =============================================
   SAFE RESIZE
   ============================================= */
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

/* =============================================
   FIT BOUNDS ON FIRST LOAD
   ============================================= */
function InitialFit({ source, destination, points, ready }) {
  const map = useMap();
  useEffect(() => {
    if (!ready || !map._loaded) return;
    let timer = setTimeout(() => {
      try {
        const bounds = [];
        if (source && isValidCoord(source.lat, source.lon)) bounds.push([source.lat, source.lon]);
        if (destination && isValidCoord(destination.lat, destination.lon)) bounds.push([destination.lat, destination.lon]);
        if (Array.isArray(points)) points.forEach((p) => { if (isValidCoord(p.latitude, p.longitude)) bounds.push([p.latitude, p.longitude]); });
        if (bounds.length >= 2) { map.invalidateSize(); map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 }); }
      } catch (e) {}
    }, 400);
    return () => { clearTimeout(timer); };
  }, [ready, source, destination, points, map]);
  return null;
}

/* =============================================
   MAIN JOURNEY MAP
   ============================================= */
export default function JourneyMap({ source, destination, routePoints, prediction, currentPointIndex = 0 }) {
  const routeColor = getTrafficColor(prediction);
  const points = routePoints || [];
  const idx = Math.min(currentPointIndex, points.length - 1);

  const currentPoint = points[idx] || null;
  const nextPoint = idx + 1 < points.length ? points[idx + 1] : null;

  /* Bearing for car rotation */
  let bearing = 0;
  if (currentPoint && nextPoint && isValidCoord(currentPoint.latitude, currentPoint.longitude) && isValidCoord(nextPoint.latitude, nextPoint.longitude)) {
    bearing = calcBearing(currentPoint.latitude, currentPoint.longitude, nextPoint.latitude, nextPoint.longitude);
  }

  /* Route lines */
  const allLatLngs = points.filter((p) => isValidCoord(p.latitude, p.longitude)).map((p) => [p.latitude, p.longitude]);
  const completedLatLngs = points.slice(0, idx + 1).filter((p) => isValidCoord(p.latitude, p.longitude)).map((p) => [p.latitude, p.longitude]);
  const remainingLatLngs = points.slice(idx).filter((p) => isValidCoord(p.latitude, p.longitude)).map((p) => [p.latitude, p.longitude]);

  const mapKey = source && destination ? `journey-${source.lat}-${source.lon}-${destination.lat}-${destination.lon}` : 'journey-default';
  const carKey = `car-${idx}-${bearing.toFixed(0)}`;

  return (
    <MapContainer key={mapKey} center={[10.7905, 78.7047]} zoom={14} style={{ height: '550px', width: '100%', borderRadius: '0 0 8px 8px', border: '1px solid rgba(255,255,255,0.12)' }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <ResizeMap />
      <InitialFit source={source} destination={destination} points={points} ready={currentPointIndex > 0} />
      <MapFollower points={points} currentIndex={currentPointIndex} />

      {/* Full route — gray dashed background */}
      {allLatLngs.length > 0 && (
        <Polyline positions={allLatLngs} color="#475569" weight={6} opacity={0.3} dashArray="8,10" />
      )}

      {/* Completed route — bright blue solid */}
      {completedLatLngs.length > 1 && (
        <Polyline positions={completedLatLngs} color="#3b82f6" weight={8} opacity={0.95} lineCap="round" lineJoin="round" />
      )}

      {/* Remaining route — muted color */}
      {remainingLatLngs.length > 1 && (
        <Polyline positions={remainingLatLngs} color={routeColor} weight={6} opacity={0.5} />
      )}

      {/* Destination marker */}
      {destination && isValidCoord(destination.lat, destination.lon) && (
        <Marker position={[destination.lat, destination.lon]}>
          <Popup>Destination: {destination.name}</Popup>
        </Marker>
      )}

      {/* Animated car */}
      {currentPoint && isValidCoord(currentPoint.latitude, currentPoint.longitude) && (
        <Marker key={carKey} position={[currentPoint.latitude, currentPoint.longitude]} icon={createCarIcon(bearing)} zIndexOffset={1000}>
          <Popup>Your position</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}