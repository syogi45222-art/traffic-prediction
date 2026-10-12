// Shared Chart.js setup: registers elements once and applies the dark theme
// so every chart in the app looks the same.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.font.family = 'Inter, sans-serif';
ChartJS.defaults.font.size = 12;
ChartJS.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
ChartJS.defaults.plugins.legend.labels.boxWidth = 8;
ChartJS.defaults.plugins.tooltip.backgroundColor = '#0b0f19';
ChartJS.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.12)';
ChartJS.defaults.plugins.tooltip.borderWidth = 1;
ChartJS.defaults.plugins.tooltip.padding = 10;
ChartJS.defaults.plugins.tooltip.cornerRadius = 8;
ChartJS.defaults.maintainAspectRatio = false;

export const COLORS = {
  blue: '#3b82f6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  slate: '#64748b',
  track: 'rgba(100, 116, 139, 0.18)'
};

// One place to map any traffic/congestion label to a colour.
// Backend returns "Low" / "Moderate" / "High" and "Light" / "Moderate" / "Heavy".
export function levelColor(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('low') || l.includes('light')) return COLORS.green;
  if (l.includes('moderate') || l.includes('medium')) return COLORS.amber;
  if (l.includes('high') || l.includes('heavy')) return COLORS.red;
  return COLORS.slate;
}

export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
