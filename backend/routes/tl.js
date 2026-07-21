const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const TeamLead = require('../models/TeamLead');
const TideBTFormResponse = require('../models/TideBTFormResponse');
const verifyToken = require('../middleware/auth');
const { cacheGet, cacheSet, cacheKey, cacheInvalidatePattern } = require('../utils/cache');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to find the connect collection dynamically based on selectedMonth and selectedYear
const findConnectCollection = async (db, selectedMonth, selectedYear) => {
  if (!selectedMonth) return null;

  const allCollections = (await db.listCollections().toArray()).map(c => c.name);
  const mu = selectedMonth.toUpperCase();
  const MONTH_ABBR = {
    'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
    'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
    'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
  };
  const abbr = MONTH_ABBR[mu] || mu;

  // Try canonical hardcoded format first: "BT_TL_CONNECT JULY"
  const canonical = `BT_TL_CONNECT ${mu}`;
  if (allCollections.includes(canonical)) return canonical;

  // Try abbreviation: "BT_TL_CONNECT JUL"
  const canonicalAbbr = `BT_TL_CONNECT ${abbr}`;
  if (allCollections.includes(canonicalAbbr)) return canonicalAbbr;

  // Fallback: any BT_TL_CONNECT collection that matches the month
  const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
  return btCols.find(c => { const cu = c.toUpperCase(); return cu.includes(mu) || cu.includes(abbr); }) || null;
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

    // ── Mark Attendance for TideBT TL ─────────────────────────────────────
    try {
      const db = mongoose.connection.db;
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const today = istTime.toISOString().split('T')[0];

      const existing = await db.collection('Attendance').findOne({ userId: tl._id, date: today });

      // Look up tlName from TideBT_Access — use this for userName in attendance
      // so attendance page can match by TideBT_Access.tlName correctly
      const tlEmail = (tl.email || tl.emailId || '').trim();
      const escape  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let accessTlName = tl.name.trim();
      const firstWord  = accessTlName.split(' ')[0];
      const tlAccess = await db.collection('TideBT_Access').findOne({
        $or: [
          // PRIMARY: match by tlEmail (most reliable — email never changes)
          ...(tlEmail ? [{ tlEmail: tlEmail.toLowerCase() }] : []),
          // FALLBACK: match by tlName exact
          { tlName: { $regex: new RegExp(`^\\s*${escape(accessTlName)}\\s*$`, 'i') } },
          // FALLBACK: first-word match
          { tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') } },
        ]
      });
      if (tlAccess?.tlName) {
        accessTlName = tlAccess.tlName.trim();
        // NOTE: Do NOT update TeamLeads.name — TideBT_Access is the source of truth
      }

      if (!existing) {
        await db.collection('Attendance').insertOne({
          userId: tl._id,
          userEmail: tl.email,
          userName: accessTlName,
          userType: 'teamlead',
          date: today,
          firstLoginTime: now,
          lastActivityTime: now,
          attendanceMarked: true,
          reloginCount: 0,
          status: 'present',
          source: 'tidebt-tl',
          createdAt: now,
        });
        console.log(`✅ Attendance marked (TideBT TL): ${tl.email}`);
      } else {
        await db.collection('Attendance').updateOne(
          { userId: tl._id, date: today },
          { $set: { lastActivityTime: now, lastLogoutTime: null, duration: null, userName: accessTlName }, $inc: { reloginCount: 1 } }
        );
        console.log(`✅ Re-login (TideBT TL): ${tl.email}`);
      }
    } catch (attErr) {
      console.error('Attendance marking error (TL):', attErr.message);
    }
    // ──────────────────────────────────────────────────────────────────────

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

    // ── Override name with canonical TideBT_Access.tlName ─────────────────
    // TideBT_Access.tlName is the source of truth for the TL's display name.
    // TeamLeads.name may differ — always resolve from TideBT_Access.
    // PRIMARY lookup: by tlEmail (most reliable)
    // FALLBACK: by tlName exact → first-word match
    try {
      const db      = mongoose.connection.db;
      const escape  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tlEmail = (tl.email || tl.emailId || '').trim().toLowerCase();
      const portalName = tl.name.trim();
      const firstWord  = portalName.split(' ')[0];

      const accessRecord = await db.collection('TideBT_Access').findOne({
        $or: [
          ...(tlEmail ? [{ tlEmail: tlEmail }] : []),
          { tlName: { $regex: new RegExp(`^\\s*${escape(portalName)}\\s*$`, 'i') } },
          { tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') } },
        ]
      });

      if (accessRecord?.tlName) {
        const canonical = accessRecord.tlName.trim();
        const tlObj = tl.toObject();
        tlObj.name = canonical;
        console.log(`[Profile] Canonical name: "${portalName}" → "${canonical}" (via ${accessRecord.tlEmail ? 'email' : 'name'})`);
        return res.json(tlObj);
      }
    } catch (nameErr) {
      console.warn('[Profile] Canonical name lookup failed (non-fatal):', nameErr.message);
    }
    // ──────────────────────────────────────────────────────────────────────

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

    const ck = cacheKey('TL_FSES', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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

    const result = { fses: fseNames };
    await cacheSet(ck, result);
    res.json(result);
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

    const ck = cacheKey('TL_TEAM_FORMS', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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
      const result = [];
      await cacheSet(ck, result);
      return res.json(result);
    }

    // Query both TideBT Form Responses and TideBT_Mobikwik where employeeName is in FSE names
    const onboardForms = await TideBTFormResponse.find({
      employeeName: { $in: fseNames.map(name => new RegExp(`^${name}$`, 'i')) }
    }).lean();

    const mobikwikForms = await db.collection('TideBT_Mobikwik').find({
      employeeName: { $in: fseNames.map(name => new RegExp(`^${name}$`, 'i')) }
    }).toArray();

    const allForms = [...onboardForms, ...mobikwikForms].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const result = allForms;
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    console.error('TideBT team forms error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/bt-payment - Save a BT payment
router.post('/bt-payment', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email emailId');
    if (!tl) return res.status(404).json({ message: 'Team Lead not found' });

    const { transferToWhom, transferTo, amount, paymentDoneOn } = req.body;

    const db = mongoose.connection.db;
    const TideBTPayments = db.collection('TideBT_Payments');

    // ── Resolve canonical senderName from TideBT_Access ──────────────────
    // TL portal name (tl.name) may differ from fund sheet name (TideBT_Access.tlName)
    // PRIMARY: match by tlEmail — most reliable, email never changes
    // FALLBACK: name-based match
    const tlPortalName = tl.name.trim();
    const tlEmail      = (tl.email || tl.emailId || '').trim().toLowerCase();
    const escape       = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let canonicalName  = tlPortalName; // fallback to portal name

    try {
      const firstWord = tlPortalName.split(' ')[0];
      const accessRecord = await db.collection('TideBT_Access').findOne({
        $or: [
          ...(tlEmail ? [{ tlEmail: tlEmail }] : []),
          { tlName: { $regex: new RegExp(`^\\s*${escape(tlPortalName)}\\s*$`, 'i') } },
          { tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') } },
        ]
      });
      if (accessRecord?.tlName) {
        canonicalName = accessRecord.tlName.trim();
        console.log(`[BT Payment] TL name resolved: "${tlPortalName}" → "${canonicalName}"`);
      }
    } catch (nameErr) {
      console.warn('[BT Payment] Name resolution failed (non-fatal):', nameErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    const payment = {
      transferToWhom,
      senderName: canonicalName, // use fund-sheet canonical name, not portal name
      transferTo,
      amount: Number(amount),
      paymentDoneOn,
      source: 'tl-panel',
      createdAt: new Date()
    };

    await TideBTPayments.insertOne(payment);

    // Clear TL payment caches so fresh data loads next time
    await cacheInvalidatePattern(`TL_SENT_PAYMENTS:${tl._id.toString()}*`);
    await cacheInvalidatePattern(`TL_PAYMENTS:${tl._id.toString()}*`);

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

    const ck = cacheKey('TL_PAYMENTS', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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
    // Use exact match only — prefix match would cause "Niteesh" to pick up "Niteesh Kumar Saroj" (an FSE)
    const fseAccessRecords = await db.collection('TideBT_Access').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
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
      $and: [
        {
          $or: nameArray.map(n => ({
            transferTo: { $regex: new RegExp(`^\\s*${escape(n)}\\s*$`, 'i') }
          }))
        },
        // Only TL/Manager type payments — exclude FSE-type payments
        // This prevents mixing Niteesh's FSE received fund with his TL received fund
        { transferToWhom: { $not: { $regex: /^FSE|^FSC/i } } }
      ]
    }).sort({ createdAt: -1 }).toArray();

    const normalizedPayments = payments.map(p => ({ ...p, createdAt: p.createdAt || null }));
    console.log(`[TL Payments] TL: "${tlName}", names searched: ${JSON.stringify(nameArray)}, found: ${payments.length}`);

    const result = normalizedPayments;
    await cacheSet(ck, result);
    res.json(result);
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

    const ck = cacheKey('TL_MY_FORMS', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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

    const result = allForms;
    await cacheSet(ck, result);
    res.json(result);
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

    await cacheInvalidatePattern(`TL_MY_FORMS:${tl._id.toString()}*`);
    await cacheInvalidatePattern(`TL_TEAM_FORMS:${tl._id.toString()}*`);

    // ── Auto-add to bt_master if merchant not already there ───────────────
    try {
      const db = mongoose.connection.db;
      const existing = await db.collection('bt_master').findOne({ merchantNumber });
      if (!existing && merchantNumber) {
        await db.collection('bt_master').insertOne({
          merchantNumber,
          merchantName:  merchantName  || '',
          merchantEmail: merchantEmailId || '',
          fseName:       tl.name,
          fseEmail:      tl.email,
          tl:            tl.name,
          _syncedAt:     new Date(),
          _source:       'tidebt-form-auto'
        });
        console.log(`✅ Auto-added to bt_master: ${merchantNumber} for TL ${tl.name}`);
      }
    } catch (btErr) {
      console.error('bt_master auto-insert error (non-fatal):', btErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

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
// NOTE: No MongoDB cache — targets set by admin on a DIFFERENT backend, cache can't be invalidated here.
router.get('/tidebt-my-target', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { month, year } = req.query;
    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Exact boundary match — prevents "Ravi" matching "Ravi Kumar"
    const query = {
      targetFor: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    };
    if (month) query.month = month;
    if (year)  query.year  = parseInt(year);

    const targets = await db.collection('TideBT_Targets').find(query).toArray();
    console.log(`[Target] TL: "${tlName}", month: ${month}, year: ${year}, found: ${targets.length}`);

    if (targets.length === 0) {
      return res.json({ success: true, target: null });
    }

    const target = {
      btTarget:  targets.reduce((sum, t) => sum + (t.btTarget  || 0), 0),
      rpTarget:  targets.reduce((sum, t) => sum + (t.rpTarget  || 0), 0),
      month:     month || targets[0].month,
      year:      year  || targets[0].year,
      endDate:   targets[0].endDate   || null,
      startDate: targets[0].startDate || null,
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

    const selectedMonth = req.query.selectedMonth || req.query.month;
    const selectedYear = req.query.selectedYear || req.query.year;
    const ck = cacheKey('TL_TEAM_PERF', tl._id.toString(), selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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

    const result = {
      success: true,
      teamTarget,
      btCompleted: teamBtCompleted,
      fseData
    };
    await cacheSet(ck, result);
    res.json(result);
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

    await cacheInvalidatePattern(`TL_MY_FORMS:${tl._id.toString()}*`);
    await cacheInvalidatePattern(`TL_TEAM_FORMS:${tl._id.toString()}*`);

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

    const ck = cacheKey('TL_SENT_PAYMENTS', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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
    // IMPORTANT: Use exact match ($ at end) — prefix match would cause "Niteesh" TL
    // to pick up "Niteesh Kumar Saroj" FSE, incorrectly marking FSE payments as TL self-transfers
    // which inflates carry-forward in the Fund Summary.
    const fseRecs = await db.collection('TideBT_Access').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
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
      .find({
        $or: tlNamesArray.map(n => ({
          senderName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*$`, 'i') }
        }))
      })
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

    const result = { success: true, payments: enriched };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-team-fund-tracker - Get fund usage per FSE under this TL
// Uses BT_TL_CONNECT (selected month) as BT/RP source — TideBT_RewardPass is empty
router.get('/tidebt-team-fund-tracker', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email emailId');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { dateFilter, selectedYear, selectedMonth } = req.query;
    const ck = cacheKey('TL_FUND_TRACKER', tl._id.toString(), selectedMonth, selectedYear, dateFilter);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const tlPortalName = tl.name.trim();
    const tlEmail      = (tl.email || tl.emailId || '').trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // ── Resolve canonical tlName from TideBT_Access ───────────────────────
    let tlName = tlPortalName;
    try {
      // 1. Match by tlEmail (most reliable — never confuse with fseEmail)
      let ar = tlEmail
        ? await db.collection('TideBT_Access').findOne({ tlEmail: tlEmail.toLowerCase() })
        : null;
      // 2. Exact tlName match
      if (!ar) {
        ar = await db.collection('TideBT_Access').findOne({
          tlName: { $regex: new RegExp(`^\\s*${escape(tlPortalName)}\\s*$`, 'i') }
        });
      }
      // 3. First-word tlName match (e.g. "Rohit Kumar" → "Rohit")
      if (!ar) {
        const fw = tlPortalName.split(' ')[0];
        ar = await db.collection('TideBT_Access').findOne({
          tlName: { $regex: new RegExp(`^\\s*${escape(fw)}\\s*$`, 'i') }
        });
      }
      if (ar?.tlName) tlName = ar.tlName.trim();
    } catch {}
    // ─────────────────────────────────────────────────────────────────────

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

    const { fromDate, toDate } = req.query;
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
      // Only use BT_TL_CONNECT* collections — never tl_connect_*
      const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const mm = cu => cu.includes(mu) || cu.includes(abbr);
      if (yearStr) { const m = btCols.find(c => { const cu = c.toUpperCase(); return mm(cu) && (cu.includes(yearStr) || (sy && cu.includes(sy))); }); if (m) return m; }
      return btCols.find(c => mm(c.toUpperCase())) || null;
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
          const mDeductionMap = {};
          allPayments.forEach(p => {
            if (!p.createdAt) return;
            const d = new Date(p.createdAt);
            if (d.getFullYear() !== curYear || MONTHS[d.getMonth()] !== monthName) return;
            const n = (p.transferTo || '').trim().toLowerCase();
            if (fseNames.some(f => f.toLowerCase() === n)) {
              if ((p.amount || 0) > 0) {
                mReceivedMap[n] = (mReceivedMap[n] || 0) + (p.amount || 0);
              } else if ((p.amount || 0) < 0) {
                mDeductionMap[n] = (mDeductionMap[n] || 0) + Math.abs(p.amount || 0);
              }
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

          // Accumulate per FSE — running balance with proper negative handling.
          // A month where FSE spent more than received reduces the carry (can't go below 0).
          fseNames.forEach(fseName => {
            const fl = fseName.toLowerCase();
            const recv      = mReceivedMap[fl]  || 0;
            const deduction = mDeductionMap[fl] || 0;
            const bt        = mBTMap[fl]  || 0;
            const rp        = mRPMap[fl]  || 0;
            const rpCost = rp * 2500;
            const fee  = Math.round((bt > 10000 ? bt * 0.015 : 0) * 100) / 100;
            const left = recv - deduction - (rpCost + fee);
            if (recv === 0 && left === 0) return;
            fseCarryMap[fl] = Math.max(0, (fseCarryMap[fl] || 0) + left);
          });
        }
      }
    }

    // Build tracker per FSE using BT_TL_CONNECT for BT/RP
    const tracker = fseNames.map(fseName => {
      const fseNameLower = fseName.toLowerCase().trim();
      const merchantNums = fseMerchantNums[fseName] || [];

      // Fund received — positive payments only (exact match on transferTo)
      const received = payments
        .filter(p => p.amount > 0 && (p.transferTo || '').toLowerCase().trim() === fseNameLower)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      // Fund deducted — absolute value of negative payments (minus fund recoveries)
      const deduction = payments
        .filter(p => p.amount < 0 && (p.transferTo || '').toLowerCase().trim() === fseNameLower)
        .reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);

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
      const fundLeft = totalAvailable - deduction - (usedRP + fee + withdrawFee);
      return { fseName, received, deduction, carryForward: carryFwd, totalAvailable, usedBT, rpCount, usedRP, fee, withdrawAmount, withdrawFee, fundLeft };
    });

    const result = { success: true, tracker };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET /api/tl/tidebt-team-reward-pass - Get team's reward pass data (FSEs under this TL)
router.get('/tidebt-team-reward-pass', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const ck = cacheKey('TL_TEAM_RPASS', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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

    if (fseNames.length === 0) {
      const result = { success: true, data: [] };
      await cacheSet(ck, result);
      return res.json(result);
    }

    // Get reward pass data for all FSEs — exact name match, exclude role:'TL' records
    const data = await db.collection('TideBT_RewardPass')
      .find({ 
        employeeName: { $in: fseNames.map(n => new RegExp(`^\\s*${escape(n.trim())}\\s*$`, 'i')) },
        role: { $ne: 'TL' }
      })
      .sort({ createdAt: -1 })
      .toArray();

    const result = { success: true, data };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-fse-targets - Get ALL targets for this TL's FSEs (set by TL or Admin)
// No MongoDB cache — admin can set targets on a different backend, cache would hide them
router.get('/tidebt-fse-targets', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Get all FSEs under this TL
    let accessRecs = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }, { projection: { fseName: 1, _id: 0 } }).toArray();

    if (accessRecs.length === 0) {
      const fw = tlName.split(' ')[0];
      accessRecs = await db.collection('TideBT_Access').find({
        tlName: { $regex: new RegExp(`^\\s*${escape(fw)}\\s*$`, 'i') },
        hasTideBTAccess: true
      }, { projection: { fseName: 1, _id: 0 } }).toArray();
    }

    const fseNames = [...new Set(accessRecs.map(r => r.fseName).filter(Boolean))];

    // Get ALL targets for these FSEs (regardless of who set them)
    const targets = fseNames.length > 0
      ? await db.collection('TideBT_Targets')
          .find({
            targetFor: { $in: fseNames.map(n => new RegExp(`^\\s*${escape(n)}\\s*$`, 'i')) }
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    res.json({ success: true, targets, fseNames });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/tidebt-set-fse-target - TL sets target for their FSE
router.post('/tidebt-set-fse-target', verifyToken, async (req, res) => {
  try {
    const tl = await TeamLead.findById(req.user.id).select('name');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { targetFor, btTarget, rpTarget, month, year, startDate, endDate } = req.body;
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
      startDate: startDate || null,
      endDate: endDate || null,
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

    const ck = cacheKey('TL_MY_RPASS', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;

    // Match ONLY by employeeId — no email match
    // Email match would pull in "Niteesh Kumar Saroj" FSE data into TL "Niteesh" panel
    const data = await db.collection('TideBT_RewardPass')
      .find({ employeeId: tl._id })
      .sort({ createdAt: -1 })
      .toArray();

    const result = { success: true, data };
    await cacheSet(ck, result);
    res.json(result);
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

    const ck = cacheKey('TL_EXPENSES', tl._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const expenses = await db.collection('TideBT_Expenses')
      .find({ employeeId: tl._id })
      .sort({ createdAt: -1 })
      .toArray();

    const result = { success: true, expenses };
    await cacheSet(ck, result);
    res.json(result);
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
    const { selectedMonth, selectedYear } = req.query;

    // ── Cache check ───────────────────────────────────────────────────────
    const { cacheGet, cacheSet, cacheKey } = require('../utils/cache');
    const ck = cacheKey('TL_MY_BT', tlName, selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    // Get TL's own merchant numbers — bt_master PRIMARY, then TideBT_Merchants + forms as fallback
    // IMPORTANT: Do NOT match by email in bt_master — TL email may match FSE records
    // (e.g. TL "Niteesh" email = nksaroj2001@gmail.com also belongs to FSE "Niteesh Kumar Saroj")
    // Only use exact fseName match for TL's personal merchants
    // ALSO: Exclude merchants where tl field = TL's short name (those are FSE merchants under this TL)
    const tlShortName = tlName.split(' ')[0]; // e.g. "Niteesh" from "Niteesh Kumar Saroj"
    const [masterDocs, merchantDocs, formMerchantDocs] = await Promise.all([
      // bt_master — exact fseName match only (NO email match for TL personal BT)
      // Also exclude merchants where tl = tlShortName (those are FSE records, not TL personal)
      db.collection('bt_master').find({
        fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*\\d*\\s*$`, 'i') },
        tl: { $not: { $regex: new RegExp(`^\\s*${escape(tlShortName)}\\s*$`, 'i') } }
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

    const result = { success: true, btAmount, btGap, todaysBT, yesterdaysBT,
      upiAmount, upiGap, upiTxnCount, rewardPassCount, passLiveCount,
      totalMerchants: merchants.length, merchants, collectionUsed: collectionName };
    await cacheSet(ck, result);
    res.json(result);
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

    const { selectedMonth, selectedYear } = req.query;
    const ck = cacheKey('TL_BT_PERF', tl._id.toString(), selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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
    const collectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    const empty = { success: true, btAmount: 0, btGap: 0, todaysBT: 0, yesterdaysBT: 0,
      upiAmount: 0, upiGap: 0, upiTxnCount: 0, rewardPassCount: 0, passLiveCount: 0,
      totalMerchants: 0, merchants: [], collectionUsed: collectionName };

    if (!collectionName || merchantNumbers.length === 0) {
      await cacheSet(ck, empty);
      return res.json(empty);
    }

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

    const result = { success: true, collectionUsed: collectionName,
      collectionMonth: collectionName ? (() => {
        const parts = collectionName.split(' ');
        const m = parts[parts.length - 1];
        return m ? m.charAt(0) + m.slice(1).toLowerCase() : null;
      })() : null,
      btAmount, btGap, todaysBT, yesterdaysBT,
      upiAmount, upiGap, upiTxnCount, rewardPassCount, passLiveCount,
      totalMerchants: merchants.length, merchants };
    await cacheSet(ck, result);
    res.json(result);
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

    const ck = cacheKey('TL_TEAM_MERCHANTS', tl._id.toString(), selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

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
      const result = { success: true, fseData: [], btCollection: null, summary: { totalMerchants: 0, totalBT: 0, totalRP: 0, passLive: 0, pending: 0 } };
      await cacheSet(ck, result);
      return res.json(result);
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

    const result = {
      success: true,
      btCollection: btCollectionName,
      collectionMonth: btCollectionName ? (() => {
        const parts = btCollectionName.split(' ');
        const m = parts[parts.length - 1];
        return m ? m.charAt(0) + m.slice(1).toLowerCase() : null;
      })() : null,
      summary: { totalMerchants, totalBT, totalRP, passLive: totalPassLive, pending: totalPending },
      fseData
    };
    await cacheSet(ck, result);
    res.json(result);
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

    const ck = cacheKey('TL_MY_MERCHANTS', tl._id.toString(), selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    // Step 1: Get TL's own merchants from bt_master by exact name only
    // (NOT by email — email would pull in FSE "Niteesh Kumar Saroj" merchants)
    const masterDocs = await db.collection('bt_master').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*\\d*\\s*$`, 'i') }
    }).toArray();

    if (masterDocs.length === 0) {
      const result = { success: true, merchants: [], total: 0, btCollection: null };
      await cacheSet(ck, result);
      return res.json(result);
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

    const result = { success: true, merchants, total: merchants.length, btCollection: btCollectionName };
    await cacheSet(ck, result);
    res.json(result);
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

    const { year } = req.query;
    const yearStr  = year || String(new Date().getFullYear());
    const ck = cacheKey('TL_ANNUAL_BT', tl._id.toString(), yearStr);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db     = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
      // Only use BT_TL_CONNECT* collections — never tl_connect_*
      const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const matchesMonth = (cu) => cu.includes(monthUpper) || cu.includes(monthAbbr);

      let colName = btCols.find(c => {
        const cu = c.toUpperCase();
        return matchesMonth(cu) && (cu.includes(yearStr) || cu.includes(shortYear));
      });
      if (!colName) colName = btCols.find(c => matchesMonth(c.toUpperCase()));
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

    const result = { success: true, year: yearStr, months: monthResults };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    console.error('TL Annual BT summary error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tl/tidebt-carry-forward
// Returns carry-forward from TideBT_OpeningBalances (pre-synced monthly).
// Only shows data for July 2026 (carry from June). All other months return 0.
router.get('/tidebt-carry-forward', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const tl = await TeamLead.findById(req.user.id).select('name email emailId');
    if (!tl) return res.status(404).json({ message: 'TL not found' });

    const { month, year } = req.query;

    // Opening balances are only synced for July 2026 — other months return 0
    const OPENING_BALANCE_MONTH = 'July';
    const OPENING_BALANCE_YEAR  = 2026;
    if (month !== OPENING_BALANCE_MONTH || parseInt(year) !== OPENING_BALANCE_YEAR) {
      return res.json({ success: true, carryForward: 0 });
    }

    const db = mongoose.connection.db;
    const tlName = tl.name.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build TL name variations — only the TL's OWN names, not their FSEs' names.
    // Query TideBT_Access for records where THIS TL is the tlName to find canonical tlName spellings.
    // Do NOT add fseName of team members — that contaminates the lookup with FSE balances.
    const nameVariations = new Set([tlName.toLowerCase()]);
    const accessRecs = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    }).toArray();
    accessRecs.forEach(r => {
      if (r.tlName) nameVariations.add(r.tlName.trim().toLowerCase());
    });
    // Also check if TL appears as their own fseName (some TLs are also FSEs, e.g. Niteesh Kumar Saroj)
    // but only add names that match the TL exactly — not team members' fseNames
    const selfFseRecs = await db.collection('TideBT_Access').find({
      fseName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    }).toArray();
    selfFseRecs.forEach(r => {
      if (r.fseName) nameVariations.add(r.fseName.trim().toLowerCase());
    });

    // Look up in TideBT_OpeningBalances — ONLY TL-type records to avoid picking up FSE balances
    let carryForward = 0;
    for (const nameLower of nameVariations) {
      const record = await db.collection('TideBT_OpeningBalances').findOne({
        type: 'TL', // strict: only TL records, never FSE records
        name: { $regex: new RegExp(`^\\s*${escape(nameLower)}\\s*$`, 'i') }
      });
      if (record && (record.openingBalance || 0) > 0) {
        carryForward = Math.round(record.openingBalance);
        console.log(`[Carry Forward TL] "${tlName}" → "${record.name}": ₹${carryForward}`);
        break;
      }
    }

    res.json({ success: true, carryForward });
  } catch (err) {
    console.error('TL carry forward error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tl/cache/bust — clear all TL cache entries (call after sync)
router.post('/cache/bust', async (req, res) => {
  try {
    await cacheInvalidatePattern('TL_*');
    res.json({ success: true, message: 'All TL cache entries cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
