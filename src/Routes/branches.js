const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');
const Order = require('../models/Order');
const AdminUser = require('../models/AdminUser');
const Tenant = require('../models/Tenant');
const jwt = require('jsonwebtoken');
const { isAdminRole } = require('../utils/branchScope');
const { resolveTenant, addTenantScope, OBJECT_ID_RE } = require('../utils/tenantScope');

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (!isAdminRole(decoded.role)) {
      return res.status(403).json({ error: 'Admin access only.' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/branches — public listing (active only, scoped by tenant)
router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let decoded = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); } catch (_) {}
    }

    const isSuperAdmin = decoded && decoded.role === 'superadmin';
    const isTenantAdmin = decoded && decoded.role === 'admin';

    // 1. Superadmin listing with per-branch analytics
    if (isSuperAdmin) {
      const requestedTenant = req.query.tenantId || req.query.tenant;
      let branchFilter = {};
      if (requestedTenant) {
        if (OBJECT_ID_RE.test(requestedTenant)) branchFilter.tenantId = requestedTenant;
        else {
          const t = await Tenant.findOne({ slug: requestedTenant.toLowerCase() });
          if (t) branchFilter.tenantId = t._id;
        }
      }

      const branches = await Branch.find(branchFilter).populate('tenantId', 'name slug currency currencySymbol').sort({ createdAt: 1 }).lean();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const enriched = await Promise.all(branches.map(async (b) => {
        const [totalOrders, todayOrders, pendingOrders, activeRiders, revenueResult] = await Promise.all([
          Order.countDocuments({ branchId: b._id }),
          Order.countDocuments({ branchId: b._id, createdAt: { $gte: todayStart } }),
          Order.countDocuments({ branchId: b._id, status: { $in: ['pending_admin', 'pending_kitchen', 'received', 'preparing', 'out-for-delivery'] } }),
          AdminUser.countDocuments({ branchId: b._id, role: 'delivery', active: true }),
          Order.aggregate([
            { $match: { branchId: b._id, status: { $in: ['completed', 'delivered'] } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
          ])
        ]);

        return {
          ...b,
          tenant: b.tenantId || null,
          stats: {
            totalOrders,
            todayOrders,
            pendingOrders,
            activeRiders,
            totalRevenue: revenueResult[0]?.total || 0
          }
        };
      }));

      const combined = enriched.reduce((acc, b) => {
        acc.totalOrders += b.stats.totalOrders;
        acc.todayOrders += b.stats.todayOrders;
        acc.pendingOrders += b.stats.pendingOrders;
        acc.activeRiders += b.stats.activeRiders;
        return acc;
      }, { totalOrders: 0, todayOrders: 0, pendingOrders: 0, activeRiders: 0 });

      return res.json({ branches: enriched, combined });
    }

    // 2. Tenant Admin listing
    if (isTenantAdmin) {
      const branches = await Branch.find({ tenantId: decoded.tenantId }).sort({ createdAt: 1 }).lean();
      return res.json({ branches });
    }

    // 3. Public listing scoped to tenant
    const tenantId = await resolveTenant(req);
    const filter = { isActive: true };
    await addTenantScope(filter, tenantId);

    const branches = await Branch.find(filter)
      .select('name code country countryCode city currency currencySymbol timezone taxRate address phone heroImage deliveryZones paymentMethods location deliveryRadiusKm isActive tenantId')
      .sort({ name: 1 })
      .lean();

    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// GET /api/branches/by-code/:code — lookup a branch by its unique code
router.get('/by-code/:code', async (req, res) => {
  try {
    const branch = await Branch.findOne({ code: req.params.code.trim().toLowerCase(), isActive: true })
      .populate('tenantId', 'name slug logo theme currency currencySymbol')
      .lean();
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: 'Failed to find branch' });
  }
});

// POST /api/branches — create a new branch (Superadmin or Tenant Admin)
router.post('/', adminAuth, async (req, res) => {
  try {
    const {
      name, code, country, countryCode, city, currency, currencySymbol,
      timezone, taxRate, address, phone, heroImage, deliveryZones, paymentMethods,
      location, deliveryRadiusKm, tenantId
    } = req.body;

    if (!name || !code || !country || !city || !currency || !currencySymbol || !timezone) {
      return res.status(400).json({ error: 'Missing required branch fields' });
    }

    const cleanCode = code.trim().toLowerCase();
    const existing = await Branch.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ error: 'A branch with this code already exists' });
    }

    let resolvedTenantId = req.admin.tenantId;
    if (req.admin.role === 'superadmin') {
      resolvedTenantId = tenantId || (await resolveTenant(req));
    }

    const branch = await Branch.create({
      tenantId: resolvedTenantId,
      name: name.trim(),
      code: cleanCode,
      country: country.trim(),
      countryCode: (countryCode || 'PK').trim().toUpperCase(),
      city: city.trim(),
      currency: currency.trim().toUpperCase(),
      currencySymbol: currencySymbol.trim(),
      timezone: timezone.trim(),
      taxRate: Number(taxRate) || 0,
      address: address || '',
      phone: phone || '',
      heroImage: heroImage || '',
      deliveryZones: Array.isArray(deliveryZones) ? deliveryZones : [],
      paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : ['Cash on delivery'],
      location: location || undefined,
      deliveryRadiusKm: Number(deliveryRadiusKm) || 5
    });

    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create branch' });
  }
});

module.exports = router;
