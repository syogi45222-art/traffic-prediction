import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Topbar({ onMenu }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Get the logged-in user's name from localStorage
  const username = localStorage.getItem('username') || 'User';

  // Dynamic Title and Subtitle based on the current URL path
  let title = "Smart Traffic Jam Prediction";
  let subtitle = "AI-Powered Routing & Congestion Forecasting";

  if (location.pathname === '/dashboard' || location.pathname === '/') {
    title = "Route Dashboard";
    subtitle = "Live navigation, routing, and traffic jam analysis";
  } else if (location.pathname === '/traffic') {
    title = "Traffic Density";
    subtitle = "Hourly traffic pattern and congestion on your route";
  } else if (location.pathname === '/prediction') {
    title = "ML Prediction";
    subtitle = "Forecast your route for later departure times";
  } else if (location.pathname === '/analytics') {
    title = "Live Analytics";
    subtitle = "Speed, delay and travel time, refreshed every 30 seconds";
  } else if (location.pathname === '/accident') {
    title = "Accident & Hazard Alerts";
    subtitle = "Live incident tracking and safety speed suggestions";
  } else if (location.pathname === '/weather') {
    title = "Weather Impact Analysis";
    subtitle = "Atmospheric conditions affecting traffic density";
  } else if (location.pathname === '/train') {
    title = "Train Info";
    subtitle = "Trains between stations, with every stop and timing";
  } else if (location.pathname === '/history') {
    title = "Search History";
    subtitle = "Your previous route predictions and analytics";
  } else if (location.pathname === '/admin/events') {
    title = "Events Admin";
    subtitle = "Festivals, temple events and market days that affect traffic";
  } else if (location.pathname === '/admin/schools') {
    title = "School Zones";
    subtitle = "Schools and bell times for time-based safety alerts";
  }

  // Handle User Logout
  const handleLogout = () => {
    // Clear the user session from localStorage
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    // Redirect and force page reload to clear React state
    window.location.href = '/login';
  };

  return (
    <div className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Open menu"><i className="fa-solid fa-bars"></i></button>
      <div className="topbar-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="topbar-actions">
        {/* User Greeting */}
        <div className="profile">
          <i className="fa-solid fa-user-pen"></i>
          <span>Hii, {username}</span>
        </div>

        {/* Logout Button */}
        <button
          className="logout-btn"
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)'
          }}
        >
          <i className="fa-solid fa-right-from-bracket"></i>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}