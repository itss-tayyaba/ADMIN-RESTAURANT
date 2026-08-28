const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Branch = require('../models/Branch');
const Order = require('../models/Order');
const AdminUser = require('../models/AdminUser');

const STAFF_ROLES = ['admin', 'chef', 'delivery'];
const PUBLIC_BRANCH_FIELDS = 'name code country countryCode city currency currencySymbol taxRate address phone heroImage deliveryZones paymentMethods location deliveryRadiusKm';

function superadminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin access only.' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Customer pages resolve a public branch code (such as london-uk) to its id.
router.get('/public', async (_req, res) => {
  try {
    res.json(await Branch.find({ isActive: true }).select(PUBLIC_BRANCH_FIELDS).sort({ country: 1, city: 1 }));
  } catch { res.status(500).json({ error: 'Failed to fetch branches' }); }
});

router.get('/by-code/:code', async (req, res) => {
  try {
    const code = String(req.params.code).trim().toLowerCase();
    // Keep the original London URL working as well as the URL shared with
    // customers. Earlier setup used "london-uk" while the public link is
    // "/order/uk-london"; both must identify one, independent branch.
    let branch = await Branch.findOne({ code, isActive: true }).select(PUBLIC_BRANCH_FIELDS);
    if (!branch && code === 'uk-london') {
      branch = await Branch.findOne({ code: 'london-uk', isActive: true }).select(PUBLIC_BRANCH_FIELDS);
    }
    if (!branch && (code === 'us-dollar' || code === 'usd')) {
      const defaultBranch = await Branch.findOne({ code: 'default' }) || await Branch.findOne({});
      return res.json({
        _id: defaultBranch ? defaultBranch._id : '6a8e00000000000000000001',
        name: 'Ember & Brew — Global ($ / USD)',
        code: 'us-dollar',
        country: 'United States',
        countryCode: 'US',
        city: 'Global',
        currency: 'USD',
        currencySymbol: '$',
        taxRate: 0.08,
        phone: '+1 (555) 018-2947',
        address: '214 Maple & 5th, Historic District',
        deliveryZones: ['Downtown', 'Midtown', 'Metro'],
        paymentMethods: ['card', 'apple-pay', 'google-pay', 'cash']
      });
    }
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch { res.status(500).json({ error: 'Failed to resolve branch' }); }
});

// The data expected by public/superadmin/superadmin.js.
router.get('/', superadminAuth, async (_req, res) => {
  try {
    const branches = await Branch.find({}).sort({ name: 1 });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [revenueRows, todayRows, pendingRows, riderRows] = await Promise.all([
      Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: '$branchId', revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { status: { $in: ['received', 'preparing', 'ready'] } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
      AdminUser.aggregate([{ $match: { role: 'delivery', active: true } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }])
    ]);
    const makeMap = rows => new Map(rows.map(row => [row._id ? String(row._id) : 'null', row]));
    const revenue = makeMap(revenueRows), orderToday = makeMap(todayRows), pending = makeMap(pendingRows), riders = makeMap(riderRows);
    const result = branches.map(branch => {
      const key = String(branch._id);
      return { ...branch.toObject(), stats: {
        totalRevenue: revenue.get(key)?.revenue || 0,
        totalOrders: revenue.get(key)?.orders || 0,
        todayOrders: orderToday.get(key)?.count || 0,
        pendingOrders: pending.get(key)?.count || 0,
        activeRiders: riders.get(key)?.count || 0
      }};
    });
    const combined = result.reduce((total, branch) => ({
      totalOrders: total.totalOrders + branch.stats.totalOrders,
      todayOrders: total.todayOrders + branch.stats.todayOrders,
      pendingOrders: total.pendingOrders + branch.stats.pendingOrders,
      activeRiders: total.activeRiders + branch.stats.activeRiders
    }), { totalOrders: 0, todayOrders: 0, pendingOrders: 0, activeRiders: 0 });
    res.json({ branches: result, combined });
  } catch (err) {
    console.error('BRANCH OVERVIEW ERROR:', err);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

router.post('/', superadminAuth, async (req, res) => {
  try {
    const { name, code, country, countryCode, city, currency, currencySymbol, timezone, taxRate, address, phone, heroImage, deliveryZones, paymentMethods } = req.body;
    const required = { name, code, country, countryCode, city, currency, currencySymbol, timezone };
    const missing = Object.entries(required).find(([, value]) => !String(value || '').trim());
    if (missing) return res.status(400).json({ error: `${missing[0]} is required.` });
    const strings = value => Array.isArray(value) ? value.map(String).map(v => v.trim()).filter(Boolean) : [];
    const branch = await Branch.create({
      name: String(name).trim(), code: String(code).trim().toLowerCase(), country: String(country).trim(), countryCode: String(countryCode).trim().toUpperCase(),
      city: String(city).trim(), currency: String(currency).trim().toUpperCase(), currencySymbol: String(currencySymbol).trim(), timezone: String(timezone).trim(),
      taxRate: Number(taxRate) || 0, address: String(address || '').trim(), phone: String(phone || '').trim(), heroImage: String(heroImage || '').trim(), deliveryZones: strings(deliveryZones), paymentMethods: strings(paymentMethods)
    });
    res.status(201).json(branch);
  } catch (err) {
    res.status(err?.code === 11000 ? 409 : 500).json({ error: err?.code === 11000 ? 'That branch code already exists.' : 'Failed to create branch' });
  }
});

router.put('/:id', superadminAuth, async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.isActive === 'boolean') update.isActive = req.body.isActive;
    if (typeof req.body.heroImage === 'string') update.heroImage = req.body.heroImage.trim();
    const branch = await Branch.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch { res.status(500).json({ error: 'Failed to update branch' }); }
});

router.get('/:id/staff', superadminAuth, async (req, res) => {
  try {
    res.json(await AdminUser.find({ branchId: req.params.id, role: { $in: STAFF_ROLES } }, 'name username role region phone active activeOrders createdAt').sort({ role: 1, name: 1, username: 1 }));
  } catch { res.status(500).json({ error: 'Failed to fetch branch staff' }); }
});

router.post('/:id/staff', superadminAuth, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const { name, username, password, role, region, phone } = req.body;
    if (!name || !username || !password || !STAFF_ROLES.includes(role)) return res.status(400).json({ error: 'name, username, password, and a valid staff role are required.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await AdminUser.exists({ username: String(username).trim() })) return res.status(409).json({ error: 'That username is already in use.' });
    const member = await AdminUser.create({ name: String(name).trim(), username: String(username).trim(), password, role, branchId: branch._id, region: role === 'delivery' ? String(region || '').trim() : null, phone: role === 'delivery' ? String(phone || '').trim() : '' });
    res.status(201).json({ _id: member._id, name: member.name, username: member.username, role: member.role, branchId: member.branchId });
  } catch { res.status(500).json({ error: 'Failed to create staff member' }); }
});

router.get('/:id', superadminAuth, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch { res.status(500).json({ error: 'Failed to fetch branch' }); }
});

module.exports = router;
