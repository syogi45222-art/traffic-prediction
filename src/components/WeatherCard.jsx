import React from 'react';
import { Panel } from './ui';

export default function WeatherCard({ weather }) {
  return (
    <Panel title={weather?.city ? `Weather · ${weather.city}` : 'Weather'} icon="fa-cloud-sun">
      {weather ? (
        <div className="kv-list">
          <div className="kv"><span>Conditions</span><strong>{weather.weather_main ?? '--'}</strong></div>
          <div className="kv"><span>Temperature</span><strong>{weather.temp ?? '--'} °C</strong></div>
          <div className="kv"><span>Humidity · Wind</span><strong>{weather.humidity ?? '--'}% · {weather.wind ?? '--'} m/s</strong></div>
          <div className="kv"><span>Visibility</span><strong>{weather.visibility ?? '--'} km</strong></div>
        </div>
      ) : (
        <p className="route-meta">Weather appears after a route prediction.</p>
      )}
    </Panel>
  );
}
