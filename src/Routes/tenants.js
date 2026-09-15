const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const AdminUser = require('../models/AdminUser');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const jwt = require('jsonwebtoken');
const { OBJECT_ID_RE } = require('../utils/tenantScope');

// Middleware to extract admin auth if present
function optionalAdminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      req.admin = decoded;
    } catch (_) {}
  }
  next();
}

function superAdminOnly(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/tenants — List tenants
router.get('/', optionalAdminAuth, async (req, res) => {
  try {
    const isSuperAdmin = req.admin && req.admin.role === 'superadmin';
    const filter = isSuperAdmin ? {} : { status: 'active' };
    const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).lean();

    if (isSuperAdmin) {
      const enriched = await Promise.all(tenants.map(async (t) => {
        const [branchCount, menuCount, orderCount, adminCount] = await Promise.all([
          Branch.countDocuments({ tenantId: t._id }),
          MenuItem.countDocuments({ tenantId: t._id }),
          Order.countDocuments({ tenantId: t._id }),
          AdminUser.countDocuments({ tenantId: t._id, role: { $ne: 'superadmin' } })
        ]);
        return {
          ...t,
          stats: { branchCount, menuCount, orderCount, adminCount }
        };
      }));
      return res.json({ tenants: enriched });
    }

    // Public view
    const publicTenants = tenants.map(t => ({
      _id: t._id,
      name: t.name,
      slug: t.slug,
      tagline: t.tagline,
      description: t.description,
      logo: t.logo,
      banner: t.banner,
      theme: t.theme,
      currency: t.currency,
      currencySymbol: t.currencySymbol
    }));
    res.json({ tenants: publicTenants });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// GET /api/tenants/:slugOrId — Get single tenant details & its branches
router.get('/:slugOrId', async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const isObjectId = OBJECT_ID_RE.test(slugOrId);
    const tenant = isObjectId
      ? await Tenant.findById(slugOrId).lean()
      : await Tenant.findOne({ slug: slugOrId.toLowerCase() }).lean();

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant restaurant not found' });
    }

    const branches = await Branch.find({ tenantId: tenant._id, isActive: true })
      .select('name code city country countryCode currency currencySymbol timezone taxRate address phone heroImage deliveryZones paymentMethods location deliveryRadiusKm')
      .lean();

    res.json({ tenant, branches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant details' });
  }
});

// POST /api/tenants — Create a new tenant brand (Superadmin only)
router.post('/', superAdminOnly, async (req, res) => {
  try {
    const {
      name,
      slug,
      tagline,
      description,
      logo,
      banner,
      theme,
      contact,
      currency,
      currencySymbol,
      ownerName,
      ownerEmail,
      ownerPhone,
      adminUsername,
      adminPassword,
      initialBranchName,
      initialBranchCity,
      initialBranchCountry
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Tenant brand name and slug are required' });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await Tenant.findOne({ slug: cleanSlug });
    if (existing) {
      return res.status(400).json({ error: 'A restaurant with this slug already exists' });
    }

    const tenant = await Tenant.create({
      name: name.trim(),
      slug: cleanSlug,
      tagline: tagline || 'Artisan Culinary & Kitchen',
      description: description || '',
      logo: logo || '/images/app-logo.png',
      banner: banner || '',
      theme: {
        primaryColor: theme?.primaryColor || '#D4A853',
        secondaryColor: theme?.secondaryColor || '#C67D5A',
        accentColor: theme?.accentColor || '#D4A853',
        bgDark: theme?.bgDark || '#0F0E0C'
      },
      contact: {
        email: contact?.email || ownerEmail || '',
        phone: contact?.phone || ownerPhone || '',
        website: contact?.website || '',
        address: contact?.address || ''
      },
      currency: currency || 'PKR',
      currencySymbol: currencySymbol || 'Rs',
      ownerName: ownerName || '',
      ownerEmail: ownerEmail || '',
      ownerPhone: ownerPhone || '',
      status: 'active'
    });

    // Create Initial Default Branch for this tenant
    const branchCode = cleanSlug + '-main';
    const branch = await Branch.create({
      tenantId: tenant._id,
      name: initialBranchName || (tenant.name + ' — Main'),
      code: branchCode,
      country: initialBranchCountry || 'Pakistan',
      countryCode: 'PK',
      city: initialBranchCity || 'Lahore',
      currency: tenant.currency,
      currencySymbol: tenant.currencySymbol,
      timezone: 'Asia/Karachi',
      taxRate: 0.08,
      address: contact?.address || '',
      phone: contact?.phone || ownerPhone || '',
      deliveryZones: [],
      paymentMethods: ['Cash on delivery', 'Card', 'Wallet']
    });

    // Create Tenant Admin User if credentials provided
    let createdAdmin = null;
    if (adminUsername && adminPassword) {
      const existingUser = await AdminUser.findOne({ username: adminUsername.trim() });
      if (!existingUser) {
        createdAdmin = await AdminUser.create({
          username: adminUsername.trim(),
          password: adminPassword,
          name: ownerName || (tenant.name + ' Admin'),
          role: 'admin',
          tenantId: tenant._id,
          branchId: branch._id
        });
      }
    }

    res.status(201).json({
      message: 'Restaurant tenant created successfully',
      tenant,
      branch,
      admin: createdAdmin ? { username: createdAdmin.username, role: createdAdmin.role } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create tenant' });
  }
});

// PUT /api/tenants/:id — Update tenant details & branding
router.put('/:id', superAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    delete updates._id;

    if (updates.slug) {
      updates.slug = updates.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const conflict = await Tenant.findOne({ slug: updates.slug, _id: { $ne: id } });
      if (conflict) {
        return res.status(400).json({ error: 'This slug is already in use by another restaurant.' });
      }
    }

    const updated = await Tenant.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Tenant not found' });

    res.json({ message: 'Tenant updated successfully', tenant: updated });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update tenant' });
  }
});

// DELETE /api/tenants/:id — Deactivate or Delete Tenant
router.delete('/:id', superAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (tenant.slug === 'ember-and-brew') {
      return res.status(400).json({ error: 'Cannot delete the primary system tenant.' });
    }

    tenant.status = 'suspended';
    await tenant.save();

    res.json({ message: 'Tenant suspended successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suspend tenant' });
  }
});

module.exports = router;
