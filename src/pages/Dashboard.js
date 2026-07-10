import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Use existing backend (port 4000) for profile and Tide BT access data
const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [tl, setTl] = useState(null);
  const [fseList, setFseList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamForms, setTeamForms] = useState([]);
  const [expandedTeamForm, setExpandedTeamForm] = useState(null);
  const [showTeamList, setShowTeamList] = useState(false);
  const [myForms, setMyForms] = useState([]);
  const [expandedMyForm, setExpandedMyForm] = useState(null);
  const [formTab, setFormTab] = useState('team-onboard');
  const [receivedPayments, setReceivedPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [rewardPassData, setRewardPassData] = useState([]);
  const [teamRewardPassData, setTeamRewardPassData] = useState([]);
  const [sentPayments, setSentPayments] = useState([]);
  const [myTarget, setMyTarget] = useState(null);
  const [targetFSE, setTargetFSE] = useState('');
  const [targetBT, setTargetBT] = useState('');
  const [targetRP, setTargetRP] = useState('');
  const [targetStartDate, setTargetStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetSuccess, setTargetSuccess] = useState('');
  const [fseTargets, setFseTargets] = useState([]);
  const [teamFundTracker, setTeamFundTracker] = useState([]);
  const [showFundTracker, setShowFundTracker] = useState(false);
  const [showSentDetails, setShowSentDetails] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePurpose, setExpensePurpose] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [btPerf, setBtPerf] = useState(null);
  const [myBtPerf, setMyBtPerf] = useState(null); // TL's personal BT
  const [prevMyBtPerf, setPrevMyBtPerf] = useState(null); // Prev month TL personal BT
  const [annualBtSummary, setAnnualBtSummary] = useState(null); // All months BT data
  const [amountRange, setAmountRange] = useState(''); // Amount range filter for Onboard tabs
  const [teamPerformance, setTeamPerformance] = useState(null);

  // Selected KPI for bottom sheet details
  const [activeKpi, setActiveKpi] = useState(null);

  // Date filter state — default to all data, user can filter by month
  const [dateFilter, setDateFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('en-US', { month: 'long' }));

  // Date filter function
  const filterByDate = (items, dateField = 'createdAt') => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yr = selectedYear ? parseInt(selectedYear) : null;

    return items.filter(item => {
      const raw = item[dateField];

      // Items with no date are always included
      if (!raw) return true;

      const d = new Date(raw);
      if (isNaN(d)) return true; // can't parse — include anyway

      // Enforce selectedYear and selectedMonth strictly first
      if (yr && d.getFullYear() !== yr) return false;
      if (selectedMonth && d.toLocaleString('en-US', { month: 'long' }) !== selectedMonth) return false;

      if (dateFilter === 'today') {
        return d.toISOString().split('T')[0] === todayStr;

      } else if (dateFilter === 'month') {
        const filterYr = yr || now.getFullYear();
        const ms = new Date(filterYr, now.getMonth(), 1);
        const me = new Date(filterYr, now.getMonth() + 1, 0, 23, 59, 59, 999);
        return d >= ms && d <= me;

      } else if (dateFilter === 'custom') {
        if (fromDate && d < new Date(fromDate)) return false;
        if (toDate && d > new Date(toDate + 'T23:59:59')) return false;
        return true;

      } else {
        return true;
      }
    });
  };

  const filteredTeamForms = useMemo(() => filterByDate(teamForms), [teamForms, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredMyForms = useMemo(() => filterByDate(myForms), [myForms, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredPayments = useMemo(() => filterByDate(receivedPayments), [receivedPayments, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredPaymentsForDisplay = useMemo(() => filterByDate(receivedPayments), [receivedPayments, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredExpenses = useMemo(() => filterByDate(expenses), [expenses, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredSentPayments = useMemo(() => filterByDate(sentPayments), [sentPayments, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredRewardPass = useMemo(() => filterByDate(rewardPassData, 'dateOfWorking'), [rewardPassData, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredTeamRewardPass = useMemo(() => filterByDate(teamRewardPassData, 'dateOfWorking'), [teamRewardPassData, dateFilter, fromDate, toDate, selectedYear, selectedMonth]);
  const filteredFseTargets = useMemo(() => {
    const targetMonth = selectedMonth || '';
    const targetYear = selectedYear || '';
    return fseTargets.filter(t => {
      if (targetMonth && t.month !== targetMonth) return false;
      if (targetYear && String(t.year) !== targetYear) return false;
      return true;
    });
  }, [fseTargets, selectedMonth, selectedYear]);

  const totalFund = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);  // Month-wise filtered
  // My personal BT — use myBtPerf (TL's own merchants in BT_TL_CONNECT)
  const fundUsedBT = myBtPerf ? (myBtPerf.btAmount || 0) : filteredRewardPass.reduce((sum, r) => sum + (r.totalBTAmount || 0), 0);
  const totalRPCount = myBtPerf ? (myBtPerf.rewardPassCount || 0) : filteredRewardPass.reduce((sum, r) => sum + (r.totalRPCount || 0), 0);
  const fundUsedRP = totalRPCount * 2500;
  const fee = Math.round((fundUsedBT > 10000 ? fundUsedBT * 0.015 : 0) * 100) / 100; // 1.5% only if BT > ₹10,000
  const sentToFSEs = filteredSentPayments.reduce((sum, p) => sum + ((!p.isSelf && p.transferToWhom !== 'Self' ? p.amount : 0) || 0), 0);  // Month-wise
  // Self-transferred: payments where TL sent fund to themselves
  const selfTransferred = filteredSentPayments.reduce((sum, p) => sum + ((p.isSelf || p.transferToWhom === 'Self' ? p.amount : 0) || 0), 0);  // Month-wise
  const withdrawAmount = filteredMyForms.filter(f => f.formType === 'mobikwik-withdraw').reduce((s, f) => s + (f.withdrawAmount || 0), 0);
  const withdrawFees = Math.round(withdrawAmount * 0.03 * 100) / 100;
  const totalUsed = fundUsedRP + fee + withdrawFees;
  // Fund with TL = Received - Sent to FSEs (minimum 0)
  const fundWithTL = Math.max(0, totalFund - sentToFSEs);
  // My Fund = only what TL explicitly transferred to self
  const myFund = selfTransferred;
  // Fund Left = My Fund - Used
  const fundLeft = myFund - (fundUsedRP + fee + withdrawFees);

  // ── Previous month carry-forward (pure frontend — no extra API call) ──────
  const prevMonthData = useMemo(() => {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthIdx  = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : new Date().getMonth();
    const curYear      = selectedYear  ? parseInt(selectedYear)             : new Date().getFullYear();
    const prevMonthIdx = curMonthIdx === 0 ? 11 : curMonthIdx - 1;
    const prevYear     = curMonthIdx === 0 ? curYear - 1 : curYear;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];

    const isInPrevMonth = (dateRaw) => {
      if (!dateRaw) return false;
      const d = new Date(dateRaw);
      if (isNaN(d)) return false;
      return d.getFullYear() === prevYear && d.getMonth() === prevMonthIdx;
    };

    // Prev month received by TL
    const prevReceived = receivedPayments
      .filter(p => isInPrevMonth(p.createdAt))
      .reduce((s, p) => s + (p.amount || 0), 0);

    // Prev month self-transferred (TL kept for self)
    const prevSelf = sentPayments
      .filter(p => isInPrevMonth(p.createdAt) && (p.isSelf || p.transferToWhom === 'Self'))
      .reduce((s, p) => s + (p.amount || 0), 0);

    // Prev month sent to FSEs
    const prevSentFSEs = sentPayments
      .filter(p => isInPrevMonth(p.createdAt) && !p.isSelf && p.transferToWhom !== 'Self')
      .reduce((s, p) => s + (p.amount || 0), 0);

    // BT & RP from prevMyBtPerf API — accurate, same source as current month
    const prevBT      = prevMyBtPerf ? (prevMyBtPerf.btAmount       || 0) : 0;
    const prevRPCount = prevMyBtPerf ? (prevMyBtPerf.rewardPassCount || 0) : 0;
    const prevRP      = prevRPCount * 2500;
    const prevFee     = Math.round((prevBT > 10000 ? prevBT * 0.015 : 0) * 100) / 100;

    // Mobikwik withdraw from local forms
    const prevWithdraw = myForms.filter(f => f.formType === 'mobikwik-withdraw' && isInPrevMonth(f.createdAt))
      .reduce((s, f) => s + (f.withdrawAmount || 0), 0);
    const prevWithdrawFees = Math.round(prevWithdraw * 0.03 * 100) / 100;
    const prevTotalUsed = prevRP + prevFee + prevWithdrawFees;
    const prevFundLeft  = prevSelf - prevTotalUsed;

    return { prevMonthName, prevYear, prevReceived, prevSelf, prevSentFSEs, prevBT, prevRPCount, prevRP, prevFee, prevTotalUsed, prevFundLeft };
  }, [receivedPayments, sentPayments, prevMyBtPerf, myForms, selectedMonth, selectedYear]);

  // ── Combined KPIs including carry-forward ─────────────────────────────────
  // Cumulative carry = sum of (received - used) for ALL months before current month
  const carryForward = useMemo(() => {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthIdx = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : new Date().getMonth();
    const curYear     = selectedYear  ? parseInt(selectedYear)             : new Date().getFullYear();

    const pastMonths = MONTH_NAMES.slice(0, curMonthIdx);
    if (pastMonths.length === 0) return 0;

    const prevMonthIdx  = curMonthIdx - 1;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];

    // Use running balance — negative self-kept (returned fund) reduces balance
    let runningBalance = 0;

    pastMonths.forEach(monthName => {
      // Self-transferred (TL's own fund kept) in this month
      // Negative = TL returned fund back to admin
      const monthSelf = sentPayments
        .filter(p => {
          if (!p.createdAt || !(p.isSelf || p.transferToWhom === 'Self')) return false;
          const d = new Date(p.createdAt);
          return d.getFullYear() === curYear && MONTH_NAMES[d.getMonth()] === monthName;
        })
        .reduce((s, p) => s + (p.amount || 0), 0);

      // Also account for negative received payments (TL returned fund directly)
      const monthReceivedNeg = receivedPayments
        .filter(p => {
          if (!p.createdAt || (p.amount || 0) >= 0) return false;
          const d = new Date(p.createdAt);
          return d.getFullYear() === curYear && MONTH_NAMES[d.getMonth()] === monthName;
        })
        .reduce((s, p) => s + (p.amount || 0), 0); // negative values

      let monthBT = 0, monthRP = 0;
      if (monthName === prevMonthName && prevMyBtPerf) {
        monthBT = prevMyBtPerf.btAmount       || 0;
        monthRP = prevMyBtPerf.rewardPassCount || 0;
      } else if (annualBtSummary?.months) {
        const monthData = annualBtSummary.months.find(m => m.month === monthName);
        monthBT = monthData ? (monthData.btAmount       || 0) : 0;
        monthRP = monthData ? (monthData.rewardPassCount || 0) : 0;
      }

      const monthRPCost = monthRP * 2500;
      const monthFee    = Math.round((monthBT > 10000 ? monthBT * 0.015 : 0) * 100) / 100;

      const monthWithdraw = myForms
        .filter(f => {
          if (f.formType !== 'mobikwik-withdraw' || !f.createdAt) return false;
          const d = new Date(f.createdAt);
          return d.getFullYear() === curYear && MONTH_NAMES[d.getMonth()] === monthName;
        })
        .reduce((s, f) => s + (f.withdrawAmount || 0), 0);
      const monthWithdrawFees = Math.round(monthWithdraw * 0.03 * 100) / 100;

      const monthUsed = monthRPCost + monthFee + monthWithdrawFees;

      // Net = self-kept + negative received (returns) - costs
      // Running balance accumulates — clamp to 0
      runningBalance = Math.max(0, runningBalance + monthSelf + monthReceivedNeg - monthUsed);
    });

    return runningBalance;
  }, [sentPayments, receivedPayments, prevMyBtPerf, annualBtSummary, myForms, selectedMonth, selectedYear]);

  const totalAvailable    = myFund + carryForward;
  const fundLeftWithCarry = totalAvailable - totalUsed;

  // ── Stale-while-revalidate fetch helper ───────────────────────────────────
  const cachedFetch = useCallback((url, setter, transform, ck) => {
    const stored = localStorage.getItem(ck);
    if (stored) { try { setter(transform(JSON.parse(stored))); } catch {} }
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(data => { localStorage.setItem(ck, JSON.stringify(data)); setter(transform(data)); })
      .catch(() => {});
  }, [token]);

  // ── Background prefetch all months so switching is instant ───────────────
  // Silently fetches bt-performance + team-performance for all months in background
  // after the page loads. Next time user switches month → data is already in localStorage.
  useEffect(() => {
    if (!token || !tl) return;
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curYear = new Date().getFullYear().toString();
    // Run in background after 3s delay so it doesn't compete with primary data loading
    const timer = setTimeout(() => {
      MONTH_NAMES.forEach(month => {
        const ckBt   = `tl_btperf_${month}_${curYear}`;
        const ckMyBt = `tl_mybtperf_${month}_${curYear}`;
        const ckTeam = `tl_teamperf_${month}_${curYear}`;
        const ckFund = `tl_fundtracker_${month}_${curYear}_all`;
        // Only prefetch if not already cached
        if (!localStorage.getItem(ckBt)) {
          const p = new URLSearchParams({ selectedMonth: month, selectedYear: curYear });
          fetch(`${PROFILE_API_BASE}/api/tl/tidebt-bt-performance?${p}`, { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.json()).then(d => localStorage.setItem(ckBt, JSON.stringify(d))).catch(() => {});
        }
        if (!localStorage.getItem(ckMyBt)) {
          const p = new URLSearchParams({ selectedMonth: month, selectedYear: curYear });
          fetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-bt-performance?${p}`, { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.json()).then(d => localStorage.setItem(ckMyBt, JSON.stringify(d))).catch(() => {});
        }
        if (!localStorage.getItem(ckTeam)) {
          const p = new URLSearchParams({ selectedMonth: month, selectedYear: curYear });
          fetch(`${PROFILE_API_BASE}/api/tl/tidebt-team-performance?${p}`, { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.json()).then(d => localStorage.setItem(ckTeam, JSON.stringify(d))).catch(() => {});
        }
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [token, tl, PROFILE_API_BASE]);

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
    const stored = localStorage.getItem('tl_fses');
    if (stored) { try { setFseList(JSON.parse(stored)); setLoading(false); } catch {} }
    fetch(`${PROFILE_API_BASE}/api/tl/tidebt-fses`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(data => {
        const fses = Array.isArray(data.fses) ? data.fses : [];
        localStorage.setItem('tl_fses', JSON.stringify(fses));
        setFseList(fses); setLoading(false);
      })
      .catch(() => { setFseList([]); setLoading(false); });
  }, [token, tl]);

  // Fetch team Tide BT forms
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-team-forms`, setTeamForms, d => Array.isArray(d) ? d : [], 'tl_teamforms');
  }, [token, tl, cachedFetch]);

  // Fetch my own Tide BT forms
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-forms`, setMyForms, d => Array.isArray(d) ? d : [], 'tl_myforms');
  }, [token, tl, cachedFetch]);

  // Fetch received payments
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-received-payments`, setReceivedPayments, d => Array.isArray(d.payments) ? d.payments : Array.isArray(d) ? d : [], 'tl_payments');
  }, [token, tl, cachedFetch]);

  // Fetch expenses
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-expenses`, setExpenses, d => d.expenses || [], 'tl_expenses');
  }, [token, tl, cachedFetch]);

  // Fetch reward pass data
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-reward-pass`, setRewardPassData, d => d.data || [], 'tl_rewardpass');
  }, [token, tl, cachedFetch]);

  // Fetch team reward pass data (FSEs under this TL)
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-team-reward-pass`, setTeamRewardPassData, d => d.data || [], 'tl_teamrewardpass');
  }, [token, tl, cachedFetch]);

  // Fetch BT performance from BT_TL_CONNECT {MONTH} — refetch when month or year changes
  useEffect(() => {
    if (!token || !tl) return;
    const params = new URLSearchParams();
    if (selectedMonth) params.set('selectedMonth', selectedMonth);
    if (selectedYear) params.set('selectedYear', selectedYear);
    // Team BT
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-bt-performance?${params.toString()}`,
      d => { if (d && d.success) setBtPerf(d); else setBtPerf(null); }, d => d,
      `tl_btperf_${selectedMonth}_${selectedYear}`);
    // My personal BT
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-bt-performance?${params.toString()}`,
      d => { if (d && d.success) setMyBtPerf(d); else setMyBtPerf(null); }, d => d,
      `tl_mybtperf_${selectedMonth}_${selectedYear}`);

    // Prev month personal BT
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthIdx  = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : new Date().getMonth();
    const curYear      = selectedYear  ? parseInt(selectedYear)             : new Date().getFullYear();
    const prevMonthIdx = curMonthIdx === 0 ? 11 : curMonthIdx - 1;
    const prevYear     = curMonthIdx === 0 ? curYear - 1 : curYear;
    const prevParams   = new URLSearchParams();
    prevParams.set('selectedMonth', MONTH_NAMES[prevMonthIdx]);
    prevParams.set('selectedYear', String(prevYear));
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-bt-performance?${prevParams.toString()}`,
      d => { if (d && d.success) setPrevMyBtPerf(d); else setPrevMyBtPerf(null); }, d => d,
      `tl_mybtperf_${MONTH_NAMES[prevMonthIdx]}_${prevYear}`);

    // Annual summary
    const yearStr = String(curYear);
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-annual-bt-summary?year=${yearStr}`,
      d => { if (d && d.success) setAnnualBtSummary(d); else setAnnualBtSummary(null); }, d => d,
      `tl_annual_${yearStr}`);
  }, [token, tl, selectedMonth, selectedYear, cachedFetch]);

  // Fetch team target & performance details
  useEffect(() => {
    if (!token || !tl) return;
    const params = new URLSearchParams();
    if (selectedMonth) params.set('selectedMonth', selectedMonth);
    if (selectedYear) params.set('selectedYear', selectedYear);
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-team-performance?${params.toString()}`,
      d => { if (d && d.success) setTeamPerformance(d); else setTeamPerformance(null); }, d => d,
      `tl_teamperf_${selectedMonth}_${selectedYear}`);
  }, [token, tl, selectedMonth, selectedYear, cachedFetch]);

  // Fetch payments sent by this TL to FSEs
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-sent-payments`, setSentPayments, d => d.payments || [], 'tl_sentpayments');
  }, [token, tl, cachedFetch]);

  // Fetch my target
  useEffect(() => {
    if (!token || !tl) return;
    const targetMonth = selectedMonth || '';
    const targetYear = selectedYear || '';
    // No localStorage cache for targets — admin sets them on a different backend,
    // stale cache would hide the target. Always fetch fresh.
    fetch(
      `${PROFILE_API_BASE}/api/tl/tidebt-my-target?month=${targetMonth}&year=${targetYear}`,
      { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }
    )
      .then(r => r.json())
      .then(d => setMyTarget(d.target || null))
      .catch(() => {});
  }, [token, tl, selectedMonth, selectedYear]);

  // Fetch FSE targets set by this TL
  useEffect(() => {
    if (!token || !tl) return;
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-fse-targets`, setFseTargets, d => d.targets || [], 'tl_fsetargets');
  }, [token, tl, cachedFetch]);

  // Fetch team fund tracker
  useEffect(() => {
    if (!token || !tl) return;
    const queryParams = new URLSearchParams({ dateFilter, fromDate, toDate, selectedYear, selectedMonth }).toString();
    cachedFetch(`${PROFILE_API_BASE}/api/tl/tidebt-team-fund-tracker?${queryParams}`,
      setTeamFundTracker, d => d.tracker || [], `tl_fundtracker_${selectedMonth}_${selectedYear}_${dateFilter}`);
  }, [token, tl, dateFilter, fromDate, toDate, selectedYear, selectedMonth, cachedFetch]);

  const handleAddExpense = async () => {
    if (!expenseAmount || !expensePurpose) return;
    setExpenseLoading(true);
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/tl/tidebt-add-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ amount: expenseAmount, purpose: expensePurpose })
      });
      if (res.ok) {
        setExpenseAmount(''); setExpensePurpose('');
        const expRes = await fetch(`${PROFILE_API_BASE}/api/tl/tidebt-my-expenses`, { headers: { Authorization: 'Bearer ' + token } });
        const expData = await expRes.json();
        setExpenses(expData.expenses || []);
      }
    } catch (err) { console.error(err); }
    finally { setExpenseLoading(false); }
  };

  const getKpiDetails = (kpiLabel) => {
    const targetMonth = selectedMonth || new Date().toLocaleString('en-US', { month: 'long' });
    const targetYear = selectedYear ? parseInt(selectedYear) : new Date().getFullYear();

    // Actual Calculations
    const totalTeamBT = filteredTeamRewardPass.reduce((s, r) => s + (r.totalBTAmount || 0), 0);
    const totalTeamRP = filteredTeamRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0);

    const today = new Date().toISOString().split('T')[0];
    const todayForms = filteredTeamRewardPass.filter(r => r.dateOfWorking === today || (r.createdAt && r.createdAt.startsWith(today)));
    const todayBTVal = todayForms.reduce((s, r) => s + (r.totalBTAmount || 0), 0);

    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().split('T')[0];
    const yesterdayForms = filteredTeamRewardPass.filter(r => r.dateOfWorking === yesterday || (r.createdAt && r.createdAt.startsWith(yesterday)));
    const yesterdayBTVal = yesterdayForms.reduce((s, r) => s + (r.totalBTAmount || 0), 0);

    const remainingBTVal = myTarget?.btTarget ? Math.max(0, myTarget.btTarget - totalTeamBT) : 0;
    const remainingRPVal = myTarget?.rpTarget ? Math.max(0, myTarget.rpTarget - totalTeamRP) : 0;

    switch (kpiLabel) {
      case 'My BT': {
        const myBtCompleted = myBtPerf ? (myBtPerf.btAmount || 0) : fundUsedBT;
        const myBtTarget = myTarget?.btTarget || 0;
        const myBtRemaining = myBtTarget > 0 ? Math.max(0, myBtTarget - myBtCompleted) : 0;
        const myBtAchievement = myBtTarget > 0 ? Math.round((myBtCompleted / myBtTarget) * 100) : 0;
        return {
          title: 'My BT',
          totalValue: `₹${myBtCompleted.toLocaleString()}`,
          desc: myBtTarget > 0
            ? `Target: ₹${myBtTarget.toLocaleString()} · Achieved: ${myBtAchievement}% · Remaining: ₹${myBtRemaining.toLocaleString()}`
            : 'No target assigned for this month. Showing BT completed.',
          type: 'my-bt-performance',
          btTarget: myBtTarget,
          btCompleted: myBtCompleted,
          remaining: myBtRemaining,
          achievement: myBtAchievement,
          items: myBtPerf
            ? (myBtPerf.merchants || [])
                .filter(m => (m.stage3 || 0) > 0)
                .sort((a, b) => (b.stage3 || 0) - (a.stage3 || 0))
                .map(m => ({
                  name: m.lead || '–',
                  value: `₹${(m.stage3 || 0).toLocaleString()}`,
                  detail: `UPI: ${m.upiActive} · Txn: ${m.upiTxnCount} · 📞 ${m.merchantNumber}`
                }))
            : filteredRewardPass.map(r => ({
                name: r.workingUpdate || 'Reward Pass Submission',
                value: `₹${(r.totalBTAmount || 0).toLocaleString()}`,
                detail: `RP Count: ${r.totalRPCount || 0} · Date: ${r.dateOfWorking ? new Date(r.dateOfWorking).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}`
              }))
        };
      }

      case 'My RP':
        return {
          title: 'My RP',
          totalValue: myBtPerf ? `${myBtPerf.rewardPassCount || 0} Merchants` : `${filteredRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0)} Passes`,
          desc: myBtPerf ? 'Your merchants with Reward Pass Pro Active.' : 'Total count of reward passes submitted by you.',
          type: 'individual',
          items: myBtPerf
            ? (myBtPerf.merchants || []).filter(m => (m.rewardPassPro || '').toLowerCase() === 'active').map(m => ({
                name: m.lead || '–',
                value: m.rewardPassPro,
                detail: `Pass Live: ${m.passLive} · 📞 ${m.merchantNumber}`
              }))
            : filteredRewardPass.map(r => ({
                name: r.workingUpdate || 'Reward Pass Submission',
                value: `${r.totalRPCount || 0} RP`,
                detail: `BT Amount: ₹${(r.totalBTAmount || 0).toLocaleString()} · Date: ${r.dateOfWorking ? new Date(r.dateOfWorking).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}`
              }))
        };

      case 'Team BT': {
        const teamTarget = teamPerformance?.teamTarget || 0;
        const btCompleted = teamPerformance?.btCompleted || 0;
        const remainingTarget = Math.max(0, teamTarget - btCompleted);
        const achievementPct = teamTarget > 0 ? Math.round((btCompleted / teamTarget) * 100) : 0;

        return {
          title: 'Team BT',
          totalValue: `₹${btCompleted.toLocaleString()}`,
          desc: `Team target: ₹${teamTarget.toLocaleString()} · Achieved: ${achievementPct}% · Remaining: ₹${remainingTarget.toLocaleString()}`,
          type: 'team-performance',
          color: 'bg-primary',
          items: (teamPerformance?.fseData || []).map(fse => {
            const fseTarget = fse.btTarget || 0;
            const fseCompleted = fse.btCompleted || 0;
            const fseRemaining = Math.max(0, fseTarget - fseCompleted);
            const fsePct = fseTarget > 0 ? Math.round((fseCompleted / fseTarget) * 100) : 0;
            const contrib = btCompleted > 0 ? Math.round((fseCompleted / btCompleted) * 100) : 0;

            return {
              name: fse.fseName,
              completed: fseCompleted,
              remaining: fseRemaining,
              target: fseTarget,
              achievement: fsePct,
              contribution: contrib
            };
          }).sort((a, b) => b.completed - a.completed)
        };
      }

      case 'Team RP': {
        if (btPerf && btPerf.merchants && btPerf.merchants.length > 0) {
          const activeRPMerchants = btPerf.merchants
            .filter(m => (m.rewardPassPro || '').toLowerCase() === 'active')
            .sort((a, b) => (a.lead || '').localeCompare(b.lead || ''));
          const total = btPerf.rewardPassCount || 0;
          return {
            title: 'Team RP',
            totalValue: `${total} Merchants`,
            desc: 'Merchants with Reward Pass Pro Active.',
            type: 'contribution',
            color: 'bg-blue',
            items: activeRPMerchants.map(m => ({
              name: m.lead || m.merchantNumber || '–',
              numericValue: 1,
              value: m.rewardPassPro,
              percentage: total > 0 ? Math.round((1 / total) * 100 * 10) / 10 : 0
            }))
          };
        }
        // Fallback
        const fseDataRP = {};
        fseList.forEach(name => { fseDataRP[name] = 0; });
        filteredTeamRewardPass.forEach(r => {
          if (r.employeeName) fseDataRP[r.employeeName] = (fseDataRP[r.employeeName] || 0) + (r.totalRPCount || 0);
        });
        return {
          title: 'Team RP',
          totalValue: `${totalTeamRP} Passes`,
          desc: 'Total reward pass count submitted by your team sales executives.',
          type: 'contribution',
          color: 'bg-blue',
          items: Object.entries(fseDataRP).map(([name, val]) => ({
            name,
            numericValue: val,
            value: `${val} RP`,
            percentage: totalTeamRP > 0 ? Math.round((val / totalTeamRP) * 100 * 10) / 10 : 0
          })).sort((a, b) => b.numericValue - a.numericValue)
        };
      }

      case 'Team BT Target': {
        const fseData = {};
        fseList.forEach(name => { fseData[name] = 0; });
        fseTargets.forEach(t => {
          if (t.month === targetMonth && parseInt(t.year) === targetYear) {
            fseData[t.targetFor] = (t.btTarget || 0);
          }
        });
        const totalTarget = Object.values(fseData).reduce((s, v) => s + v, 0);
        return {
          title: 'Team BT Target',
          totalValue: `₹${(myTarget?.btTarget || 0).toLocaleString()}`,
          desc: `Assigned team BT target for ${targetMonth} ${targetYear}.`,
          type: 'contribution',
          color: 'bg-orange',
          items: Object.entries(fseData).map(([name, val]) => ({
            name,
            numericValue: val,
            value: `₹${val.toLocaleString()}`,
            percentage: totalTarget > 0 ? Math.round((val / totalTarget) * 100 * 10) / 10 : 0
          })).sort((a, b) => b.numericValue - a.numericValue)
        };
      }

      case 'Team RP Target': {
        const fseData = {};
        fseList.forEach(name => { fseData[name] = 0; });
        fseTargets.forEach(t => {
          if (t.month === targetMonth && parseInt(t.year) === targetYear) {
            fseData[t.targetFor] = (t.rpTarget || 0);
          }
        });
        const totalTarget = Object.values(fseData).reduce((s, v) => s + v, 0);
        return {
          title: 'Team RP Target',
          totalValue: `${myTarget?.rpTarget || 0} RP`,
          desc: `Assigned team RP target for ${targetMonth} ${targetYear}.`,
          type: 'contribution',
          color: 'bg-purple',
          items: Object.entries(fseData).map(([name, val]) => ({
            name,
            numericValue: val,
            value: `${val} RP`,
            percentage: totalTarget > 0 ? Math.round((val / totalTarget) * 100 * 10) / 10 : 0
          })).sort((a, b) => b.numericValue - a.numericValue)
        };
      }

      case 'Todays Team BT': {
        const collMonthT = btPerf?.collectionMonth;
        const isMatchT = !selectedMonth || (collMonthT && collMonthT.toLowerCase() === selectedMonth.toLowerCase());
        const merchantItems = [];
        if (btPerf?.merchants && isMatchT) {
          btPerf.merchants.filter(m => (m.todaysStage3||0) > 0).forEach(m => {
            merchantItems.push({
              merchantNumber: m.merchantNumber,
              lead: m.lead || m.merchantNumber,
              amount: m.todaysStage3 || 0
            });
          });
        }
        const todayTotal = (btPerf && isMatchT) ? (btPerf.todaysBT || 0) : (isMatchT ? todayBTVal : 0);
        const todayDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        return {
          title: "Today's Team BT",
          totalValue: `₹${todayTotal.toLocaleString()}`,
          desc: `Team BT for ${todayDate} — ${merchantItems.length} merchants`,
          type: 'contribution',
          color: 'bg-primary',
          items: merchantItems
            .sort((a,b) => b.amount - a.amount)
            .map(m => ({
              name: m.lead,
              numericValue: m.amount,
              value: `₹${m.amount.toLocaleString()}`,
              detail: `📞 ${m.merchantNumber}`,
              percentage: todayTotal > 0 ? Math.round((m.amount / todayTotal) * 100 * 10) / 10 : 0
            }))
        };
      }

      case 'Yesterdays Team BT': {
        const collMonthY = btPerf?.collectionMonth;
        const isMatchY = !selectedMonth || (collMonthY && collMonthY.toLowerCase() === selectedMonth.toLowerCase());
        const fseDataY = {};
        fseList.forEach(name => { fseDataY[name] = 0; });
        if (btPerf?.merchants && isMatchY) {
          btPerf.merchants.filter(m => (m.yesterdaysStage3||0) > 0).forEach(m => {
            fseDataY[m.lead || m.merchantNumber] = (fseDataY[m.lead || m.merchantNumber] || 0) + (m.yesterdaysStage3 || 0);
          });
        } else if (!isMatchY) {
          // wrong month — show empty
        } else {
          yesterdayForms.forEach(r => { if (r.employeeName) fseDataY[r.employeeName] = (fseDataY[r.employeeName] || 0) + (r.totalBTAmount || 0); });
        }
        const yTotal = (btPerf && isMatchY) ? (btPerf.yesterdaysBT || 0) : (isMatchY ? yesterdayBTVal : 0);
        return {
          title: "Yesterday's Team BT",
          totalValue: `₹${yTotal.toLocaleString()}`,
          desc: "Tide BT amount submitted by your team members yesterday.",
          type: 'contribution',
          color: 'bg-purple',
          items: Object.entries(fseDataY).filter(([,v])=>v>0).map(([name, val]) => ({
            name, numericValue: val, value: `₹${val.toLocaleString()}`,
            percentage: yTotal > 0 ? Math.round((val / yTotal) * 100 * 10) / 10 : 0
          })).sort((a, b) => b.numericValue - a.numericValue)
        };
      }

      case 'Remaining BT': {
        const fseTargetsMap = {};
        const fseActualsMap = {};
        fseList.forEach(name => {
          fseTargetsMap[name] = 0;
          fseActualsMap[name] = 0;
        });
        fseTargets.forEach(t => {
          if (t.month === targetMonth && parseInt(t.year) === targetYear) {
            fseTargetsMap[t.targetFor] = (t.btTarget || 0);
          }
        });
        filteredTeamRewardPass.forEach(r => {
          if (r.employeeName) {
            fseActualsMap[r.employeeName] = (fseActualsMap[r.employeeName] || 0) + (r.totalBTAmount || 0);
          }
        });
        return {
          title: 'Remaining BT Target',
          totalValue: `₹${remainingBTVal.toLocaleString()}`,
          desc: 'Remaining BT amount needed to hit target this month.',
          type: 'remaining',
          color: 'bg-orange',
          items: Object.entries(fseTargetsMap).map(([name, targetVal]) => {
            const actualVal = fseActualsMap[name] || 0;
            const remainingVal = Math.max(0, targetVal - actualVal);
            const percentage = targetVal > 0 ? Math.min(100, Math.round((actualVal / targetVal) * 100)) : 0;
            return {
              name,
              targetValue: `₹${targetVal.toLocaleString()}`,
              actualValue: `₹${actualVal.toLocaleString()}`,
              value: remainingVal > 0 ? `₹${remainingVal.toLocaleString()} remaining` : 'Achieved! 🎉',
              percentage,
              numericValue: remainingVal
            };
          }).sort((a, b) => b.numericValue - a.numericValue)
        };
      }

      case 'Remaining RP': {
        const fseTargetsMap = {};
        const fseActualsMap = {};
        fseList.forEach(name => {
          fseTargetsMap[name] = 0;
          fseActualsMap[name] = 0;
        });
        fseTargets.forEach(t => {
          if (t.month === targetMonth && parseInt(t.year) === targetYear) {
            fseTargetsMap[t.targetFor] = (t.rpTarget || 0);
          }
        });
        filteredTeamRewardPass.forEach(r => {
          if (r.employeeName) {
            fseActualsMap[r.employeeName] = (fseActualsMap[r.employeeName] || 0) + (r.totalRPCount || 0);
          }
        });
        return {
          title: 'Remaining RP Target',
          totalValue: `${remainingRPVal} RP`,
          desc: 'Remaining RP count needed to hit target this month.',
          type: 'remaining',
          color: 'bg-purple',
          items: Object.entries(fseTargetsMap).map(([name, targetVal]) => {
            const actualVal = fseActualsMap[name] || 0;
            const remainingVal = Math.max(0, targetVal - actualVal);
            const percentage = targetVal > 0 ? Math.min(100, Math.round((actualVal / targetVal) * 100)) : 0;
            return {
              name,
              targetValue: `${targetVal} RP`,
              actualValue: `${actualVal} RP`,
              value: remainingVal > 0 ? `${remainingVal} RP remaining` : 'Achieved! 🎉',
              percentage,
              numericValue: remainingVal
            };
          }).sort((a, b) => b.numericValue - a.numericValue)
        };
      }

      default:
        return null;
    }
  };

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

        {/* Tide BT Onboarding button */}
        <Link to="/daily-visit" style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,71,49,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Tide BT Onboarding</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Fill Tide BT daily onboarding data</div>
            </div>
          </div>
        </Link>

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

        {/* Mobikwik/Payzapp Withdraw button */}
        <Link to="/mobikwik-withdraw" style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(67,56,202,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>💸</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Mobikwik/Payzapp Withdraw</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Submit withdraw request with reason</div>
            </div>
          </div>
        </Link>

        {/* Team Merchants button */}
        <Link to="/team-merchants" style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>🏪</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Team Merchants</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>View all merchants mapped to your FSEs</div>
            </div>
          </div>
        </Link>

        {/* My Merchants button */}
        <Link to="/my-merchants" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>🏪</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>My Merchants</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>View merchants you personally handle</div>
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

        {/* Date Filter */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '12px 16px', marginBottom: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {['all', 'today', 'month'].map(f => (
              <button key={f} onClick={() => { 
                setDateFilter(f); 
                setFromDate(''); 
                setToDate(''); 
                if (f === 'all') { setSelectedYear(''); setSelectedMonth(''); }
                if (f === 'month' || f === 'today') { setSelectedYear(new Date().getFullYear().toString()); setSelectedMonth(new Date().toLocaleString('en-US', { month: 'long' })); }
              }}
                style={{ padding: '6px 14px', border: dateFilter === f ? 'none' : '1px solid #dde8dd', borderRadius: 8, background: dateFilter === f ? '#1a4731' : '#fff', color: dateFilter === f ? '#fff' : '#1a4731', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {f === 'all' ? 'All' : f === 'today' ? 'Today' : 'This Month'}
              </button>
            ))}
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setDateFilter('custom'); setSelectedMonth(''); setSelectedYear(''); }}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }} />
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setDateFilter('custom'); setSelectedMonth(''); setSelectedYear(''); }}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }} />
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }}>
              <option value="">Year</option>
              {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }}>
              <option value="">Month</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(dateFilter !== 'all' || fromDate || toDate || selectedMonth !== new Date().toLocaleString('en-US', { month: 'long' }) || selectedYear !== new Date().getFullYear().toString()) && (
              <button onClick={() => { setDateFilter('all'); setFromDate(''); setToDate(''); setSelectedMonth(new Date().toLocaleString('en-US', { month: 'long' })); setSelectedYear(new Date().getFullYear().toString()); }}
                style={{ padding: '5px 10px', border: '1px solid #c62828', borderRadius: 8, background: '#fff', color: '#c62828', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                Reset
              </button>
            )}
          </div>
        </div>

        {/* TL Dashboard KPIs */}
        <div className="section-title" style={{ marginTop: 20, marginBottom: 10 }}>TL Dashboard</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'My BT',
              value: myBtPerf ? `₹${(myBtPerf.btAmount || 0).toLocaleString()}` : (fundUsedBT ? `₹${fundUsedBT.toLocaleString()}` : '–'),
              icon: '💰', color: '#1a4731', bg: '#e6f4ea',
              sublabel: myBtPerf
                ? (() => {
                    const gap = (myBtPerf.merchants || []).filter(m => (m.stage3||0) > 0).reduce((s,m) => s+(m.stage3Gap||0), 0);
                    return gap > 0 ? `Gap: ₹${gap.toLocaleString()}` : null;
                  })()
                : null
            },
            { label: 'My RP',
              value: myBtPerf ? `${myBtPerf.rewardPassCount || 0}` : (filteredRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0) || '–'),
              icon: '🏅', color: '#0369a1', bg: '#e0f2fe',
              sublabel: myBtPerf ? `${myBtPerf.passLiveCount || 0} Pass Live` : null
            },
            { label: 'Team BT',
              value: btPerf ? `₹${(btPerf.btAmount || 0).toLocaleString()}` : (filteredTeamRewardPass.reduce((s, r) => s + (r.totalBTAmount || 0), 0) ? `₹${filteredTeamRewardPass.reduce((s, r) => s + (r.totalBTAmount || 0), 0).toLocaleString()}` : '–'),
              icon: '📊', color: '#2e7d32', bg: '#e6f4ea'
            },
            { label: 'Team RP',
              value: btPerf ? `${btPerf.rewardPassCount || 0}` : (filteredTeamRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0) || '–'),
              icon: '🎖️', color: '#6a1b9a', bg: '#f3e8ff'
            },
            { label: 'Team BT Target', value: myTarget?.btTarget ? `₹${myTarget.btTarget.toLocaleString()}` : '–', icon: '🎯', color: '#b45309', bg: '#fef3c7' },
            { label: 'Team RP Target', value: myTarget?.rpTarget || '–', icon: '🎁', color: '#4338ca', bg: '#ede9fe' },
            { label: 'Todays Team BT',
              value: (() => {
                const collMonth = btPerf?.collectionMonth;
                const isMatchingMonth = !selectedMonth || (collMonth && collMonth.toLowerCase() === selectedMonth.toLowerCase());
                if (btPerf && isMatchingMonth) return `₹${(btPerf.todaysBT || 0).toLocaleString()}`;
                return '₹0';
              })(),
              icon: '📈', color: '#0f766e', bg: '#ccfbf1',
              sublabel: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            },
            { label: 'Yesterdays Team BT',
              value: (() => {
                const collMonth = btPerf?.collectionMonth;
                const isMatchingMonth = !selectedMonth || (collMonth && collMonth.toLowerCase() === selectedMonth.toLowerCase());
                if (btPerf && isMatchingMonth) return `₹${(btPerf.yesterdaysBT || 0).toLocaleString()}`;
                return '₹0';
              })(),
              icon: '📉', color: '#6b21a8', bg: '#f3e8ff',
              sublabel: (() => { const y = new Date(); y.setDate(y.getDate()-1); return y.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); })()
            },
            { label: 'Remaining BT', value: myTarget?.btTarget ? `₹${Math.max(0, myTarget.btTarget - (btPerf?.btAmount || filteredTeamRewardPass.reduce((s, r) => s + (r.totalBTAmount || 0), 0))).toLocaleString()}` : '–', icon: '⏳', color: '#c2410c', bg: '#ffedd5' },
            { label: 'Remaining RP', value: myTarget?.rpTarget ? Math.max(0, myTarget.rpTarget - (btPerf?.rewardPassCount || filteredTeamRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0))) : '–', icon: '⌛', color: '#6b21a8', bg: '#f3e8ff' },
          ].map(stat => (
            <div 
              key={stat.label} 
              className="dashboard-kpi-card" 
              onClick={() => setActiveKpi(stat.label)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{stat.icon}</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
                  {stat.sublabel && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>{stat.sublabel}</div>}
                </div>
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

        {/* My Fund Summary */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>💰 Received Fund Summary</div>
        </div>

        {/* Previous month carry-forward banner */}
        {prevMonthData.prevReceived > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: '1.5px solid #a5d6a7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📅 {prevMonthData.prevMonthName} {prevMonthData.prevYear} — Carry Forward
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                Received ₹{prevMonthData.prevReceived.toLocaleString()} · BT ₹{prevMonthData.prevBT.toLocaleString()} · RP {prevMonthData.prevRPCount}×₹2,500 · Sent FSEs ₹{prevMonthData.prevSentFSEs.toLocaleString()} · Used ₹{prevMonthData.prevTotalUsed.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Carry Into {selectedMonth || 'This Month'}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: carryForward >= 0 ? '#1565c0' : '#c62828' }}>
                ₹{carryForward.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Section 1: Received Fund flow — 4 cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: totalFund < 0 ? '#fdecea' : '#e6f4ea', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: `1.5px solid ${totalFund < 0 ? '#c6282830' : '#2e7d3230'}` }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
              {totalFund < 0 ? 'Returned to Admin' : 'Received Fund'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: totalFund < 0 ? '#c62828' : '#2e7d32' }}>₹{totalFund.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>{totalFund < 0 ? 'Net Return' : 'From Admin'}</div>
          </div>
          <div style={{ background: '#e8f5e9', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #43a04730', cursor: 'pointer' }}
            onClick={() => setShowSentDetails(!showSentDetails)}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Sent to FSEs</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#388e3c' }}>₹{sentToFSEs.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>Tap for details ↓</div>
          </div>
          <div style={{ background: '#e0f7fa', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #0097a730' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Fund with TL</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#00695c' }}>₹{fundWithTL.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>Received − Sent</div>
          </div>
          <div style={{ background: myFund < 0 ? '#fdecea' : '#fff8e1', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: `1.5px solid ${myFund < 0 ? '#c6282830' : '#f9a82530'}` }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>My Fund</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: myFund < 0 ? '#c62828' : '#f57f17' }}>₹{myFund.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>{myFund < 0 ? 'Returned excess' : 'Self-Transferred'}</div>
          </div>
        </div>

        {/* Section 2: My Fund Usage */}
        <div className="section-title" style={{ marginBottom: 12 }}>💸 My Fund Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 8 }}>
          <div style={{ background: '#fff8e1', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #f9a82530' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>My Fund</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f57f17' }}>₹{myFund.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>Self-Transferred</div>
          </div>
          <div style={{ background: '#e8f5e9', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #43a04730' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Carry Forward</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#388e3c' }}>₹{carryForward.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>From {prevMonthData.prevMonthName}</div>
          </div>
          <div style={{ background: '#f1f8e9', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #2e7d3240' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Total Available</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1b5e20' }}>₹{totalAvailable.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>My Fund + Carry</div>
          </div>
          <div style={{ background: '#fff3e0', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #e6510030' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>BT</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#e65100' }}>₹{fundUsedBT.toLocaleString()}</div>
          </div>
          <div style={{ background: '#ede9fe', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #7c3aed30' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>RP</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#7c3aed' }}>₹{fundUsedRP.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: '#888' }}>{totalRPCount} × ₹2,500</div>
          </div>
          <div style={{ background: '#fce4ec', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #c6282830' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>BT Fee (1.5%)</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#c62828' }}>₹{fee.toLocaleString()}</div>
          </div>
          <div style={{ background: '#fff8e1', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #ff980030' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Total Used</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#ff6f00' }}>₹{totalUsed.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>RP + Fee + Withdraw</div>
          </div>
          <div style={{ background: fundLeftWithCarry >= 0 ? '#e3f2fd' : '#fdecea', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: `1.5px solid ${fundLeftWithCarry >= 0 ? '#1565c030' : '#c6282830'}` }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Fund Left</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: fundLeftWithCarry >= 0 ? '#1565c0' : '#c62828' }}>₹{fundLeftWithCarry.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>Available − Used</div>
          </div>
        </div>

        {/* Sent to FSEs Details */}
        {showSentDetails && filteredSentPayments.filter(p => !p.isSelf && p.transferToWhom !== 'Self').length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '12px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1a4731', marginBottom: 8 }}>Sent to FSEs Breakdown:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredSentPayments.filter(p => !p.isSelf && p.transferToWhom !== 'Self').map((p, i) => {
                const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#f8faf9', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a4731' }}>{p.transferTo}</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#888' }}>{p.paymentDoneOn} · {date}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#2e7d32' }}>₹{p.amount?.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobikwik Summary */}
        {(() => {
          const withdrawForms = filteredMyForms.filter(f => f.formType === 'mobikwik-withdraw');
          const totalWithdraw = withdrawForms.reduce((s, f) => s + (f.withdrawAmount || 0), 0);
          const totalFees = Math.round(totalWithdraw * 0.03 * 100) / 100;
          const teamWithdrawForms = filteredTeamForms.filter(f => f.formType === 'mobikwik-withdraw');
          const teamTotalWithdraw = teamWithdrawForms.reduce((s, f) => s + (f.withdrawAmount || 0), 0);
          const teamTotalFees = Math.round(teamTotalWithdraw * 0.03 * 100) / 100;
          return (
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>💸 My Mobikwik Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <div style={{ background: '#ede9fe', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #7c3aed30' }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Withdraw Amount</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#4338ca' }}>₹{totalWithdraw.toLocaleString()}</div>
                </div>
                <div style={{ background: '#fce4ec', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #c6282830' }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Withdraw Fees (3%)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#c62828' }}>₹{totalFees.toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Received Payments List */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4731' }}>Fund Transactions</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{filteredPaymentsForDisplay.length}</div>
            <button onClick={() => document.getElementById('tl-received-payments-list').style.display = document.getElementById('tl-received-payments-list').style.display === 'none' ? 'flex' : 'none'}
              style={{ padding: '3px 10px', border: '1px solid #dde8dd', borderRadius: 8, background: '#fff', fontSize: 11, fontWeight: 600, color: '#1a4731', cursor: 'pointer' }}>
              Hide/Show
            </button>
          </div>
        </div>

        <div id="tl-received-payments-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {filteredPaymentsForDisplay.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No transactions for this period.</p>
          </div>
        ) : (
          filteredPaymentsForDisplay.map((p, i) => {
            const isReturn = (p.amount || 0) < 0;
            return (
              <div key={i} style={{
                background: isReturn ? '#fff5f5' : '#fff',
                borderRadius: 10,
                border: `1px solid ${isReturn ? '#ffcdd2' : '#e8f3ed'}`,
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isReturn ? '#c62828' : '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                    {isReturn ? `↩ Returned to ${p.senderName || 'Admin'}` : '⬇ Received Fund'}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isReturn ? '#c62828' : '#2e7d32' }}>
                    ₹{Math.abs(p.amount || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                    {isReturn ? `${p.transferTo} → ${p.senderName}` : `${p.senderName} → You`} · {p.paymentDoneOn} · {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 8, fontWeight: 700,
                  background: isReturn ? '#fdecea' : '#e6f4ea',
                  color: isReturn ? '#c62828' : '#2e7d32'
                }}>
                  {isReturn ? 'Return' : 'Credit'}
                </span>
              </div>
            );
          })
        )}
        </div>

        {/* Expense History */}
        {filteredExpenses.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e65100' }}>Expenses</div>
              <div style={{ background: '#fff3e0', color: '#e65100', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{filteredExpenses.length}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {filteredExpenses.map((e, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f3ed', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e65100' }}>-₹{e.amount?.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#888' }}>{e.purpose} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Set Target for FSE */}
        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>🎯 Set Target for FSE</div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '16px' }}>
            {targetSuccess && <div style={{ background: '#e6f4ea', color: '#2e7d32', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{targetSuccess}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 2, minWidth: 120 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 4 }}>FSE Name</label>
                <select value={targetFSE} onChange={e => setTargetFSE(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 12 }}>
                  <option value="">Select FSE</option>
                  {fseList.map((fse, i) => <option key={i} value={fse}>{fse}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 4 }}>BT Target (₹)</label>
                <input type="number" value={targetBT} onChange={e => setTargetBT(e.target.value)} placeholder="₹"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 12 }} />
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 4 }}>RP Target</label>
                <input type="number" value={targetRP} onChange={e => setTargetRP(e.target.value)} placeholder="Count"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 12 }} />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 4 }}>Start Date</label>
                <input type="date" value={targetStartDate || ''} onChange={e => setTargetStartDate(e.target.value)}
                  style={{ width: '100%', padding: '7px 8px', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 11 }} />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 4 }}>Deadline</label>
                <input type="date" value={targetEndDate || ''} onChange={e => setTargetEndDate(e.target.value)}
                  style={{ width: '100%', padding: '7px 8px', border: '1.5px solid #dde8dd', borderRadius: 8, fontSize: 11 }} />
              </div>
              <button disabled={targetSaving || !targetFSE || !targetBT || !targetRP}
                onClick={async () => {
                  setTargetSaving(true); setTargetSuccess('');
                  try {
                    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
                    const currentYear = new Date().getFullYear();
                    const res = await fetch(`${PROFILE_API_BASE}/api/tl/tidebt-set-fse-target`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                      body: JSON.stringify({ targetFor: targetFSE, btTarget: targetBT, rpTarget: targetRP, month: currentMonth, year: currentYear, startDate: targetStartDate || null, endDate: targetEndDate || null })
                    });
                    if (res.ok) {
                      setTargetSuccess(`✓ Target set for ${targetFSE}`);
                      setTargetFSE(''); setTargetBT(''); setTargetRP('');
                      setTargetStartDate(''); setTargetEndDate('');
                      // Refresh targets list
                      fetch(`${PROFILE_API_BASE}/api/tl/tidebt-fse-targets`, { headers: { Authorization: 'Bearer ' + token } })
                        .then(r => r.json()).then(data => setFseTargets(data.targets || [])).catch(() => {});
                    }
                  } catch (err) { console.error(err); }
                  finally { setTargetSaving(false); }
                }}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#1a4731', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (!targetFSE || !targetBT || !targetRP) ? 0.5 : 1 }}>
                {targetSaving ? '...' : 'Set'}
              </button>
            </div>
            {/* FSE Targets Table */}
            {filteredFseTargets.length > 0 && (
              <div style={{ marginTop: 14, borderTop: '1px solid #e8f3ed', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a4731', marginBottom: 8 }}>Targets Set by You:</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#888' }}>FSE</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#888' }}>BT Target</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#888' }}>RP Target</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#888' }}>Month</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#888' }}>Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFseTargets.map((t, i) => {
                        const dl = t.endDate ? Math.ceil((new Date(t.endDate) - new Date()) / (1000*60*60*24)) : null;
                        const isAdminSet = !t.setByRole || t.setByRole === 'Admin';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                              {t.targetFor}
                              {isAdminSet && <span style={{ marginLeft: 4, fontSize: 9, color: '#9e9e9e' }}>🔒 Admin</span>}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#e65100' }}>₹{t.btTarget?.toLocaleString()}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{t.rpTarget}</td>
                            <td style={{ padding: '6px 10px', color: '#888' }}>{t.month} {t.year}</td>
                            <td style={{ padding: '6px 10px' }}>
                              {t.endDate ? (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                                  background: dl < 0 ? '#fee2e2' : dl <= 3 ? '#fff3e0' : '#e8f5e9',
                                  color: dl < 0 ? '#b91c1c' : dl <= 3 ? '#e65100' : '#1a4731'
                                }}>
                                  {new Date(t.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  {dl !== null && ` (${dl < 0 ? 'Expired' : dl === 0 ? 'Today' : `${dl}d`})`}
                                </span>
                              ) : '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Team Fund Tracker */}
        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>📊 Team Fund Tracker</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {selectedMonth && (
                <span style={{ fontSize: 10, color: '#1a4731', background: '#d8f3dc', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                  {selectedMonth} {selectedYear}
                </span>
              )}
              <button onClick={() => setShowFundTracker(!showFundTracker)} style={{ padding: '5px 12px', border: '1.5px solid #1a4731', background: showFundTracker ? '#1a4731' : '#fff', color: showFundTracker ? '#fff' : '#1a4731', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                {showFundTracker ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showFundTracker && (teamFundTracker.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No FSE fund data yet.</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#f5faf7' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#1a4731', borderBottom: '2px solid #e8f3ed' }}>FSE</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#2e7d32', borderBottom: '2px solid #e8f3ed' }}>Recd</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#388e3c', borderBottom: '2px solid #e8f3ed' }}>Carry</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#1b5e20', borderBottom: '2px solid #e8f3ed' }}>Avail</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#e65100', borderBottom: '2px solid #e8f3ed' }}>BT</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#0369a1', borderBottom: '2px solid #e8f3ed' }}>RP#</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#7c3aed', borderBottom: '2px solid #e8f3ed' }}>RP</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#c62828', borderBottom: '2px solid #e8f3ed' }}>Fee</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#4338ca', borderBottom: '2px solid #e8f3ed' }}>MKW</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#880e4f', borderBottom: '2px solid #e8f3ed' }}>WFee</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#1565c0', borderBottom: '2px solid #e8f3ed' }}>Left</th>
                  </tr>
                </thead>
                <tbody>
                  {teamFundTracker.map((fse, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafcfa' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1a4731', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fse.fseName}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#2e7d32' }}>₹{fse.received?.toLocaleString()}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#388e3c' }}>₹{(fse.carryForward || 0).toLocaleString()}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#1b5e20' }}>₹{(fse.totalAvailable || fse.received || 0).toLocaleString()}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#e65100' }}>₹{fse.usedBT?.toLocaleString()}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#0369a1' }}>{fse.rpCount || 0}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>₹{fse.usedRP?.toLocaleString()}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#c62828' }}>₹{fse.fee?.toLocaleString()}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#4338ca' }}>₹{fse.withdrawAmount?.toLocaleString() || 0}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700, color: '#880e4f' }}>₹{fse.withdrawFee?.toLocaleString() || 0}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 800, color: fse.fundLeft >= 0 ? '#1565c0' : '#c62828' }}>
                        ₹{fse.fundLeft?.toLocaleString()}
                        {fse.fundLeft < 0 && <div style={{ fontSize: 7, color: '#c62828', fontWeight: 400 }}>BT done, fund pending</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* My Forms & Team Forms - Tabbed */}
        {(() => {
          const teamOnboard = filteredTeamForms.filter(f => f.formType === 'daily-visit' || !f.formType);
          const teamWithdraw = filteredTeamForms.filter(f => f.formType === 'mobikwik-withdraw');
          const myOnboard = filteredMyForms.filter(f => f.formType === 'daily-visit' || !f.formType);
          const myWithdraw = filteredMyForms.filter(f => f.formType === 'mobikwik-withdraw');

          // ── Amount range filter ─────────────────────────────────────────
          const AMOUNT_RANGES = [
            { label: 'All Amounts',              value: '' },
            { label: '₹0 – ₹10,000',            value: '0-10000',       min: 0,      max: 10000 },
            { label: '₹10,001 – ₹50,000',        value: '10001-50000',   min: 10001,  max: 50000 },
            { label: '₹50,001 – ₹1,00,000',      value: '50001-100000',  min: 50001,  max: 100000 },
            { label: '₹1,00,001 – ₹1,50,000',    value: '100001-150000', min: 100001, max: 150000 },
            { label: '₹1,50,001 – ₹2,00,000',    value: '150001-200000', min: 150001, max: 200000 },
          ];
          const selectedRange = AMOUNT_RANGES.find(r => r.value === amountRange);

          // BT amount lookup from btPerf (team data)
          const btAmountLookup = {};
          (btPerf?.merchants || []).forEach(m => {
            btAmountLookup[(m.merchantNumber || '').trim()] = m.stage3 || 0;
          });
          const getFormBTAmount = (form) => {
            const num = (form.merchantNumber || '').trim();
            // Priority: btPerf lookup → totalBTAmount on form → withdrawAmountInclFee → withdrawAmount
            if (btAmountLookup[num] !== undefined) return btAmountLookup[num];
            if (form.totalBTAmount) return form.totalBTAmount;
            if (form.withdrawAmountInclFee && !isNaN(Number(form.withdrawAmountInclFee))) return Number(form.withdrawAmountInclFee);
            return form.withdrawAmount || 0;
          };
          const applyAmountFilter = (forms) => {
            // 'All Amounts' — no range selected, return everything
            if (!amountRange || !selectedRange) return forms;
            return forms.filter(f => {
              const amt = getFormBTAmount(f);
              return amt >= selectedRange.min && amt <= selectedRange.max;
            });
          };

          const teamOnboardFiltered = applyAmountFilter(teamOnboard);
          const myOnboardFiltered   = applyAmountFilter(myOnboard);

          // Excel serial date converter (BT_TL_CONNECT stores dates as Excel serial numbers)
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

          // ── Per-merchant BT/RP/Live data from btPerf ─────────────────────
          const btMerchantMap = {};      // keyed by merchantNumber
          const btMerchantByName = {};   // keyed by lead name (fallback)
          (btPerf?.merchants || []).forEach(m => {
            const num  = (m.merchantNumber || '').trim();
            const name = (m.lead || '').trim().toLowerCase();
            if (num)  btMerchantMap[num]     = m;
            if (name) btMerchantByName[name] = m;
          });

          // Derive actual onboarding stage from btPerf data
          const getActualStage = (form) => {
            const num  = (form.merchantNumber || '').trim();
            const name = (form.merchantName  || '').trim().toLowerCase();
            // Primary: number lookup; Fallback: name lookup
            const m = btMerchantMap[num] || btMerchantByName[name] || null;
            if (!m) return { label: form.merchantOpinion || 'Ready For Onboarding', color: '#888', bg: '#f0f0f0', icon: '📋', btAmt: 0, rpCount: 0, passLive: '–', btGap: 0, upiTxn: 0 };
            // Normalize — BT collection stores numbers as strings
            const stage3  = parseFloat(m.stage3)      || 0;
            const stage3Gap = parseFloat(m.stage3Gap) || 0;
            const upiTxn  = parseFloat(m.upiTxnCount) || 0;
            const passLive = (m.passLive || '').toLowerCase() === 'live';
            const rpActive = (m.rewardPassPro || '').toLowerCase() === 'active';
            const btDone   = stage3 > 0;
            let label, color, bg, icon;
            if (passLive)       { label = 'RP Live 🎉'; color = '#2e7d32'; bg = '#e6f4ea'; icon = '🟢'; }
            else if (rpActive)  { label = 'RP Active';  color = '#0369a1'; bg = '#e0f2fe'; icon = '🔵'; }
            else if (btDone)    { label = 'BT Done';    color = '#e65100'; bg = '#fff3e0'; icon = '🟠'; }
            else                { label = 'Ready';      color = '#6b21a8'; bg = '#f3e8ff'; icon = '🟣'; }
            return {
              label, color, bg, icon,
              btAmt:   stage3,
              rpCount: rpActive ? 1 : 0,
              passLive: m.passLive || '–',
              btGap:   stage3Gap,
              upiTxn,
              upiAmount: parseFloat(m.withdrawAmount) || 0,
              upiActive:    m.upiActive || '–',
              priorityPass: m.priorityPassStatus || '–',
              msmegst:      m.msmegstStatus || '–',
              insurance:    m.insuranceStatus || '–',
              rpActiveDate: fmtExcelDate(m.rewardsPassProActiveDate),
              partnerName:  m.partnerName || form.merchantName || '–',
            };
          };

          const AmountFilterBar = ({ activeTab, totalCount, filteredCount }) => (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>BT Amount:</span>
              <select value={amountRange} onChange={e => setAmountRange(e.target.value)}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #dde8dd', background: '#fff', color: '#1a4731', fontWeight: 600 }}>
                {AMOUNT_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {amountRange && (
                <>
                  <button onClick={() => setAmountRange('')}
                    style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #c62828', borderRadius: 8, background: '#fff', color: '#c62828', cursor: 'pointer', fontWeight: 700 }}>
                    ✕
                  </button>
                  <span style={{ fontSize: 11, color: '#888' }}>{filteredCount} of {totalCount}</span>
                </>
              )}
            </div>
          );

          return (
            <>
              <div className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>My Forms</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 12, borderBottom: '2px solid #e8f3ed' }}>
                {[
                  { key: 'my-onboard', label: 'Onboard', count: myOnboardFiltered.length },
                  { key: 'my-withdraw', label: 'Mobikwik', count: myWithdraw.length },
                  { key: 'my-payments', label: 'BT Pay', count: filteredSentPayments.length },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setFormTab(tab.key)}
                    style={{ padding: '6px 4px', border: 'none', background: formTab === tab.key ? '#1a4731' : 'transparent', color: formTab === tab.key ? '#fff' : '#1a4731', fontWeight: 700, fontSize: 9, cursor: 'pointer', borderRadius: '8px 8px 0 0', textAlign: 'center' }}>
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {formTab === 'my-onboard' && (
                <>
                  {myOnboardFiltered.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No onboarding forms.</p></div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {myOnboardFiltered.map((form, i) => {
                        const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                        const isExpanded = expandedMyForm === (form._id || i);
                        const status = form.onboardingStatus || form.merchantOpinion || 'Submitted';
                        const statusColors = {
                          'Ready For Onboarding': { bg: '#ede9fe', color: '#6b21a8' },
                          'Completed':            { bg: '#d8f3dc', color: '#1a4731' },
                          'Not Interested':       { bg: '#fee2e2', color: '#b91c1c' },
                          'Need to visit again':  { bg: '#fff3c7', color: '#92400e' },
                        };
                        const sc = statusColors[status] || { bg: '#e8f3ed', color: '#1a4731' };
                        return (
                      <div key={form._id || i} style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpandedMyForm(isExpanded ? null : (form._id || i))}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f3ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏪</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4731', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.merchantName}</div>
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                              📞 {form.merchantNumber}{form.merchantCategory ? ` · ${form.merchantCategory}` : ''}{' · 📅 '}{date}
                            </div>
                          </div>
                          <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{status}</span>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div><b>Merchant:</b> {form.merchantName}</div>
                            <div><b>Phone:</b> {form.merchantNumber}</div>
                            <div><b>Category:</b> {form.merchantCategory || '–'}</div>
                            <div><b>Opinion:</b> {form.merchantOpinion || '–'}</div>
                            <div><b>Status:</b> <span style={{ color: sc.color, fontWeight: 700 }}>{status}</span></div>
                            <div><b>Email:</b> {form.merchantEmailId || '–'}</div>
                            <div><b>Submitted:</b> {date}</div>
                          </div>
                        )}
                      </div>); })}
                  </div>
                  )}
                </>
              )}

              {formTab === 'my-withdraw' && (myWithdraw.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No withdraw forms yet.</p></div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myWithdraw.map((form, i) => { const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); const isExpanded = expandedMyForm === (form._id || `w-${i}`); return (
                    <div key={form._id || i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpandedMyForm(isExpanded ? null : (form._id || `w-${i}`))}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>💸</div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }}>₹{form.withdrawAmount?.toLocaleString() || '–'}</div><div style={{ fontSize: 10, color: '#888' }}>{form.reasonOfWithdraw || '–'} · 📅 {date}</div></div>
                        <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: '#ede9fe', color: '#4338ca' }}>Fees: ₹{form.withdrawFees || 0}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <div><b>Merchant:</b> {form.merchantName}</div>
                          <div><b>Phone:</b> {form.merchantNumber}</div>
                          <div><b>Amount:</b> ₹{form.withdrawAmount?.toLocaleString() || '–'}</div>
                          <div><b>Fees:</b> ₹{form.withdrawFees || 0}</div>
                          <div><b>Reason:</b> {form.reasonOfWithdraw || '–'}</div>
                          <div><b>Txn Date:</b> {form.transactionDate ? new Date(form.transactionDate).toLocaleDateString('en-IN') : '–'}</div>
                          <div><b>Date:</b> {date}</div>
                        </div>
                      )}
                    </div>); })}
                </div>)
              )}



              {formTab === 'my-payments' && (filteredSentPayments.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No payments sent yet.</p></div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredSentPayments.map((p, i) => {
                    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
                    const isExpanded = expandedMyForm === `pay-${i}`;
                    return (
                      <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpandedMyForm(isExpanded ? null : `pay-${i}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e6f4ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>💰</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32' }}>₹{p.amount?.toLocaleString()} → {p.transferTo}</div>
                            <div style={{ fontSize: 10, color: '#888' }}>{p.paymentDoneOn} · 📅 {date}</div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div><b>To:</b> {p.transferTo}</div>
                            <div><b>Amount:</b> ₹{p.amount?.toLocaleString()}</div>
                            <div><b>Payment On:</b> {p.paymentDoneOn || '–'}</div>
                            <div><b>Date:</b> {date}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>)
              )}

              {/* Team Forms */}
              <div className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>Team Forms</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, marginBottom: 12, borderBottom: '2px solid #e8f3ed' }}>
                {[
                  { key: 'team-onboard', label: 'Onboard', count: teamOnboardFiltered.length },
                  { key: 'team-withdraw', label: 'Mobikwik', count: teamWithdraw.length },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setFormTab(tab.key)}
                    style={{ padding: '6px 4px', border: 'none', background: formTab === tab.key ? '#1a4731' : 'transparent', color: formTab === tab.key ? '#fff' : '#1a4731', fontWeight: 700, fontSize: 9, cursor: 'pointer', borderRadius: '8px 8px 0 0', textAlign: 'center' }}>
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {formTab === 'team-onboard' && (
                <>
                  {teamOnboardFiltered.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No team onboarding forms.</p></div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {teamOnboardFiltered.map((form, i) => {
                        const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                        const isExpanded = expandedTeamForm === (form._id || i);
                        const status = form.onboardingStatus || form.merchantOpinion || 'Submitted';
                        const statusColors = {
                          'Ready For Onboarding': { bg: '#ede9fe', color: '#6b21a8' },
                          'Completed':            { bg: '#d8f3dc', color: '#1a4731' },
                          'Not Interested':       { bg: '#fee2e2', color: '#b91c1c' },
                          'Need to visit again':  { bg: '#fff3c7', color: '#92400e' },
                        };
                        const sc = statusColors[status] || { bg: '#e8f3ed', color: '#1a4731' };
                        return (
                        <div key={form._id || i} style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpandedTeamForm(isExpanded ? null : (form._id || i))}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f3ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏪</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4731', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.merchantName}</div>
                              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                                👤 {form.employeeName} · 📞 {form.merchantNumber} · 📅 {date}
                              </div>
                            </div>
                            <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{status}</span>
                          </div>
                          {isExpanded && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              <div><b>FSE:</b> {form.employeeName}</div>
                              <div><b>Merchant:</b> {form.merchantName}</div>
                              <div><b>Phone:</b> {form.merchantNumber}</div>
                              <div><b>Category:</b> {form.merchantCategory || '–'}</div>
                              <div><b>Opinion:</b> {form.merchantOpinion || '–'}</div>
                              <div><b>Status:</b> <span style={{ color: sc.color, fontWeight: 700 }}>{status}</span></div>
                              <div><b>Email:</b> {form.merchantEmailId || '–'}</div>
                              <div><b>Date:</b> {date}</div>
                            </div>
                          )}
                        </div>); })}
                    </div>
                  )}
                </>
              )}

              {formTab === 'team-withdraw' && (teamWithdraw.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No team withdraw forms yet.</p></div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {teamWithdraw.map((form, i) => { const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); const isExpanded = expandedTeamForm === (form._id || `tw-${i}`); return (
                    <div key={form._id || i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpandedTeamForm(isExpanded ? null : (form._id || `tw-${i}`))}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>💸</div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }}>₹{form.withdrawAmount?.toLocaleString() || '–'} · {form.employeeName}</div><div style={{ fontSize: 10, color: '#888' }}>{form.reasonOfWithdraw || '–'} · 📅 {date}</div></div>
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <div><b>FSE:</b> {form.employeeName}</div>
                          <div><b>Merchant:</b> {form.merchantName}</div>
                          <div><b>Phone:</b> {form.merchantNumber}</div>
                          <div><b>Amount:</b> ₹{form.withdrawAmount?.toLocaleString() || '–'}</div>
                          <div><b>Fees:</b> ₹{form.withdrawFees || 0}</div>
                          <div><b>Reason:</b> {form.reasonOfWithdraw || '–'}</div>
                          <div><b>Txn Date:</b> {form.transactionDate ? new Date(form.transactionDate).toLocaleDateString('en-IN') : '–'}</div>
                          <div><b>Date:</b> {date}</div>
                        </div>
                      )}
                    </div>); })}
                </div>)
              )}


            </>
          );
        })()}

      </div>

      {/* ── KPI DETAILS BOTTOM SHEET ── */}
      {activeKpi && (() => {
        const details = getKpiDetails(activeKpi);
        if (!details) return null;
        return (
          <div className="bottom-sheet-overlay" onClick={() => setActiveKpi(null)}>
            <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="bottom-sheet-handle"></div>
              
              <div className="bottom-sheet-header">
                <span className="bottom-sheet-title">{details.title} Details</span>
                <button className="bottom-sheet-close" onClick={() => setActiveKpi(null)}>✕</button>
              </div>
              
              <div className="bottom-sheet-content">
                {/* Highlighted KPI Summary */}
                <div className="kpi-summary-highlight">
                  <div className="kpi-summary-label">{details.title}</div>
                  <div className="kpi-summary-value">{details.totalValue}</div>
                  <div className="kpi-summary-desc">{details.desc}</div>
                </div>

                {details.type === 'my-bt-performance' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px', marginTop: '10px' }}>
                    <div style={{ background: '#f5faf7', border: '1px solid #e8f3ed', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>BT Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a4731', marginTop: '4px' }}>
                        {details.btTarget > 0 ? `₹${details.btTarget.toLocaleString()}` : '–'}
                      </div>
                    </div>
                    <div style={{ background: '#e6f4ea', border: '1px solid #d8f3dc', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#2e7d32', fontWeight: '600', textTransform: 'uppercase' }}>BT Completed</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#2e7d32', marginTop: '4px' }}>
                        ₹{details.btCompleted.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#c2410c', fontWeight: '600', textTransform: 'uppercase' }}>Remaining Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c', marginTop: '4px' }}>
                        {details.btTarget > 0 ? `₹${details.remaining.toLocaleString()}` : '–'}
                      </div>
                    </div>
                    <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '600', textTransform: 'uppercase' }}>Achievement %</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1d4ed8', marginTop: '4px' }}>
                        {details.btTarget > 0 ? `${details.achievement}%` : '–'}
                      </div>
                    </div>
                  </div>
                )}

                {details.type === 'team-performance' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px', marginTop: '10px' }}>
                    <div style={{ background: '#f5faf7', border: '1px solid #e8f3ed', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>Team Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a4731', marginTop: '4px' }}>
                        ₹{(teamPerformance?.teamTarget || 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#e6f4ea', border: '1px solid #d8f3dc', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#2e7d32', fontWeight: '600', textTransform: 'uppercase' }}>BT Completed</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#2e7d32', marginTop: '4px' }}>
                        ₹{(teamPerformance?.btCompleted || 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#c2410c', fontWeight: '600', textTransform: 'uppercase' }}>Remaining Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c', marginTop: '4px' }}>
                        ₹{Math.max(0, (teamPerformance?.teamTarget || 0) - (teamPerformance?.btCompleted || 0)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '600', textTransform: 'uppercase' }}>Achievement %</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1d4ed8', marginTop: '4px' }}>
                        {teamPerformance?.teamTarget > 0 ? Math.round(((teamPerformance?.btCompleted || 0) / teamPerformance.teamTarget) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Items list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
                  {details.items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-light)', fontSize: 13 }}>
                      No data found for the selected period.
                    </div>
                  ) : details.type === 'individual' || details.type === 'my-bt-performance' ? (
                    // Individual detail listing (My BT, My RP daily entries)
                    details.items.map((item, idx) => (
                      <div key={idx} className="sheet-list-item">
                        <div className="sheet-list-left">
                          <div className="sheet-list-title">{item.name}</div>
                          <div className="sheet-list-subtitle">{item.detail}</div>
                        </div>
                        <div className="sheet-list-right">{item.value}</div>
                      </div>
                    ))
                  ) : details.type === 'remaining' ? (
                    // Remaining target representation with progress stats
                    details.items.map((item, idx) => {
                      const avatarInitials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                      const isAchieved = item.percentage >= 100;
                      return (
                        <div key={idx} className="employee-card">
                          <div className="employee-info-row">
                            <div className="employee-profile">
                              <div className="employee-avatar">{avatarInitials}</div>
                              <div>
                                <div className="employee-name">{item.name}</div>
                                <div className="employee-role">Target: {item.targetValue} · Actual: {item.actualValue}</div>
                              </div>
                            </div>
                            <div className="employee-stats">
                              <div className="employee-value" style={{ color: isAchieved ? '#2e7d32' : 'var(--green-dark)' }}>{item.value}</div>
                              <div className="employee-contrib">{item.percentage}% achieved</div>
                            </div>
                          </div>
                          <div className="progress-bar-container">
                            <div 
                              className={`progress-bar-fill ${isAchieved ? 'bg-primary' : details.color}`}
                              style={{ width: `${item.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })
                  ) : details.type === 'team-performance' ? (
                    // Team BT Target details per FSE
                    details.items.map((item, idx) => {
                      const avatarInitials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                      const isAchieved = item.achievement >= 100;
                      return (
                        <div key={idx} className="employee-card">
                          <div className="employee-info-row">
                            <div className="employee-profile">
                              <div className="employee-avatar">{avatarInitials}</div>
                              <div>
                                <div className="employee-name">{item.name}</div>
                                <div className="employee-role">Target: ₹{item.target.toLocaleString()} · Remaining: ₹{item.remaining.toLocaleString()}</div>
                              </div>
                            </div>
                            <div className="employee-stats">
                              <div className="employee-value" style={{ color: isAchieved ? '#2e7d32' : 'var(--green-dark)' }}>₹{item.completed.toLocaleString()}</div>
                              <div className="employee-contrib">{item.achievement}% hit · {item.contribution}% team share</div>
                            </div>
                          </div>
                          <div className="progress-bar-container">
                            <div 
                              className={`progress-bar-fill ${isAchieved ? 'bg-primary' : details.color}`}
                              style={{ width: `${Math.min(100, item.achievement)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Team contribution lists (Team BT, Team RP, targets, todays, yesterdays)
                    details.items.map((item, idx) => {
                      const avatarInitials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                      return (
                        <div key={idx} className="employee-card">
                          <div className="employee-info-row">
                            <div className="employee-profile">
                              <div className="employee-avatar">{avatarInitials}</div>
                              <div>
                                <div className="employee-name">{item.name}</div>
                                <div className="employee-role">Field Sales Executive</div>
                              </div>
                            </div>
                            <div className="employee-stats">
                              <div className="employee-value">{item.value}</div>
                              <div className="employee-contrib">{item.percentage}% team share</div>
                            </div>
                          </div>
                          <div className="progress-bar-container">
                            <div 
                              className={`progress-bar-fill ${details.color}`}
                              style={{ width: `${item.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <Footer />
    </>
  );
}
