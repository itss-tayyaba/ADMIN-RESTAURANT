require('dotenv').config();
const dns = require('dns');
if (process.env.USE_CUSTOM_DNS === 'true') {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const Tenant = require('../src/models/Tenant');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const coll = mongoose.connection.db.collection('customers');

  // 1. Get default tenant
  let defaultTenant = await Tenant.findOne({ slug: 'ember-and-brew' });
  if (!defaultTenant) {
    defaultTenant = await Tenant.createDefaultTenant();
  }
  console.log('Default Tenant ID:', defaultTenant._id);

  // 2. Clean up empty string emails: unset email field if it is "" so sparse index works
  const unsetEmptyEmails = await coll.updateMany(
    { email: '' },
    { $unset: { email: '' } }
  );
  console.log('Unset empty string emails count:', unsetEmptyEmails.modifiedCount);

  // 3. Backfill tenantId for all legacy customers missing tenantId
  const backfillResult = await coll.updateMany(
    { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] },
    { $set: { tenantId: defaultTenant._id } }
  );
  console.log('Backfilled tenantId for legacy customers:', backfillResult.modifiedCount);

  // 4. Drop legacy global email_1 index if present
  const indexes = await coll.indexes();
  const legacyEmailIndex = indexes.find(i => i.name === 'email_1' && i.unique);
  if (legacyEmailIndex) {
    await coll.dropIndex('email_1');
    console.log('✅ Dropped legacy global index "email_1".');
  } else {
    console.log('No legacy "email_1" index found.');
  }

  // 5. Ensure tenant-scoped indexes exist with partialFilterExpression
  await coll.dropIndex('tenantId_1_email_1').catch(() => {});
  await coll.createIndex(
    { tenantId: 1, email: 1 },
    {
      unique: true,
      partialFilterExpression: { email: { $type: 'string' } },
      name: 'tenantId_1_email_1'
    }
  );
  await coll.createIndex(
    { tenantId: 1, phone: 1 },
    { name: 'tenantId_1_phone_1' }
  );
  console.log('✅ Tenant-aware customer indexes verified with partialFilterExpression.');

  const finalIndexes = await coll.indexes();
  console.log('Final Customer Indexes:', finalIndexes.map(i => i.name));
}

run()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
