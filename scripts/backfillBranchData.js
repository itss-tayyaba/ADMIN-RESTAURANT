// One-time migration for records created before branch support.
// It assigns legacy reservations, tables, and complaints to the original
// default branch and replaces the global table-number index with a
// per-branch unique index so every branch may have its own T-01, T-02, etc.

require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../src/models/Branch');
const Reservation = require('../src/models/Reservation');
const RestaurantTable = require('../src/models/RestaurantTable');
const Complaint = require('../src/models/Complaint');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const defaultBranch = await Branch.createDefaultBranch();
  const branchId = defaultBranch._id;

  const [reservations, tables, complaints] = await Promise.all([
    Reservation.updateMany({ branchId: null }, { $set: { branchId } }),
    RestaurantTable.updateMany({ branchId: null }, { $set: { branchId } }),
    Complaint.updateMany({ branchId: null }, { $set: { branchId } })
  ]);

  try { await RestaurantTable.collection.dropIndex('tableNumber_1'); }
  catch (error) { if (error.codeName !== 'IndexNotFound') throw error; }
  await RestaurantTable.collection.createIndex({ branchId: 1, tableNumber: 1 }, { unique: true });

  console.log(`Moved to ${defaultBranch.name}: ${reservations.modifiedCount} reservations, ${tables.modifiedCount} tables, ${complaints.modifiedCount} complaints.`);
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error('Branch data migration failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
