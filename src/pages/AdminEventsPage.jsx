import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getEvents, getUpcomingEvents, createEvent, updateEvent, deleteEvent, reverseGeocode } from '../api/api';
import LocationSearch from '../components/LocationSearch';
import { Panel, StatTile, EmptyState } from '../components/ui';

const TYPES = [
  { value: 'festival', label: 'Festival', icon: 'fa-star' },
  { value: 'temple', label: 'Temple event', icon: 'fa-place-of-worship' },
  { value: 'market', label: 'Market day', icon: 'fa-store' },
  { value: 'procession', label: 'Procession / rally', icon: 'fa-people-group' },
  { value: 'concert', label: 'Concert / show', icon: 'fa-music' },
  { value: 'sports', label: 'Sports match', icon: 'fa-futbol' },
  { value: 'other', label: 'Other', icon: 'fa-calendar' },
];
const TYPE_BY = Object.fromEntries(TYPES.map((t) => [t.value, t]));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const IMPACT_COLOR = { High: '#ef4444', Moderate: '#f59e0b', Low: '#3b82f6' };

const EMPTY = {
  name: '', event_type: 'festival', location_name: '', lat: null, lon: null, radius_km: 2,
  impact: 'Moderate', recurrence: 'once', start_date: '', end_date: '', weekday: 6,
  start_time: '', end_time: '', notes: '', active: 1,
};

function whenText(ev) {
  const hours = ev.start_time && ev.end_time ? `${ev.start_time}–${ev.end_time}` : 'All day';
  if (ev.recurrence === 'weekly') return `Every ${WEEKDAYS[ev.weekday]} · ${hours}`;
  const range = ev.end_date && ev.end_date !== ev.start_date ? `${ev.start_date} → ${ev.end_date}` : ev.start_date;
  return `${ev.recurrence === 'yearly' ? 'Every year ' : ''}${range} · ${hours}`;
}

