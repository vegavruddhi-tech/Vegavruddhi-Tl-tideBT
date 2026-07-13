const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // What names are in TideBT_Payments where transferToWhom is TL related
  const tlPayments = await db.collection('TideBT_Payments').find({
    $or: [
      { transferToWhom: { $regex: /TL|Manager/i } },
      { transferTo: { $regex: /dheeraj|anand/i } }
    ]
  }).toArray();
  console.log('TL/Manager payments:', tlPayments.length);
  tlPayments.slice(0, 10).forEach(p => console.log(`  transferTo: "${p.transferTo}", whom: "${p.transferToWhom}", amount: ${p.amount}`));

  // Check all distinct transferTo names
  const allNames = await db.collection('TideBT_Payments').distinct('transferTo');
  console.log('\nAll distinct transferTo names (first 20):', allNames.slice(0, 20));

  await mongoose.connection.close();
}
run().catch(console.error);
