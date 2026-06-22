import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAGE_SIZE = 15;

const fmt = d => {
  if (!d) return '–';
  const dt = new Date(d);
  return isNaN(dt) ? '–' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtExcelDate = (val) => {
  if (!val || val === '–' || val === '-' || val === '0' || val === 0) return '–';
  const num = parseFloat(val);
  if (!isNaN(num) && num > 40000 && num < 55000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_COLORS = {
  'Onboarded':  { bg: '#d8f3dc', color: '#1a4731' },
  'BT Active':  { bg: '#e0f2fe', color: '#0369a1' },
  'Pending':    { bg: '#fef3c7', color: '#92400e' },
  'Ready For Onboarding': { bg: '#ede9fe', color: '#6b21a8' },
  'Not Interested': { bg: '#fee2e2', color: '#b91c1c' },
};
const getStatusStyle = s => STATUS_COLORS[s] || { bg: '#f1f5f9', color: '#475569' };

export default function TeamMerchants() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [tl, setTl] = useState(null);
  const [fseData, setFseData] = useState([]);
  const [summary, setSummary] = useState({ totalMerchants: 0, totalBT: 0, totalRP: 0, passLive: 0, pending: 0 });
  const [btMonth, setBtMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('en-US', { month: 'long' }));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [btAmountRange, setBtAmountRange] = useState('');
  const [btOnlyFilter, setBtOnlyFilter] = useState(false);
  const [pendingFilter, setPendingFilter] = useState('');
  const [expandedFSE, setExpandedFSE] = useState(null);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [fsePages, setFsePages] = useState({});

  const BT_AMOUNT_RANGES = [
    { label: 'All Amounts', value: '' },
    { label: '₹0 – ₹10,000', value: '0-10000' },
    { label: '₹10,001 – ₹50,000', value: '10001-50000' },
    { label: '₹50,001 – ₹1,00,000', value: '50001-100000' },
    { label: '₹1,00,001 – ₹1,50,000', value: '100001-150000' },
    { label: '₹1,50,001 – ₹2,00,000', value: '150001-200000' },
  ];

  // Load TL profile
  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetch(`${API_BASE}/api/tl/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (r.status === 401) { localStorage.clear(); navigate('/'); } return r.json(); })
      .then(setTl).catch(() => {});
  }, [token, navigate]);

  // Load team merchants
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedMonth) params.set('selectedMonth', selectedMonth);
    if (selectedYear)  params.set('selectedYear',  selectedYear);
    fetch(`${API_BASE}/api/tl/tidebt-team-merchants?${params}`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setFseData(d.fseData || []);
          setSummary(d.summary || {});
          if (d.collectionMonth) setBtMonth(d.collectionMonth);
          else setBtMonth(selectedMonth || '');
        }
        setLoading(false);
      })
      .catch(() => { setError('Failed to load team merchants.'); setLoading(false); });
  }, [token, selectedMonth, selectedYear]);

  // Filter merchants inside each FSE
  const filteredFseData = useMemo(() => {
    return fseData.map(fse => {
      const q = search.toLowerCase().trim();
      const merchants = fse.merchants.filter(m => {
        if (q && !(
          (m.merchantName || '').toLowerCase().includes(q) ||
          (m.merchantNumber || '').includes(q) ||
          (m.merchantCategory || '').toLowerCase().includes(q)
        )) return false;
        if (statusFilter && m.onboardingStatus !== statusFilter) return false;
        // BT Amount range
        if (btAmountRange) {
          const [min, max] = btAmountRange.split('-').map(Number);
          if ((m.stage3 || 0) < min || (m.stage3 || 0) > max) return false;
        }
        // BT Done Only
        if (btOnlyFilter && !(m.stage3 > 0)) return false;
        // BT Left
        if (pendingFilter === 'bt-left' && !(m.stage3Gap > 0)) return false;
        // RP Left
        if (pendingFilter === 'rp-left' && (m.rewardPassPro || '').toLowerCase() === 'active') return false;
        return true;
      });
      return { ...fse, merchants };
    }).filter(fse => fse.merchants.length > 0 || (!search && !statusFilter && !btAmountRange && !btOnlyFilter && !pendingFilter));
  }, [fseData, search, statusFilter, btAmountRange, btOnlyFilter, pendingFilter]);

  const allStatuses = useMemo(() => {
    const s = new Set();
    fseData.forEach(fse => fse.merchants.forEach(m => { if (m.onboardingStatus) s.add(m.onboardingStatus); }));
    return [...s].sort();
  }, [fseData]);

  const getPage = useCallback((fseName) => fsePages[fseName] || 1, [fsePages]);
  const setPage = useCallback((fseName, p) => setFsePages(prev => ({ ...prev, [fseName]: p })), []);

  return (
    <>
      <Navbar tl={tl} />
      <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 80 }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a4731 0%, #2d6a4f 100%)', padding: '28px 20px 24px', color: '#fff' }}>
          <button onClick={() => navigate('/dashboard')}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
            ← Dashboard
          </button>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏪 Team Merchants</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
            {tl?.name || ''} — BT data: {btMonth || selectedMonth || 'All'} {selectedYear}
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 960, margin: '0 auto' }}>

          {/* Summary chips */}
          {!loading && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'Total Merchants', value: summary.totalMerchants, bg: '#1a4731', color: '#fff' },
                { label: 'Total BT',        value: `₹${(summary.totalBT || 0).toLocaleString()}`, bg: '#fff3e0', color: '#e65100' },
                { label: 'Total RP',        value: summary.totalRP, bg: '#ede9fe', color: '#7c3aed' },
                { label: 'Pass Live',       value: summary.passLive, bg: '#d8f3dc', color: '#1a4731' },
                { label: 'Pending',         value: summary.pending, bg: '#fef3c7', color: '#92400e' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{c.value}</span><span style={{ fontWeight: 400 }}>{c.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: 'var(--shadow-sm)', marginBottom: 20 }}>
            {/* Month/Year row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BT Data Month:</span>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                style={{ height: 34, borderRadius: 8, border: '2px solid #1a4731', fontSize: 13, padding: '0 10px', background: '#f0fdf4', color: '#1a4731', fontWeight: 700, outline: 'none' }}>
                <option value="">All Months</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                style={{ height: 34, borderRadius: 8, border: '2px solid #1a4731', fontSize: 13, padding: '0 10px', background: '#f0fdf4', color: '#1a4731', fontWeight: 700, outline: 'none' }}>
                {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {btMonth && (
                <span style={{ fontSize: 12, color: '#1a4731', background: '#d8f3dc', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
                  📊 BT data: {btMonth}
                </span>
              )}
            </div>
            {/* Search + Status row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: '1 1 220px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search merchant name, number..."
                  style={{ width: '100%', paddingLeft: 32, paddingRight: 12, height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                style={{ flex: '0 1 160px', height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, padding: '0 10px', background: '#fff', outline: 'none' }}>
                <option value="">All Statuses</option>
                {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* BT Amount Range */}
              <select value={btAmountRange} onChange={e => setBtAmountRange(e.target.value)}
                style={{ flex: '0 1 190px', height: 38, borderRadius: 8, border: `1.5px solid ${btAmountRange ? '#1a4731' : '#e2e8f0'}`, fontSize: 13, padding: '0 10px', background: btAmountRange ? '#f0fdf4' : '#fff', color: btAmountRange ? '#1a4731' : '#374151', fontWeight: btAmountRange ? 700 : 400, outline: 'none' }}>
                {BT_AMOUNT_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {/* BT Done Only */}
              <button onClick={() => setBtOnlyFilter(v => !v)}
                style={{ height: 38, borderRadius: 8, border: `1.5px solid ${btOnlyFilter ? '#e65100' : '#e2e8f0'}`, background: btOnlyFilter ? '#fff3e0' : '#fff', color: btOnlyFilter ? '#e65100' : '#64748b', fontSize: 12, padding: '0 12px', cursor: 'pointer', fontWeight: btOnlyFilter ? 700 : 400 }}>
                {btOnlyFilter ? '🔥 BT Done Only' : 'BT Done Only'}
              </button>
              {/* BT Left */}
              <button onClick={() => setPendingFilter(v => v === 'bt-left' ? '' : 'bt-left')}
                style={{ height: 38, borderRadius: 8, border: `1.5px solid ${pendingFilter==='bt-left'?'#c2410c':'#e2e8f0'}`, background: pendingFilter==='bt-left'?'#ffedd5':'#fff', color: pendingFilter==='bt-left'?'#c2410c':'#64748b', fontSize: 12, padding: '0 12px', cursor: 'pointer', fontWeight: pendingFilter==='bt-left'?700:400 }}>
                ⏳ BT Left
              </button>
              {/* RP Left */}
              <button onClick={() => setPendingFilter(v => v === 'rp-left' ? '' : 'rp-left')}
                style={{ height: 38, borderRadius: 8, border: `1.5px solid ${pendingFilter==='rp-left'?'#6b21a8':'#e2e8f0'}`, background: pendingFilter==='rp-left'?'#f3e8ff':'#fff', color: pendingFilter==='rp-left'?'#6b21a8':'#64748b', fontSize: 12, padding: '0 12px', cursor: 'pointer', fontWeight: pendingFilter==='rp-left'?700:400 }}>
                🎁 RP Left
              </button>
              {(search || statusFilter || btAmountRange || btOnlyFilter || pendingFilter) && (
                <button onClick={() => { setSearch(''); setStatusFilter(''); setBtAmountRange(''); setBtOnlyFilter(false); setPendingFilter(''); }}
                  style={{ height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, padding: '0 14px', cursor: 'pointer', color: '#b91c1c' }}>
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 10 }} />)}
          {error && !loading && <div style={{ background: '#fee2e2', borderRadius: 12, padding: 16, color: '#b91c1c', textAlign: 'center' }}>{error}</div>}

          {/* FSE Accordion List */}
          {!loading && !error && filteredFseData.map(fse => {
            const isExpanded = expandedFSE === fse.fseName;
            const m = fse.metrics;
            const page = getPage(fse.fseName);
            const totalPages = Math.max(1, Math.ceil(fse.merchants.length / PAGE_SIZE));
            const paged = fse.merchants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

            return (
              <div key={fse.fseName} style={{ background: '#fff', borderRadius: 14, marginBottom: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1.5px solid #e8f3ed' }}>
                {/* FSE Header — click to expand */}
                <div onClick={() => setExpandedFSE(isExpanded ? null : fse.fseName)}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isExpanded ? '#f0fdf4' : '#fff', transition: 'background 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a4731', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>
                      {fse.fseName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a4731' }}>{fse.fseName}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {m.totalMerchants} merchants · BT ₹{(m.totalBTAmount || 0).toLocaleString()} · {m.passLive} Pass Live
                      </div>
                    </div>
                  </div>
                  {/* FSE metrics row */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Total',    value: m.totalMerchants, bg: '#e8f3ed',  color: '#1a4731' },
                      { label: 'BT',       value: m.btDone,         bg: '#fff3e0',  color: '#e65100' },
                      { label: 'RP',       value: m.rpDone,         bg: '#ede9fe',  color: '#7c3aed' },
                      { label: 'Live',     value: m.passLive,       bg: '#d8f3dc',  color: '#1a4731' },
                      { label: 'Pending',  value: m.pending,        bg: '#fef3c7',  color: '#92400e' },
                    ].map(c => (
                      <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center', minWidth: 36 }}>
                        <div>{c.value}</div>
                        <div style={{ fontSize: 8, fontWeight: 400, opacity: 0.8 }}>{c.label}</div>
                      </div>
                    ))}
                    <span style={{ fontSize: 18, color: '#888', marginLeft: 4 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded merchant list */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #e8f3ed' }}>
                    {fse.merchants.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: 13 }}>No merchants match your filters.</div>
                    ) : (
                      <>
                        {/* Merchant cards */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {paged.map((merchant, i) => {
                            const sc = getStatusStyle(merchant.onboardingStatus);
                            return (
                              <div key={merchant.merchantNumber + i}
                                onClick={() => setSelectedMerchant(merchant)}
                                style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8fdf9'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4731', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {merchant.merchantName}
                                    {merchant.btVerified && <span style={{ fontSize: 10 }}>✅</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                                    📞 {merchant.merchantNumber}
                                    {merchant.merchantCategory && merchant.merchantCategory !== '–' ? ` · ${merchant.merchantCategory}` : ''}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    {/* Current Stage */}
                                    {(() => {
                                      const stage3  = parseFloat(merchant.stage3) || 0;
                                      const passLive = (merchant.passLive || '').toLowerCase() === 'live';
                                      const rpActive = (merchant.rewardPassPro || '').toLowerCase() === 'active';
                                      const btDone   = stage3 > 0;
                                      let stageName = 'Ready';
                                      let stageColor = '#6b21a8';
                                      let stageBg = '#f3e8ff';
                                      if (passLive) {
                                        stageName = 'RP Live';
                                        stageColor = '#1a4731';
                                        stageBg = '#d8f3dc';
                                      } else if (rpActive) {
                                        stageName = 'RP Active';
                                        stageColor = '#0369a1';
                                        stageBg = '#e0f2fe';
                                      } else if (btDone) {
                                        stageName = 'BT Done';
                                        stageColor = '#e65100';
                                        stageBg = '#fff3e0';
                                      }
                                      return (
                                        <span style={{ fontSize: 9, background: stageBg, color: stageColor, padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: `1px solid ${stageColor}20` }}>
                                          Stage: {stageName}
                                        </span>
                                      );
                                    })()}

                                    {/* BT Completed */}
                                    <span style={{ fontSize: 9, background: merchant.stage3 > 0 ? '#fff3e0' : '#f1f5f9', color: merchant.stage3 > 0 ? '#e65100' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: merchant.stage3 > 0 ? '1px solid #e6510020' : '1px solid #e2e8f0' }}>
                                      BT Completed: ₹{(merchant.stage3 || 0).toLocaleString()}
                                    </span>

                                    {/* BT Gap */}
                                    <span style={{ fontSize: 9, background: merchant.stage3Gap > 0 ? '#fee2e2' : '#f1f5f9', color: merchant.stage3Gap > 0 ? '#b91c1c' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: merchant.stage3Gap > 0 ? '1px solid #b91c1c20' : '1px solid #e2e8f0' }}>
                                      Gap: ₹{(merchant.stage3Gap || 0).toLocaleString()}
                                    </span>

                                    {/* RP Status */}
                                    <span style={{ fontSize: 9, background: (merchant.rewardPassPro || '').toLowerCase() === 'active' ? '#ede9fe' : '#f1f5f9', color: (merchant.rewardPassPro || '').toLowerCase() === 'active' ? '#7c3aed' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: (merchant.rewardPassPro || '').toLowerCase() === 'active' ? '1px solid #7c3aed20' : '1px solid #e2e8f0' }}>
                                      RP: {(merchant.rewardPassPro || '').toLowerCase() === 'active' ? 'Active ✓' : 'Not Active'}
                                    </span>

                                    {/* Pass Live Status */}
                                    <span style={{ fontSize: 9, background: (merchant.passLive || '').toLowerCase() === 'live' ? '#d8f3dc' : '#f1f5f9', color: (merchant.passLive || '').toLowerCase() === 'live' ? '#1a4731' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: (merchant.passLive || '').toLowerCase() === 'live' ? '1px solid #1a473120' : '1px solid #e2e8f0' }}>
                                      Pass: {(merchant.passLive || '').toLowerCase() === 'live' ? 'Live ✓' : 'Not Live'}
                                    </span>

                                    {/* UPI Transaction Count */}
                                    <span style={{ fontSize: 9, background: merchant.upiTxnCount > 0 ? '#e0f2fe' : '#f1f5f9', color: merchant.upiTxnCount > 0 ? '#0369a1' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: merchant.upiTxnCount > 0 ? '1px solid #0369a120' : '1px solid #e2e8f0' }}>
                                      UPI Txns: {merchant.upiTxnCount || 0}
                                    </span>

                                    {/* Total UPI Amount */}
                                    <span style={{ fontSize: 9, background: merchant.upiAmount > 0 ? '#e0f2fe' : '#f1f5f9', color: merchant.upiAmount > 0 ? '#0369a1' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: merchant.upiAmount > 0 ? '1px solid #0369a120' : '1px solid #e2e8f0' }}>
                                      UPI Amt: ₹{(merchant.upiAmount || 0).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                  <span style={{ ...sc, padding: '3px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{merchant.onboardingStatus || 'Pending'}</span>
                                  {merchant.lastActivity && (
                                    <span style={{ fontSize: 9, color: '#888' }}>{fmt(merchant.lastActivity)}</span>
                                  )}
                                  <span style={{ fontSize: 14, color: '#888' }}>›</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
                            <button onClick={() => setPage(fse.fseName, Math.max(1, page - 1))} disabled={page === 1}
                              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12, color: page === 1 ? '#ccc' : '#1a4731' }}>‹</button>
                            <span style={{ fontSize: 11, color: '#888' }}>Page {page} of {totalPages}</span>
                            <button onClick={() => setPage(fse.fseName, Math.min(totalPages, page + 1))} disabled={page === totalPages}
                              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12, color: page === totalPages ? '#ccc' : '#1a4731' }}>›</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && !error && filteredFseData.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>No team merchants found</div>
            </div>
          )}
        </div>
      </main>

      {/* Merchant Detail Bottom Sheet */}
      {selectedMerchant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setSelectedMerchant(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '82vh', overflowY: 'auto', padding: '20px 20px 40px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{selectedMerchant.merchantName}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>📞 {selectedMerchant.merchantNumber}</div>
                <div style={{ fontSize: 12, color: '#1a4731', marginTop: 2 }}>FSE: {selectedMerchant.fseName}</div>
              </div>
              <button onClick={() => setSelectedMerchant(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            {/* Status badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <span style={{ ...getStatusStyle(selectedMerchant.onboardingStatus), padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                {selectedMerchant.onboardingStatus || 'Pending'}
              </span>
              {selectedMerchant.btVerified
                ? <span style={{ background: '#d8f3dc', color: '#1a4731', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>✅ BT Verified</span>
                : <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>⏳ BT Pending</span>
              }
            </div>

            {/* Progress Metrics Section */}
            <div style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 800, color: '#1a4731', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📊 Progress Metrics ({btMonth})
            </div>
            <div style={{ background: '#f8faf9', borderRadius: 10, padding: '4px 12px', marginBottom: 16, border: '1px solid #e8f3ed' }}>
              {[
                ['Current Stage', (() => {
                  const stage3  = parseFloat(selectedMerchant.stage3) || 0;
                  const passLive = (selectedMerchant.passLive || '').toLowerCase() === 'live';
                  const rpActive = (selectedMerchant.rewardPassPro || '').toLowerCase() === 'active';
                  const btDone   = stage3 > 0;
                  if (passLive) return 'RP Live 🎉';
                  if (rpActive) return 'RP Active';
                  if (btDone) return 'BT Done';
                  return 'Ready';
                })()],
                ['Onboarding Status', selectedMerchant.onboardingStatus || 'Pending'],
                ['BT Completed', `₹${(selectedMerchant.stage3 || 0).toLocaleString()}`],
                ['BT Gap/Remaining Amount', `₹${(selectedMerchant.stage3Gap || 0).toLocaleString()}`],
                ['RP Status', (selectedMerchant.rewardPassPro || '').toLowerCase() === 'active' ? 'Active ✓' : 'Not Active'],
                ['Pass Live Status', (selectedMerchant.passLive || '').toLowerCase() === 'live' ? 'Live ✓' : 'Not Live'],
                ['UPI Transaction Count', `${selectedMerchant.upiTxnCount || 0} txn`],
                ['Total UPI Amount', `₹${(selectedMerchant.upiAmount || 0).toLocaleString()}`],
                ['Last Activity Date', fmt(selectedMerchant.lastActivity)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #e8f3ed' }}>
                  <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 750, color: '#1a4731' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📋 Additional Details
            </div>
            {[
              ['Category',         selectedMerchant.merchantCategory],
              ['TL',               selectedMerchant.tl],
              ['Onboarding Date',  fmt(selectedMerchant.submissionDate)],
              ['Latest Opinion',   selectedMerchant.latestOpinion],
              ['UPI Status',       selectedMerchant.upiActive !== '–' ? selectedMerchant.upiActive : null],
              ['RP Active Date',   fmtExcelDate(selectedMerchant.rewardsPassProActiveDate)],
              ['Priority Pass',    selectedMerchant.priorityPassStatus !== '–' ? selectedMerchant.priorityPassStatus : null],
              ['MSME/GST',         selectedMerchant.msmegstStatus !== '–' ? selectedMerchant.msmegstStatus : null],
              ['Insurance',        selectedMerchant.insuranceStatus !== '–' ? selectedMerchant.insuranceStatus : null],
            ].filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '–').map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
