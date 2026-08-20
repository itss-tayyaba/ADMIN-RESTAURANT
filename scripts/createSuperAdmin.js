// One-time script to create the first superadmin account. Not run
// automatically by the server (see the note in src/models/AdminUser.js) —
// a superadmin sees every branch, so it must be a deliberate, manual step,
// not something that gets silently seeded with a demo password.
//
// Usage:
//   node scripts/createSuperAdmin.js <username> <password> [name]
//
// Example:
//   node scripts/createSuperAdmin.js root "a-strong-unique-password" "Platform Owner"
//
// Uses the same MONGODB_URI from your .env that server.js uses. Safe to
// re-run — if the username already exists it will refuse rather than
// overwrite anything.

require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../src/models/AdminUser');

async function run() {
  const [, , username, password, name] = process.argv;

  if (!username || !password) {
    console.error('Usage: node scripts/createSuperAdmin.js <username> <password> [name]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Choose a stronger password (8+ characters) for a superadmin account.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await AdminUser.findOne({ username });
  if (existing) {
    console.error(`❌ An account with username "${username}" already exists (role: ${existing.role}). Choose a different username.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // branchId is deliberately omitted/null — that is what makes this account
  // a superadmin in practice, not just in name.
  const superadmin = await AdminUser.create({
    username,
    password,
    name: name || 'Super Admin',
    role: 'superadmin',
    branchId: null
  });

  console.log(`✅ Superadmin created: ${superadmin.username} (${superadmin._id})`);
  console.log('   Sign in from /admin/login and choose the "Super Admin" role.');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Failed to create superadmin:', err);
  process.exit(1);
});
