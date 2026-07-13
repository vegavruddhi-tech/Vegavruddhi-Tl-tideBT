const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Check what transferTo names exist for Dheeraj
  const p = await db.collection('TideBT_Payments').find({
    transferTo: { $regex: 'Dheeraj', $options: 'i' }
  }).toArray();
  
  console.log('Dheeraj payments in DB:', p.length);
  p.forEach(x => console.log({
    transferTo: x.transferTo,
    amount: x.amount,
    transferToWhom: x.transferToWhom,
    createdAt: x.createdAt,
    senderName: x.senderName
  }));

  // Check what the route does — it filters out "TL's & Managers" payments
  const route_check = await db.collection('TideBT_Payments').find({
    transferTo: { $regex: 'Dheeraj', $options: 'i' },
    transferToWhom: { $not: { $regex: /^TL'?s\s*&\s*Managers$/i } }
  }).toArray();
  console.log('\nAfter route filter (not TL payments):', route_check.length);
  
  await mongoose.connection.close();
}
run().catch(console.error);
