// Reset an existing superadmin password.
// Usage: node scripts/resetSuperAdminPassword.js <username> <new-password>

require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../src/models/AdminUser');

async function run() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    throw new Error('Usage: node scripts/resetSuperAdminPassword.js <username> <new-password>');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await AdminUser.findOne({ username, role: 'superadmin' });
  if (!user) {
    throw new Error(`No superadmin account found with username "${username}".`);
  }

  user.password = password;
  await user.save();
  const updated = await user.comparePassword(password);
  if (!updated) {
    throw new Error('Password update could not be verified.');
  }
  console.log(`Password updated and verified for superadmin "${username}".`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
