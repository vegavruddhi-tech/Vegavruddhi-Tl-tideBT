const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const TeamLead = require('../models/TeamLead');
const TideBTFormResponse = require('../models/TideBTFormResponse');
const verifyToken = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to find the connect collection dynamically based on selectedMonth and selectedYear
const findConnectCollection = async (db, selectedMonth, selectedYear) => {
  // If no month selected — do NOT fall back to latest collection
  // Return null so callers show ₹0 instead of wrong month's data
  if (!selectedMonth) return null;

  const allCollections = (await db.listCollections().toArray()).map(c => c.name);
  
  const monthUpper = selectedMonth.toUpperCase();
  const yearStr = selectedYear ? String(selectedYear) : null;
  const shortYear = yearStr ? yearStr.slice(-2) : null;

  // Month abbreviation map — handles both full names and 3-letter abbreviations
  const MONTH_ABBR = {
    'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
    'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
    'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
  };
  const monthAbbr = MONTH_ABBR[monthUpper] || monthUpper;

  // Search BT_TL_CONNECT first (new format), then TL_CONNECT / tl_connect (old format)
  const btCollections = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
  const tlCollections = allCollections.filter(c => c.toUpperCase().includes('TL_CONNECT') && !c.toUpperCase().startsWith('BT_TL_CONNECT'));
  const candidateCollections = [...btCollections, ...tlCollections];

  const matchesMonth = (cu) => cu.includes(monthUpper) || cu.includes(monthAbbr);

  if (yearStr) {
    const match = candidateCollections.find(c => {
      const cu = c.toUpperCase();
      return matchesMonth(cu) && (cu.includes(yearStr) || cu.includes(shortYear));
    });
    if (match) return match;
  }
  const match = candidateCollections.find(c => matchesMonth(c.toUpperCase()));
  if (match) return match;

  return null;
};

// Helper to normalize the dynamic document format
const normalizeConnectDoc = (r) => {
  if (!r) return null;

  const getVal = (keys) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null) return r[k];
    }
    return undefined;
  };

  const parseNum = (val) => {
    if (val === undefined || val === null || val === '–' || val === '-') return 0;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/,/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const getStr = (keys, fallback = '–') => {
    const val = getVal(keys);
    if (val === undefined || val === null) return fallback;
    return String(val).trim() || fallback;
  };

  const stage3    = parseNum(getVal(['stage3', 'stage_3', 'Stage-3', 'Stage_3']));
  const stage3Gap = parseNum(getVal(['stage3Gap', 'stage_3_gap', 'Stage-3_GAP', 'Stage_3_GAP', 'stage3_gap']));
  const todaysStage3 = parseNum(getVal(['todaysStage3', 'today_s_stage_3', "Today's_Stage-3", "Today's_Stage_3", 'todaysStage_3', 'today_s_stage3']));
  const yesterdaysStage3 = parseNum(getVal(['yesterdaysStage3', 'yesterday_s_stage_3', "Yesterday's_Stage-3", "Yesterday's_Stage_3", 'yesterdaysStage_3', 'yesterday_s_stage3']));
  
  const upiActive = getStr(['upiActive', 'upi_active', 'UPI_Active']);
  const upiGap    = getStr(['upiGap', 'upi_gap', 'UPI_Gap']);
  const upiTxnCount = parseNum(getVal(['upiTxnCount', 'upi_txn_count', 'Upi_Txn_Count', 'upi_txns', 'upiTxns']));
  
  const passLive = getStr(['passLive', 'pass_live', 'Pass_Live']);
  const rewardPassPro = getStr(['rewardPassPro', 'reward_pass_pro', 'Reward_Pass_Pro', 'priorityPassPro', 'priority_pass_pro', 'priorityPass', 'priority_pass']);
  const rewardsPassProActiveDate = getStr(['rewardsPassProActiveDate', 'rewards_pass_pro_active_date', 'Rewards_Pass_Pro_Active_Date', 'priority_pass_active_date', 'priority_pass_pro_active_date']);
  
  const withdrawAmount = parseNum(getVal(['withdrawAmount', 'withdraw_amount', 'UPI_Amount', 'upi_amount', 'upiAmount']));

  return {
    merchantNumber: r.merchantNumber || r.Number || r.mobile_no_ || r.phone || r.Mobile_No_ || '',
    lead: r.lead || r.Lead || '–',
    stage3,
    stage3Gap,
    todaysStage3,
    yesterdaysStage3,
    upiActive,
    upiGap,
    upiTxnCount,
    passLive,
    rewardPassPro,
    rewardsPassProActiveDate,
    withdrawAmount,
    priorityPassStatus: getStr(['priorityPassStatus', 'Priority_Pass_Status', 'priority_pass_status']),
    msmegstStatus: getStr(['msmegstStatus', 'MSME/GST_Status', 'msmegst_status', 'MSME_GST_Status']),
    insuranceStatus: getStr(['insuranceStatus', 'Insurance_Status', 'insurance_status']),
    createdAt: r.createdAt || r._synced_at || r._syncedAt || null
  };
};

