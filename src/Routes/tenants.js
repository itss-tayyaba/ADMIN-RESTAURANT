const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const AdminUser = require('../models/AdminUser');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const jwt = require('jsonwebtoken');
const { OBJECT_ID_RE } = require('../utils/tenantScope');

function generateTempPassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const allChars = upper + lower + digits + symbols;

  const password = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)]
  ];

  for (let i = 4; i < length; i++) {
    password.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

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
        const [branchCount, menuCount, orderCount, adminCount, ownerUser] = await Promise.all([
          Branch.countDocuments({ tenantId: t._id }),
          MenuItem.countDocuments({ tenantId: t._id }),
          Order.countDocuments({ tenantId: t._id }),
          AdminUser.countDocuments({ tenantId: t._id, role: { $ne: 'superadmin' } }),
          AdminUser.findOne({ tenantId: t._id, role: 'owner' }).select('username name email').lean()
        ]);
        return {
          ...t,
          ownerUser: ownerUser || null,
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

// GET /api/tenants/me/profile — Get branding and profile of currently authenticated tenant admin/owner
router.get('/me/profile', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = header.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    let tenantId = decoded.tenantId;

    // If superadmin is viewing a branch or passed tenantId
    if (decoded.role === 'superadmin') {
      if (req.query.tenantId) {
        tenantId = req.query.tenantId;
      } else if (req.query.branchId) {
        const branch = await Branch.findById(req.query.branchId).select('tenantId').lean();
        if (branch) tenantId = branch.tenantId;
      }
    }

    // If still no tenantId and user has a branchId, find tenant via branch
    if (!tenantId && decoded.branchId) {
      const branch = await Branch.findById(decoded.branchId).select('tenantId').lean();
      if (branch) tenantId = branch.tenantId;
    }

    if (!tenantId) {
      if (decoded.role === 'superadmin') {
        return res.json({
          isSuperAdmin: true,
          role: 'superadmin',
          tenant: null
        });
      }
      return res.status(404).json({ error: 'No tenant associated with this account' });
    }

    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const branches = await Branch.find({ tenantId: tenant._id, isActive: true })
      .select('name code city currency currencySymbol timezone')
      .lean();

    res.json({
      isSuperAdmin: decoded.role === 'superadmin',
      role: decoded.role,
      tenant,
      branches
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant profile' });
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
      country,
      timezone,
      ownerName,
      ownerEmail,
      ownerPhone,
      adminUsername,
      adminPassword,
      initialBranchName,
      initialBranchCity
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Tenant restaurant name and slug are required' });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await Tenant.findOne({ slug: cleanSlug });
    if (existing) {
      return res.status(400).json({ error: 'A restaurant with this slug already exists' });
    }

    const selectedCountry = country ? country.trim() : 'Pakistan';
    const selectedTimezone = timezone ? timezone.trim() : 'Asia/Karachi';
    const selectedCurrency = currency ? currency.trim().toUpperCase() : 'PKR';
    const selectedCurrencySymbol = currencySymbol ? currencySymbol.trim() : (selectedCurrency === 'USD' ? '$' : selectedCurrency === 'GBP' ? '£' : selectedCurrency === 'EUR' ? '€' : selectedCurrency === 'AUD' ? 'A$' : 'Rs');

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
      currency: selectedCurrency,
      currencySymbol: selectedCurrencySymbol,
      country: selectedCountry,
      timezone: selectedTimezone,
      ownerName: ownerName ? ownerName.trim() : '',
      ownerEmail: ownerEmail ? ownerEmail.trim().toLowerCase() : '',
      ownerPhone: ownerPhone || '',
      plan: 'pro',
      billingCycle: 'monthly',
      status: 'active'
    });

    // Create Initial Default Branch for this tenant
    const branchCode = cleanSlug + '-main';
    const branch = await Branch.create({
      tenantId: tenant._id,
      name: initialBranchName || (tenant.name + ' — Main'),
      code: branchCode,
      country: selectedCountry,
      countryCode: selectedCountry === 'Australia' ? 'AU' : selectedCountry === 'United Kingdom' ? 'GB' : selectedCountry === 'United States' ? 'US' : 'PK',
      city: initialBranchCity || (selectedCountry === 'Pakistan' ? 'Lahore' : 'Main'),
      currency: tenant.currency,
      currencySymbol: tenant.currencySymbol,
      timezone: selectedTimezone,
      taxRate: 0.08,
      address: contact?.address || '',
      phone: contact?.phone || ownerPhone || '',
      deliveryZones: [],
      paymentMethods: ['Cash on delivery', 'Card', 'Wallet']
    });

    // Generate unique owner username
    let finalUsername = adminUsername ? adminUsername.trim() : '';
    if (!finalUsername) {
      let baseUsername = cleanSlug.replace(/[^a-z0-9]/g, '');
      if (!baseUsername) baseUsername = 'restaurant';
      baseUsername += 'admin';
      let candidateUsername = baseUsername;
      let counter = 1;
      while (await AdminUser.findOne({ username: candidateUsername })) {
        candidateUsername = `${baseUsername}${counter++}`;
      }
      finalUsername = candidateUsername;
    }

    // Generate strong temporary password if not provided
    const tempPassword = adminPassword ? adminPassword.trim() : generateTempPassword(12);

    // Create Owner User
    const ownerUser = await AdminUser.create({
      username: finalUsername,
      password: tempPassword,
      name: ownerName ? ownerName.trim() : (tenant.name + ' Owner'),
      email: ownerEmail ? ownerEmail.trim().toLowerCase() : '',
      role: 'owner',
      tenantId: tenant._id,
      branchId: branch._id
    });

    res.status(201).json({
      message: 'Restaurant tenant created successfully',
      tenant,
      branch,
      credentials: {
        username: ownerUser.username,
        tempPassword,
        role: 'owner',
        loginUrl: '/admin/login'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create tenant' });
  }
});

// GET /api/tenants/users/all — List all platform users (Superadmin only)
router.get('/users/all', superAdminOnly, async (req, res) => {
  try {
    const users = await AdminUser.find({})
      .populate('tenantId', 'name slug country status')
      .populate('branchId', 'name code city country')
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch platform users' });
  }
});

// PUT /api/tenants/:id/subscription — Manage tenant subscription (Superadmin only)
router.put('/:id/subscription', superAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, billingCycle, status, extendMonths, customExpiresAt, customPlanPrice, subscriptionNotes } = req.body;
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (plan && ['starter', 'pro', 'enterprise'].includes(plan)) tenant.plan = plan;
    if (billingCycle && ['monthly', 'annual'].includes(billingCycle)) tenant.billingCycle = billingCycle;
    if (status && ['active', 'trial', 'suspended'].includes(status)) tenant.status = status;
    if (customPlanPrice !== undefined) tenant.customPlanPrice = customPlanPrice ? Number(customPlanPrice) : null;
    if (subscriptionNotes !== undefined) tenant.subscriptionNotes = String(subscriptionNotes).trim();

    if (customExpiresAt) {
      const expDate = new Date(customExpiresAt);
      if (!isNaN(expDate.getTime())) {
        tenant.subscriptionExpiresAt = expDate;
      }
    } else if (extendMonths && Number(extendMonths) > 0) {
      const base = (tenant.subscriptionExpiresAt && new Date(tenant.subscriptionExpiresAt) > new Date())
        ? new Date(tenant.subscriptionExpiresAt)
        : new Date();
      base.setMonth(base.getMonth() + Number(extendMonths));
      tenant.subscriptionExpiresAt = base;
    }

    await tenant.save();
    res.json({ message: 'Subscription updated successfully', tenant });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update subscription' });
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
