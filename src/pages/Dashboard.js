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
  const [teamForms, setTeamForms] = useState([]);
  const [expandedTeamForm, setExpandedTeamForm] = useState(null);
  const [showTeamList, setShowTeamList] = useState(false);
  const [receivedPayments, setReceivedPayments] = useState([]);

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

  // Fetch team Tide BT forms
  useEffect(() => {
    if (!token || !tl) return;
    fetch(`${PROFILE_API_BASE}/api/tl/tidebt-team-forms`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(r => r.json())
      .then(data => setTeamForms(Array.isArray(data) ? data : []))
      .catch(() => setTeamForms([]));
  }, [token, tl]);

  // Fetch received payments
  useEffect(() => {
    if (!token || !tl) return;
    fetch(`${PROFILE_API_BASE}/api/tl/tidebt-received-payments`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(r => r.json())
      .then(data => setReceivedPayments(data.payments || []))
      .catch(() => setReceivedPayments([]));
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

        {/* BT Payment Tracker button */}
        <Link to="/bt-payment" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,71,49,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>💰</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>BT Payment Tracker</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Fill daily money tracking form</div>
            </div>
          </div>
        </Link>

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

        {/* TL Dashboard KPIs */}
        <div className="section-title" style={{ marginTop: 20, marginBottom: 10 }}>TL Dashboard</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Team BT', value: '–', icon: '📊', color: '#1a4731', bg: '#e6f4ea' },
            { label: 'Team RP', value: '–', icon: '🏅', color: '#0369a1', bg: '#e0f2fe' },
            { label: 'Team Tide BT Target', value: '–', icon: '🎯', color: '#b45309', bg: '#fef3c7' },
            { label: 'Team Reward Pass Target', value: '–', icon: '🎁', color: '#4338ca', bg: '#ede9fe' },
            { label: 'Team Achievement', value: '–', icon: '🏆', color: '#15803d', bg: '#dcfce7' },
            { label: 'Remaining Target Tide BT', value: '–', icon: '⏳', color: '#c2410c', bg: '#ffedd5' },
            { label: 'Remaining Target Reward Pass', value: '–', icon: '⌛', color: '#6b21a8', bg: '#f3e8ff' },
            { label: 'Daily Growth', value: '–', icon: '📈', color: '#0f766e', bg: '#ccfbf1' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#fff', borderRadius: 12, padding: '16px 14px',
              border: '1.5px solid #e8f3ed', boxShadow: '0 2px 8px rgba(26,71,49,0.06)',
              display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{stat.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* My Team KPI - clickable to expand FSE list */}
        <div style={{ marginTop: 20, marginBottom: 12 }}>
          <div onClick={() => setShowTeamList(!showTeamList)} style={{
            background: '#fff', borderRadius: 12, padding: '16px 20px',
            border: `1.5px solid ${showTeamList ? '#2d7a4f' : '#e8f3ed'}`,
            boxShadow: '0 2px 8px rgba(26,71,49,0.06)',
            cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e6f4ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👥</div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>My Team</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1a4731' }}>{fseList.length} FSEs</div>
              </div>
            </div>
            <div style={{ fontSize: 18, color: '#888', transition: 'transform 0.2s', transform: showTeamList ? 'rotate(180deg)' : 'rotate(0)' }}>▼</div>
          </div>

          {showTeamList && fseList.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fseList.map((fse, idx) => {
                const fseInitials = fse.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <div key={idx} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #e8f3ed', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {fseInitials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a4731' }}>{fse}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>Field Sales Executive</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1a4731', background: '#e6f4ea', padding: '4px 10px', borderRadius: 8 }}>FSE</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Received Funds */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>💰 Received Funds</div>
          <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
            {receivedPayments.length} Payments
          </div>
        </div>

        {receivedPayments.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e8f3ed', padding: '24px 20px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No payments received yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {receivedPayments.map((p, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a4731' }}>₹{p.amount?.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    From: <strong>{p.senderName}</strong> · {p.paymentDoneOn} · {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}
                  </div>
                </div>
                <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: '#e6f4ea', color: '#2e7d32' }}>
                  Received
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Team Tide BT Forms */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>Team Tide BT Forms</div>
          <div style={{ background: '#e6f4ea', color: '#1a4731', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
            {teamForms.length} Forms
          </div>
        </div>

        {teamForms.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e8f3ed', overflow: 'hidden' }}>
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <p style={{ fontSize: 14, color: '#666', margin: 0 }}>No Tide BT forms submitted by your team yet.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teamForms.map((form, i) => {
              const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
              const isOnboarding = form.merchantOpinion === 'Ready For Onboarding';
              const isExpanded = expandedTeamForm === (form._id || i);
              return (
                <div key={form._id || i} style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${isExpanded ? '#2d7a4f' : '#e8f3ed'}`, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setExpandedTeamForm(isExpanded ? null : (form._id || i))}>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: isOnboarding ? '#e6f4ea' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: isOnboarding ? '#2e7d32' : '#c62828', flexShrink: 0 }}>
                      {form.merchantName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a4731' }}>{form.merchantName}</div>
                      <div style={{ fontSize: 11, color: '#888', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        <span>👤 {form.employeeName}</span>
                        <span>📞 {form.merchantNumber}</span>
                        <span>📅 {date}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: isOnboarding ? '#e6f4ea' : '#fdecea', color: isOnboarding ? '#2e7d32' : '#c62828' }}>
                        {form.merchantOpinion || form.formType}
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '0 16px 14px', borderTop: '1px solid #e8f3ed', paddingTop: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>FSE Name</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.employeeName || '–'}</div></div>
                        <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Merchant Opinion</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.merchantOpinion || '–'}</div></div>
                        <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Category</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.merchantCategory || '–'}</div></div>
                        {form.onboardingStatus && <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Onboarding Status</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.onboardingStatus}</div></div>}
                        {form.merchantEmailId && <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Merchant Email</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.merchantEmailId}</div></div>}
                        {form.formType === 'mobikwik-withdraw' && <>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Withdraw Amount</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>₹{form.withdrawAmount || '–'}</div></div>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Withdraw Fees</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>₹{form.withdrawFees || '–'}</div></div>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Reason</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.reasonOfWithdraw || '–'}</div></div>
                        </>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* End of content */}

      </div>
      <Footer />
    </>
  );
}
