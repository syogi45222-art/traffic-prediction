import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function carIcon(heading) {
  return L.divIcon({
    className: 'nav-car-live',
    html: `<div class="nav-car" style="transform:rotate(${heading}deg)"><i class="fa-solid fa-location-arrow" style="transform:rotate(-45deg)"></i></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const dotIcon = (cls, icon) => L.divIcon({
  className: '',
  html: `<div class="nav-poi ${cls}"><i class="fa-solid ${icon}"></i></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});
const ACCIDENT_ICON = dotIcon('danger', 'fa-car-burst');
const HAZARD_ICON = dotIcon('warn', 'fa-triangle-exclamation');
const TRAIN_ICON = dotIcon('train', 'fa-train');
const FLAG_ICON = dotIcon('flag', 'fa-flag-checkered');
const NO_POINTS = [];

/* Keep the car centred like a sat-nav until the user drags the map */
function Follow({ pos, follow, onUserMove }) {
  const map = useMap();
  useMapEvents({ dragstart: onUserMove });
  const lat = pos?.lat;
  const lon = pos?.lon;
  useEffect(() => {
    if (!follow || lat == null) return;
    map.setView([lat, lon], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 });
  }, [lat, lon, follow, map]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function NavigationMap({ nav, routeColor = '#3b82f6', height = 520 }) {
  const [follow, setFollow] = useState(true);
  const pts = nav.routePts || NO_POINTS;
  const seg = Math.min(nav.seg || 0, Math.max(0, pts.length - 1));

  const { done, ahead } = useMemo(() => {
    const ll = pts.map((p) => [p.lat, p.lon]);
    const here = nav.pos ? [[nav.pos.lat, nav.pos.lon]] : [];
    return { done: [...ll.slice(0, seg + 1), ...here], ahead: [...here, ...ll.slice(seg + 1)] };
  }, [pts, seg, nav.pos]);

  const heading = Math.round((nav.heading || 0) / 5) * 5;
  const icon = useMemo(() => carIcon(heading), [heading]);
  const end = pts[pts.length - 1];
  const center = nav.pos ? [nav.pos.lat, nav.pos.lon] : end ? [end.lat, end.lon] : [13.0827, 80.2707];

  return (
    <div className="nav-map-wrap" style={{ height }}>
      <MapContainer center={center} zoom={16} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <Follow pos={nav.pos} follow={follow} onUserMove={() => setFollow(false)} />

        {ahead.length > 1 && <Polyline key={`a-${nav.routeVersion}`} positions={ahead} pathOptions={{ color: '#1e3a8a', weight: 11, opacity: 0.35 }} />}
        {ahead.length > 1 && <Polyline key={`b-${nav.routeVersion}`} positions={ahead} pathOptions={{ color: routeColor, weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />}
        {done.length > 1 && <Polyline positions={done} pathOptions={{ color: '#94a3b8', weight: 7, opacity: 0.7 }} />}

        {(nav.incidents || []).map((inc) => (
          <Marker key={`i-${inc.id}`} position={[inc.lat, inc.lon]} icon={inc.type === 'Accident' ? ACCIDENT_ICON : HAZARD_ICON}>
            <Popup><strong>{inc.type}</strong><br />{inc.description}</Popup>
          </Marker>
        ))}
        {(nav.schoolZones || []).map((z) => (
          <Circle key={`s-${z.id}`} center={[z.lat, z.lon]} radius={z.radiusM} pathOptions={{ color: '#f59e0b', weight: 2, fillOpacity: 0.18 }}>
            <Popup><strong>{z.name}</strong><br />School zone · {z.speed_limit} km/h</Popup>
          </Circle>
        ))}
        {(nav.eventZones || []).map((z) => (
          <Circle key={`e-${z.id}`} center={[z.lat, z.lon]} radius={z.radiusM} pathOptions={{ color: '#ec4899', weight: 1, fillOpacity: 0.12 }}>
            <Popup><strong>{z.name}</strong><br />{z.location}</Popup>
          </Circle>
        ))}
        {(nav.trainStops || []).map((t) => (
          <Marker key={`t-${t.key}`} position={[t.lat, t.lon]} icon={TRAIN_ICON}>
            <Popup><strong>{t.trainName}</strong><br />{t.station}</Popup>
          </Marker>
        ))}
        {end && <Marker position={[end.lat, end.lon]} icon={FLAG_ICON}><Popup>Destination</Popup></Marker>}

        {nav.pos && nav.accuracy > 15 && nav.accuracy < 500 && (
          <Circle center={[nav.pos.lat, nav.pos.lon]} radius={nav.accuracy} pathOptions={{ color: '#3b82f6', weight: 1, fillOpacity: 0.08 }} />
        )}
        {nav.pos && <Marker position={[nav.pos.lat, nav.pos.lon]} icon={icon} zIndexOffset={1000} />}
      </MapContainer>

      {!follow && (
        <button className="nav-recenter" onClick={() => setFollow(true)}>
          <i className="fa-solid fa-location-crosshairs"></i> Re-centre
        </button>
      )}
    </div>
  );
}
