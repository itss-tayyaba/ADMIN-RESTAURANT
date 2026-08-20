// Restores the original Ember & Brew menu for the default branch.
// Safe to run more than once: it updates the 24 original dishes in place and
// does not delete custom dishes, orders, customers, or staff accounts.

require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../src/models/Branch');
const MenuItem = require('../src/models/MenuItem');
const originalMenu = require('../src/data/menuItems');

async function restoreDefaultMenu() {
  await mongoose.connect(process.env.MONGODB_URI);
  const defaultBranch = await Branch.createDefaultBranch();

  for (const item of originalMenu) {
    // Match a legacy unscoped item first so restoring the menu does not create
    // duplicate cards after the branch feature was added.
    const existing = await MenuItem.findOne({
      name: item.name,
      $or: [{ branchId: defaultBranch._id }, { branchId: null }]
    });

    const values = { ...item, branchId: defaultBranch._id, available: true };
    if (existing) {
      await MenuItem.updateOne({ _id: existing._id }, { $set: values });
    } else {
      await MenuItem.create(values);
    }
  }

  console.log(`Restored ${originalMenu.length} original menu items for ${defaultBranch.name}.`);
  await mongoose.disconnect();
}

restoreDefaultMenu().catch(async (error) => {
  console.error('Could not restore the menu:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
