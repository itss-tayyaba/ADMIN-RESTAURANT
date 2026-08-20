const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Branch = require('../models/Branch');
const Order = require('../models/Order');
const AdminUser = require('../models/AdminUser');

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

// GET /api/branches — every branch, each with a quick stat snapshot.
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