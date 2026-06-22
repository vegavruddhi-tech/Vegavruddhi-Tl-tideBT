const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  const tlName = 'Niteesh';
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Simulate tidebt-my-bt-performance — what does it fetch?
  console.log('\n=== Simulating tidebt-my-bt-performance for TL:', tlName, '===');

  // bt_master
  const masterDocs = await db.collection('bt_master').find({
    $or: [
      { fseEmail: { $regex: new RegExp(`^nksaroj2001@gmail.com$`, 'i') } },
      { fseName:  { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*\\d*\\s*$`, 'i') } }
    ]
  }).project({ merchantNumber: 1, merchantName: 1, fseName: 1 }).toArray();
  console.log('bt_master matches:', masterDocs.length);
  masterDocs.forEach(m => console.log(' -', m.merchantName, '| fse:', m.fseName, '| num:', m.merchantNumber));

  // TideBT_Merchants
  const merchantDocs = await db.collection('TideBT_Merchants').find({
    employeeName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
  }).project({ merchantNumber: 1, employeeName: 1 }).toArray();
  console.log('\nTideBT_Merchants matches:', merchantDocs.length);

  // TideBT Form Responses
  const formDocs = await db.collection('TideBT Form Responses').find({
    employeeName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
    merchantNumber: { $exists: true, $ne: '' }
  }).project({ merchantNumber: 1, employeeName: 1 }).toArray();
  console.log('TideBT Form Responses matches:', formDocs.length);

  const allNums = [...new Set([
    ...masterDocs.map(m => m.merchantNumber),
    ...merchantDocs.map(m => m.merchantNumber),
    ...formDocs.map(m => m.merchantNumber)
  ].filter(Boolean))];
  console.log('\nTotal merchant numbers:', allNums.length);

  // Now check myBtPerf — myRewardPass
  const myRP = await db.collection('TideBT_RewardPass').find({
    employeeId: new mongoose.Types.ObjectId('69d6c757e48b68da67de56d2')
  }).toArray();
  console.log('\n=== TideBT_RewardPass by TL._id:', myRP.length, '===');
  myRP.forEach(r => console.log(' - btAmt:', r.totalBTAmount, '| rpCount:', r.totalRPCount, '| name:', r.employeeName, '| role:', r.role));

  // Check what myBtPerf returns — look for data by email
  const byEmail = await db.collection('TideBT_RewardPass').find({
    employeeEmail: { $regex: /nksaroj2001/i }
  }).toArray();
  console.log('\n=== TideBT_RewardPass by email (nksaroj2001):', byEmail.length, '===');
  byEmail.forEach(r => console.log(' - btAmt:', r.totalBTAmount, '| rpCount:', r.totalRPCount, '| name:', r.employeeName, '| role:', r.role, '| email:', r.employeeEmail));

  // BT_TL_CONNECT JUNE for Niteesh by name
  const juneByName = await db.collection('BT_TL_CONNECT JUNE').find({
    lead: { $regex: /niteesh/i }
  }).project({ lead: 1, merchantNumber: 1, stage3: 1 }).limit(10).toArray();
  console.log('\n=== BT_TL_CONNECT JUNE lead=Niteesh*:', juneByName.length, '===');
  juneByName.forEach(m => console.log(' - lead:', m.lead, '| num:', m.merchantNumber, '| stage3:', m.stage3));

  mongoose.disconnect();
}).catch(e => console.error('Error:', e.message));
