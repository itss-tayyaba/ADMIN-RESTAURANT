// src/seedOrders.js
//
// Seeds a handful of realistic demo orders so the admin dashboard
// (revenue, order counts, popular dishes, recent orders) isn't empty.
//
// Unlike src/seeds.js, this script is ADDITIVE — it does NOT wipe existing
// orders, so it's safe to run more than once (it just adds more).
//
// Usage:
//   node src/seedOrders.js

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const Order = require('./models/Order');
const MenuItem = require('./models/MenuItem');
const REGIONS = require('./data/regions');

// Mirrors generateOrderNumber() in src/Routes/orders.js so IDs look/behave
// exactly like ones created through real checkout.
async function generateOrderNumber() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    let suffix = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) suffix += alphabet[bytes[i] % alphabet.length];
    const candidate = 'EB-' + suffix;
    const exists = await Order.exists({ orderNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique order number');
}

const CUSTOMER_NAMES = [
  ['Ayesha Khan', '03001234567'],
  ['Bilal Ahmed', '03011234567'],
  ['Sara Malik', '03021234567'],
  ['Usman Tariq', '03031234567'],
  ['Hina Raza', '03041234567'],
  ['Zain Abbas', '03051234567'],
  ['Mahnoor Fatima', '03061234567'],
  ['Owais Sheikh', '03071234567'],
];

const STATUS_WEIGHTS = [
  'completed', 'completed', 'completed', 'completed',
  'delivered', 'delivered',
  'preparing', 'ready', 'received', 'out-for-delivery',
  'cancelled',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedOrders() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const menuItems = await MenuItem.find({ available: true });
  if (menuItems.length === 0) {
    console.error(
      'No menu items found — run `npm run seed` first to create the menu, then re-run this script.'
    );
    process.exit(1);
  }

  const ORDER_COUNT = 24;
  const now = Date.now();
  const created = [];

  for (let n = 0; n < ORDER_COUNT; n++) {
    const [customerName, customerPhone] = pick(CUSTOMER_NAMES);
    const orderType = pick(['dine-in', 'takeaway', 'delivery', 'delivery']);
    const status = pick(STATUS_WEIGHTS);

    // Pick 1-3 distinct random items for this order
    const itemCount = randomInt(1, 3);
    const shuffled = [...menuItems].sort(() => 0.5 - Math.random());
    const chosen = shuffled.slice(0, itemCount);

    const items = chosen.map((m) => ({
      menuItem: m._id,
      name: m.name,
      qty: randomInt(1, 3),
      price: m.price,
    }));

    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    // Spread orders across the last 7 days so the weekly revenue chart
    // and "today's orders" stat both have real variation.
    const daysAgo = randomInt(0, 6);
    const createdAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - randomInt(0, 12) * 60 * 60 * 1000);

    const orderNumber = await generateOrderNumber();

    const doc = {
      orderNumber,
      isGuestOrder: true,
      items,
      subtotal,
      tax,
      total,
      status,
      customerName,
      customerPhone,
      orderType,
      createdAt,
      updatedAt: createdAt,
      statusLog: [{ status, time: createdAt }],
    };

    if (orderType === 'delivery') {
      const region = pick(REGIONS);
      doc.region = region;
      doc.deliveryAddress = `House ${randomInt(1, 200)}, Street ${randomInt(1, 40)}, ${region}`;
      doc.deliveryLocation = {
        type: 'Point',
        // Rough Faisalabad-area coordinates, jittered per order
        coordinates: [73.08 + Math.random() * 0.1, 31.41 + Math.random() * 0.1],
      };
      if (status === 'delivered' || status === 'completed') {
        doc.deliveredAt = createdAt;
      }
    }

    const order = new Order(doc);
    // Bypass the timestamps plugin's auto-now behavior so historical dates stick
    await order.save();
    await Order.updateOne({ _id: order._id }, { $set: { createdAt, updatedAt: createdAt } });

    created.push(order.orderNumber);
  }

  console.log(`Seeded ${created.length} demo orders:`);
  console.log(created.join(', '));
  console.log('Done. Refresh the admin dashboard to see revenue, order counts, and popular dishes.');

  await mongoose.disconnect();
  process.exit(0);
}

seedOrders().catch((err) => {
  console.error('Failed to seed demo orders:', err);
  process.exit(1);
});