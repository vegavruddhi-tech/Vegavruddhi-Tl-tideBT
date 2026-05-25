import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if token is passed in URL (from Tide TL redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenFromURL = params.get('token');
    
    if (tokenFromURL) {
      // Save token and redirect to dashboard
      localStorage.setItem('token', tokenFromURL);
      navigate('/dashboard');
      return;
    }
    
    // Check if already logged in
    if (localStorage.getItem('token')) {
      navigate('/dashboard');
    }
  }, [navigate]);

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img src="https://res.cloudinary.com/dhhcykoqa/image/upload/v1775158486/logo-full_ueklky.png" alt="Vegavruddhi" style={{ height: 64, width: 64, objectFit: 'contain' }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a4731', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Vegavruddhi</div>
          <div style={{ fontSize: 11, color: '#6b9e82', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>TL Tide BT Dashboard</div>
        </div>

        <hr style={{ border: 'none', borderTop: '1.5px solid #e8f0eb', marginBottom: 32 }} />

        <div style={{ fontSize: 24, fontWeight: 800, color: '#1a2e22', marginBottom: 8 }}>Redirecting... 🔄</div>
        <p style={{ fontSize: 14, color: '#6b9e82', marginBottom: 36, lineHeight: 1.5 }}>
          Please access this dashboard from the TL Tide portal.
        </p>
      </div>
    </div>
  );
}
