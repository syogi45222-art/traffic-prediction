import React, { useState, useEffect } from 'react';
import { getHistory } from '../api/api';

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
  const userId = localStorage.getItem('user_id');
  const data = await getHistory(userId); // Pass the userId
  setHistory(data);
  setLoading(false);
};
    fetchHistory();
  }, []);

  const getPredictionStyle = (prediction) => {
    if (!prediction) return {};
    const p = prediction.toLowerCase();
    if (p.includes('low') || p.includes('light')) return { color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' };
    if (p.includes('medium') || p.includes('moderate')) return { color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' };
    if (p.includes('high') || p.includes('heavy')) return { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' };
    return {};
  };

  const styles = {
    container: { padding: '25px 35px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif' },
    title: { fontSize: '22px', fontWeight: '700', color: '#f8fafc', marginBottom: '5px' },
    subtitle: { color: '#94a3b8', fontSize: '14px', marginBottom: '30px' },
    card: {
      backgroundColor: '#131b2e', border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '16px', padding: '25px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
    },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '13px', fontWeight: '600' },
    td: { padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc', fontSize: '14px' },
    badge: { padding: '6px 12px', borderRadius: '20px', fontWeight: '600', fontSize: '12px', display: 'inline-block', textAlign: 'center' },
    emptyText: { textAlign: 'center', color: '#94a3b8', padding: '40px' }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}><i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '10px', color: '#3b82f6' }}></i> Search History</h1>
      <p style={styles.subtitle}>Your previous route predictions stored in SQLite database.</p>

      <div style={styles.card}>
        {loading ? (
          <p style={styles.emptyText}><i className="fa-solid fa-spinner fa-spin"></i> Loading history...</p>
        ) : history.length === 0 ? (
          <p style={styles.emptyText}>No history found. Search for a route on the Dashboard to see it here.</p>
        ) : (
          <div className="table-scroll">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date & Time</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Destination</th>
                <th style={styles.th}>Distance (km)</th>
                <th style={styles.th}>Delay (min)</th>
                <th style={styles.th}>Traffic Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item, index) => (
                <tr key={index}>
                  <td style={styles.td}>{item.timestamp}</td>
                  <td style={styles.td}>{item.source}</td>
                  <td style={styles.td}>{item.destination}</td>
                  <td style={styles.td}>{item.distance}</td>
                  <td style={styles.td}>{item.delay}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...getPredictionStyle(item.prediction) }}>
                      {item.prediction?.toUpperCase() || 'N/A'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}