// POST /api/tl/google-login
router.post('/google-login', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential required' });

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleEmail = payload.email.toLowerCase();

    // Find TL by email (check both email and emailId)
    const tl = await TeamLead.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${googleEmail}$`, 'i') } },
        { emailId: { $regex: new RegExp(`^${googleEmail}$`, 'i') } }
      ]
    });

    if (!tl) {
      return res.status(404).json({
        message: 'No registered Team Lead found with this Google account.'
      });
    }

    if (tl.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Your account is not approved yet.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: tl._id, email: tl.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, user: tl });
  } catch (err) {
    console.error('Google login error:', err.message);
    res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }
});

// GET /api/tl/profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('-password');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });
    res.json(tl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-fses - Get FSEs under this TL with TideBT access
router.get('/tidebt-fses', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });

    const db = mongoose.connection.db;
    const TideBTAccess = db.collection('TideBT_Access');

    const tlName = tl.name.trim();

    // Exact match on tlName only — no firstWord fallback to prevent
    // cross-TL contamination (e.g. "Niteesh" TL picking up "Niteesh Kumar Saroj" FSE data)
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let records = await TideBTAccess.find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();

    // Fallback: if no records found with full name, try first word
    // (handles cases where tlName in DB is stored as short name e.g. "Ashwani")
    if (records.length === 0) {
      const firstWord = tlName.split(' ')[0];
      records = await TideBTAccess.find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }).toArray();
    }

    // Return unique FSE names
    const fseNames = [...new Set(records.map(r => r.fseName).filter(Boolean))];

    res.json({ fses: fseNames });
  } catch (err) {
    console.error('TideBT FSEs error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-team-forms - Get all form responses from FSEs under this TL
router.get('/tidebt-team-forms', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });

    const db = mongoose.connection.db;
    const TideBTAccess = db.collection('TideBT_Access');

    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let records = await TideBTAccess.find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    }).toArray();
    if (records.length === 0) {
      const firstWord = tlName.split(' ')[0];
      records = await TideBTAccess.find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') }
      }).toArray();
    }

    const fseNames = [...new Set(records.map(r => r.fseName).filter(Boolean))];

    if (fseNames.length === 0) {
      return res.json([]);
    }

    // Query both TideBT Form Responses and TideBT_Mobikwik where employeeName is in FSE names
    const onboardForms = await TideBTFormResponse.find({
      employeeName: { $in: fseNames.map(name => new RegExp(`^${name}$`, 'i')) }
    }).lean();

    const mobikwikForms = await db.collection('TideBT_Mobikwik').find({
      employeeName: { $in: fseNames.map(name => new RegExp(`^${name}$`, 'i')) }
    }).toArray();

    const allForms = [...onboardForms, ...mobikwikForms].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(allForms);
  } catch (err) {
    console.error('TideBT team forms error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/bt-payment - Save a BT payment
router.post('/bt-payment', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });

    const { transferToWhom, transferTo, amount, paymentDoneOn } = req.body;

    const db = mongoose.connection.db;
    const TideBTPayments = db.collection('TideBT_Payments');

    const payment = {
      transferToWhom,
      senderName: tl.name,
      transferTo,
      amount: Number(amount),
      paymentDoneOn,
      source: 'tl-panel',
      createdAt: new Date()
    };

    await TideBTPayments.insertOne(payment);

    res.status(201).json({ message: 'Payment recorded successfully', payment });
  } catch (err) {
    console.error('BT Payment error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-received-payments - Get payments received by this TL
router.get('/tidebt-received-payments', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email emailId');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });

    const db = mongoose.connection.db;
    const TideBTPayments = db.collection('TideBT_Payments');
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build name set — all variations of TL's name that may appear in transferTo:
    // 1. TL's short name from TeamLeads DB (e.g. "Niteesh")
    // 2. TL's full name as stored in TideBT_Access fseName (e.g. "Niteesh Kumar Saroj") — TLs can also be FSEs
    // 3. tlName from TideBT_Access records under this TL
    const nameSet = new Set([tlName]);

    // Get all TideBT_Access records where tlName matches — to find short tlName
    let accessRecords = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();
    if (accessRecords.length === 0) {
      const firstWord = tlName.split(' ')[0];
      accessRecords = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }).toArray();
    }
    accessRecords.forEach(r => { if (r.tlName) nameSet.add(r.tlName.trim()); });

    // Also check if TL appears as an FSE in TideBT_Access (fseName field)
    // e.g. TL "Niteesh" may have fseName "Niteesh Kumar Saroj" 
    const fseAccessRecords = await db.collection('TideBT_Access').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*`, 'i') }
    }).toArray();
    fseAccessRecords.forEach(r => { if (r.fseName) nameSet.add(r.fseName.trim()); });

    // Also add email-based lookup from Employees collection (handles name mismatches)
    const tlEmail = (tl.email || tl.emailId || '').trim();
    if (tlEmail) {
      const empRecord = await db.collection('Employees').findOne({
        $or: [
          { email: { $regex: new RegExp(`^${escape(tlEmail)}$`, 'i') } },
          { newJoinerEmailId: { $regex: new RegExp(`^${escape(tlEmail)}$`, 'i') } }
        ]
      });
      if (empRecord?.newJoinerName) nameSet.add(empRecord.newJoinerName.trim());
    }

    const nameArray = [...nameSet];
    const payments = await TideBTPayments.find({
      $or: nameArray.map(n => ({
        transferTo: { $regex: new RegExp(`^\\s*${escape(n)}\\s*$`, 'i') }
      }))
    }).sort({ createdAt: -1 }).toArray();

    const normalizedPayments = payments.map(p => ({ ...p, createdAt: p.createdAt || null }));
    console.log(`[TL Payments] TL: "${tlName}", names searched: ${JSON.stringify(nameArray)}, found: ${payments.length}`);

    res.json(normalizedPayments);
  } catch (err) {
    console.error('Received payments error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/check-tidebt-access - Check if TL has TideBT access
router.get('/check-tidebt-access', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });

    const db = mongoose.connection.db;
    const TideBTAccess = db.collection('TideBT_Access');

    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Exact match first — no firstWord fallback to prevent cross-TL contamination
    let accessRecord = await TideBTAccess.findOne({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    });
    if (!accessRecord) {
      const firstWord = tlName.split(' ')[0];
      accessRecord = await TideBTAccess.findOne({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      });
    }

    if (accessRecord) {
      return res.json({ hasAccess: true, record: accessRecord });
    }

    res.json({ hasAccess: false });
  } catch (err) {
    console.error('Check TideBT access error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/auto-logout
router.post('/auto-logout', verifyToken, async (req, res) => {
  res.json({ success: true, message: 'Auto logged out successfully' });
});

// GET /api/tl/tidebt-my-forms - TL gets their own submitted forms
router.get('/tidebt-my-forms', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('email name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // TideBT_Mobikwik documents were bulk-imported without a submittedBy field —
    // they only have employeeName. Match by both submittedBy (new submissions) AND
    // employeeName (existing/imported records) to cover all cases.
    const onboardForms = await TideBTFormResponse.find({
      $or: [
        { submittedBy: tl._id },
        { employeeName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') } }
      ]
    }).lean();

    const mobikwikForms = await db.collection('TideBT_Mobikwik').find({
      $or: [
        { submittedBy: tl._id },
        { employeeName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') } }
      ]
    }).toArray();

    const allForms = [...onboardForms, ...mobikwikForms].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(allForms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/tidebt-daily-visit - TL submits a daily visit form
router.post('/tidebt-daily-visit', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { merchantName, merchantNumber, merchantOpinion, merchantCategory, onboardingStatus, merchantEmailId } = req.body;

    if (!/^\d{10}$/.test(merchantNumber)) {
      return res.status(400).json({ message: 'Merchant Mobile Number must be exactly 10 digits.' });
    }

    const formResponse = await TideBTFormResponse.create({
      submittedBy: tl._id,
      employeeName: tl.name,
      employeeEmail: tl.email,
      formType: 'daily-visit',
      merchantName,
      merchantNumber,
      merchantOpinion,
      merchantCategory,
      onboardingStatus,
      merchantEmailId
    });

    res.status(201).json({ message: 'Daily visit form submitted', form: formResponse });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/tidebt-reward-pass - TL submits reward pass form
router.post('/tidebt-reward-pass', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { dateOfWorking, workingUpdate, totalBTAmount, totalRPCount } = req.body;
    if (!dateOfWorking || !workingUpdate || !totalBTAmount || !totalRPCount) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const db = mongoose.connection.db;
    await db.collection('TideBT_RewardPass').insertOne({
      employeeName: tl.name,
      employeeEmail: tl.email,
      employeeId: tl._id,
      role: 'TL',
      dateOfWorking,
      workingUpdate,
      totalBTAmount: parseFloat(totalBTAmount),
      totalRPCount: parseInt(totalRPCount),
      createdAt: new Date()
    });

    res.json({ success: true, message: 'Reward Pass form submitted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-my-target - TL gets their target (sum of all targets for this month)
router.get('/tidebt-my-target', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const { month, year } = req.query;
    const query = { targetFor: { $regex: new RegExp(tl.name.trim(), 'i') } };
    if (month) query.month = month;
    if (year) query.year = parseInt(year);

    // Get ALL targets and sum them
    const targets = await db.collection('TideBT_Targets').find(query).toArray();
    
    if (targets.length === 0) return res.json({ success: true, target: null });

    const target = {
      btTarget: targets.reduce((sum, t) => sum + (t.btTarget || 0), 0),
      rpTarget: targets.reduce((sum, t) => sum + (t.rpTarget || 0), 0),
      month: month || targets[0].month,
      year: year || targets[0].year
    };

    res.json({ success: true, target });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-team-performance - Get team performance details
router.get('/tidebt-team-performance', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Get FSE names under this TL
    let records = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();
    if (records.length === 0) {
      const firstWord = tlName.split(' ')[0];
      records = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }).toArray();
    }
    const fseNames = [...new Set(records.map(r => r.fseName).filter(Boolean))];

    const selectedMonth = req.query.selectedMonth || req.query.month;
    const selectedYear = req.query.selectedYear || req.query.year;

    // Fetch TL target (Team Target)
    const tlTargetQuery = {
      targetFor: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    };
    if (selectedMonth) tlTargetQuery.month = selectedMonth;
    if (selectedYear) tlTargetQuery.year = parseInt(selectedYear);

    const tlTargets = await db.collection('TideBT_Targets').find(tlTargetQuery).toArray();
    const teamTarget = tlTargets.reduce((sum, t) => sum + (t.btTarget || 0), 0);

    // Fetch FSE targets
    const fseTargetQuery = {
      targetFor: { $in: fseNames.map(name => new RegExp(`^\\s*${escape(name.trim())}\\s*$`, 'i')) }
    };
    if (selectedMonth) fseTargetQuery.month = selectedMonth;
    if (selectedYear) fseTargetQuery.year = parseInt(selectedYear);

    const fseTargetsList = await db.collection('TideBT_Targets').find(fseTargetQuery).toArray();

    // Fetch BT Completed for all FSEs from BT_TL_CONNECT collection for selected month
    const btCollectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    // Get all merchants from bt_master for all FSEs
    const allMasterDocs = fseNames.length > 0 ? await db.collection('bt_master').find({
      $or: fseNames.map(n => ({
        fseName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') }
      }))
    }).toArray() : [];

    // Group merchant numbers by FSE
    const fseMerchantNums = {};
    fseNames.forEach(n => { fseMerchantNums[n] = []; });
    allMasterDocs.forEach(m => {
      const num = (m.merchantNumber || '').trim();
      if (!num) return;
      const matchedFSE = fseNames.find(n =>
        new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i').test(m.fseName || '')
      );
      if (matchedFSE) fseMerchantNums[matchedFSE].push(num);
    });

    const btLookup = {};
    if (btCollectionName) {
      const allNums = [...new Set(Object.values(fseMerchantNums).flat())];
      if (allNums.length > 0) {
        const btDocs = await db.collection(btCollectionName).find({
          merchantNumber: { $in: allNums }
        }).toArray();
        btDocs.forEach(r => {
          const norm = normalizeConnectDoc(r);
          if (norm) btLookup[norm.merchantNumber.trim()] = norm;
        });
      }
    }

    // Aggregate BT Completed per FSE
    let teamBtCompleted = 0;
    const fseData = fseNames.map(name => {
      const merchantNums = fseMerchantNums[name] || [];
      let usedBT = 0;
      merchantNums.forEach(num => {
        const norm = btLookup[num];
        if (norm) usedBT += norm.stage3 || 0;
      });
      teamBtCompleted += usedBT;

      // target
      const matchTargets = fseTargetsList.filter(t => new RegExp(`^\\s*${escape(name.trim())}\\s*$`, 'i').test(t.targetFor || ''));
      const targetVal = matchTargets.reduce((sum, t) => sum + (t.btTarget || 0), 0);

      return {
        fseName: name,
        btCompleted: usedBT,
        btTarget: targetVal
      };
    });

    res.json({
      success: true,
      teamTarget,
      btCompleted: teamBtCompleted,
      fseData
    });
  } catch (err) {
    console.error('TL team performance error:', err.message);
    res.status(500).json({ message: err.message });
  }
});


// POST /api/tl/tidebt-mobikwik-withdraw - TL submits mobikwik withdraw form
router.post('/tidebt-mobikwik-withdraw', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { merchantName, merchantNumber, transactionDate, withdrawAmount, withdrawFees, reasonOfWithdraw } = req.body;

    if (!/^\d{10}$/.test(merchantNumber)) {
      return res.status(400).json({ message: 'Merchant Mobile Number must be exactly 10 digits.' });
    }

    const db = mongoose.connection.db;
    const doc = {
      submittedBy: tl._id,
      employeeName: tl.name,
      employeeEmail: tl.email,
      formType: 'mobikwik-withdraw',
      merchantName,
      merchantNumber,
      transactionDate: transactionDate ? new Date(transactionDate) : null,
      withdrawAmount: parseFloat(withdrawAmount) || 0,
      withdrawFees: parseFloat(withdrawFees) || 0,
      reasonOfWithdraw,
      createdAt: new Date()
    };

    await db.collection('TideBT_Mobikwik').insertOne(doc);

    res.status(201).json({ message: 'Mobikwik withdraw form submitted', form: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-sent-payments - Get payments sent by this TL to FSEs
router.get('/tidebt-sent-payments', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email emailId');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build all name variations for this TL (same logic as received-payments)
    const tlNameSet = new Set([tlName]);
    let accessRecs = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    }).toArray();
    if (accessRecs.length === 0) {
      const fw = tlName.split(' ')[0];
      accessRecs = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(fw)}\\s*$`, 'i') }
      }).toArray();
    }
    accessRecs.forEach(r => { if (r.tlName) tlNameSet.add(r.tlName.trim()); });
    const fseRecs = await db.collection('TideBT_Access').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*`, 'i') }
    }).toArray();
    fseRecs.forEach(r => { if (r.fseName) tlNameSet.add(r.fseName.trim()); });
    const tlEmail = (tl.email || tl.emailId || '').trim();
    if (tlEmail) {
      const emp = await db.collection('Employees').findOne({
        $or: [
          { email: { $regex: new RegExp(`^${escape(tlEmail)}$`, 'i') } },
          { newJoinerEmailId: { $regex: new RegExp(`^${escape(tlEmail)}$`, 'i') } }
        ]
      });
      if (emp?.newJoinerName) tlNameSet.add(emp.newJoinerName.trim());
    }
    const tlNamesArray = [...tlNameSet];

    const payments = await db.collection('TideBT_Payments')
      .find({ senderName: { $regex: new RegExp(escape(tlName), 'i') } })
      .sort({ createdAt: -1 })
      .toArray();

    // Mark each payment as Self or FSE based on transferTo matching TL's own names
    const enriched = payments.map(p => {
      const transferTo = (p.transferTo || '').trim();
      const isSelf = tlNamesArray.some(n =>
        new RegExp(`^\\s*${escape(n)}\\s*$`, 'i').test(transferTo)
      ) || p.transferToWhom === 'Self';
      return {
        ...p,
        isSelf,
        transferToWhom: p.transferToWhom || (isSelf ? 'Self' : 'FSE Ground Team')
      };
    });

    res.json({ success: true, payments: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-team-fund-tracker - Get fund usage per FSE under this TL
// Uses BT_TL_CONNECT (selected month) as BT/RP source — TideBT_RewardPass is empty
router.get('/tidebt-team-fund-tracker', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Get FSE names under this TL
    let records = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();
    if (records.length === 0) {
      const firstWord = tlName.split(' ')[0];
      records = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }).toArray();
    }
    const fseNames = [...new Set(records.map(r => r.fseName).filter(Boolean))];

    const { dateFilter, fromDate, toDate, selectedYear, selectedMonth } = req.query;
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const filterByDate = (items, dateField = 'createdAt') => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return items.filter(item => {
        if (!item[dateField]) return false;
        const d = new Date(item[dateField]);
        if (isNaN(d.getTime())) return false;
        if (dateFilter === 'today')  return d >= today && d < new Date(today.getTime() + 86400000);
        if (dateFilter === 'month')  return d >= monthStart && d <= monthEnd;
        if (dateFilter === 'custom') {
          if (fromDate) { const f = new Date(fromDate); if (!isNaN(f) && d < f) return false; }
          if (toDate)   { const t = new Date(toDate + 'T23:59:59'); if (!isNaN(t) && d > t) return false; }
          return true;
        }
        if (selectedYear  && d.getFullYear() !== parseInt(selectedYear)) return false;
        if (selectedMonth && MONTHS[d.getMonth()] !== selectedMonth) return false;
        return true;
      });
    };

    // Get BT_TL_CONNECT collection for selected month
    const btCollectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    // Get all merchants from bt_master per FSE
    const allMasterDocs = fseNames.length > 0 ? await db.collection('bt_master').find({
      $or: fseNames.map(n => ({
        fseName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') }
      }))
    }).toArray() : [];

    // Group merchant numbers by FSE
    const fseMerchantNums = {};
    fseNames.forEach(n => { fseMerchantNums[n] = []; });
    allMasterDocs.forEach(m => {
      const num = (m.merchantNumber || '').trim();
      if (!num) return;
      const matchedFSE = fseNames.find(n =>
        new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i').test(m.fseName || '')
      );
      if (matchedFSE) fseMerchantNums[matchedFSE].push(num);
    });

    // Get BT data from BT_TL_CONNECT for all merchants
    const btLookup = {};
    if (btCollectionName) {
      const allNums = [...new Set(Object.values(fseMerchantNums).flat())];
      if (allNums.length > 0) {
        const btDocs = await db.collection(btCollectionName).find({
          merchantNumber: { $in: allNums }
        }).toArray();
        btDocs.forEach(r => {
          const norm = normalizeConnectDoc(r);
          if (norm) btLookup[norm.merchantNumber.trim()] = norm;
        });
      }
    }

    // Get payments (received by FSEs) and withdraw forms
    const allPayments = await db.collection('TideBT_Payments').find({}).toArray();
    let payments = allPayments;
    let withdrawForms = await db.collection('TideBT_Mobikwik')
      .find({ formType: 'mobikwik-withdraw' }).toArray();

    if (dateFilter || selectedYear || selectedMonth) {
      withdrawForms = filterByDate(withdrawForms, 'createdAt');
      payments      = filterByDate(allPayments, 'createdAt');
    }

    // ── Cumulative carry-forward per FSE for all months before selectedMonth ──
    const allCollections = (await db.listCollections().toArray()).map(c => c.name);
    const MONTH_ABBR_MAP = {
      'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
      'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
      'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
    };
    const findBTCol = (monthName, yearStr) => {
      const mu = monthName.toUpperCase();
      const abbr = MONTH_ABBR_MAP[mu] || mu;
      const sy = yearStr ? yearStr.slice(-2) : null;
      const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const tlCols = allCollections.filter(c => c.toUpperCase().includes('TL_CONNECT') && !c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const candidates = [...btCols, ...tlCols];
      const mm = cu => cu.includes(mu) || cu.includes(abbr);
      if (yearStr) { const m = candidates.find(c => { const cu = c.toUpperCase(); return mm(cu) && (cu.includes(yearStr) || (sy && cu.includes(sy))); }); if (m) return m; }
      return candidates.find(c => mm(c.toUpperCase())) || null;
    };

    const fseCarryMap = {}; // fseName.toLowerCase() → cumulative carry
    if (selectedMonth && selectedYear) {
      const curYear     = parseInt(selectedYear);
      const curMonthIdx = MONTHS.indexOf(selectedMonth);
      if (curMonthIdx > 0) {
        // Build number→FSE map from bt_master for carry calculation
        const numToFSEForCarry = {};
        allMasterDocs.forEach(m => {
          const num = (m.merchantNumber || '').trim();
          const n   = (m.fseName || '').trim().toLowerCase();
          if (num && n) numToFSEForCarry[num] = n;
        });

        for (let i = 0; i < curMonthIdx; i++) {
          const monthName = MONTHS[i];
          const colName   = findBTCol(monthName, String(curYear));

          // Payments received this month per FSE
          const mReceivedMap = {};
          allPayments.forEach(p => {
            if (!p.createdAt) return;
            const d = new Date(p.createdAt);
            if (d.getFullYear() !== curYear || MONTHS[d.getMonth()] !== monthName) return;
            const n = (p.transferTo || '').trim().toLowerCase();
            if (fseNames.some(f => f.toLowerCase() === n)) {
              mReceivedMap[n] = (mReceivedMap[n] || 0) + (p.amount || 0);
            }
          });

          // BT/RP per FSE from this month's collection
          const mBTMap = {}, mRPMap = {};
          if (colName) {
            const allNums = [...new Set(Object.values(fseMerchantNums).flat())];
            if (allNums.length > 0) {
              const mDocs = await db.collection(colName).find({ merchantNumber: { $in: allNums } })
                .project({ merchantNumber: 1, stage3: 1, rewardPassPro: 1, priorityPassPro: 1 }).toArray();
              mDocs.forEach(r => {
                const num  = (r.merchantNumber || '').trim();
                const fse  = (numToFSEForCarry[num] || '').toLowerCase();
                if (!fse) return;
                mBTMap[fse] = (mBTMap[fse] || 0) + (parseFloat(String(r.stage3 || '0').replace(/,/g,'')) || 0);
                if ((r.rewardPassPro || r.priorityPassPro || '').toLowerCase() === 'active') mRPMap[fse] = (mRPMap[fse] || 0) + 1;
              });
            }
          }

          // Accumulate per FSE
          fseNames.forEach(fseName => {
            const fl = fseName.toLowerCase();
            const recv = mReceivedMap[fl] || 0;
            if (recv === 0) return;
            const bt   = mBTMap[fl]  || 0;
            const rp   = mRPMap[fl]  || 0;
            const rpCost = rp * 2500;
            const fee  = Math.round((bt > 10000 ? bt * 0.015 : 0) * 100) / 100;
            const left = recv - (rpCost + fee);
            if (left > 0) fseCarryMap[fl] = (fseCarryMap[fl] || 0) + left;
          });
        }
      }
    }

    // Build tracker per FSE using BT_TL_CONNECT for BT/RP
    const tracker = fseNames.map(fseName => {
      const fseNameLower = fseName.toLowerCase().trim();
      const merchantNums = fseMerchantNums[fseName] || [];

      // Fund received — exact match on transferTo
      const received = payments
        .filter(p => p.amount && (p.transferTo || '').toLowerCase().trim() === fseNameLower)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      // BT/RP from BT_TL_CONNECT — aggregate across all merchants
      let usedBT = 0, rpCount = 0;
      merchantNums.forEach(num => {
        const norm = btLookup[num];
        if (!norm) return;
        usedBT += norm.stage3 || 0;
        if ((norm.rewardPassPro || '').toLowerCase() === 'active') rpCount++;
      });
      const usedRP = rpCount * 2500;
      const fee    = Math.round((usedBT > 10000 ? usedBT * 0.015 : 0) * 100) / 100;

      // Withdraw forms — exact match on employeeName
      const fseWithdraws = withdrawForms.filter(f =>
        (f.fse || f.employeeName || '').toLowerCase().trim() === fseNameLower
      );
      const withdrawAmount = fseWithdraws.reduce((sum, f) => sum + (f.withdrawAmount || 0), 0);
      const withdrawFee    = Math.round(withdrawAmount * 0.03 * 100) / 100;

      const carryFwd     = fseCarryMap[fseNameLower] || 0;
      const totalAvailable = received + carryFwd;
      const fundLeft = totalAvailable - (usedRP + fee + withdrawFee);
      return { fseName, received, carryForward: carryFwd, totalAvailable, usedBT, rpCount, usedRP, fee, withdrawAmount, withdrawFee, fundLeft };
    });

    res.json({ success: true, tracker });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET /api/tl/tidebt-team-reward-pass - Get team's reward pass data (FSEs under this TL)
router.get('/tidebt-team-reward-pass', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let records = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    }).toArray();
    if (records.length === 0) {
      const firstWord = tlName.split(' ')[0];
      records = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') }
      }).toArray();
    }
    const fseNames = [...new Set(records.map(r => r.fseName).filter(Boolean))];

    if (fseNames.length === 0) return res.json({ success: true, data: [] });

    // Get reward pass data for all FSEs — exact name match, exclude role:'TL' records
    const data = await db.collection('TideBT_RewardPass')
      .find({ 
        employeeName: { $in: fseNames.map(n => new RegExp(`^\\s*${escape(n.trim())}\\s*$`, 'i')) },
        role: { $ne: 'TL' }
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-fse-targets - Get targets set by this TL
router.get('/tidebt-fse-targets', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const targets = await db.collection('TideBT_Targets')
      .find({ setBy: { $regex: new RegExp(tl.name.trim(), 'i') } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, targets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/tidebt-set-fse-target - TL sets target for their FSE
router.post('/tidebt-set-fse-target', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { targetFor, btTarget, rpTarget, month, year } = req.body;
    if (!targetFor || !btTarget || !rpTarget || !month || !year) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const db = mongoose.connection.db;
    
    // Always insert new record (keep history)
    await db.collection('TideBT_Targets').insertOne({
      targetFor,
      targetRole: 'FSE',
      setBy: tl.name,
      setByRole: 'TL',
      btTarget: parseFloat(btTarget),
      rpTarget: parseInt(rpTarget),
      month,
      year: parseInt(year),
      createdAt: new Date()
    });

    res.json({ success: true, message: `Target set for ${targetFor}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-my-reward-pass - TL gets their reward pass submissions
router.get('/tidebt-my-reward-pass', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;

    // Match ONLY by employeeId — no email match
    // Email match would pull in "Niteesh Kumar Saroj" FSE data into TL "Niteesh" panel
    const data = await db.collection('TideBT_RewardPass')
      .find({ employeeId: tl._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/tidebt-add-expense - TL logs an expense
router.post('/tidebt-add-expense', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { amount, purpose, date } = req.body;
    if (!amount || !purpose) return res.status(400).json({ message: 'Amount and purpose are required' });

    const db = mongoose.connection.db;
    await db.collection('TideBT_Expenses').insertOne({
      employeeName: tl.name,
      employeeId: tl._id,
      role: 'TL',
      amount: parseFloat(amount),
      purpose,
      date: date || new Date().toISOString(),
      createdAt: new Date()
    });

    res.json({ success: true, message: 'Expense recorded' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-my-expenses - TL gets their expenses
router.get('/tidebt-my-expenses', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const expenses = await db.collection('TideBT_Expenses')
      .find({ employeeId: tl._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-my-bt-performance - TL's PERSONAL BT from BT_TL_CONNECT {MONTH}
// Uses the TL's own name as an FSE (TLs also do BT work personally)
router.get('/tidebt-my-bt-performance', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db     = mongoose.connection.db;
    const tlName = tl.name.trim();
    const tlEmail = tl.email.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Get TL's own merchant numbers — bt_master PRIMARY, then TideBT_Merchants + forms as fallback
    // IMPORTANT: Do NOT match by email in bt_master — TL email may match FSE records
    // (e.g. TL "Niteesh" email = nksaroj2001@gmail.com also belongs to FSE "Niteesh Kumar Saroj")
    // Only use exact fseName match for TL's personal merchants
    const [masterDocs, merchantDocs, formMerchantDocs] = await Promise.all([
      // bt_master — exact fseName match only (NO email match for TL personal BT)
      db.collection('bt_master').find({
        fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*\\d*\\s*$`, 'i') }
      }).project({ merchantNumber: 1 }).toArray(),

      db.collection('TideBT_Merchants').find({
        employeeName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
      }).project({ merchantNumber: 1 }).toArray(),

      db.collection('TideBT Form Responses').find({
        employeeName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
        formType: { $in: ['daily-visit', null] },
        merchantNumber: { $exists: true, $ne: '' }
      }).project({ merchantNumber: 1 }).toArray()
    ]);

    const merchantNumbers = [...new Set([
      ...masterDocs.map(m => (m.merchantNumber || '').trim()),
      ...merchantDocs.map(m => (m.merchantNumber || '').trim()),
      ...formMerchantDocs.map(m => (m.merchantNumber || '').trim())
    ].filter(Boolean))];

    const { selectedMonth, selectedYear } = req.query;
    const collectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    const empty = { success: true, btAmount: 0, btGap: 0, todaysBT: 0, yesterdaysBT: 0,
      upiAmount: 0, upiGap: 0, upiTxnCount: 0, rewardPassCount: 0, passLiveCount: 0,
      totalMerchants: 0, merchants: [], collectionUsed: collectionName };

    if (!collectionName || merchantNumbers.length === 0) return res.json(empty);

    let btDocs = await db.collection(collectionName).find({
      merchantNumber: { $in: merchantNumbers }
    }).toArray();

    // Enforce strict year filtering on document date if selectedYear is passed
    if (selectedYear) {
      const targetYr = parseInt(selectedYear);
      btDocs = btDocs.filter(r => {
        const dateRaw = r.createdAt || r._syncedAt || r._synced_at;
        if (!dateRaw) {
          const collectionHasOtherYear = ['2024','2025','2026','24','25','26'].some(y => {
            if (y === selectedYear || y === selectedYear.slice(-2)) return false;
            return collectionName.includes(y);
          });
          return !collectionHasOtherYear;
        }
        const d = new Date(dateRaw);
        return !isNaN(d.getTime()) && d.getFullYear() === targetYr;
      });
    }

    let btAmount = 0, btGap = 0, todaysBT = 0, yesterdaysBT = 0;
    let upiAmount = 0, upiGap = 0, upiTxnCount = 0;
    let rewardPassCount = 0, passLiveCount = 0;

    const merchants = btDocs.map(r => {
      const norm = normalizeConnectDoc(r);
      
      btAmount     += norm.stage3;
      if (norm.stage3 > 0) btGap += norm.stage3Gap;
      todaysBT     += norm.todaysStage3;
      yesterdaysBT += norm.yesterdaysStage3;
      upiAmount    += norm.withdrawAmount;
      upiGap       += norm.upiGap !== '–' ? parseFloat(norm.upiGap.replace(/,/g, '')) || 0 : 0;
      upiTxnCount  += norm.upiTxnCount;
      if (norm.rewardPassPro.toLowerCase() === 'active') rewardPassCount++;
      if (norm.passLive.toLowerCase() === 'live') passLiveCount++;

      return norm;
    });

    res.json({ success: true, btAmount, btGap, todaysBT, yesterdaysBT,
      upiAmount, upiGap, upiTxnCount, rewardPassCount, passLiveCount,
      totalMerchants: merchants.length, merchants, collectionUsed: collectionName });
  } catch (err) {
    console.error('TL My BT performance error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-bt-performance - TL gets BT performance for their team from BT_TL_CONNECT {MONTH}
router.get('/tidebt-bt-performance', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db     = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Get FSE names under this TL
    let accessRecords = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();
    if (accessRecords.length === 0) {
      const firstWord = tlName.split(' ')[0];
      accessRecords = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }).toArray();
    }
    const fseNames = [...new Set(accessRecords.map(r => r.fseName).filter(Boolean))];

    // Get all merchant numbers for FSEs under this TL
    // PRIMARY: bt_master — has all assigned merchants even without forms
    // FALLBACK: TideBT_Merchants + form responses
    const [btMasterDocs, merchantDocs, formMerchantDocs, appFormMerchantDocs] = await Promise.all([
      // bt_master — primary (all merchants assigned to FSEs under this TL)
      fseNames.length > 0 ? db.collection('bt_master').find({
        $or: fseNames.map(n => ({
          fseName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') }
        }))
      }).project({ merchantNumber: 1 }).toArray() : Promise.resolve([]),

      db.collection('TideBT_Merchants').find({
        $or: fseNames.map(n => ({
          employeeName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*$`, 'i') }
        }))
      }).project({ merchantNumber: 1 }).toArray(),

      fseNames.length > 0 ? db.collection('TideBT Form Responses').find({
        employeeName: { $in: fseNames.map(n => new RegExp(`^${escape(n)}$`, 'i')) },
        formType: { $in: ['daily-visit', null] },
        merchantNumber: { $exists: true, $ne: '' }
      }).project({ merchantNumber: 1 }).toArray() : Promise.resolve([]),

      fseNames.length > 0 ? db.collection('tidebt_form_responses').find({
        employeeName: { $in: fseNames.map(n => new RegExp(`^${escape(n)}$`, 'i')) },
        formType: 'daily-visit',
        merchantNumber: { $exists: true, $ne: '' }
      }).project({ merchantNumber: 1 }).toArray() : Promise.resolve([])
    ]);

    const merchantNumbers = [...new Set([
      ...btMasterDocs.map(m => (m.merchantNumber || '').trim()),
      ...merchantDocs.map(m => (m.merchantNumber || '').trim()),
      ...formMerchantDocs.map(m => (m.merchantNumber || '').trim()),
      ...appFormMerchantDocs.map(m => (m.merchantNumber || '').trim())
    ].filter(Boolean))];


    // Determine collection based on selectedMonth and selectedYear
    const { selectedMonth, selectedYear } = req.query;
    const collectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    const empty = { success: true, btAmount: 0, btGap: 0, todaysBT: 0, yesterdaysBT: 0,
      upiAmount: 0, upiGap: 0, upiTxnCount: 0, rewardPassCount: 0, passLiveCount: 0,
      totalMerchants: 0, merchants: [], collectionUsed: collectionName };

    if (!collectionName || merchantNumbers.length === 0) return res.json(empty);

    let btDocs = await db.collection(collectionName).find({
      merchantNumber: { $in: merchantNumbers }
    }).toArray();

    // Enforce strict year filtering on document date if selectedYear is passed
    if (selectedYear) {
      const targetYr = parseInt(selectedYear);
      btDocs = btDocs.filter(r => {
        const dateRaw = r.createdAt || r._syncedAt || r._synced_at;
        if (!dateRaw) {
          const collectionHasOtherYear = ['2024','2025','2026','24','25','26'].some(y => {
            if (y === selectedYear || y === selectedYear.slice(-2)) return false;
            return collectionName.includes(y);
          });
          return !collectionHasOtherYear;
        }
        const d = new Date(dateRaw);
        return !isNaN(d.getTime()) && d.getFullYear() === targetYr;
      });
    }

    let btAmount = 0, btGap = 0, todaysBT = 0, yesterdaysBT = 0;
    let upiAmount = 0, upiGap = 0, upiTxnCount = 0, rewardPassCount = 0, passLiveCount = 0;

    const merchants = btDocs.map(r => {
      const norm = normalizeConnectDoc(r);
      
      btAmount     += norm.stage3;
      if (norm.stage3 > 0) btGap += norm.stage3Gap;
      todaysBT     += norm.todaysStage3;
      yesterdaysBT += norm.yesterdaysStage3;
      upiAmount    += norm.withdrawAmount;
      upiGap       += norm.upiGap !== '–' ? parseFloat(norm.upiGap.replace(/,/g, '')) || 0 : 0;
      upiTxnCount  += norm.upiTxnCount;
      if (norm.rewardPassPro.toLowerCase() === 'active') rewardPassCount++;
      if (norm.passLive.toLowerCase() === 'live') passLiveCount++;

      return norm;
    });

    res.json({ success: true, collectionUsed: collectionName,
      collectionMonth: collectionName ? (() => {
        const parts = collectionName.split(' ');
        const m = parts[parts.length - 1];
        return m ? m.charAt(0) + m.slice(1).toLowerCase() : null;
      })() : null,
      btAmount, btGap, todaysBT, yesterdaysBT,
      upiAmount, upiGap, upiTxnCount, rewardPassCount, passLiveCount,
      totalMerchants: merchants.length, merchants });
  } catch (err) {
    console.error('TL BT performance error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-team-merchants
// Returns FSE-wise merchant list with BT/RP/Pass Live metrics for selected month
router.get('/tidebt-team-merchants', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db     = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const { selectedMonth, selectedYear } = req.query;

    // Step 1: Get FSEs under this TL
    let accessRecords = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();
    if (accessRecords.length === 0) {
      const firstWord = tlName.split(' ')[0];
      accessRecords = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }).toArray();
    }
    const fseNames = [...new Set(accessRecords.map(r => r.fseName).filter(Boolean))];

    if (fseNames.length === 0) {
      return res.json({ success: true, fseData: [], btCollection: null, summary: { totalMerchants: 0, totalBT: 0, totalRP: 0, passLive: 0, pending: 0 } });
    }

    // Step 2: Get BT_TL_CONNECT collection for selected month
    const btCollectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    // Step 3: Get all merchants from bt_master for all FSEs
    const allMasterDocs = await db.collection('bt_master').find({
      $or: fseNames.map(n => ({
        fseName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') }
      }))
    }).toArray();

    // Group by FSE name
    const fseMap = {};
    fseNames.forEach(n => { fseMap[n] = []; });

    allMasterDocs.forEach(m => {
      const key = (m.merchantNumber || '').trim();
      if (!key) return;
      // Find which FSE this belongs to
      const matchedFSE = fseNames.find(n =>
        new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i').test(m.fseName || '')
      );
      if (!matchedFSE) return;
      if (!fseMap[matchedFSE]) fseMap[matchedFSE] = [];
      fseMap[matchedFSE].push({
        merchantNumber:   key,
        merchantName:     (m.merchantName || '').trim() || '–',
        merchantEmail:    (m.merchantEmail || '').trim(),
        tl:               (m.tl || '').trim(),
        fseName:          matchedFSE,
        // defaults
        onboardingStatus: 'Pending',
        submissionDate:   null,
        lastActivity:     null,
        btVerified:       false,
        stage3:           0,
        stage3Gap:        0,
        passLive:         '–',
        rewardPassPro:    '–',
        upiActive:        '–',
        upiTxnCount:      0,
        upiAmount:        0,
        priorityPassStatus: '–',
        msmegstStatus:    '–',
        insuranceStatus:  '–',
        rewardsPassProActiveDate: '–',
        latestOpinion:    '–',
        merchantCategory: '–',
        visitCount:       0
      });
    });

    // All merchant numbers
    const allMerchantNums = allMasterDocs.map(m => (m.merchantNumber || '').trim()).filter(Boolean);

    // Step 4: Enrich from TideBT Form Responses (visit dates, opinions)
    const formDocs = await db.collection('TideBT Form Responses').find({
      merchantNumber: { $in: allMerchantNums },
      employeeName: { $in: fseNames.map(n => new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i')) }
    }).sort({ createdAt: -1 }).toArray();

    // Build a lookup: merchantNumber → form docs
    const formLookup = {};
    formDocs.forEach(f => {
      const num = (f.merchantNumber || '').trim();
      if (!formLookup[num]) formLookup[num] = [];
      formLookup[num].push(f);
    });

    // Apply form enrichment to each FSE's merchants
    Object.keys(fseMap).forEach(fseName => {
      fseMap[fseName].forEach(m => {
        const forms = formLookup[m.merchantNumber] || [];
        forms.forEach(f => {
          const d = f.createdAt ? new Date(f.createdAt) : null;
          if (d && !isNaN(d)) {
            if (!m.submissionDate || d < new Date(m.submissionDate)) m.submissionDate = f.createdAt;
            if (!m.lastActivity  || d > new Date(m.lastActivity)) {
              m.lastActivity     = f.createdAt;
              m.onboardingStatus = (f.onboardingStatus || f.merchantOpinion || m.onboardingStatus || '').trim() || 'Pending';
              m.merchantCategory = (f.merchantCategory || m.merchantCategory).trim();
              m.latestOpinion    = (f.merchantOpinion  || m.latestOpinion).trim();
            }
          }
          m.visitCount++;
        });
      });
    });

    // Step 5: Enrich from BT_TL_CONNECT for selected month
    if (btCollectionName) {
      const btDocs = await db.collection(btCollectionName).find({
        merchantNumber: { $in: allMerchantNums }
      }).toArray();

      // Build lookup by merchantNumber
      const btLookup = {};
      btDocs.forEach(r => {
        const norm = normalizeConnectDoc(r);
        if (norm) btLookup[norm.merchantNumber.trim()] = norm;
      });

      Object.keys(fseMap).forEach(fseName => {
        fseMap[fseName].forEach(m => {
          const norm = btLookup[m.merchantNumber];
          if (!norm) return;
          m.stage3           = norm.stage3;
          m.stage3Gap        = norm.stage3Gap;
          m.passLive         = norm.passLive;
          m.rewardPassPro    = norm.rewardPassPro;
          m.upiActive        = norm.upiActive;
          m.upiTxnCount      = norm.upiTxnCount;
          m.upiAmount        = norm.withdrawAmount || 0;
          m.priorityPassStatus      = norm.priorityPassStatus;
          m.msmegstStatus           = norm.msmegstStatus;
          m.insuranceStatus         = norm.insuranceStatus;
          m.rewardsPassProActiveDate = norm.rewardsPassProActiveDate;

          const isLive   = norm.passLive.toLowerCase()      === 'live';
          const isActive = norm.rewardPassPro.toLowerCase() === 'active';
          m.btVerified = isLive || isActive || norm.stage3 > 0;
          if (isLive || isActive) m.onboardingStatus = 'Onboarded';
          else if (norm.stage3 > 0) m.onboardingStatus = 'BT Active';
        });
      });
    }

    // Step 6: Build FSE summary + overall summary
    let totalMerchants = 0, totalBT = 0, totalRP = 0, totalPassLive = 0, totalPending = 0;

    const fseData = fseNames.map(fseName => {
      const merchants = fseMap[fseName] || [];
      const metrics = {
        totalMerchants:  merchants.length,
        onboarded:       merchants.filter(m => (m.onboardingStatus || '').toLowerCase() === 'onboarded').length,
        btDone:          merchants.filter(m => m.stage3 > 0).length,
        rpDone:          merchants.filter(m => (m.rewardPassPro || '').toLowerCase() === 'active').length,
        passLive:        merchants.filter(m => (m.passLive || '').toLowerCase() === 'live').length,
        pending:         merchants.filter(m => m.stage3 === 0 && (m.passLive || '').toLowerCase() !== 'live').length,
        totalBTAmount:   merchants.reduce((s, m) => s + (m.stage3 || 0), 0),
        totalRPCount:    merchants.filter(m => (m.rewardPassPro || '').toLowerCase() === 'active').length,
        newMerchants:    merchants.filter(m => m.submissionDate != null).length,
        btVerified:      merchants.filter(m => m.btVerified).length,
      };

      totalMerchants += metrics.totalMerchants;
      totalBT        += metrics.totalBTAmount;
      totalRP        += metrics.totalRPCount;
      totalPassLive  += metrics.passLive;
      totalPending   += metrics.pending;

      return {
        fseName,
        metrics,
        merchants: merchants.sort((a, b) => {
          if (a.lastActivity && b.lastActivity) return new Date(b.lastActivity) - new Date(a.lastActivity);
          if (a.lastActivity) return -1;
          if (b.lastActivity) return 1;
          return (a.merchantName || '').localeCompare(b.merchantName || '');
        })
      };
    });

    res.json({
      success: true,
      btCollection: btCollectionName,
      collectionMonth: btCollectionName ? (() => {
        const parts = btCollectionName.split(' ');
        const m = parts[parts.length - 1];
        return m ? m.charAt(0) + m.slice(1).toLowerCase() : null;
      })() : null,
      summary: { totalMerchants, totalBT, totalRP, passLive: totalPassLive, pending: totalPending },
      fseData
    });
  } catch (err) {
    console.error('Team merchants error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-my-merchants
// TL's own merchants from bt_master + BT_TL_CONNECT verification
// IMPORTANT: Use ONLY exact fseName match — do NOT use email (would pull in FSE data)
router.get('/tidebt-my-merchants', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db      = mongoose.connection.db;
    const tlName  = tl.name.trim();
    const escape  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const { selectedMonth, selectedYear } = req.query;

    // Step 1: Get TL's own merchants from bt_master by exact name only
    // (NOT by email — email would pull in FSE "Niteesh Kumar Saroj" merchants)
    const masterDocs = await db.collection('bt_master').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*\\d*\\s*$`, 'i') }
    }).toArray();

    if (masterDocs.length === 0) {
      return res.json({ success: true, merchants: [], total: 0, btCollection: null });
    }

    const merchantMap = {};
    masterDocs.forEach(m => {
      const key = (m.merchantNumber || '').trim();
      if (!key) return;
      merchantMap[key] = {
        merchantNumber:   key,
        merchantName:     (m.merchantName  || '').trim() || '–',
        merchantEmail:    (m.merchantEmail || '').trim(),
        fseName:          (m.fseName       || tlName).trim(),
        tl:               (m.tl            || '').trim(),
        onboardingStatus: 'Pending',
        submissionDate:   null,
        lastActivity:     null,
        visitCount:       0,
        latestOpinion:    '–',
        merchantCategory: '–',
        btVerified:       false,
        stage3:           0,
        stage3Gap:        0,
        passLive:         '–',
        rewardPassPro:    '–',
        upiActive:        '–',
        upiTxnCount:      0,
        upiAmount:        0,
        priorityPassStatus: '–',
        msmegstStatus:    '–',
        insuranceStatus:  '–',
        rewardsPassProActiveDate: '–'
      };
    });

    const merchantNumbers = Object.keys(merchantMap);

    // Step 2: Enrich from TideBT Form Responses (only TL's own submitted forms)
    const [sheetForms, appForms] = await Promise.all([
      db.collection('TideBT Form Responses').find({
        submittedBy: tl._id,
        merchantNumber: { $in: merchantNumbers }
      }).sort({ createdAt: -1 }).toArray(),
      db.collection('tidebt_form_responses').find({
        submittedBy: tl._id,
        formType: 'daily-visit',
        merchantNumber: { $in: merchantNumbers }
      }).sort({ createdAt: -1 }).toArray()
    ]);

    [...sheetForms, ...appForms].forEach(f => {
      const key = (f.merchantNumber || '').trim();
      const m   = merchantMap[key];
      if (!m) return;
      const d = f.createdAt ? new Date(f.createdAt) : null;
      if (d && !isNaN(d)) {
        if (!m.submissionDate || d < new Date(m.submissionDate)) m.submissionDate = f.createdAt;
        if (!m.lastActivity  || d > new Date(m.lastActivity)) {
          m.lastActivity     = f.createdAt;
          m.onboardingStatus = (f.onboardingStatus || f.merchantOpinion || m.onboardingStatus).trim();
          m.merchantCategory = (f.merchantCategory || m.merchantCategory).trim();
          m.latestOpinion    = (f.merchantOpinion  || m.latestOpinion).trim();
        }
      }
      m.visitCount++;
    });

    // Step 3: Verify from BT_TL_CONNECT
    const btCollectionName = await findConnectCollection(db, selectedMonth, selectedYear);
    if (btCollectionName) {
      const btDocs = await db.collection(btCollectionName).find({
        merchantNumber: { $in: merchantNumbers }
      }).toArray();

      btDocs.forEach(r => {
        const norm = normalizeConnectDoc(r);
        if (!norm) return;
        const key = norm.merchantNumber.trim();
        const m   = merchantMap[key];
        if (!m) return;

        m.stage3                  = norm.stage3;
        m.stage3Gap               = norm.stage3Gap;
        m.passLive                = norm.passLive;
        m.rewardPassPro           = norm.rewardPassPro;
        m.upiActive               = norm.upiActive;
        m.upiTxnCount             = norm.upiTxnCount;
        m.upiAmount               = norm.withdrawAmount || 0;
        m.priorityPassStatus      = norm.priorityPassStatus;
        m.msmegstStatus           = norm.msmegstStatus;
        m.insuranceStatus         = norm.insuranceStatus;
        m.rewardsPassProActiveDate = norm.rewardsPassProActiveDate;

        const isLive   = norm.passLive.toLowerCase()      === 'live';
        const isActive = norm.rewardPassPro.toLowerCase() === 'active';
        m.btVerified = isLive || isActive || norm.stage3 > 0;
        if (isLive || isActive) m.onboardingStatus = 'Onboarded';
        else if (norm.stage3 > 0) m.onboardingStatus = 'BT Active';
      });
    }

    const merchants = Object.values(merchantMap).sort((a, b) => {
      if (a.lastActivity && b.lastActivity) return new Date(b.lastActivity) - new Date(a.lastActivity);
      if (a.lastActivity) return -1;
      if (b.lastActivity) return 1;
      return (a.merchantName || '').localeCompare(b.merchantName || '');
    });

    res.json({ success: true, merchants, total: merchants.length, btCollection: btCollectionName });
  } catch (err) {
    console.error('TL My merchants error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-annual-bt-summary
// Returns BT amount + RP count per month for the year — used for cumulative carry-forward
router.get('/tidebt-annual-bt-summary', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db     = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const { year } = req.query;
    const yearStr  = year || String(new Date().getFullYear());

    // Get TL's own merchant numbers from bt_master (personal BT — exact name match only)
    const masterDocs = await db.collection('bt_master').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*\\d*\\s*$`, 'i') }
    }).project({ merchantNumber: 1 }).toArray();

    const merchantNumbers = [...new Set(
      masterDocs.map(m => (m.merchantNumber || '').trim()).filter(Boolean)
    )];

    // Build lead name patterns for historical data (churned merchants)
    const nameParts = tlName.split(' ').filter(Boolean);
    const firstName = nameParts[0] || tlName;
    const lastInitial = nameParts[1] ? nameParts[1][0] : '';
    const leadPatterns = [
      new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i'),
      new RegExp(`^\\s*${escape(firstName)}\\s*${lastInitial ? escape(lastInitial) : ''}`, 'i'),
      new RegExp(`^\\s*${escape(firstName)}\\s*$`, 'i')
    ];

    const allCollections = (await db.listCollections().toArray()).map(c => c.name);
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const shortYear = yearStr.slice(-2);

    const MONTH_ABBR = {
      'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
      'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
      'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
    };

    const monthResults = await Promise.all(MONTH_NAMES.map(async (monthName) => {
      const monthUpper = monthName.toUpperCase();
      const monthAbbr  = MONTH_ABBR[monthUpper] || monthUpper;
      const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const tlCols = allCollections.filter(c => c.toUpperCase().includes('TL_CONNECT') && !c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const candidates = [...btCols, ...tlCols];
      const matchesMonth = (cu) => cu.includes(monthUpper) || cu.includes(monthAbbr);

      let colName = candidates.find(c => {
        const cu = c.toUpperCase();
        return matchesMonth(cu) && (cu.includes(yearStr) || cu.includes(shortYear));
      });
      if (!colName) colName = candidates.find(c => matchesMonth(c.toUpperCase()));
      if (!colName) return { month: monthName, btAmount: 0, rewardPassCount: 0, passLiveCount: 0, collectionFound: false };

      const [byMerchant, byLead] = await Promise.all([
        merchantNumbers.length > 0
          ? db.collection(colName).find({ merchantNumber: { $in: merchantNumbers } })
              .project({ stage3: 1, rewardPassPro: 1, priorityPassPro: 1, passLive: 1, merchantNumber: 1 }).toArray()
          : Promise.resolve([]),
        db.collection(colName).find({
          $or: leadPatterns.map(p => ({ lead: p }))
        }).project({ stage3: 1, rewardPassPro: 1, priorityPassPro: 1, passLive: 1, merchantNumber: 1 }).toArray()
      ]);

      const seen = new Set();
      const btDocs = [];
      [...byMerchant, ...byLead].forEach(r => {
        const key = r.merchantNumber || String(r._id);
        if (!seen.has(key)) { seen.add(key); btDocs.push(r); }
      });

      let btAmount = 0, rewardPassCount = 0, passLiveCount = 0;
      btDocs.forEach(r => {
        const parseNum = v => { const n = parseFloat(String(v || '0').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
        btAmount += parseNum(r.stage3 || r.Stage_3 || r['Stage-3']);
        const rp = (r.rewardPassPro || r.priorityPassPro || '').toLowerCase();
        if (rp === 'active') rewardPassCount++;
        if ((r.passLive || '').toLowerCase() === 'live') passLiveCount++;
      });

      return { month: monthName, btAmount, rewardPassCount, passLiveCount, collectionFound: true, totalDocs: btDocs.length };
    }));

    res.json({ success: true, year: yearStr, months: monthResults });
  } catch (err) {
    console.error('TL Annual BT summary error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
