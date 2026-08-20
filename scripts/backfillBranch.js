// One-time migration: tags every existing MenuItem document with the
// default branch's _id, since they were created before branches existed.
// Safe to re-run — it only touches documents where branchId is still null.
//
// Run locally with:  node scripts/backfillMenuBranch.js
// (uses the same MONGODB_URI from your .env that server.js uses)

require('dotenv').config();
const mongoose = require('mongoose');

const MenuItem = require('../src/models/MenuItem');
const Branch = require('../src/models/Branch');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const defaultBranch = await Branch.findOne({ code: 'default' });
  if (!defaultBranch) {
    console.error('No branch with code "default" found — run the server once first so it gets seeded.');
    process.exit(1);
  }
  console.log(`Backfilling to branch: ${defaultBranch.name} (${defaultBranch._id})`);

  const menuResult = await MenuItem.updateMany(
    { branchId: null },
    { $set: { branchId: defaultBranch._id } }
  );
  console.log(`Menu items updated: ${menuResult.modifiedCount}`);

  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
