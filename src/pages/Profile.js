import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Use port 4000 for profile API (existing Tide backend)
const PROFILE_API_BASE = 'http://localhost:4000';

export default function Profile() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [tl, setTl] = useState(null);

  const loadProfile = () => {
    fetch(`${PROFILE_API_BASE}/api/tl/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (r.status === 401) { localStorage.clear(); navigate('/'); } return r.json(); })
      .then(setTl).catch(console.error);
  };
  
  useEffect(loadProfile, [token]); // eslint-disable-line

  const initials = tl?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const joined   = tl?.createdAt ? new Date(tl.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '–';

  return (
    <>
      <Navbar tl={tl} />
      <div className="profile-page">
        {/* Hero */}
        <div className="profile-hero">
          <div className="hero-avatar">
            {tl?.image ? (
              <img
                src={tl.image}
                alt="avatar"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "50%",
                }}
              />
            ) : (
              initials
            )}
          </div>
          <div className="hero-info">
            <h1 id="heroName">{tl?.name || "–"}</h1>
            <div className="hero-role">
              IT &amp; Business Consultation Services
            </div>
            <div className="hero-badges">
              <span className="hero-badge">Team Lead</span>
              <span className="hero-badge">{tl?.location || "–"}</span>
              <span className="hero-badge active">
                {tl?.status || "Active"}
              </span>
            </div>
          </div>
          <a
            href="/dashboard"
            className="hero-back"
            onClick={(e) => {
              e.preventDefault();
              navigate("/dashboard");
            }}
          >
            ← Dashboard
          </a>
        </div>

        {/* Personal Info */}
        <div className="profile-section">
          <div className="section-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="sec-icon">👤</div>
              <h3>Personal Information</h3>
            </div>
          </div>
          <div className="field-grid">
            {[
              ["Full Name", tl?.name],
              ["Phone Number", tl?.phone],
              ["Email", tl?.email],
            ].map(([lbl, val]) => (
              <div className="field-item" key={lbl}>
                <div className="f-label">{lbl}</div>
                <div className="f-value">{val || "–"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Work Info */}
        <div className="profile-section">
          <div className="section-header">
            <div className="sec-icon">💼</div>
            <h3>Work Information</h3>
          </div>
          <div className="field-grid">
            <div className="field-item">
              <div className="f-label">Position</div>
              <div className="f-value">Team Lead</div>
            </div>
            <div className="field-item">
              <div className="f-label">Location</div>
              <div className="f-value">{tl?.location || "–"}</div>
            </div>
            <div className="field-item">
              <div className="f-label">Reporting Manager</div>
              <div className="f-value">{tl?.reportingManager || "–"}</div>
            </div>
            <div className="field-item">
              <div className="f-label">Joined On</div>
              <div className="f-value">{joined}</div>
            </div>
            <div className="field-item">
              <div className="f-label">Employment Status</div>
              <div className="f-value">
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 12px",
                    borderRadius: 20,
                    background: "var(--green-pale)",
                    color: "var(--green-dark)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {tl?.status || "–"}
                </span>
              </div>
            </div>
            {tl?.employeeId && (
              <div className="field-item">
                <div className="f-label">Employee ID</div>
                <div className="f-value">{tl.employeeId}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
