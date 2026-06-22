import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

const REASON_OPTIONS = [
  'Tide Error/Bass Error',
  'Monthly/Daily Limit',
  'Issue in customer Bank - Other Bank Option is not available',
  'Amount Stuck in process & back to customer wallet',
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

export default function MobikwikWithdrawForm() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [emp, setEmp] = useState(null);

  // Form state
  const [merchantName, setMerchantName] = useState('');
  const [merchantNumber, setMerchantNumber] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawFees, setWithdrawFees] = useState('');
  const [reasonOfWithdraw, setReasonOfWithdraw] = useState('');
  const [otherReason, setOtherReason] = useState('');

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

    if (!merchantName) { setError('Please enter Merchant Name.'); return; }
    if (!merchantNumber) { setError('Please enter Merchant Number.'); return; }
    if (!/^\d{10}$/.test(merchantNumber)) {
      setError('Merchant Number must be exactly 10 digits.');
      return;
    }
    if (!transactionDate) { setError('Please select Transaction Date.'); return; }
    if (!withdrawAmount) { setError('Please enter Withdraw Amount.'); return; }
    if (!reasonOfWithdraw) { setError('Please select Reason of Withdraw.'); return; }
    if (reasonOfWithdraw === 'Other' && !otherReason) { setError('Please enter the reason.'); return; }

    const payload = {
      merchantName,
      merchantNumber,
      transactionDate,
      withdrawAmount: parseFloat(withdrawAmount),
      withdrawFees: parseFloat(withdrawFees),
      reasonOfWithdraw: reasonOfWithdraw === 'Other' ? otherReason : reasonOfWithdraw,
    };

    setLoading(true);
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/tidebt-mobikwik-withdraw`, {
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
    setMerchantName(''); setMerchantNumber(''); setTransactionDate('');
    setWithdrawAmount(''); setWithdrawFees(''); setReasonOfWithdraw(''); setOtherReason('');
    setError(''); setSuccess('');
  };

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none' };

  return (
    <>
      <Navbar emp={emp} />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--green-dark)', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-dark)' }}>💸 Mobikwik/Payzapp Withdraw</div>
        </div>

        {error && <div style={{ background: '#fdecea', color: '#c62828', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ background: '#e6f4ea', color: '#2e7d32', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{success}</div>}

        <form onSubmit={handleSubmit}>

          <FormCard icon="👤" title="Merchant Info" sub="Enter merchant details">
            <FormField label="Merchant Name" required>
              <input type="text" value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="Your answer" style={inputStyle} />
            </FormField>

            <FormField label="Merchant Number" required>
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
          </FormCard>

          <FormCard icon="📅" title="Transaction Details" sub="Enter transaction information">
            <FormField label="Transaction Date" required>
              <input type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} style={inputStyle} />
            </FormField>

            <FormField label="Withdraw Amount" required>
              <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Your answer" style={inputStyle} />
            </FormField>
          </FormCard>

          <FormCard icon="❓" title="Reason" sub="Why was the withdraw needed?">
            <FormField label="Reason of Withdraw" required>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {REASON_OPTIONS.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1.5px solid ${reasonOfWithdraw === opt ? 'var(--green-dark)' : '#dde8dd'}`, borderRadius: 10, cursor: 'pointer', background: reasonOfWithdraw === opt ? 'var(--green-pale)' : '#fafcfa', transition: 'all 0.2s' }}>
                    <input type="radio" name="reason" value={opt} checked={reasonOfWithdraw === opt} onChange={() => setReasonOfWithdraw(opt)}
                      style={{ accentColor: 'var(--green-dark)', width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-dark)' }}>{opt}</span>
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1.5px solid ${reasonOfWithdraw === 'Other' ? 'var(--green-dark)' : '#dde8dd'}`, borderRadius: 10, cursor: 'pointer', background: reasonOfWithdraw === 'Other' ? 'var(--green-pale)' : '#fafcfa', transition: 'all 0.2s' }}>
                  <input type="radio" name="reason" value="Other" checked={reasonOfWithdraw === 'Other'} onChange={() => setReasonOfWithdraw('Other')}
                    style={{ accentColor: 'var(--green-dark)', width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-dark)' }}>Other:</span>
                  {reasonOfWithdraw === 'Other' && (
                    <input type="text" value={otherReason} onChange={e => setOtherReason(e.target.value)} placeholder="Your answer"
                      style={{ flex: 1, padding: '6px 10px', border: 'none', borderBottom: '1.5px solid #dde8dd', fontSize: 13, background: 'transparent', outline: 'none' }} />
                  )}
                </label>
              </div>
            </FormField>
          </FormCard>

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
