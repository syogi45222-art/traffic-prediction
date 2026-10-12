import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser } from '../api/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        const data = await loginUser(username, password);
        if (data.error) {
          setError(data.error);
        } else {
          localStorage.setItem('user_id', data.user_id);
          localStorage.setItem('username', data.username);
          localStorage.setItem('role', data.role || 'user');
          navigate('/dashboard', { replace: true });
        }
      } else {
        const data = await registerUser(username, password);
        if (data.error) {
          setError(data.error);
        } else {
          setSuccess(data.message);
          setIsLogin(true);
        }
      }
    } catch (err) {
      setError('Server connection failed. Is Flask running?');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    body: {
      backgroundImage: 'url("https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1920&q=80")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      height: '100vh',
      width: '100%',
    },
    overlay: {
      width: '100%',
      height: '100vh',
      background: 'rgba(0,0,0,.75)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '16px',
      boxSizing: 'border-box',
    },
    loginCard: {
      width: '100%',
      maxWidth: '420px',
      background: 'rgba(17,24,39,.95)',
      padding: 'clamp(22px, 6vw, 40px)',
      borderRadius: '20px',
      color: 'white',
      textAlign: 'center',
      backdropFilter: 'blur(10px)',
      boxSizing: 'border-box',
    },
    logo: {
      width: '80px',
      height: '80px',
      margin: 'auto',
      borderRadius: '50%',
      background: '#2563eb',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: '32px',
      marginBottom: '20px',
    },
    h1: { marginBottom: '10px', fontSize: '24px' },
    p: { color: '#cbd5e1', marginBottom: '25px', fontSize: '14px' },
    inputBox: { position: 'relative', marginBottom: '15px' },
    inputIcon: { position: 'absolute', left: '15px', top: '15px', color: '#64748b' },
    input: {
      width: '100%', 
      padding: '14px 14px 14px 45px', 
      backgroundColor: '#0b0f19',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '10px', 
      boxSizing: 'border-box', 
      fontSize: '14px',
      color: '#f8fafc', 
      outline: 'none', 
      fontFamily: 'Inter, sans-serif'
    },
    btn: {
      width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
      background: '#2563eb', color: 'white', fontSize: '16px', cursor: 'pointer',
      marginTop: '10px', fontWeight: '600'
    },
    links: { marginTop: '20px', display: 'flex', justifyContent: 'space-between' },
    link: { color: '#60a5fa', textDecoration: 'none', cursor: 'pointer', fontSize: '14px' }
  };

  return (
    <div style={styles.body}>
      <div style={styles.overlay}>
        <div style={styles.loginCard}>
          <div style={styles.logo}>
            <i className="fa-solid fa-route"></i>
          </div>
          
          <h1 style={styles.h1}>Smart Traffic Prediction</h1>
          <p style={styles.p}>AI Powered Traffic Analysis & Smart Route Recommendation</p>

          <form onSubmit={handleSubmit}>
            <div style={styles.inputBox}>
              <i className="fa-solid fa-user" style={styles.inputIcon}></i>
              <input
                type="text"
                placeholder="Username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                autoComplete="off" /* THIS STOPS THE BROWSER FROM AUTO-FILLING "eswar" */
              />
            </div>

            <div style={styles.inputBox}>
              <i className="fa-solid fa-lock" style={styles.inputIcon}></i>
              <input
                type="password"
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                autoComplete="new-password" /* THIS STOPS PASSWORD AUTO-FILL */
              />
            </div>

            {error && <p style={{ color: '#ef4444', marginBottom: '15px', fontSize: '14px' }}>{error}</p>}
            {success && <p style={{ color: '#10b981', marginBottom: '15px', fontSize: '14px' }}>{success}</p>}

            <button type="submit" style={styles.btn} disabled={loading}>
              {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Create Account')}
            </button>
          </form>

          <div style={styles.links}>
            <span style={styles.link} onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); }}>
              {isLogin ? 'Create Account' : 'Back to Login'}
            </span>
            <span style={styles.link} onClick={() => alert('Please contact your system administrator.')}>
              Forgot Password?
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}