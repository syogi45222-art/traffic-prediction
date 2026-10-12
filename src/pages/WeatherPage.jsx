import React, { useState, useEffect } from 'react';
import { useTraffic } from '../context/TrafficContext';
import { getWeather } from '../api/api';

function getWeatherIcon(main) {
  const m = (main || '').toLowerCase();
  if (m.includes('clear')) return { icon: '☀️', bg: 'linear-gradient(135deg, #f59e0b, #d97706)' };
  if (m.includes('cloud')) return { icon: '☁️', bg: 'linear-gradient(135deg, #64748b, #475569)' };
  if (m.includes('rain')) return { icon: '🌧️', bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' };
  if (m.includes('thunder')) return { icon: '⛈️', bg: 'linear-gradient(135deg, #7c3aed, #4c1d95)' };
  if (m.includes('snow')) return { icon: '❄️', bg: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' };
  if (m.includes('mist') || m.includes('fog') || m.includes('haze')) return { icon: '🌫️', bg: 'linear-gradient(135deg, #64748b, #334155)' };
  return { icon: '🌤️', bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' };
}

function getComfortLevel(temp) {
  if (temp > 40) return { text: 'Extreme Heat', color: '#ef4444', advice: 'Avoid outdoor activities.' };
  if (temp > 35) return { text: 'Very Hot', color: '#f97316', advice: 'Wear light clothing. Use sunscreen.' };
  if (temp > 30) return { text: 'Hot', color: '#f59e0b', advice: 'Stay in shade when possible.' };
  if (temp > 25) return { text: 'Warm', color: '#10b981', advice: 'Comfortable for outdoor activities.' };
  if (temp > 20) return { text: 'Pleasant', color: '#3b82f6', advice: 'Perfect weather for travel.' };
  if (temp > 15) return { text: 'Cool', color: '#6366f1', advice: 'Wear a light jacket.' };
  if (temp > 10) return { text: 'Chilly', color: '#8b5cf6', advice: 'Wear warm clothing.' };
  if (temp > 0) return { text: 'Cold', color: '#06b6d4', advice: 'Drive carefully. Roads may be icy.' };
  return { text: 'Freezing', color: '#e2e8f0', advice: 'Extreme cold. Avoid non-essential travel.' };
}

function getTrafficImpact(weather) {
  const m = (weather?.weather_main || '').toLowerCase();
  if (m.includes('thunder')) return { level: 'Severe', color: '#ef4444', icon: 'fa-triangle-exclamation', desc: 'Thunderstorms cause major traffic disruptions. Expect significant delays.' };
  if (m.includes('rain')) return { level: 'High', color: '#f97316', icon: 'fa-cloud-rain', desc: 'Rain reduces visibility and road grip. Slow down and maintain distance.' };
  if (m.includes('snow')) return { level: 'High', color: '#f97316', icon: 'fa-snowflake', desc: 'Snow causes slippery roads. Use winter tires and drive carefully.' };
  if (m.includes('fog') || m.includes('mist') || m.includes('haze')) return { level: 'Moderate', color: '#f59e0b', icon: 'fa-smog', desc: 'Low visibility conditions. Use fog lights and reduce speed.' };
  if (m.includes('dust') || m.includes('sand')) return { level: 'Moderate', color: '#f59e0b', icon: 'fa-wind', desc: 'Dust reduces visibility. Keep windows closed while driving.' };
  if (m.includes('cloud')) return { level: 'Low', color: '#10b981', icon: 'fa-cloud', desc: 'Overcast skies. Normal driving conditions expected.' };
  if (m.includes('clear')) return { level: 'Minimal', color: '#10b981', icon: 'fa-sun', desc: 'Clear skies. Ideal driving conditions.' };
  return { level: 'Low', color: '#10b981', icon: 'fa-circle-check', desc: 'Normal driving conditions expected.' };
}

export default function WeatherPage() {
  const { predictionData, sourceLocation, destinationLocation } = useTraffic();
  const [sourceWeather, setSourceWeather] = useState(null);
  const [destWeather, setDestWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  // AUTO-LOAD weather from prediction data
  useEffect(() => {
    async function loadWeather() {
      if (predictionData?.weather) {
        setSourceWeather(predictionData.weather);
        // Also fetch destination weather
        if (destinationLocation?.name && destinationLocation.name !== sourceLocation?.name) {
          setLoading(true);
          try {
            const data = await getWeather(destinationLocation.name);
            setDestWeather(data);
          } catch (err) {
            console.error('Dest weather error:', err);
          } finally {
            setLoading(false);
          }
        } else {
          setDestWeather(null);
        }
      }
    }
    loadWeather();
  }, [predictionData, sourceLocation, destinationLocation]);

  function renderWeatherCard(weather, label, locationInfo) {
    if (!weather) return null;
    const weatherInfo = getWeatherIcon(weather.weather_main);
    const comfort = getComfortLevel(weather.temp);
    const impact = getTrafficImpact(weather);

    return (
      <div key={label}>
        {/* SECTION LABEL */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#fff' }}>
            <i className={label === 'Source' ? 'fa-solid fa-location-dot' : 'fa-solid fa-flag-checkered'}></i>
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{label} Weather</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{locationInfo?.name || weather.city}</p>
          </div>
        </div>

        {/* HERO CARD */}
        <div style={{ background: weatherInfo.bg, borderRadius: '16px', padding: '25px', marginBottom: '20px', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '100px', opacity: '0.15' }}>{weatherInfo.icon}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ fontSize: '52px', lineHeight: 1 }}>{weatherInfo.icon}</span>
              <div>
                <div style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1 }}>{Math.round(weather.temp)}°C</div>
                <div style={{ fontSize: '15px', fontWeight: 600, opacity: 0.9, marginTop: '4px' }}>{weather.weather_main}</div>
                <div style={{ fontSize: '12px', opacity: 0.7, textTransform: 'capitalize' }}>{weather.description}</div>
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', opacity: 0.8 }}>Comfort</span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: comfort.color }}>{comfort.text}</div>
            </div>
          </div>
        </div>

        {/* DETAIL CARDS */}
        <div className="wx-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <i className="fa-solid fa-droplet" style={{ color: '#3b82f6', fontSize: '16px', marginBottom: '6px', display: 'block' }}></i>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{weather.humidity}%</div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Humidity</span>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <i className="fa-solid fa-wind" style={{ color: '#10b981', fontSize: '16px', marginBottom: '6px', display: 'block' }}></i>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{weather.wind} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>m/s</span></div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Wind</span>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <i className="fa-solid fa-eye" style={{ color: '#8b5cf6', fontSize: '16px', marginBottom: '6px', display: 'block' }}></i>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{weather.visibility} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>km</span></div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Visibility</span>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <i className="fa-solid fa-cloud" style={{ color: '#64748b', fontSize: '16px', marginBottom: '6px', display: 'block' }}></i>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{weather.clouds_all}%</div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Clouds</span>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <i className="fa-solid fa-cloud-rain" style={{ color: '#06b6d4', fontSize: '16px', marginBottom: '6px', display: 'block' }}></i>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{weather.rain_1h} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>mm</span></div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rain</span>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <i className="fa-solid fa-temperature-half" style={{ color: '#f59e0b', fontSize: '16px', marginBottom: '6px', display: 'block' }}></i>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{weather.temp}°C</div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Temperature</span>
          </div>
        </div>

        {/* TRAFFIC IMPACT */}
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${impact.color}33`, borderRadius: '12px', padding: '18px', borderLeft: `4px solid ${impact.color}`, marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <i className={`fa-solid ${impact.icon}`} style={{ color: impact.color, fontSize: '18px' }}></i>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>Traffic Impact: </span>
            <span style={{ fontWeight: 700, fontSize: '14px', color: impact.color, background: `${impact.color}20`, padding: '3px 10px', borderRadius: '12px' }}>{impact.level}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>{impact.desc}</p>
        </div>

        {/* DRIVING TIPS */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '18px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><i className="fa-solid fa-shield-halved" style={{ color: 'var(--accent-blue)' }}></i> Driving Tips</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', borderRadius: '8px', padding: '10px' }}>
              <i className="fa-solid fa-gauge-high" style={{ color: '#3b82f6', fontSize: '14px' }}></i>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{weather.rain_1h > 0 || weather.visibility < 5 ? 'Reduce speed by 20-30%' : 'Normal speed conditions'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', borderRadius: '8px', padding: '10px' }}>
              <i className="fa-solid fa-car-rear" style={{ color: '#10b981', fontSize: '14px' }}></i>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{weather.rain_1h > 0 ? 'Double following distance' : 'Maintain 3-second gap'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', borderRadius: '8px', padding: '10px' }}>
              <i className="fa-solid fa-lightbulb" style={{ color: '#f59e0b', fontSize: '14px' }}></i>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{weather.visibility < 5 ? 'Use fog lights & low beam' : 'Standard lighting'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', borderRadius: '8px', padding: '10px' }}>
              <i className="fa-solid fa-route" style={{ color: '#8b5cf6', fontSize: '14px' }}></i>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{weather.rain_1h > 0 ? 'Avoid flood-prone routes' : 'All routes accessible'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '20px' }}>

      {/* NO PREDICTION DATA */}
      {!predictionData?.weather && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '60px 30px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
          <i className="fa-solid fa-route" style={{ fontSize: '56px', color: 'var(--accent-blue)', marginBottom: '20px', display: 'block' }}></i>
          <h2 style={{ fontSize: '22px', color: 'var(--text-primary)', marginBottom: '10px' }}>Weather Module</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '5px' }}>Go to Dashboard → Run a traffic prediction first.</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Weather data will auto-load based on your source & destination.</p>
        </div>
      )}

      {/* ROUTE INFO BANNER */}
      {predictionData?.weather && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', marginBottom: '25px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-location-dot" style={{ color: '#10b981', fontSize: '18px' }}></i>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sourceLocation?.name || 'Source'}</span>
            </div>
            <i className="fa-solid fa-arrow-right" style={{ color: 'var(--text-secondary)' }}></i>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-flag-checkered" style={{ color: '#ef4444', fontSize: '18px' }}></i>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{destinationLocation?.name || 'Destination'}</span>
            </div>
            <div style={{ marginLeft: 'auto', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '20px', padding: '6px 14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)' }}><i className="fa-solid fa-cloud-sun" style={{ marginRight: '6px' }}></i>Auto-detected from prediction</span>
            </div>
          </div>
        </div>
      )}

      {/* WEATHER CARDS */}
      {predictionData?.weather && (
        <div className="wx-grid-dest" style={{ display: 'grid', gridTemplateColumns: destWeather ? '1fr 1fr' : '1fr', gap: '25px' }}>
          {/* SOURCE WEATHER */}
          {renderWeatherCard(sourceWeather, 'Source', sourceLocation)}

          {/* DESTINATION WEATHER */}
          {destWeather && renderWeatherCard(destWeather, 'Destination', destinationLocation)}
        </div>
      )}

      {/* LOADING DESTINATION */}
      {loading && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '30px', textAlign: 'center' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '24px', color: 'var(--accent-blue)', marginBottom: '10px' }}></i>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading destination weather...</p>
        </div>
      )}
    </div>
  );
}