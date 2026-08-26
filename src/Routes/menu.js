const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Branch = require('../models/Branch');
const jwt = require('jsonwebtoken');
const { isAdminRole, resolveBranchId, BRANCH_ID_RE } = require('../utils/branchScope');
const { upload, bufferToDataUri } = require('../middleware/upload');

// Middleware: verify admin JWT
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

// Resolves which branchId to filter customer-facing menu requests by.
// - ?branchId=<id> wins if present and valid (this is what #5, the
//   customer location picker, will send once it exists).
// - Otherwise falls back to the default branch, cached in memory after
//   the first lookup (it practically never changes at runtime).
let _defaultBranchIdCache = null;
async function resolveCustomerBranchId(req) {
  const requested = req.query && req.query.branchId;
  if (requested && BRANCH_ID_RE.test(requested)) return requested;

  if (_defaultBranchIdCache) return _defaultBranchIdCache;
  const defaultBranch = await Branch.findOne({ code: 'default' });
  if (defaultBranch) _defaultBranchIdCache = String(defaultBranch._id);
  return _defaultBranchIdCache; // may be null if no default branch exists yet
}

// Menu records created before branches were introduced have branchId: null.
// Keep those original records visible in the original/default branch until the
// one-time backfill has been run. Other branches must never inherit them.
async function addLegacyDefaultMenuFilter(query, branchId) {
  if (!branchId) return;

  const defaultBranchId = await resolveCustomerBranchId({ query: {} });
  if (branchId === defaultBranchId) {
    // Use $and so a customer search can safely add its own $or condition.
    query.$and = [{ $or: [{ branchId }, { branchId: null }] }];
  } else {
    query.branchId = branchId;
  }
}

// GET /api/menu/admin — fetch ALL items incl. unavailable ones (admin only)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const branchId = resolveBranchId(req.admin, req.query);
    const filter = {};
    await addLegacyDefaultMenuFilter(filter, branchId);
    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST /api/menu — create a new menu item (admin only)
// Accepts multipart/form-data with an "image" file field (uploaded to
// Cloudinary), or a plain "image" URL string in the body for back-compat.
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, available } = req.body;
    let image = req.body.image;

    if (req.file) {
      image = bufferToDataUri(req.file);
    }

    if (!name || !description || price == null || !category || !image) {
      return res.status(400).json({ error: 'name, description, price, category, and image are required' });
    }

    // A branch admin's items always belong to their own branch. A
    // superadmin has no home branch, so they must say which branch this
    // new item is for — same pattern as adding a delivery rider.
    const branchId = req.admin.role === 'superadmin'
      ? req.body.branchId
      : req.admin.branchId;

    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required when adding an item as a superadmin.' });
    }

    const item = new MenuItem({ name, description, price, category, image, available: available !== false, branchId });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    console.error('CREATE ITEM ERROR:', err);
    res.status(500).json({ error: err.message || 'Failed to create item' });
  }
});

// PUT /api/menu/:id — update a menu item (admin only, own branch)
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, available } = req.body;
    let image = req.body.image;

    if (req.file) {
      image = bufferToDataUri(req.file);
    }

    const branchIdFilter = resolveBranchId(req.admin, req.query);
    const query = { _id: req.params.id };
    await addLegacyDefaultMenuFilter(query, branchIdFilter);

    // Only overwrite image if a new one was actually provided — editing
    // name/price/etc. shouldn't blank out the existing picture.
    const update = { name, description, price, category, available };
    if (image) update.image = image;

    const item = await MenuItem.findOneAndUpdate(
      query,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    console.error('UPDATE ITEM ERROR:', err);
    res.status(500).json({ error: err.message || 'Failed to update item' });
  }
});

// DELETE /api/menu/:id — remove a menu item (admin only, own branch)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const branchIdFilter = resolveBranchId(req.admin, req.query);
    const query = { _id: req.params.id };
    await addLegacyDefaultMenuFilter(query, branchIdFilter);

    const item = await MenuItem.findOneAndDelete(query);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// GET /api/menu — fetch all menu items for a branch, optionally filter by category
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = { available: true };

    const branchId = await resolveCustomerBranchId(req);
    await addLegacyDefaultMenuFilter(query, branchId);

    if (category && category !== 'All') query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    // `lean()` skips Mongoose document hydration because this is a read-only
    // public response, reducing work for every menu request.
    const items = await MenuItem.find(query).sort({ category: 1, name: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// GET /api/menu/categories — list categories for a branch
router.get('/categories', async (req, res) => {
  try {
    const query = { available: true };
    const branchId = await resolveCustomerBranchId(req);
    await addLegacyDefaultMenuFilter(query, branchId);

    const cats = await MenuItem.distinct('category', query);
    res.json(['All', ...cats.sort()]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
