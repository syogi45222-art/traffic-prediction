import axios from 'axios';

// Local dev: empty, so Vite's proxy forwards /api to Flask.
// Deployed (Vercel): set VITE_API_URL to the backend URL, e.g. https://smart-traffic-api.onrender.com
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const API = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// =====================================
// MAP & ROUTE APIS
// =====================================
export const searchPlaces = async (query) => {
  try {
    const res = await API.get(`/search_places?q=${encodeURIComponent(query)}&limit=8`);
    return res.data;
  } catch (err) {
    console.error('Search Error:', err);
    return [];
  }
};

export const reverseGeocode = async (lat, lon) => {
  const res = await API.get(`/api/reverse_geocode?lat=${lat}&lon=${lon}`);
  return res.data;
};

export const rerouteFrom = async (lat, lon, destinationCoords) => {
  const res = await API.post('/api/reroute', { lat, lon, destination_coords: destinationCoords });
  return res.data;
};

// =====================================
// FESTIVAL / MARKET-DAY EVENTS
// =====================================
const adminHeaders = () => ({ headers: { 'X-User-Id': localStorage.getItem('user_id') || '' } });

export const getSchools = async (params = {}) => (await API.get('/api/schools', { params })).data;
export const getSchoolStats = async () => (await API.get('/api/schools/stats')).data;
export const importSchools = async (file, dryRun) => {
  const form = new FormData();
  form.append('file', file);
  const res = await API.post(`/api/schools/import?dry_run=${dryRun ? 1 : 0}`, form, {
    headers: { 'Content-Type': 'multipart/form-data', 'X-User-Id': localStorage.getItem('user_id') || '' },
    timeout: 120000
  });
  return res.data;
};
export const createSchool = async (zone) => (await API.post('/api/schools', zone, adminHeaders())).data;
export const updateSchool = async (id, zone) => (await API.put(`/api/schools/${id}`, zone, adminHeaders())).data;
export const deleteSchool = async (id) => (await API.delete(`/api/schools/${id}`, adminHeaders())).data;
export const getRole = async (userId) => (await API.get(`/api/role?user_id=${userId}`)).data.role;
export const getEvents = async () => (await API.get('/api/events')).data;
export const getUpcomingEvents = async (days = 7) => (await API.get(`/api/events/upcoming?days=${days}`)).data;
export const createEvent = async (event) => (await API.post('/api/events', event, adminHeaders())).data;
export const updateEvent = async (id, event) => (await API.put(`/api/events/${id}`, event, adminHeaders())).data;
export const deleteEvent = async (id) => (await API.delete(`/api/events/${id}`, adminHeaders())).data;

// =====================================
// PREDICTION & TRAFFIC APIS
// =====================================
export const predictTraffic = async (source, destination, date, time, weather = null, coords = {}) => {
  const payload = { source, destination, date, time };
  if (weather) payload.weather = weather;
  if (coords.source) payload.source_coords = coords.source;
  if (coords.destination) payload.destination_coords = coords.destination;
  
  const res = await API.post('/predict', payload);
  return res.data;
};

export const getTrafficHistory = async () => {
  const res = await API.get('/traffic_history');
  return res.data;
};

export const getTrafficRealtime = async () => {
  const res = await API.get('/traffic_realtime');
  return res.data;
};

export const getAccidentInfo = async (source, destination) => {
  const res = await API.post('/api/accident', { source, destination });
  return res.data;
};

// =====================================
// WEATHER API
// =====================================
export const getWeather = async (city) => {
  const res = await API.post('/api/weather', { city });
  return res.data;
};

// =====================================
// AUTH APIS
// =====================================
export const loginUser = async (username, password) => {
  const res = await API.post('/api/login', { username, password });
  return res.data;
};

export const registerUser = async (username, password) => {
  const res = await API.post('/api/register', { username, password });
  return res.data;
};

// =====================================
// HISTORY APIS
// =====================================
export const saveHistory = async (historyData) => {
  try {
    await API.post('/api/save_history', historyData);
  } catch (err) {
    console.error('Save History Error:', err);
  }
};

export const getHistory = async (userId) => {
  const res = await API.get(`/api/get_history?user_id=${userId}`);
  return res.data;
};

// =====================================
// SYSTEM
// =====================================
export const healthCheck = async () => {
  const res = await API.get('/health');
  return res.data;
};
export const getTrainInfo = async (source, destination, time = null, date = null) => {
  try {
    let url = `/api/train_info?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}`;
    if (time) url += `&time=${encodeURIComponent(time)}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;
    const res = await API.get(url);
    return res.data;
  } catch (err) {
    console.error('Train Info Error:', err);
    return { route_type: 'not_found', trains: [], summary: 'Failed to load trains.' };
  }
};