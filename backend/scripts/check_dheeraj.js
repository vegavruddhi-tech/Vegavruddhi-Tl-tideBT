const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Check TeamLeads collection for Dheeraj
  const tl = await db.collection('TeamLeads').findOne({ name: { $regex: /dheeraj/i } });
  console.log('TeamLeads record:', tl ? { name: tl.name, email: tl.email || tl.emailId } : 'NOT FOUND');

  // Check payments to Dheeraj
  const payments = await db.collection('TideBT_Payments').find({
    transferTo: { $regex: /dheeraj/i }
  }).toArray();
  console.log('\nPayments to Dheeraj:', payments.length);
  payments.slice(0, 5).forEach(p => console.log(`  transferTo: "${p.transferTo}", amount: ${p.amount}, date: ${p.createdAt}`));

  // Check what names are in payments for TLs
  const tlPayments = await db.collection('TideBT_Payments').find({
    transferToWhom: { $regex: /TL|Manager/i }
  }).distinct('transferTo');
  console.log('\nDistinct TL/Manager names in payments:', tlPayments.slice(0, 10));

  await mongoose.connection.close();
}
run().catch(console.error);
