const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const jwt = require('jsonwebtoken');

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

// GET /api/menu/admin — fetch ALL items incl. unavailable ones (admin only)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const items = await MenuItem.find({}).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST /api/menu — create a new menu item (admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, description, price, category, image, available } = req.body;
    if (!name || !description || price == null || !category || !image) {
      return res.status(400).json({ error: 'name, description, price, category, and image are required' });
    }
    const item = new MenuItem({ name, description, price, category, image, available: available !== false });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/menu/:id — update a menu item (admin only)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { name, description, price, category, image, available } = req.body;
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: { name, description, price, category, image, available } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/menu/:id — remove a menu item (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// GET /api/menu — fetch all menu items, optionally filter by category
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = { available: true };
    if (category && category !== 'All') query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    const items = await MenuItem.find(query).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// GET /api/menu/categories — list all categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await MenuItem.distinct('category', { available: true });
    res.json(['All', ...cats.sort()]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;