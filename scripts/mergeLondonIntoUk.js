// One-time branch consolidation: London is the UK branch's city, not a
// separate branch. This moves every London-owned record to the UK branch and
// then removes the duplicate London branch.

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const mongoose = require('mongoose');
const Branch = require('../src/models/Branch');
const MenuItem = require('../src/models/MenuItem');
const Order = require('../src/models/Order');
const AdminUser = require('../src/models/AdminUser');
const Complaint = require('../src/models/Complaint');
const Reservation = require('../src/models/Reservation');
const Customer = require('../src/models/Customer');
const RestaurantTable = require('../src/models/RestaurantTable');

async function moveModel(Model, sourceId, targetId) {
  const result = await Model.updateMany({ branchId: sourceId }, { $set: { branchId: targetId } });
  return result.modifiedCount;
}

async function mergeLondonIntoUk() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const uk = await Branch.findOne({ countryCode: 'GB', name: /UK/i });
    if (!uk) throw new Error('UK branch not found. Expected a branch named "Ember & Brew UK".');
    const london = await Branch.findOne({ countryCode: 'GB', name: /London/i, _id: { $ne: uk._id } });
    if (!london) {
      console.log('No separate London branch found; the UK branch is already consolidated.');
      return;
    }

    const sourceId = london._id;
    const targetId = uk._id;
    const moved = {
      menuItems: await moveModel(MenuItem, sourceId, targetId),
      orders: await moveModel(Order, sourceId, targetId),
      staff: await moveModel(AdminUser, sourceId, targetId),
      complaints: await moveModel(Complaint, sourceId, targetId),
      reservations: await moveModel(Reservation, sourceId, targetId),
      customers: await moveModel(Customer, sourceId, targetId)
    };

    // Table numbers must be unique inside a branch. Keep the UK's table if
    // both branches happen to have the same number; otherwise move London's.
    const londonTables = await RestaurantTable.find({ branchId: sourceId });
    let movedTables = 0;
    let skippedTables = 0;
    for (const table of londonTables) {
      const existsInUk = await RestaurantTable.exists({ branchId: targetId, tableNumber: table.tableNumber });
      if (existsInUk) {
        await RestaurantTable.deleteOne({ _id: table._id });
        skippedTables += 1;
      } else {
        table.branchId = targetId;
        await table.save();
        movedTables += 1;
      }
    }
    moved.tables = movedTables;
    moved.duplicateTablesRemoved = skippedTables;

    await Branch.deleteOne({ _id: sourceId });
    console.log(`Merged ${london.name} into ${uk.name}.`, moved);
  } catch (error) {
    console.error('Could not merge London into the UK branch:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

mergeLondonIntoUk();
