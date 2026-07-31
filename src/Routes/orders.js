const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const MenuItem = require('../models/MenuItem');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { customerAuth } = require('./customerAuth');
const REGIONS = require('../data/regions');

// Generates an order number that is NOT guessable/sequential (e.g. EB-4K9QXP).
// Anyone who has this number can look the order up on the public tracking
// page, so it doubles as an access token — it must not be enumerable the
// way "EB-1041, EB-1042, ..." was.
async function generateOrderNumber() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
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


// Middleware: verify admin JWT
function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only.' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/orders/meta/regions — public list of valid delivery regions
router.get('/meta/regions', (req, res) => {
  res.json({ regions: REGIONS });
});

// POST /api/orders — create a new order (requires a logged-in customer account)
router.post('/', customerAuth, async (req, res) => {
  try {
    const { items, orderType, deliveryAddress, notes, region } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    if (orderType === 'delivery' && !REGIONS.includes(region)) {
      return res.status(400).json({ error: 'Please choose a valid delivery region.' });
    }

    const customer = await Customer.findById(req.customer.id);
    if (!customer) return res.status(401).json({ error: 'Account not found. Please log in again.' });

    // Never trust client-submitted prices — look up every item's real price
    // and availability from the menu in the database. A customer could
    // otherwise send { price: 0.01 } for a $10 item.
    for (const i of items) {
      if (!i.menuItemId || !/^[0-9a-fA-F]{24}$/.test(i.menuItemId)) {
        return res.status(400).json({ error: `"${i.name || 'An item'}" is not a valid menu item.` });
      }
      if (!i.qty || i.qty < 1) {
        return res.status(400).json({ error: `Invalid quantity for "${i.name || 'an item'}".` });
      }
    }
    const menuItemIds = items.map(i => i.menuItemId);
    const menuItemDocs = await MenuItem.find({ _id: { $in: menuItemIds }, available: true });
    const menuItemById = new Map(menuItemDocs.map(m => [m._id.toString(), m]));

    const missing = items.find(i => !menuItemById.has(i.menuItemId));
    if (missing) {
      return res.status(400).json({ error: `"${missing.name || 'An item'}" is no longer available.` });
    }

    const resolvedItems = items.map(i => {
      const menuItem = menuItemById.get(i.menuItemId);
      return {
        menuItem: menuItem._id,
        name: menuItem.name,
        qty: i.qty,
        price: menuItem.price // server-authoritative price, client value ignored
      };
    });

    const subtotal = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = subtotal * 0.08;

    const orderNumber = await generateOrderNumber();

    const order = new Order({
      orderNumber,
      customer: customer._id,
      items: resolvedItems,
      subtotal,
      tax,
      total: subtotal + tax,
      customerName: customer.name,
      customerPhone: customer.phone,
      orderType: orderType || 'dine-in',
      deliveryAddress: deliveryAddress || '',
      region: orderType === 'delivery' ? region : '',
      notes: notes || '',
      statusLog: [{ status: 'received', time: new Date() }]
    });

    await order.save();
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/mine/list — the logged-in customer's own order history
router.get('/mine/list', customerAuth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.customer.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your orders' });
  }
});

// GET /api/orders/stats/summary — dashboard stats (admin only)
router.get('/stats/summary', adminAuth, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [allOrders, todayOrders] = await Promise.all([
      Order.find({}),
      Order.find({ createdAt: { $gte: startOfToday } })
    ]);

    const activeStatuses = ['received', 'preparing', 'ready'];
    const totalRevenue = allOrders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0);
    const pendingCount = allOrders.filter(o => activeStatuses.includes(o.status)).length;

    // Tally item quantities for a "popular dishes" ranking
    const itemCounts = {};
    for (const order of allOrders) {
      if (order.status === 'cancelled') continue;
      for (const item of order.items) {
        const key = item.name;
        itemCounts[key] = (itemCounts[key] || 0) + item.qty;
      }
    }
    const popularDishes = Object.entries(itemCounts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    res.json({
      totalRevenue,
      totalOrders: allOrders.length,
      todayOrders: todayOrders.length,
      pendingCount,
      popularDishes
    });
  } catch (err) {
  console.error("========== ORDER ERROR ==========");
  console.error(err);

  res.status(500).json({
    success: false,
    message: err.message,
    errors: err.errors || null,
    stack: err.stack
  });
}
});

// GET /api/orders — list all orders (admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id — get single order (for tracking)
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/orders/:id/status — update order status (admin only)
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const existing = await Order.findOne({ orderNumber: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const deliveryOnlyStatuses = ['out-for-delivery', 'delivered'];
    if (existing.orderType !== 'delivery' && deliveryOnlyStatuses.includes(status)) {
      return res.status(400).json({ error: `"${status}" only applies to delivery orders.` });
    }

    const order = await Order.findOneAndUpdate(
      { orderNumber: req.params.id },
      {
        $set: { status },
        $push: { statusLog: { status, time: new Date() } }
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

module.exports = router;