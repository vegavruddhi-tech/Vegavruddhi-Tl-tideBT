import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

const MERCHANT_CATEGORY_OPTIONS = [
  'Bike Rider', 'Small Merchant', 'Hawker', 'Free Lancer', 'Teacher', 'Skill Employer', 'Others'
];

const MERCHANT_OPINION_OPTIONS = [
  'Ready For Onboarding', 'Not interested'
];

const ONBOARDING_STATUS_OPTIONS = [
  'Completed', 'Pending/Hold'
];

function FormCard({ icon, title, sub, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '20px 18px', marginBottom: 16,
      border: '1.5px solid #e8f3ed', boxShadow: '0 2px 8px rgba(26,71,49,0.06)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-dark)', margin: 0 }}>{title}</h3>
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
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#c62828' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export default function DailyVisitForm() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [emp, setEmp] = useState(null);

  // Form state
  const [merchantName, setMerchantName] = useState('');
  const [merchantNumber, setMerchantNumber] = useState('');
  const [merchantOpinion, setMerchantOpinion] = useState('');
  const [merchantCategory, setMerchantCategory] = useState('');
  const [onboardingStatus, setOnboardingStatus] = useState('');
  const [merchantEmailId, setMerchantEmailId] = useState('');
                                                                                                                                                                                    
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetch(`${PROFILE_API_BASE}/api/tl/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json()).then(setEmp).catch(console.error);
  }, [token, navigate]);

  const isOnboarding = merchantOpinion === 'Ready For Onboarding';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!merchantName) { setError('Please enter Merchant Name.'); return; }
    if (!merchantNumber) { setError('Please enter Merchant Mobile Number.'); return; }
    if (!/^\d{10}$/.test(merchantNumber)) {
      setError('Merchant Mobile Number must be exactly 10 digits.');
      return;
    }
    if (!merchantOpinion) { setError('Please select Merchant Opinion.'); return; }
    if (isOnboarding && !onboardingStatus) { setError('Please select Onboarding Status.'); return; }
    if (isOnboarding && !merchantEmailId) { setError('Please enter Merchant Email ID.'); return; }

    const payload = {
      merchantName,
      merchantNumber,
      merchantOpinion,
      merchantCategory,
      ...(isOnboarding && { onboardingStatus, merchantEmailId }),
    };

    setLoading(true);
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/tidebt-daily-visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Submission failed'); return; }
      setSuccess('✓ Form submitted successfully! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch { setError('Server error. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleClear = () => {
    setMerchantName(''); setMerchantNumber(''); setMerchantOpinion('');
    setMerchantCategory(''); setOnboardingStatus(''); setMerchantEmailId('');
    setError(''); setSuccess('');
  };

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none' };
  const selectStyle = { ...inputStyle, color: '#888', cursor: 'pointer' };

  return (
    <>
      <Navbar emp={emp} />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--green-dark)', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-dark)' }}>📋 Tide BT Onboarding</div>
        </div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Tide BT daily onboarding data</p>

        {error && <div style={{ background: '#fdecea', color: '#c62828', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ background: '#e6f4ea', color: '#2e7d32', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{success}</div>}

        <form onSubmit={handleSubmit}>

          {/* Merchant Details */}
          <FormCard icon="👤" title="Merchant Details" sub="Basic merchant information">
            <FormField label="Merchant Name" required>
              <input type="text" value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="Your answer" style={inputStyle} />
            </FormField>

            <FormField label="Merchant Mobile Number" required>
              <input 
                type="tel" 
                value={merchantNumber} 
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 10) {
                    setMerchantNumber(val);
                  }
                }} 
                placeholder="Your answer" 
                style={inputStyle} 
              />
            </FormField>

            <FormField label="Merchant Opinion" required>
              <select value={merchantOpinion} onChange={e => setMerchantOpinion(e.target.value)} style={{ ...selectStyle, color: merchantOpinion ? '#1a4731' : '#888' }}>
                <option value="">Choose</option>
                {MERCHANT_OPINION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </FormField>
          </FormCard>

          {/* Onboarding Details - only shown when Ready For Onboarding */}
          {isOnboarding && (
            <FormCard icon="✅" title="Onboarding Details" sub="Complete onboarding information">
              <FormField label="Onboarding Status" required>
                <select value={onboardingStatus} onChange={e => setOnboardingStatus(e.target.value)} style={{ ...selectStyle, color: onboardingStatus ? '#1a4731' : '#888' }}>
                  <option value="">Choose</option>
                  {ONBOARDING_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </FormField>

              <FormField label="Merchant Email ID" required>
                <input type="email" value={merchantEmailId} onChange={e => setMerchantEmailId(e.target.value)} placeholder="Your answer" style={inputStyle} />
              </FormField>
            </FormCard>
          )}

          {/* Submit buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button type="submit" disabled={loading}
              style={{ padding: '12px 28px', border: 'none', borderRadius: 8, background: 'var(--green-dark)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Submitting...' : '✓ Submit'}
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
