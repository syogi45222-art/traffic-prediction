import React from 'react';
import { Panel } from './ui';

// Incident status is shown in the banner above the map; this card only adds the safety advice.
export default function AccidentCard({ accident }) {
  return (
    <Panel title="Safety advice" icon="fa-shield-halved">
      {accident ? (
        <div className="kv-list">
          <div className="kv"><span>Suggested speed</span><strong>{accident.speed || 60} km/h</strong></div>
          <div className="kv"><span>Nearest incident</span><strong>{accident.distance || 'None on route'}</strong></div>
          <div className="kv"><span>Advice</span><strong style={{ textAlign: 'right' }}>{accident.advice || 'Drive safely'}</strong></div>
        </div>
      ) : (
        <p className="route-meta">Checking the route for incidents…</p>
      )}
    </Panel>
  );
}
