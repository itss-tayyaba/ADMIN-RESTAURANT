// Ready-to-run script — creates your superadmin account.
// No arguments needed, everything is set below.
//
// HOW TO USE:
// 1. Save this file as scripts/createMySuperAdmin.js in your project
//    (same folder as your other scripts like createSuperAdmin.js).
// 2. Open a terminal in your project's ROOT folder (where package.json and
//    .env live).
// 3. Run:   node scripts/createMySuperAdmin.js
// 4. Look for the ✅ success message, then log in at /admin/login with the
//    username and password below, choosing the "Super Admin" role.
//
// You can change USERNAME and PASSWORD below before running it.
// If the account already exists, this script will tell you instead of
// overwriting it — run resetSuperAdminPassword.js instead in that case.

const USERNAME = "superadmin";
const PASSWORD = "ChangeMe123!";   // <-- change this before running, if you like
const NAME = "Platform Owner";

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../src/models/AdminUser');

async function run() {
  if (PASSWORD.length < 8) {
    console.error('❌ Choose a stronger password (8+ characters) before running this.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const existing = await AdminUser.findOne({ username: USERNAME });
  if (existing) {
    console.error(`❌ An account with username "${USERNAME}" already exists (role: ${existing.role}).`);
    console.error('   If this IS your superadmin and you just forgot the password, run:');
    console.error(`   node scripts/resetSuperAdminPassword.js ${USERNAME} "YourNewPassword123"`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // branchId is deliberately omitted — that's what makes this a superadmin
  // (sees every branch) rather than a branch-scoped admin.
  const superadmin = await AdminUser.create({
    username: USERNAME,
    password: PASSWORD,
    name: NAME,
    role: 'superadmin',
    branchId: null
  });

  console.log('✅ Superadmin created successfully!');
  console.log(`   Username: ${superadmin.username}`);
  console.log(`   Password: ${PASSWORD}`);
  console.log('   Go to /admin/login, choose "Super Admin", and sign in.');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌ Failed to create superadmin:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});