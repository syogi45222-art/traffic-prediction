import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import PredictionPage from './pages/PredictionPage';
import WeatherPage from './pages/WeatherPage';
import TrafficPage from './pages/TrafficPage';
import AccidentPage from './pages/AccidentPage';
import HistoryPage from './pages/HistoryPage';
import TrainPage from './pages/TrainPage'; // <-- ADDED IMPORT HERE
import AdminEventsPage from './pages/AdminEventsPage';
import AdminSchoolsPage from './pages/AdminSchoolsPage';

function AppLayout() {
  // Phone-size screens: the sidebar becomes a slide-in menu opened from the topbar
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className={`app-layout ${menuOpen ? 'menu-open' : ''}`}>
      <Sidebar onNavigate={() => setMenuOpen(false)} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)}></div>}
      <div className="main-wrapper">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/prediction" element={<PredictionPage />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route path="/traffic" element={<TrafficPage />} />
            <Route path="/accident" element={<AccidentPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/train" element={<TrainPage />} /> {/* <-- ADDED ROUTE HERE */}
            <Route path="/admin/events" element={isAdmin() ? <AdminEventsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/schools" element={isAdmin() ? <AdminSchoolsPage /> : <Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

// Read login state on every navigation (not once when App first renders),
// so navigate('/dashboard') right after login sees the new user_id.
const isLoggedIn = () => Boolean(localStorage.getItem('user_id'));
const isAdmin = () => localStorage.getItem('role') === 'admin';

function RequireAuth({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }) {
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      {/* Login page; already logged-in users go straight to the dashboard */}
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />

      {/* Everything else needs a logged-in user */}
      <Route path="/*" element={<RequireAuth><AppLayout /></RequireAuth>} />
    </Routes>
  );
}