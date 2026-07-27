require('dotenv').config();
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGODB_URI);

client.connect().then(async () => {
  const db = client.db('CompanyDB');
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const tlEmail = 'rohitkumar952870@gmail.com';
  const portalName = 'Rohit Kumar';
  const firstWord = 'Rohit';

  console.log('=== Simulating login/profile lookup for Rohit ===\n');

  // Step 1: $or query used in login + profile
  const step1 = await db.collection('TideBT_Access').findOne({
    $or: [
      { tlEmail: tlEmail.toLowerCase() },
      { tlName: { $regex: new RegExp(`^\\s*${escape(portalName)}\\s*$`, 'i') } },
      { tlName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*$`, 'i') } },
    ]
  });
  console.log('Step 1 - login/profile $or result:', step1 ? { tlName: step1.tlName, fseName: step1.fseName, tlEmail: step1.tlEmail, fseEmail: step1.fseEmail } : 'null');

  // Step 2: after login, tl.name gets set to step1.tlName
  // Simulate what fund tracker does with that name
  const resolvedName = step1?.tlName || portalName;
  console.log('\nResolved tlName after login:', resolvedName);

  // Step 3: fund tracker FSE lookup
  const fses = await db.collection('TideBT_Access').find({
    tlName: { $regex: new RegExp(`^\\s*${escape(resolvedName)}\\s*$`, 'i') },
    hasTideBTAccess: true
  }).toArray();
  console.log('\nFSEs found for tlName "' + resolvedName + '":', fses.map(f => f.fseName));

  // Also check: does the TideBT_Payments transferTo query work?
  const payments = await db.collection('TideBT_Payments').find({
    transferTo: { $regex: new RegExp(`^\\s*${escape(resolvedName)}\\s*$`, 'i') }
  }).limit(3).toArray();
  console.log('\nPayments found for transferTo "' + resolvedName + '":', payments.length);

  client.close();
}).catch(e => console.error(e.message));
