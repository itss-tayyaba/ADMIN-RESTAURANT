const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Branch = require('../models/Branch');
const jwt = require('jsonwebtoken');
const { isAdminRole, resolveBranchId, BRANCH_ID_RE } = require('../utils/branchScope');
const { resolveTenant, addTenantScope } = require('../utils/tenantScope');
const { upload, bufferToDataUri } = require('../middleware/upload');

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

// GET /api/menu/admin — fetch all items for admin panel
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin' ? (req.query.tenantId || null) : req.admin.tenantId;
    const branchId = resolveBranchId(req.admin, req.query);

    const filter = {};
    if (tenantId) await addTenantScope(filter, tenantId);
    if (branchId) {
      filter.$and = [...(filter.$and || []), { $or: [{ branchId }, { branchId: null }] }];
    }

    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// GET /api/menu — public menu for customers
router.get('/', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const branchId = req.query.branchId;

    const filter = { available: true };
    await addTenantScope(filter, tenantId);

    if (branchId && BRANCH_ID_RE.test(branchId)) {
      filter.$and = [...(filter.$and || []), { $or: [{ branchId }, { branchId: null }] }];
    }

    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// POST /api/menu — create a new menu item
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, available } = req.body;
    let image = req.body.image;

    if (req.file) image = bufferToDataUri(req.file);

    if (!name || !description || price == null || !category || !image) {
      return res.status(400).json({ error: 'name, description, price, category, and image are required' });
    }

    const tenantId = req.admin.role === 'superadmin' ? (req.body.tenantId || (await resolveTenant(req))) : req.admin.tenantId;
    const branchId = req.admin.role === 'superadmin' ? req.body.branchId : req.admin.branchId;

    const item = new MenuItem({
      tenantId,
      name,
      description,
      price: Number(price),
      category,
      image,
      available: available !== false,
      branchId: branchId || null
    });

    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create item' });
  }
});

// PUT /api/menu/:id — update menu item
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (req.file) updates.image = bufferToDataUri(req.file);
    if (updates.price != null) updates.price = Number(updates.price);
    if (updates.available != null) updates.available = String(updates.available) === 'true';
    // Tenant and branch ownership are server-controlled, never editable by
    // a browser request.
    delete updates.tenantId;
    delete updates.branchId;

    const query = { _id: req.params.id };
    const tenantId = req.admin.role === 'superadmin' ? req.query.tenantId : req.admin.tenantId;
    if (tenantId) await addTenantScope(query, tenantId);
    const branchId = resolveBranchId(req.admin, req.query);
    if (branchId) query.$and = [...(query.$and || []), { $or: [{ branchId }, { branchId: null }] }];
    const item = await MenuItem.findOneAndUpdate(query, { $set: updates }, { new: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/menu/:id — delete menu item
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const query = { _id: req.params.id };
    const tenantId = req.admin.role === 'superadmin' ? req.query.tenantId : req.admin.tenantId;
    if (tenantId) await addTenantScope(query, tenantId);
    const branchId = resolveBranchId(req.admin, req.query);
    if (branchId) query.$and = [...(query.$and || []), { $or: [{ branchId }, { branchId: null }] }];
    const item = await MenuItem.findOneAndDelete(query);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
