import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getSchools, getSchoolStats, createSchool, updateSchool, deleteSchool, importSchools, reverseGeocode } from '../api/api';
import LocationSearch from '../components/LocationSearch';
import { Panel, StatTile } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_ZOOM = 12; // below this a city view would hold thousands of zones

const EMPTY = {
  name: '', location_name: '', lat: null, lon: null, radius_m: 300, speed_limit: 25,
  morning_start: '08:00', morning_end: '09:00', afternoon_start: '15:30', afternoon_end: '16:30',
  school_days: [0, 1, 2, 3, 4], notes: '', active: 1,
};

const TEMPLATE = [
  'name,lat,lon,location,radius_m,speed_limit,morning_start,morning_end,afternoon_start,afternoon_end,days',
  'Government Higher Secondary School,13.0418,80.2341,Nungambakkam,300,25,08:00,09:00,15:30,16:30,Mon-Fri',
  'St. Mary\'s Matriculation School,13.0067,80.2206,Guindy,,,,,,,Mon-Sat',
].join('\n');

const toDays = (str) => String(str || '').split(',').filter(Boolean).map(Number);

function windowsText(z) {
  return [z.morning_start && `${z.morning_start}–${z.morning_end}`, z.afternoon_start && `${z.afternoon_start}–${z.afternoon_end}`].filter(Boolean).join(' & ');
}

function daysText(days) {
  const d = toDays(days).join();
  if (d === '0,1,2,3,4') return 'Mon–Fri';
  if (d === '0,1,2,3,4,5') return 'Mon–Sat';
  return toDays(days).map((i) => DAYS[i]).join(', ');
}

/* Same rule as the backend's school_service.is_active_at */
function activeNow(z, now = new Date()) {
  if (!z.active) return false;
  if (!toDays(z.school_days).includes((now.getDay() + 6) % 7)) return false;
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return Boolean((z.morning_start && z.morning_start <= t && t <= z.morning_end) || (z.afternoon_start && z.afternoon_start <= t && t <= z.afternoon_end));
}

/* Loads only the zones inside the visible map area */
function ViewportLoader({ reloadKey, onZones, onPick }) {
  const map = useMap();
  const seq = useRef(0);
  const load = useCallback(() => {
    if (map.getZoom() < MIN_ZOOM) { onZones(null); return; }
    const b = map.getBounds();
    const mine = ++seq.current;
    getSchools({ bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(5)).join(','), limit: 3000 })
      .then((list) => { if (mine === seq.current) onZones(list); })
      .catch(() => {});
  }, [map, onZones]);
  useMapEvents({ moveend: load, click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  useEffect(() => { load(); }, [load, reloadKey]);
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 15), { duration: 0.6 }); }, [target, map]);
  return null;
}

/* =============================================
   CSV IMPORT
   ============================================= */
function ImportPanel({ onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const inputRef = useRef(null);

  const choose = async (f) => {
    setFile(f); setPreview(null); setDone(null); setError('');
    if (!f) return;
    setBusy(true);
    try { setPreview(await importSchools(f, true)); }
    catch (err) { setError(err?.response?.data?.error || 'Could not read the file.'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const res = await importSchools(file, false);
      setDone(res.imported);
      setPreview(null); setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported();
    } catch (err) { setError(err?.response?.data?.error || 'Import failed.'); }
    finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'school_zones_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title="Import schools from CSV" icon="fa-file-csv"
      actions={<button className="btn" onClick={downloadTemplate}><i className="fa-solid fa-download"></i> Template</button>}>
      <div className="import-box">
        <p className="admin-help">
          Required columns: <strong>name, lat, lon</strong>. Optional: location, radius_m, speed_limit, morning/afternoon start & end, days (e.g. <em>Mon-Fri</em>).
          Empty values use the defaults: 300 m · 25 km/h · 08:00–09:00 & 15:30–16:30 · Mon–Fri. Schools already saved are skipped.
        </p>
        <label className="import-drop">
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0] || null)} />
          <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`}></i>
          <span>{file ? file.name : 'Choose a CSV file'}</span>
        </label>

        {error && <div className="note error"><i className="fa-solid fa-triangle-exclamation"></i>{error}</div>}
        {done != null && <div className="note good"><i className="fa-solid fa-circle-check"></i>Imported {done.toLocaleString()} school zones.</div>}

        {preview && (
          <div className="import-preview">
            <div className="import-counts">
              <div className="ok"><strong>{preview.valid.toLocaleString()}</strong><span>ready to import</span></div>
              <div className="dup"><strong>{preview.duplicates.toLocaleString()}</strong><span>already saved</span></div>
              <div className="bad"><strong>{preview.skipped.toLocaleString()}</strong><span>skipped</span></div>
            </div>
            {preview.sample?.length > 0 && (
              <p className="admin-help">First rows: {preview.sample.map((r) => r.name).join(' · ')}</p>
            )}
            {preview.skipped_rows?.length > 0 && (
              <div className="import-skipped">
                {preview.skipped_rows.slice(0, 8).map((r) => (
                  <div key={r.line}>Line {r.line}{r.name ? ` (${r.name})` : ''}: {r.reason}</div>
                ))}
                {preview.skipped > 8 && <div>…and {preview.skipped - 8} more</div>}
              </div>
            )}
            <button className="btn btn-primary" onClick={confirm} disabled={busy || preview.valid === 0}>
              <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-file-import'}`}></i> Import {preview.valid.toLocaleString()} schools
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* =============================================
   PAGE
   ============================================= */
