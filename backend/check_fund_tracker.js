const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;

  // Check TideBT_RewardPass for FSEs under Niteesh
  const fseNames = ['Raju verma', 'Sujeet Saroj', 'Gurupratap Singh', 'Ratan Kumawat'];
  
  for (const fseName of fseNames) {
    const rp = await db.collection('TideBT_RewardPass').find({
      employeeName: { $regex: new RegExp(`^\\s*${fseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }
    }).toArray();
    console.log(`\n${fseName} — RewardPass records: ${rp.length}`);
    if (rp.length > 0) rp.slice(0, 3).forEach(r => console.log(' -', r.employeeName, '| bt:', r.totalBTAmount, '| rp:', r.totalRPCount));
    
    // Also check TideBT_Payments for this FSE (received)
    const payments = await db.collection('TideBT_Payments').find({
      transferTo: { $regex: new RegExp(`^\\s*${fseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }
    }).toArray();
    console.log(`${fseName} — Payments received: ${payments.length} | total: ₹${payments.reduce((s,p)=>s+(p.amount||0),0)}`);
  }

  // Check what employeeNames exist in RewardPass
  const names = await db.collection('TideBT_RewardPass').distinct('employeeName');
  console.log('\nAll employeeNames in TideBT_RewardPass (first 20):', names.slice(0, 20));

  mongoose.disconnect();
}).catch(e => console.error('Error:', e.message));
