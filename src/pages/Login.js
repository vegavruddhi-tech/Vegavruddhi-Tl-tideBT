import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '175231524136-39m136pat1dpous6u9eijhfulpmpms1i.apps.googleusercontent.com';

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if token is passed in URL (from main TL portal redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenFromURL = params.get('token');
    if (tokenFromURL) {
      localStorage.setItem('token', tokenFromURL);
      navigate('/dashboard');
      return;
    }
    // Already logged in
    if (localStorage.getItem('token')) {
      navigate('/dashboard');
      return;
    }

    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [navigate]);

  const initGoogle = () => {
    if (!window.google) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    });
    window.google.accounts.id.renderButton(
      document.getElementById('google-btn'),
      {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'signin_with',
        shape: 'rectangular',
      }
    );
  };

  const handleGoogleResponse = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Login failed. You are not authorized.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #071a0f 0%, #0f3320 50%, #1a5c38 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, padding: '48px 44px',
        width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.35)', textAlign: 'center'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img
            src="https://res.cloudinary.com/dhhcykoqa/image/upload/v1775158486/logo-full_ueklky.png"
            alt="Vegavruddhi"
            style={{ height: 64, width: 64, objectFit: 'contain' }}
          />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a4731', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Vegavruddhi
          </div>
          <div style={{ fontSize: 11, color: '#6b9e82', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            TL Tide BT Dashboard
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1.5px solid #e8f0eb', marginBottom: 32 }} />

        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a2e22', marginBottom: 8 }}>
          Welcome Back 👋
        </div>
        <p style={{ fontSize: 13, color: '#6b9e82', marginBottom: 28, lineHeight: 1.6 }}>
          Sign in with your registered Google account to access the TL Tide BT Dashboard.
        </p>

        {/* Google Sign In Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div id="google-btn"></div>
        </div>

        {loading && (
          <div style={{ fontSize: 13, color: '#1a4731', marginBottom: 12 }}>
            Verifying your account...
          </div>
        )}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10,
            padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginTop: 12
          }}>
            ⚠️ {error}
          </div>
        )}

        <p style={{ fontSize: 11, color: '#aaa', marginTop: 24, lineHeight: 1.5 }}>
          Only authorized Team Leads can access this dashboard.
          <br />Contact admin if you face any issues.
        </p>
      </div>
    </div>
  );
}
