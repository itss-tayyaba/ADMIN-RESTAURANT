require('dotenv').config();

const dns = require('dns');

// Fix MongoDB Atlas SRV DNS timeout in Node.js
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

const MenuItem = require('./models/MenuItem');
const AdminUser = require('./models/AdminUser');

const bcrypt = require('bcryptjs');

const menuItems = require('./data/menuItems');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log('Connected to MongoDB');

  // Clear existing data
  await MenuItem.deleteMany({});
  await AdminUser.deleteMany({});

  // Insert menu items
  const inserted = await MenuItem.insertMany(menuItems);

  console.log(`Inserted ${inserted.length} menu items`);

  // Create admin user (password: ember2024)
  await AdminUser.create({
    username: 'admin',
    password: 'ember2024',
    role: 'admin'
  });

  console.log('Created admin user (admin / ember2024)');

  // Seed some initial pair counts to simulate order history
  // This makes recommendations work immediately
  const idMap = {};

  inserted.forEach(item => {
    idMap[item.name] = item._id;
  });

  const pairUpdates = [
    {
      item: 'Espresso',
      pairs: [
        { name: 'Butter Croissant', count: 42 },
        { name: 'Almond Danish', count: 28 }
      ]
    },
    {
      item: 'Cappuccino',
      pairs: [
        { name: 'Blueberry Muffin', count: 35 },
        { name: 'Cinnamon Roll', count: 31 }
      ]
    },
    {
      item: 'White Pasta',
      pairs: [
        { name: 'Butter Croissant', count: 38 },
        { name: 'Cheese Sandwich', count: 22 }
      ]
    },
    {
      item: 'Cold Brew',
      pairs: [
        { name: 'Chocolate Lava Cake', count: 19 },
        { name: 'Turkey Club', count: 15 }
      ]
    },
    {
      item: 'Mocha',
      pairs: [
        { name: 'Tiramisu', count: 27 },
        { name: 'Cinnamon Roll', count: 20 }
      ]
    },
    {
      item: 'Matcha Latte',
      pairs: [
        { name: 'Almond Danish', count: 18 },
        { name: 'Harvest Bowl', count: 14 }
      ]
    }
  ];

  for (const pu of pairUpdates) {
    const updates = {};

    for (const p of pu.pairs) {
      if (idMap[p.name]) {
        updates[p.name] = p.count;
      }
    }

    if (idMap[pu.item]) {
      await MenuItem.updateOne(
        { _id: idMap[pu.item] },
        { $set: { pairCounts: updates } }
      );
    }
  }

  console.log('Seeded pair counts for recommendations');
  console.log('Seed complete!');

  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});