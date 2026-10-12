// Route charts. Each chart shows one unit only (km/h, minutes or %),
// so values are never mixed on a single axis.
import React from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { COLORS, levelColor, round1 } from './chartTheme';

// Live speed against the speed the road allows with no traffic.
export function SpeedChart({ metrics }) {
  if (!metrics) return <EmptyChart />;
  const data = {
    labels: ['Current speed', 'Free-flow speed'],
    datasets: [{
      data: [round1(metrics.average_speed), round1(metrics.free_flow_speed)],
      backgroundColor: [COLORS.blue, 'rgba(16, 185, 129, 0.55)'],
      borderRadius: 8,
      barThickness: 34
    }]
  };
  const options = {
    indexAxis: 'y',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw} km/h` } } },
    scales: {
      x: { beginAtZero: true, title: { display: true, text: 'km/h' } },
      y: { grid: { display: false } }
    }
  };
  return <div className="chart-box"><Bar data={data} options={options} /></div>;
}

// Travel time split into "time without traffic" and "extra delay", stacked.
// Pass several rows (e.g. Now vs +3h) to compare them.
export function TimeChart({ rows, height }) {
  const valid = (rows || []).filter(r => r.metrics);
  if (valid.length === 0) return <EmptyChart />;
  const base = valid.map(r => round1(r.metrics.no_traffic_time ?? (r.metrics.travel_time - r.metrics.delay)));
  const delay = valid.map(r => round1(r.metrics.delay));
  const data = {
    labels: valid.map(r => r.label),
    datasets: [
      { label: 'Without traffic', data: base, backgroundColor: 'rgba(59, 130, 246, 0.55)', borderRadius: 6, barThickness: 30, stack: 't' },
      { label: 'Traffic delay', data: delay, backgroundColor: valid.map(r => levelColor(r.level)), borderRadius: 6, barThickness: 30, stack: 't' }
    ]
  };
  const options = {
    indexAxis: 'y',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw} min` } }
    },
    scales: {
      x: { stacked: true, beginAtZero: true, title: { display: true, text: 'minutes' } },
      y: { stacked: true, grid: { display: false } }
    }
  };
  return <div className="chart-box" style={height ? { height } : undefined}><Bar data={data} options={options} /></div>;
}

// Half-ring gauge for the traffic index (0–100 %).
export function CongestionGauge({ value, level }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const color = levelColor(level);
  const data = {
    labels: ['Congestion', 'Free capacity'],
    datasets: [{ data: [v, 100 - v], backgroundColor: [color, COLORS.track], borderWidth: 0 }]
  };
  const options = {
    rotation: -90,
    circumference: 180,
    cutout: '78%',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}%` } } }
  };
  return (
    <div className="gauge">
      <div className="chart-box gauge-chart"><Doughnut data={data} options={options} /></div>
      <div className="gauge-center">
        <div className="gauge-value" style={{ color }}>{v}%</div>
        <div className="gauge-label">{level || 'Traffic index'}</div>
      </div>
    </div>
  );
}

// Rolling line chart of snapshots taken while the page is open.
export function LiveTrendChart({ history }) {
  if (!history || history.length === 0) return <EmptyChart message="Waiting for the first live reading…" />;
  const data = {
    labels: history.map(h => h.time),
    datasets: [
      {
        label: 'Current speed (km/h)', data: history.map(h => h.speed), borderColor: COLORS.blue,
        backgroundColor: 'rgba(59, 130, 246, 0.12)', fill: true, tension: 0.35, pointRadius: 3, yAxisID: 'y'
      },
      {
        label: 'Delay (min)', data: history.map(h => h.delay), borderColor: COLORS.amber,
        tension: 0.35, pointRadius: 3, yAxisID: 'y1'
      }
    ]
  };
  const options = {
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top', align: 'end' } },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
      y: { beginAtZero: true, position: 'left', title: { display: true, text: 'km/h' } },
      y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'min' } }
    }
  };
  return <div className="chart-box"><Line data={data} options={options} /></div>;
}

export function EmptyChart({ message }) {
  return (
    <div className="chart-empty">
      <i className="fa-solid fa-chart-simple"></i>
      <span>{message || 'Run a route prediction to see this chart.'}</span>
    </div>
  );
}
