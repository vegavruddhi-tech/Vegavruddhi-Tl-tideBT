import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

export default function Login() {
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if token is passed in URL (from TL portal redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenFromURL = params.get('token');
    const viewAsFromURL = params.get('viewAs');

    if (tokenFromURL) {
      // Clear any previous session before saving new token
      localStorage.clear();
      localStorage.setItem('token', tokenFromURL);
      if (viewAsFromURL) {
        localStorage.setItem('viewAsEmail', viewAsFromURL);
        localStorage.setItem('isImpersonating', 'true');
      }
      navigate('/dashboard');
      return;
    }

    // Already logged in
    if (localStorage.getItem('token')) {
      navigate('/dashboard');
      return;
    }

    // Initialize Google Sign-In
    if (window.google && googleBtnRef.current) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google && googleBtnRef.current) {
          initGoogle();
          clearInterval(interval);
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [navigate]);

  const initGoogle = () => {
    window.google.accounts.id.initialize({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID || '175231524136-39m136pat1dpous6u9eijhfulpmpms1i.apps.googleusercontent.com',
      callback: onCredential,
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'signin_with',
    });
  };

  const onCredential = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Sign-in failed');
        setLoading(false);
        return;
      }
      localStorage.setItem('token', data.token);
      navigate('/dashboard');
    } catch {
      setError('Server error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <script src="https://accounts.google.com/gsi/client" async defer />
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <img src="https://res.cloudinary.com/dhhcykoqa/image/upload/v1775158486/logo-full_ueklky.png" alt="Vegavruddhi" style={{ height: 64, width: 64, objectFit: 'contain' }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a4731', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Vegavruddhi</div>
            <div style={{ fontSize: 11, color: '#6b9e82', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>TL Tide BT Dashboard</div>
          </div>

          <hr style={{ border: 'none', borderTop: '1.5px solid #e8f0eb', marginBottom: 32 }} />

          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2e22', marginBottom: 8 }}>Welcome Back 👋</div>
          <p style={{ fontSize: 13, color: '#6b9e82', marginBottom: 32, lineHeight: 1.5 }}>
            Sign in with your registered Google account to access the TL Tide BT dashboard.
          </p>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ fontSize: 14, color: '#6b9e82' }}>Signing in...</div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div ref={googleBtnRef}></div>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <a
              href="https://team-leader-gamma.vercel.app/"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: '#4a7060', textDecoration: 'none',
                padding: '8px 16px', borderRadius: 8, border: '1px solid #c8ddd3',
                background: '#f0f7f3', fontWeight: 600
              }}
            >
              ← Back to Main TL Dashboard
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
