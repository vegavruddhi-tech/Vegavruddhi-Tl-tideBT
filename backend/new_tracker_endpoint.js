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
    let payments = await db.collection('TideBT_Payments').find({}).toArray();
    let withdrawForms = await db.collection('TideBT Form Responses')
      .find({ formType: 'mobikwik-withdraw' }).toArray();

    if (dateFilter || selectedYear || selectedMonth) {
      withdrawForms = filterByDate(withdrawForms, 'createdAt');
      payments      = filterByDate(payments, 'createdAt');
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

      const fundLeft = received - (usedRP + fee + withdrawFee);
      return { fseName, received, usedBT, rpCount, usedRP, fee, withdrawAmount, withdrawFee, fundLeft };
    });

    res.json({ success: true, tracker });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
