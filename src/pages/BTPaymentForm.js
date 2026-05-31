import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PROFILE_API_BASE = 'http://localhost:4000';

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

export default function BTPaymentForm() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [tl, setTl] = useState(null);
  const [fseList, setFseList] = useState([]);

  // Form state
  const [step, setStep] = useState(1);
  const [transferToWhom, setTransferToWhom] = useState('');
  const [senderName, setSenderName] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDoneOn, setPaymentDoneOn] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetch(`${PROFILE_API_BASE}/api/tl/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json()).then(setTl).catch(console.error);
  }, [token, navigate]);

  // Load FSE list for Transfer to dropdown
  useEffect(() => {
    if (!token || !tl) return;
    fetch(`${PROFILE_API_BASE}/api/tl/tidebt-fses`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(data => setFseList(Array.isArray(data.fses) ? data.fses : []))
      .catch(() => setFseList([]));
  }, [token, tl]);

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!transferToWhom) { setError('Please select Transfer to Whom.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (!senderName) { setError('Please select Sender Name.'); return; }
      if (!transferTo) { setError('Please select Transfer to.'); return; }
      if (!amount) { setError('Please enter Amount.'); return; }
      setStep(3);
    }
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!paymentDoneOn) { setError('Please select Payment done on.'); return; }

    const payload = {
      transferToWhom,
      senderName,
      transferTo,
      amount: parseFloat(amount),
      paymentDoneOn,
    };

    setLoading(true);
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/bt-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Submission failed'); return; }
      setSuccess('✓ BT Payment submitted successfully! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch { setError('Server error. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleClear = () => {
    setTransferToWhom(''); setSenderName(''); setTransferTo('');
    setAmount(''); setPaymentDoneOn(''); setStep(1); setError(''); setSuccess('');
  };

  return (
    <>
      <Navbar tl={tl} />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--green-dark)', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-dark)' }}>💰 BT Payment Tracker</div>
        </div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>For daily money tracking</p>

        {error && <div style={{ background: '#fdecea', color: '#c62828', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ background: '#e6f4ea', color: '#2e7d32', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{success}</div>}

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: step >= s ? 'var(--green-dark)' : '#e0e0e0', transition: 'all 0.3s' }} />
          ))}
        </div>

        <form onSubmit={handleSubmit}>

          {/* Step 1 — Transfer to Whom */}
          {step === 1 && (
            <FormCard icon="🔄" title="Transfer to Whom" sub="Select the transfer category">
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: 6 }}>
                  Transfer to Whom <span style={{ color: '#c62828' }}>*</span>
                </label>
                <select value={transferToWhom} onChange={e => setTransferToWhom(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none', color: transferToWhom ? '#1a4731' : '#888', cursor: 'pointer' }}>
                  <option value="">Choose</option>
                  <option value="TL's & Managers">TL's & Managers</option>
                  <option value="FSE Ground Team">FSE Ground Team</option>
                </select>
              </div>
            </FormCard>
          )}

          {/* Step 2 — TL's & Manager / FSC Ground Team details */}
          {step === 2 && (
            <FormCard icon="👤" title={transferToWhom} sub={transferToWhom === "TL's & Managers" ? "Kindly mention TL/Manager name properly" : "Select FSE details"}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: 6 }}>
                  Sender Name <span style={{ color: '#c62828' }}>*</span>
                </label>
                <select value={senderName} onChange={e => setSenderName(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none', color: senderName ? '#1a4731' : '#888', cursor: 'pointer' }}>
                  <option value="">Choose</option>
                  {/* TODO: Replace with actual TL/Manager names from backend */}
                  <option value={tl?.name || ''}>{tl?.name || 'Current TL'}</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: 6 }}>
                  Transfer to <span style={{ color: '#c62828' }}>*</span>
                </label>
                <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none', color: transferTo ? '#1a4731' : '#888', cursor: 'pointer' }}>
                  <option value="">Choose</option>
                  {fseList.map((fse, i) => <option key={i} value={fse}>{fse}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: 6 }}>
                  Amount <span style={{ color: '#c62828' }}>*</span>
                </label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Your answer"
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none' }} />
              </div>
            </FormCard>
          )}

          {/* Step 3 — Payment Through */}
          {step === 3 && (
            <FormCard icon="💳" title="Payment Through" sub="Select payment method">
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: 6 }}>
                  Payment done on <span style={{ color: '#c62828' }}>*</span>
                </label>
                <select value={paymentDoneOn} onChange={e => setPaymentDoneOn(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #dde8dd', borderRadius: 10, fontSize: 14, background: '#fafcfa', outline: 'none', color: paymentDoneOn ? '#1a4731' : '#888', cursor: 'pointer' }}>
                  <option value="">Choose</option>
                  {transferToWhom === "TL's & Managers" ? (
                    <>
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                    </>
                  ) : (
                    <>
                      <option value="QR">QR</option>
                      <option value="Bank Account">Bank Account</option>
                      <option value="UPI">UPI</option>
                    </>
                  )}
                </select>
              </div>
            </FormCard>
          )}

          {/* Navigation buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {step > 1 && (
                <button type="button" onClick={handleBack}
                  style={{ padding: '10px 20px', border: '1.5px solid #dde8dd', borderRadius: 8, background: '#fff', color: 'var(--green-dark)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  Back
                </button>
              )}
              {step < 3 && (
                <button type="button" onClick={handleNext}
                  style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: 'var(--green-dark)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  Next
                </button>
              )}
              {step === 3 && (
                <button type="submit" disabled={loading}
                  style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: '#4338ca', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
              )}
            </div>
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
