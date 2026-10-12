import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getRole } from '../api/api';

export default function Sidebar({ onNavigate }) {
  const [role, setRole] = useState(() => localStorage.getItem('role'));

  // The role saved at login can be out of date; ask the server once per load
  useEffect(() => {
    const userId = localStorage.getItem('user_id');
    if (!userId) return;
    getRole(userId).then((r) => { localStorage.setItem('role', r); setRole(r); }).catch(() => {});
  }, []);

  return (
    <div className="sidebar">
      <div className="logo">
        <i className="fa-solid fa-traffic-light"></i>
        <h2>TrafficAI</h2>
        <button className="sidebar-close" onClick={onNavigate} aria-label="Close menu"><i className="fa-solid fa-xmark"></i></button>
      </div>

      <ul onClick={(e) => { if (e.target.closest('a')) onNavigate?.(); }}>
        <li>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-gauge-high"></i>
            <span>Dashboard</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/traffic" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-wave-square"></i>
            <span>Traffic Density</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/prediction" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-brain"></i>
            <span>ML Prediction</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/analytics" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-chart-pie"></i>
            <span>Analytics</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/accident" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>Accident Alert</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/weather" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-cloud-sun"></i>
            <span>Weather Impact</span>
          </NavLink>
        </li>
        {/* NEW TRAIN INFO LINK */}
        <li>
          <NavLink to="/train" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-train"></i>
            <span>Train Info</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/history" className={({ isActive }) => isActive ? "active" : ""}>
            <i className="fa-solid fa-clock-rotate-left"></i>
            <span>History</span>
          </NavLink>
        </li>
        {role === 'admin' && (
          <li>
            <NavLink to="/admin/events" className={({ isActive }) => isActive ? "active" : ""}>
              <i className="fa-solid fa-calendar-days"></i>
              <span>Events Admin</span>
            </NavLink>
          </li>
        )}
        {role === 'admin' && (
          <li>
            <NavLink to="/admin/schools" className={({ isActive }) => isActive ? "active" : ""}>
              <i className="fa-solid fa-children"></i>
              <span>School Zones</span>
            </NavLink>
          </li>
        )}
      </ul>
    </div>
  );
}