export default function AdminSchoolsPage() {
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);       // zones in the current map view; null = zoomed out
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const formRef = useRef(null);

  const refresh = useCallback(() => {
    getSchoolStats().then(setStats).catch(() => {});
    setReloadKey((k) => k + 1);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Name search across all schools (the map only holds what's in view)
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => getSchools({ q: query.trim(), limit: 10 }).then(setResults).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [query]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleDay = (d) => setForm((f) => ({ ...f, school_days: f.school_days.includes(d) ? f.school_days.filter((x) => x !== d) : [...f.school_days, d].sort() }));

  const pickPoint = async (lat, lon) => {
    setForm((f) => ({ ...f, lat, lon }));
    try {
      const place = await reverseGeocode(lat, lon);
      setForm((f) => (f.lat === lat ? { ...f, location_name: place?.name || f.location_name } : f));
    } catch { /* keep the typed name */ }
  };

  const startEdit = (z) => {
    setEditingId(z.id);
    setForm({ ...EMPTY, ...z, school_days: toDays(z.school_days), notes: z.notes || '', morning_start: z.morning_start || '', morning_end: z.morning_end || '', afternoon_start: z.afternoon_start || '', afternoon_end: z.afternoon_end || '' });
    setMessage(null);
    setFlyTarget({ lat: z.lat, lon: z.lon });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  const reset = () => { setEditingId(null); setForm(EMPTY); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) await updateSchool(editingId, form);
      else await createSchool(form);
      setMessage({ tone: 'good', text: editingId ? 'School zone updated.' : 'School zone added.' });
      reset();
      refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err?.response?.data?.error || 'Could not save the school zone.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (z) => {
    if (!window.confirm(`Delete the school zone "${z.name}"?`)) return;
    try { await deleteSchool(z.id); if (editingId === z.id) reset(); refresh(); }
    catch (err) { setMessage({ tone: 'error', text: err?.response?.data?.error || 'Could not delete.' }); }
  };

  const toggleActive = async (z) => {
    try { await updateSchool(z.id, { ...z, active: z.active ? 0 : 1 }); refresh(); }
    catch (err) { setMessage({ tone: 'error', text: err?.response?.data?.error || 'Could not update.' }); }
  };

  return (
    <div className="page">
      <div className="stat-grid">
        <StatTile label="School zones" value={stats?.total?.toLocaleString()} icon="fa-school" color="#f59e0b" />
        <StatTile label="Active right now" value={stats?.active_now?.toLocaleString()} icon="fa-children" color="#ef4444" hint="Inside a bell-time window" />
        <StatTile label="Switched on" value={stats?.switched_on?.toLocaleString()} icon="fa-toggle-on" color="#10b981" />
        <StatTile label="In this map view" value={zones == null ? '—' : zones.length.toLocaleString()} icon="fa-map" color="#3b82f6" hint={zones == null ? 'Zoom in to load' : undefined} />
      </div>

      {/* MAP: the main view of all school zones */}
      <Panel title="School zones map" icon="fa-map-location-dot"
        actions={
          <div className="school-search">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a school by name…" />
            {results.length > 0 && (
              <div className="school-search-results">
                {results.map((z) => (
                  <button key={z.id} onClick={() => { setFlyTarget({ lat: z.lat, lon: z.lon }); setQuery(''); }}>
                    <strong>{z.name}</strong><span>{z.location_name || `${z.lat.toFixed(3)}, ${z.lon.toFixed(3)}`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        }>
        <div className="admin-map school-map">
          <MapContainer center={[13.0827, 80.2707]} zoom={13} preferCanvas style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <ViewportLoader reloadKey={reloadKey} onZones={setZones} onPick={pickPoint} />
            <FlyTo target={flyTarget} />
            {(zones || []).filter((z) => z.id !== editingId).map((z) => {
              const live = activeNow(z);
              return (
                <Circle key={z.id} center={[z.lat, z.lon]} radius={z.radius_m}
                  pathOptions={{ color: live ? '#ef4444' : '#f59e0b', weight: 1, fillOpacity: z.active ? 0.22 : 0.05, dashArray: z.active ? null : '4 4' }}>
                  <Popup>
                    <div className="school-popup">
                      <strong>{z.name}</strong>
                      <span>{z.location_name}</span>
                      <span>{windowsText(z)} · {daysText(z.school_days)}</span>
                      <span>{z.speed_limit} km/h · {z.radius_m} m{live ? ' · ACTIVE NOW' : ''}{z.active ? '' : ' · switched off'}</span>
                      <div className="school-popup-actions">
                        <button onClick={() => startEdit(z)}><i className="fa-solid fa-pen"></i> Edit</button>
                        <button onClick={() => toggleActive(z)}><i className={`fa-solid ${z.active ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i> {z.active ? 'Off' : 'On'}</button>
                        <button className="danger" onClick={() => remove(z)}><i className="fa-solid fa-trash"></i></button>
                      </div>
                    </div>
                  </Popup>
                </Circle>
              );
            })}
            {form.lat != null && (
              <>
                <Circle center={[form.lat, form.lon]} radius={form.radius_m} pathOptions={{ color: '#3b82f6', weight: 2, fillOpacity: 0.25 }} />
                <Marker position={[form.lat, form.lon]} />
              </>
            )}
          </MapContainer>
          {zones == null && <div className="map-hint"><i className="fa-solid fa-magnifying-glass-plus"></i> Zoom in to see school zones</div>}
        </div>
        <p className="admin-help">Red = active right now · amber = outside bell times · dashed = switched off. Click a circle to edit it, or click empty map to place a new school.</p>
      </Panel>

      <div className="grid-2 admin-grid">
        <ImportPanel onImported={refresh} />

        <div ref={formRef}>
          <Panel title={editingId ? 'Edit school zone' : 'Add one school'} icon={editingId ? 'fa-pen' : 'fa-plus'}
            actions={editingId && <button className="btn" onClick={reset}><i className="fa-solid fa-xmark"></i> Cancel edit</button>}>
            <form className="admin-form" onSubmit={save}>
              <label className="full">School name
                <input className="admin-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Government Higher Secondary School" required />
              </label>
              <div className="full">
                <LocationSearch id="school-location" label="Location (search, or click on the map)" placeholder="Search school or area..."
                  value={form.location_name ? { name: form.location_name } : null}
                  onSelect={(loc) => {
                    setForm((f) => ({ ...f, location_name: loc?.name || '', ...(loc?.lat != null ? { lat: loc.lat, lon: loc.lon } : {}) }));
                    if (loc?.lat != null) setFlyTarget({ lat: loc.lat, lon: loc.lon });
                  }} />
                {form.lat != null && <div className="locate-hint" style={{ marginTop: 6 }}><i className="fa-solid fa-location-dot"></i> {form.lat.toFixed(5)}, {form.lon.toFixed(5)}</div>}
              </div>
              <label>Zone radius: <strong>{form.radius_m} m</strong>
                <input type="range" min="100" max="800" step="50" value={form.radius_m} onChange={(e) => set('radius_m', Number(e.target.value))} />
              </label>
              <label>Speed limit
                <div className="segmented admin-seg">
                  {[20, 25, 30, 40].map((v) => (
                    <button type="button" key={v} className={form.speed_limit === v ? 'active' : ''} onClick={() => set('speed_limit', v)}>{v}</button>
                  ))}
                </div>
              </label>
              <label>Morning start<input type="time" value={form.morning_start} onChange={(e) => set('morning_start', e.target.value)} /></label>
              <label>Morning end<input type="time" value={form.morning_end} onChange={(e) => set('morning_end', e.target.value)} /></label>
              <label>Afternoon start<input type="time" value={form.afternoon_start} onChange={(e) => set('afternoon_start', e.target.value)} /></label>
              <label>Afternoon end<input type="time" value={form.afternoon_end} onChange={(e) => set('afternoon_end', e.target.value)} /></label>
              <label className="full">School days
                <div className="day-picker">
                  {DAYS.map((d, i) => (
                    <button type="button" key={d} className={form.school_days.includes(i) ? 'active' : ''} onClick={() => toggleDay(i)}>{d}</button>
                  ))}
                </div>
              </label>
              <label className="full">Notes (optional)
                <textarea className="admin-input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Main gate opens onto the highway" />
              </label>
              {message && <div className={`note ${message.tone} full`}><i className={`fa-solid ${message.tone === 'good' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>{message.text}</div>}
              <button className="btn btn-primary full" type="submit" disabled={saving}>
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : editingId ? 'fa-floppy-disk' : 'fa-plus'}`}></i> {editingId ? 'Save changes' : 'Add school zone'}
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
