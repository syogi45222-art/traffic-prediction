// Small shared building blocks so every module uses the same card, stat and header styles.
import React from 'react';
import { levelColor } from './chartTheme';

export function Panel({ title, icon, actions, children, className = '', bodyHeight }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          {title && <h3>{icon && <i className={`fa-solid ${icon}`}></i>}{title}</h3>}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body" style={bodyHeight ? { height: bodyHeight } : undefined}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, unit, hint, icon, color }) {
  return (
    <div className="stat" style={color ? { '--stat-accent': color } : undefined}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <i className={`fa-solid ${icon}`}></i>}
      </div>
      <div className="stat-value">
        {value ?? '--'}{unit && value != null && <span className="stat-unit">{unit}</span>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function StatusPill({ level, children }) {
  const color = levelColor(level);
  return (
    <span className="pill" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
      <span className="pill-dot" style={{ background: color }}></span>
      {children || level || '--'}
    </span>
  );
}

// "Source → Destination" strip with the current traffic level and optional actions on the right.
export function RouteBar({ source, destination, level, meta, actions }) {
  return (
    <div className="route-bar">
      <div className="route-bar-path">
        <i className="fa-solid fa-circle-dot" style={{ color: '#10b981' }}></i>
        <span className="route-name">{source}</span>
        <i className="fa-solid fa-arrow-right-long route-arrow"></i>
        <i className="fa-solid fa-location-dot" style={{ color: '#ef4444' }}></i>
        <span className="route-name">{destination}</span>
        {level && <StatusPill level={level}>{level} traffic</StatusPill>}
      </div>
      <div className="route-bar-side">
        {meta && <span className="route-meta">{meta}</span>}
        {actions}
      </div>
    </div>
  );
}

export function LiveBadge({ active, children }) {
  return (
    <span className={`live-badge ${active ? 'on' : ''}`}>
      <span className="live-dot"></span>{children}
    </span>
  );
}

export function EmptyState({ icon = 'fa-route', title, text, children }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><i className={`fa-solid ${icon}`}></i></div>
      {title && <h3>{title}</h3>}
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
