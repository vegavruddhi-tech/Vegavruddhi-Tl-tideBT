import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

const WORKING_UPDATE_OPTIONS = [
  'Working', 'Half Day', 'Leave', 'Week Off'
];

function FormCard({ icon, title, sub, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '20px 18px', marginBottom: 16,
      border: '1.5px solid #e8f3ed', boxShadow: '0 2px 8px rgba(26,71,49,0.06)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#4338ca', margin: 0 }}>{title}</h3>
          <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{sub}</p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#1a2e22', display: 'block', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#c62828' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export default function RewardPassForm() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [emp, setEmp] = useState(null);

  const [dateOfWorking, setDateOfWorking] = useState('');
  const [workingUpdate, setWorkingUpdate] = useState('');
  const [totalBTAmount, setTotalBTAmount] = useState('');
  const [totalRPCount, setTotalRPCount] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetch(`${PROFILE_API_BASE}/api/tl/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json()).then(setEmp).catch(console.error);
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!dateOfWorking) { setError('Please select Date of Working.'); return; }
    if (!workingUpdate) { setError('Please select Working Update.'); return; }
    if (!totalBTAmount) { setError('Please enter Total BT Amount.'); return; }
    if (!totalRPCount) { setError('Please enter Total RP Count.'); return; }

    const payload = { dateOfWorking, workingUpdate, totalBTAmount: parseFloat(totalBTAmount), totalRPCount: parseInt(totalRPCount) };

    setLoading(true);
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/tidebt-reward-pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Submission failed'); return; }
      setSuccess('✓ Reward Pass form submitted successfully! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch { setError('Server error. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleClear = () => {
    setDateOfWorking(''); setWorkingUpdate(''); setTotalBTAmount(''); setTotalRPCount('');
    setError(''); setSuccess('');
  };

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none' };
  const selectStyle = { ...inputStyle, color: '#1a4731', cursor: 'pointer' };

  return (
    <>
      <Navbar tl={emp} />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#4338ca', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#4338ca' }}>🏅 Reward Pass & Bank Transfer</div>
        </div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Daily reward pass and bank transfer details</p>

        {error && <div style={{ background: '#fdecea', color: '#c62828', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ background: '#e6f4ea', color: '#2e7d32', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <FormCard icon="📅" title="Date of Working" sub="Select the working date">
            <FormField label="Date of Working" required>
              <input type="date" value={dateOfWorking} onChange={e => setDateOfWorking(e.target.value)} style={inputStyle} />
            </FormField>
          </FormCard>

          <FormCard icon="📋" title="Working Update" sub="Select your working status">
            <FormField label="Working Update" required>
              <select value={workingUpdate} onChange={e => setWorkingUpdate(e.target.value)} style={selectStyle}>
                <option value="">Choose</option>
                {WORKING_UPDATE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </FormField>
          </FormCard>

          <FormCard icon="💰" title="Total BT Amount" sub="Enter total BT amount for the day">
            <FormField label="Total BT Amount" required>
              <input type="number" value={totalBTAmount} onChange={e => setTotalBTAmount(e.target.value)} placeholder="Your answer" style={inputStyle} />
            </FormField>
          </FormCard>

          <FormCard icon="🏅" title="Total RP Count" sub="Enter total reward pass count">
            <FormField label="Total RP Count" required>
              <input type="number" value={totalRPCount} onChange={e => setTotalRPCount(e.target.value)} placeholder="Your answer" style={inputStyle} />
            </FormField>
          </FormCard>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button type="submit" disabled={loading}
              style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: '#4338ca', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Submitting...' : 'Submit'}
            </button>
            <button type="button" onClick={handleClear}
              style={{ padding: '10px 16px', border: 'none', background: 'transparent', color: '#4338ca', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Clear form
            </button>
          </div>
        </form>
      </div>
      <Footer />
    </>
  );
}
