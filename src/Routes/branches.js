const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Branch = require('../models/Branch');
const Order = require('../models/Order');
const AdminUser = require('../models/AdminUser');

const STAFF_ROLES = ['admin', 'chef', 'delivery'];

// Strictly superadmin — unlike the shared isAdminRole() helper used
// elsewhere, a branch admin has no business seeing the list of every
// branch on the platform, so this one middleware is intentionally NOT
// shared with the rest of the admin routes.
function superadminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access only.' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------- Public, unauthenticated routes ----------
// These power the customer-facing branch picker and clean per-branch URLs
// (e.g. /customer/london-uk). Registered before the superadmin-only
// '/:id' route below so a path like '/public' isn't swallowed by it.

// Fields safe to expose to a customer's browser — no revenue, no staff,
// no internal geo/tax details.
const PUBLIC_BRANCH_FIELDS = 'name code country countryCode city currency currencySymbol';

// GET /api/branches/public — every active branch, minimal fields.
// Powers a "choose your location" dropdown/landing page.
router.get('/public', async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true })
      .select(PUBLIC_BRANCH_FIELDS)
      .sort({ country: 1, city: 1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// GET /api/branches/by-code/:code — resolve a branch's short code (the
// part that goes in a clean URL, e.g. "london-uk") to its Mongo _id and
// display info. The customer page calls this once on load, then uses the
// returned _id as ?branchId= for every menu/order/reservation request.
router.get('/by-code/:code', async (req, res) => {
  try {
    const branch = await Branch.findOne({
      code: String(req.params.code).trim().toLowerCase(),
      isActive: true
    }).select(PUBLIC_BRANCH_FIELDS);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve branch' });
  }
});

// GET /api/branches/:id — every branch, each with a quick stat snapshot.
// Powers the superadmin dashboard's "all branches" grid.
router.get('/', superadminAuth, async (req, res) => {
  try {
    const branches = await Branch.find({}).sort({ name: 1 });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [revenueByBranch, todayCountByBranch, pendingByBranch, riderCountByBranch] = await Promise.all([
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: '$branchId', revenue: { $sum: '$total' }, orders: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfToday } } },
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { status: { $in: ['received', 'preparing', 'ready'] } } },
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      AdminUser.aggregate([
        { $match: { role: 'delivery', active: true } },
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ])
    ]);

    const toMap = (rows) => new Map(rows.map(r => [r._id ? r._id.toString() : 'null', r]));
    const revenueMap = toMap(revenueByBranch);
    const todayMap = toMap(todayCountByBranch);
    const pendingMap = toMap(pendingByBranch);
    const riderMap = toMap(riderCountByBranch);

    const result = branches.map(b => {
      const key = b._id.toString();
      return {
        ...b.toObject(),
        stats: {
          totalRevenue: revenueMap.get(key)?.revenue || 0,
          totalOrders: revenueMap.get(key)?.orders || 0,
          todayOrders: todayMap.get(key)?.count || 0,
          pendingOrders: pendingMap.get(key)?.count || 0,
          activeRiders: riderMap.get(key)?.count || 0
        }
      };
    });

    // Platform-wide combined totals, so the dashboard doesn't have to
    // re-sum every branch's numbers on the client.
    //
    // Deliberately NOT summing revenue here: branches can each run in a
    // different currency (PKR, GBP, ...), and adding raw numbers across
    // currencies produces a total that looks like money but isn't — it's
    // just two unrelated numbers added together. Revenue is shown per
    // branch, in that branch's own currency, instead (see branch-card /
    // branch-detail rendering in superadmin.js).
    const combined = result.reduce((acc, b) => ({
      totalOrders: acc.totalOrders + b.stats.totalOrders,
      todayOrders: acc.todayOrders + b.stats.todayOrders,
      pendingOrders: acc.pendingOrders + b.stats.pendingOrders,
      activeRiders: acc.activeRiders + b.stats.activeRiders
    }), { totalOrders: 0, todayOrders: 0, pendingOrders: 0, activeRiders: 0 });

    res.json({ branches: result, combined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// GET /api/branches/:id — single branch, for the drill-in header
// (name/city/currency etc. — stats for that branch come from the existing
// order/kitchen/delivery admin endpoints called with ?branchId=:id).
// Create a country/city branch. Only a superadmin can create branches.
router.post('/', superadminAuth, async (req, res) => {
  try {
    const { name, code, country, countryCode, city, currency, currencySymbol, timezone, taxRate, address, phone } = req.body;
    const required = { name, code, country, countryCode, city, currency, currencySymbol, timezone };
    const missing = Object.entries(required).find(([, value]) => !String(value || '').trim());
    if (missing) return res.status(400).json({ error: `${missing[0]} is required.` });

    const branch = await Branch.create({
      name: String(name).trim(), code: String(code).trim().toLowerCase(),
      country: String(country).trim(), countryCode: String(countryCode).trim().toUpperCase(),
      city: String(city).trim(), currency: String(currency).trim().toUpperCase(),
      currencySymbol: String(currencySymbol).trim(), timezone: String(timezone).trim(),
      taxRate: Number(taxRate) || 0, address: String(address || '').trim(), phone: String(phone || '').trim()
    });
    res.status(201).json(branch);
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: 'That branch code already exists.' });
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// List staff belonging to one branch (Admin, Chef, and Rider roles only).
router.get('/:id/staff', superadminAuth, async (req, res) => {
  try {
    const staff = await AdminUser.find(
      { branchId: req.params.id, role: { $in: STAFF_ROLES } },
      'name username role region phone active activeOrders createdAt'
    ).sort({ role: 1, name: 1, username: 1 });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch branch staff' });
  }
});

// Create an Admin, Chef, or Rider for one branch.
router.post('/:id/staff', superadminAuth, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const { name, username, password, role, region, phone } = req.body;
    if (!name || !username || !password || !STAFF_ROLES.includes(role)) {
      return res.status(400).json({ error: 'name, username, password, and a valid staff role are required.' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await AdminUser.exists({ username: String(username).trim() })) {
      return res.status(409).json({ error: 'That username is already in use.' });
    }

    const staffMember = await AdminUser.create({
      name: String(name).trim(), username: String(username).trim(), password, role, branchId: branch._id,
      region: role === 'delivery' ? String(region || '').trim() : null,
      phone: role === 'delivery' ? String(phone || '').trim() : ''
    });
    res.status(201).json({ _id: staffMember._id, name: staffMember.name, username: staffMember.username, role: staffMember.role, branchId: staffMember.branchId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create staff member' });
  }
});

router.get('/:id', superadminAuth, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch branch' });
  }
});

module.exports = router;