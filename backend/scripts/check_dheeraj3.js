const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Check TeamLeads name for Dheeraj
  const tl = await db.collection('TeamLeads').findOne({ name: { $regex: /dheeraj/i } });
  console.log('TL name in DB:', tl?.name, '| email:', tl?.email);

  // Search for payments with various name patterns
  const searches = ['Dheeraj', 'dheeraj', 'Anand', 'VVTG012'];
  for (const s of searches) {
    const p = await db.collection('TideBT_Payments').find({
      $or: [
        { transferTo: { $regex: s, $options: 'i' } },
        { senderName: { $regex: s, $options: 'i' } }
      ]
    }).toArray();
    console.log(`Search "${s}": ${p.length} payments`);
    p.slice(0, 3).forEach(x => console.log(`  transferTo: "${x.transferTo}", amount: ${x.amount}, whom: "${x.transferToWhom}"`));
  }

  await mongoose.connection.close();
}
run().catch(console.error);
