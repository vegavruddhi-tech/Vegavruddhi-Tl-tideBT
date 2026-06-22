const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;

  // Check TL name in TeamLeads collection
  const tl = await db.collection('TeamLeads').findOne({ name: { $regex: /niteesh/i } });
  console.log('\n=== TL in TeamLeads ===');
  console.log(' name:', tl?.name, '| email:', tl?.email, '| id:', tl?._id);

  // Check myBtPerf — TideBT_Merchants for TL name "Niteesh"
  const tlMerchants = await db.collection('TideBT_Merchants').find({
    employeeName: { $regex: /^niteesh$/i }
  }).toArray();
  console.log('\n=== TideBT_Merchants for "Niteesh" (exact):', tlMerchants.length, '===');

  // Check bt_master for TL name "Niteesh"
  const tlMaster = await db.collection('bt_master').find({
    fseName: { $regex: /^niteesh$/i }
  }).toArray();
  console.log('=== bt_master for "Niteesh" (exact):', tlMaster.length, '===');
  tlMaster.forEach(m => console.log(' -', m.merchantName, '|', m.merchantNumber));

  // Check TideBT Form Responses for "Niteesh"
  const tlForms = await db.collection('TideBT Form Responses').countDocuments({
    employeeName: { $regex: /^niteesh$/i }
  });
  console.log('=== TideBT Form Responses for "Niteesh" (exact):', tlForms, '===');

  // Check TideBT_RewardPass for "Niteesh" TL
  const tlRP = await db.collection('TideBT_RewardPass').find({
    employeeName: { $regex: /^niteesh$/i },
    role: 'TL'
  }).toArray();
  console.log('\n=== TideBT_RewardPass for "Niteesh" (TL role):', tlRP.length, '===');
  tlRP.forEach(r => console.log(' - btAmt:', r.totalBTAmount, '| rpCount:', r.totalRPCount, '| date:', r.dateOfWorking));

  // Check TideBT_RewardPass for "Niteesh Kumar Saroj" FSE
  const fseRP = await db.collection('TideBT_RewardPass').find({
    employeeName: { $regex: /niteesh kumar saroj/i }
  }).toArray();
  console.log('\n=== TideBT_RewardPass for "Niteesh Kumar Saroj" (FSE):', fseRP.length, '===');
  fseRP.forEach(r => console.log(' - btAmt:', r.totalBTAmount, '| rpCount:', r.totalRPCount, '| role:', r.role, '| date:', r.dateOfWorking));

  // Check myBtPerf — what merchant numbers would tidebt-my-bt-performance fetch for "Niteesh"
  const masterNiteesh = await db.collection('bt_master').find({
    fseName: { $regex: /^\s*niteesh\s*\d*\s*$/i }
  }).project({ merchantNumber: 1, merchantName: 1, fseName: 1 }).toArray();
  console.log('\n=== bt_master for "Niteesh" (with digit suffix):', masterNiteesh.length, '===');
  masterNiteesh.forEach(m => console.log(' -', m.merchantName, '|', m.merchantNumber, '| fse:', m.fseName));

  // Check BT_TL_CONNECT JUNE for Niteesh merchants
  if (masterNiteesh.length > 0) {
    const nums = masterNiteesh.map(m => m.merchantNumber);
    const juneData = await db.collection('BT_TL_CONNECT JUNE').find({
      merchantNumber: { $in: nums }
    }).project({ merchantNumber: 1, lead: 1, stage3: 1 }).toArray();
    console.log('\n=== BT_TL_CONNECT JUNE for Niteesh merchants:', juneData.length, '===');
    juneData.forEach(m => console.log(' - lead:', m.lead, '| num:', m.merchantNumber, '| stage3:', m.stage3));
  }

  mongoose.disconnect();
}).catch(e => console.error('Error:', e.message));
