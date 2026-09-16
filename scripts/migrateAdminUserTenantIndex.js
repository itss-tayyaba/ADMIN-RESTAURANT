// Run once before deploying the tenant-aware staff login change:
//   npm run migrate:tenant-users
// It changes the old global username constraint into a per-tenant one.
require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../src/models/AdminUser');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const indexes = await AdminUser.collection.indexes();
  const legacy = indexes.find(index =>
    index.name === 'username_1' && index.unique && JSON.stringify(index.key) === JSON.stringify({ username: 1 })
  );
  if (legacy) {
    await AdminUser.collection.dropIndex(legacy.name);
    console.log('Removed legacy global username index.');
  }
  await AdminUser.collection.createIndex({ tenantId: 1, username: 1 }, { unique: true, name: 'tenantId_1_username_1' });
  console.log('Tenant-aware staff username index is ready.');
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
