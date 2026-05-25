import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Use existing backend (port 4000) for profile and Tide BT access data
const PROFILE_API_BASE = 'http://localhost:4000';

export default function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [tl, setTl] = useState(null);
  const [fseList, setFseList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load TL profile from existing backend
  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    
    fetch(`${PROFILE_API_BASE}/api/tl/profile`, { 
      headers: { Authorization: 'Bearer ' + token } 
    })
      .then(r => { 
        if (r.status === 401) { 
          localStorage.clear(); 
          navigate('/'); 
        } 
        return r.json(); 
      })
      .then(setTl)
      .catch(console.error);
  }, [token, navigate]);

  // Load FSEs under this TL from TideBT_Access collection
  useEffect(() => {
    if (!token || !tl) return;
    
    setLoading(true);
    fetch(`${PROFILE_API_BASE}/api/tl/tidebt-fses`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(r => r.json())
      .then(data => {
        setFseList(Array.isArray(data.fses) ? data.fses : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load FSEs:', err);
        setFseList([]);
        setLoading(false);
      });
  }, [token, tl]);

  const initials = tl?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <>
      <Navbar tl={tl} />
      <div className="main-content">
        
        {/* Welcome card - with Tide BT label */}
        <div className="welcome-card" style={{ flexDirection: 'row', alignItems: 'center', padding: '16px 20px', position: 'relative' }}>
          <div className="welcome-avatar" style={{ width: 44, height: 44, fontSize: 16, flexShrink: 0 }}>
            {tl?.image ? <img src={tl.image} alt="avatar" /> : initials}
          </div>
          <div className="welcome-text" style={{ textAlign: 'left', marginLeft: 12 }}>
            <h2 style={{ fontSize: 16, marginBottom: 2 }}>Welcome, {tl?.name?.split(' ')[0] || ''}!</h2>
            <p style={{ fontSize: 12, opacity: 0.85 }}>Team Lead · {tl?.location}</p>
          </div>
          <div style={{ position: 'absolute', top: 16, right: 20, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 14px', color: '#fff', textAlign: 'center', border: '1px solid rgba(255,255,255,0.25)' }}>
            <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tide BT</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Dashboard</div>
          </div>
        </div>

        {/* Quick Overview */}
        <div className="section-title">Quick Overview</div>
        <div className="info-grid" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
          {[
            { icon: '💼', label: 'Position',         value: 'Team Lead' },
            { icon: '📍', label: 'Location',          value: tl?.location },
            { icon: '👤', label: 'Reporting Manager', value: tl?.reportingManager },
            { icon: '●',  label: 'Status',            value: tl?.status || 'Active' },
          ].map(c => (
            <div className="info-card" key={c.label} style={{ padding: '4px 8px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div className="label" style={{ fontSize: 7, marginBottom: 0 }}>{c.label}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value || '–'}</div>
            </div>
          ))}
        </div>

        {/* FSE Team Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>My Tide BT Team</div>
          {!loading && fseList.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {fseList.length} FSE{fseList.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'linear-gradient(135deg, #f8fdf9 0%, #f0f9f3 100%)', borderRadius: 16, border: '2px dashed #d0e8d8' }}>
            <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }}>⏳</div>
            <p style={{ fontSize: 14, color: '#1a4731', fontWeight: 600, margin: 0 }}>Loading your Tide BT team...</p>
          </div>
        ) : fseList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'linear-gradient(135deg, #f8fdf9 0%, #f0f9f3 100%)', borderRadius: 16, border: '2px dashed #d0e8d8' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>👥</div>
            <h3 style={{ fontSize: 18, color: '#1a4731', marginBottom: 8, fontWeight: 700 }}>No FSEs Assigned Yet</h3>
            <p style={{ fontSize: 13, color: '#666', margin: 0, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
              Your Tide BT team will appear here once FSEs are assigned to you. Contact admin for assistance.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {fseList.map((fse, idx) => {
              const initials = fse.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const colors = [
                'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)',
                'linear-gradient(135deg, #0f5132 0%, #198754 100%)',
                'linear-gradient(135deg, #1e3a2f 0%, #2d5a47 100%)',
                'linear-gradient(135deg, #164430 0%, #2a6f4a 100%)',
              ];
              const bgColor = colors[idx % colors.length];
              
              return (
                <div 
                  key={idx} 
                  className="info-card" 
                  style={{ 
                    padding: '18px 20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 14,
                    background: '#fff',
                    border: '1px solid #e8f3ed',
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(26, 71, 49, 0.08)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(26, 71, 49, 0.15)';
                    e.currentTarget.style.borderColor = '#2d7a4f';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(26, 71, 49, 0.08)';
                    e.currentTarget.style.borderColor = '#e8f3ed';
                  }}
                >
                  {/* Decorative corner accent */}
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: bgColor, opacity: 0.05, borderRadius: '0 12px 0 100%' }}></div>
                  
                  {/* Avatar */}
                  <div style={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: '50%', 
                    background: bgColor,
                    color: '#fff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: 16, 
                    fontWeight: 700, 
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(26, 71, 49, 0.2)',
                    border: '3px solid #fff'
                  }}>
                    {initials}
                  </div>
                  
                  {/* FSE Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: 15, 
                      fontWeight: 700, 
                      color: '#1a4731', 
                      marginBottom: 4, 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      letterSpacing: '-0.2px'
                    }}>
                      {fse}
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      color: '#666', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.8px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span style={{ 
                        width: 6, 
                        height: 6, 
                        borderRadius: '50%', 
                        background: '#2d7a4f',
                        display: 'inline-block'
                      }}></span>
                      Field Sales Executive
                    </div>
                  </div>
                  
                  {/* Badge number */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f0f9f3 0%, #e8f3ed 100%)',
                    color: '#1a4731',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    minWidth: 32,
                    textAlign: 'center'
                  }}>
                    #{idx + 1}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Coming Soon Message */}
        <div style={{ marginTop: 40, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <h2 style={{ fontSize: 24, color: '#1a4731', marginBottom: 12 }}>Tide BT TL Dashboard Coming Soon!</h2>
          <p style={{ fontSize: 14, color: '#666', maxWidth: 500, margin: '0 auto' }}>
            We're building amazing features for Tide BT Team Leads. Stay tuned for team management, form tracking, and more!
          </p>
        </div>

      </div>
      <Footer />
    </>
  );
}