/* Click the map to drop the event pin */
function PickOnMap({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ lat, lon }) {
  const map = useMap();
  useEffect(() => { if (lat != null) map.flyTo([lat, lon], Math.max(map.getZoom(), 13), { duration: 0.6 }); }, [lat, lon, map]);
  return null;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const [all, next] = await Promise.all([getEvents(), getUpcomingEvents(7)]);
      setEvents(all);
      setUpcoming(next);
    } catch {
      setMessage({ tone: 'error', text: 'Could not load events. Is the backend running?' });
    }
  };
  useEffect(() => { load(); }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const pickPoint = async (lat, lon) => {
    setForm((f) => ({ ...f, lat, lon }));
    try {
      const place = await reverseGeocode(lat, lon);
      setForm((f) => (f.lat === lat ? { ...f, location_name: place?.name || f.location_name } : f));
    } catch { /* keep whatever name was typed */ }
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setForm({ ...EMPTY, ...ev, start_date: ev.start_date || '', end_date: ev.end_date || '', start_time: ev.start_time || '', end_time: ev.end_time || '', notes: ev.notes || '', weekday: ev.weekday ?? 6 });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => { setEditingId(null); setForm(EMPTY); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) await updateEvent(editingId, form);
      else await createEvent(form);
      setMessage({ tone: 'good', text: editingId ? 'Event updated.' : 'Event added. Predictions on routes near it now include it.' });
      reset();
      load();
    } catch (err) {
      setMessage({ tone: 'error', text: err?.response?.data?.error || 'Could not save the event.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev) => {
    if (!window.confirm(`Delete "${ev.name}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(ev.id);
      if (editingId === ev.id) reset();
      load();
    } catch (err) {
      setMessage({ tone: 'error', text: err?.response?.data?.error || 'Could not delete the event.' });
    }
  };

  const toggleActive = async (ev) => {
    try {
      await updateEvent(ev.id, { ...ev, active: ev.active ? 0 : 1 });
      load();
    } catch (err) {
      setMessage({ tone: 'error', text: err?.response?.data?.error || 'Could not update the event.' });
    }
  };

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayCount = upcoming.filter((u) => u.date === today).length;
  const shown = useMemo(() => events.filter((ev) => {
    if (filter === 'active') return ev.active;
    if (filter === 'weekly') return ev.recurrence === 'weekly';
    if (filter === 'off') return !ev.active;
    return true;
  }), [events, filter]);

  const center = form.lat != null ? [form.lat, form.lon] : events[0] ? [events[0].lat, events[0].lon] : [13.0827, 80.2707];

  return (
    <div className="page">
      <div className="stat-grid">
        <StatTile label="Total events" value={events.length} icon="fa-calendar-days" color="#3b82f6" />
        <StatTile label="Happening today" value={todayCount} icon="fa-bolt" color="#ef4444" />
        <StatTile label="Next 7 days" value={upcoming.length} icon="fa-calendar-week" color="#f59e0b" />
        <StatTile label="Weekly markets" value={events.filter((e) => e.recurrence === 'weekly').length} icon="fa-store" color="#10b981" />
      </div>

      <div className="grid-2 admin-grid">
        <Panel title={editingId ? 'Edit event' : 'Add festival / event'} icon={editingId ? 'fa-pen' : 'fa-plus'}
          actions={editingId && <button className="btn" onClick={reset}><i className="fa-solid fa-xmark"></i> Cancel edit</button>}>
          <form className="admin-form" onSubmit={save}>
            <label className="full">Event name
              <input className="admin-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kapaleeshwarar Temple Panguni Festival" required />
            </label>

            <label>Type
              <select className="admin-input" value={form.event_type} onChange={(e) => set('event_type', e.target.value)}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>Traffic impact
              <div className="segmented admin-seg">
                {['Low', 'Moderate', 'High'].map((v) => (
                  <button type="button" key={v} className={form.impact === v ? 'active' : ''} onClick={() => set('impact', v)}>{v}</button>
                ))}
              </div>
            </label>

            <div className="full">
              <LocationSearch id="event-location" label="Location (search, or click on the map)" placeholder="Search temple, market, area..."
                value={form.location_name ? { name: form.location_name } : null}
                onSelect={(loc) => setForm((f) => ({ ...f, location_name: loc?.name || '', ...(loc?.lat != null ? { lat: loc.lat, lon: loc.lon } : {}) }))} />
              {form.lat != null && <div className="locate-hint" style={{ marginTop: 6 }}><i className="fa-solid fa-location-dot"></i> {form.lat.toFixed(5)}, {form.lon.toFixed(5)}</div>}
            </div>

            <label className="full">Crowd zone radius: <strong>{form.radius_km} km</strong>
              <input type="range" min="0.5" max="15" step="0.5" value={form.radius_km} onChange={(e) => set('radius_km', Number(e.target.value))} />
            </label>

            <label className="full">Repeats
              <div className="segmented admin-seg">
                {[['once', 'One time'], ['weekly', 'Every week'], ['yearly', 'Every year']].map(([v, l]) => (
                  <button type="button" key={v} className={form.recurrence === v ? 'active' : ''} onClick={() => set('recurrence', v)}>{l}</button>
                ))}
              </div>
            </label>

            {form.recurrence === 'weekly' ? (
              <label className="full">Day of the week
                <select className="admin-input" value={form.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label>Start date<input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required /></label>
                <label>End date<input type="date" value={form.end_date} min={form.start_date} onChange={(e) => set('end_date', e.target.value)} /></label>
              </>
            )}
            <label>Start time<input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></label>
            <label>End time<input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></label>
            <p className="admin-help full">Leave times empty for an all-day event. Traffic is counted from 1 hour before the start until 30 minutes after the end.</p>

            <label className="full">Notes (optional)
              <textarea className="admin-input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Car festival on day 7 — roads around the tank closed" />
            </label>

            {message && <div className={`note ${message.tone} full`}><i className={`fa-solid ${message.tone === 'good' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>{message.text}</div>}

            <button className="btn btn-primary full" type="submit" disabled={saving}>
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : editingId ? 'fa-floppy-disk' : 'fa-plus'}`}></i> {editingId ? 'Save changes' : 'Add event'}
            </button>
          </form>
        </Panel>

        <Panel title="Event zones" icon="fa-map-location-dot">
          <div className="admin-map">
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <PickOnMap onPick={pickPoint} />
              <FlyTo lat={form.lat} lon={form.lon} />
              {events.filter((ev) => ev.id !== editingId).map((ev) => (
                <Circle key={ev.id} center={[ev.lat, ev.lon]} radius={ev.radius_km * 1000}
                  pathOptions={{ color: IMPACT_COLOR[ev.impact], weight: 1, fillOpacity: ev.active ? 0.15 : 0.04, dashArray: ev.active ? null : '4 4' }}>
                  <Popup><strong>{ev.name}</strong><br />{whenText(ev)}</Popup>
                </Circle>
              ))}
              {form.lat != null && (
                <>
                  <Circle center={[form.lat, form.lon]} radius={form.radius_km * 1000} pathOptions={{ color: IMPACT_COLOR[form.impact], weight: 2, fillOpacity: 0.25 }} />
                  <Marker position={[form.lat, form.lon]} />
                </>
              )}
            </MapContainer>
          </div>
          <p className="admin-help">Click the map to place the event. The coloured circle is the area where routes get the traffic warning.</p>
        </Panel>
      </div>

      <Panel title="All events" icon="fa-list"
        actions={
          <div className="segmented">
            {[['all', 'All'], ['active', 'Active'], ['weekly', 'Weekly'], ['off', 'Switched off']].map(([v, l]) => (
              <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
        }>
        {shown.length === 0 ? (
          <EmptyState icon="fa-calendar-plus" title="No events yet" text="Add festivals, temple events and weekly market days. Predictions and navigation will warn drivers on routes near them." />
        ) : (
          <div className="event-list">
            {shown.map((ev) => {
              const type = TYPE_BY[ev.event_type] || TYPE_BY.other;
              const isToday = upcoming.some((u) => u.id === ev.id && u.date === today);
              return (
                <div key={ev.id} className={`event-row ${ev.active ? '' : 'off'}`}>
                  <div className="event-icon" style={{ color: IMPACT_COLOR[ev.impact], background: `${IMPACT_COLOR[ev.impact]}1f` }}><i className={`fa-solid ${type.icon}`}></i></div>
                  <div className="event-main">
                    <div className="event-name">
                      {ev.name}
                      {isToday && ev.active && <span className="event-tag today">Today</span>}
                      <span className="event-tag" style={{ color: IMPACT_COLOR[ev.impact], borderColor: `${IMPACT_COLOR[ev.impact]}66` }}>{ev.impact}</span>
                    </div>
                    <div className="event-meta"><i className="fa-solid fa-location-dot"></i> {ev.location_name || `${ev.lat.toFixed(3)}, ${ev.lon.toFixed(3)}`} · {ev.radius_km} km · {whenText(ev)}</div>
                    {ev.notes && <div className="event-notes">{ev.notes}</div>}
                  </div>
                  <div className="event-actions">
                    <button className="btn" title={ev.active ? 'Switch off' : 'Switch on'} onClick={() => toggleActive(ev)}>
                      <i className={`fa-solid ${ev.active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ color: ev.active ? '#10b981' : undefined }}></i>
                    </button>
                    <button className="btn" title="Edit" onClick={() => startEdit(ev)}><i className="fa-solid fa-pen"></i></button>
                    <button className="btn" title="Delete" onClick={() => remove(ev)}><i className="fa-solid fa-trash" style={{ color: '#ef4444' }}></i></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
