import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ tl, teamBT, teamRP, yesterdaysBT }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const logout = (e) => {
    e.preventDefault();
    localStorage.clear();
    navigate('/');
  };

  const initials = tl?.name
    ? tl.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  // Stats chips to show alongside TL name
  const chips = [
    teamBT    != null && { label: `BT ₹${Number(teamBT).toLocaleString()}`,        color: '#1a5c38', bg: '#e6f4ea' },
    teamRP    != null && { label: `RP ${teamRP}`,                                   color: '#7c3aed', bg: '#ede9fe' },
    yesterdaysBT != null && { label: `Yest BT ₹${Number(yesterdaysBT).toLocaleString()}`, color: '#0369a1', bg: '#e0f2fe' },
  ].filter(Boolean);

  return (
    <nav className="navbar">
      <div className="nav-logo">
        <a href="/dashboard" onClick={e => { e.preventDefault(); navigate('/dashboard'); }}>
          <img src="/logo-full.png" alt="Vegavruddhi Pvt. Ltd." />
        </a>
        <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Tide BT
        </span>
      </div>

      {/* Stats chips — team BT, RP, Yesterday BT */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden', marginLeft: 8 }}>
          {chips.map((chip, i) => (
            <span key={i} style={{
              background: chip.bg, color: chip.color,
              padding: '3px 8px', borderRadius: 20,
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              letterSpacing: '0.2px'
            }}>
              {chip.label}
            </span>
          ))}
        </div>
      )}

      <div className="nav-right">
        <div className="nav-profile" ref={ref} onClick={(e) => { if (e.target.closest('a')) return; setOpen(p => !p); }}>
          <div className="nav-avatar">
            {tl?.image ? <img src={tl.image} alt="avatar" /> : initials}
          </div>
          <div className="nav-info">
            <div className="name">{tl?.name || 'Loading...'}</div>
            <div className="status-badge">
              {tl?.employeeId ? `${tl.employeeId} • Team Lead` : 'Team Lead'}
            </div>
          </div>
          <span className="nav-chevron">▾</span>
          <div className={`dropdown-menu${open ? ' open' : ''}`}>
            <div className="dropdown-header">
              <div className="dh-name">{tl?.name || '–'}</div>
              <div className="dh-email">{tl?.email || '–'}</div>
              {tl?.employeeId && (
                <div style={{ fontSize: 11, color: '#1a4731', fontWeight: 700, marginTop: 4 }}>
                  ID: {tl.employeeId}
                </div>
              )}
            </div>
            <a href="/dashboard" onClick={e => { e.preventDefault(); navigate('/dashboard'); }}>🏠&nbsp; Dashboard</a>
            <a href="/profile"   onClick={e => { e.preventDefault(); navigate('/profile'); }}>👤&nbsp; My Profile</a>
            <a href="https://team-leader-gamma.vercel.app/" target="_self" style={{ color: '#1565c0' }}>🔗&nbsp; Main Dashboard</a>
            <a href="#logout" className="logout" onClick={logout}>🚪&nbsp; Logout</a>
          </div>
        </div>
      </div>
    </nav>
  );
}
