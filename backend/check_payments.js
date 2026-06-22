const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  
  const total = await db.collection('TideBT_Payments').countDocuments();
  console.log('Total TideBT_Payments:', total);
  
  // Check payments where senderName = Niteesh
  const niteesh = await db.collection('TideBT_Payments').find({ 
    senderName: { $regex: /niteesh/i } 
  }).toArray();
  console.log('\nNiteesh sent payments:', niteesh.length);
  niteesh.forEach(p => console.log(' - sender:', p.senderName, '| to:', p.transferTo, '| amt:', p.amount, '| whom:', p.transferToWhom));

  // Check what senderNames exist
  const senders = await db.collection('TideBT_Payments').distinct('senderName');
  console.log('\nAll senderNames:', senders);

  // Check received payments for Niteesh (transferTo = Niteesh)
  const received = await db.collection('TideBT_Payments').find({
    transferTo: { $regex: /^niteesh$/i }
  }).toArray();
  console.log('\nPayments received by Niteesh (exact):', received.length);
  received.forEach(p => console.log(' - from:', p.senderName, '| amt:', p.amount));

  mongoose.disconnect();
}).catch(e => console.error('Error:', e.message));
