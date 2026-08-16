const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const { customerAuth, optionalCustomerAuth } = require('./customerAuth');

// How many of the customer's own past orders to look at when building their
// personal "usually ordered together" signal. Keeps the query cheap and
// keeps recommendations reflecting recent taste rather than years-old orders.
const PERSONAL_HISTORY_ORDER_LIMIT = 20;

// Items THIS customer has personally ordered in the same order as itemId
// before, ranked by how often, most frequent first. Only looks at orders
// that actually contain itemId, so it stays cheap even for customers with
// long histories.
async function personalPairIds(customerId, itemId) {
  const orders = await Order.find({ customer: customerId, 'items.menuItem': itemId })
    .select('items')
    .sort({ createdAt: -1 })
    .limit(PERSONAL_HISTORY_ORDER_LIMIT);

  const counts = new Map();
  for (const order of orders) {
    for (const line of order.items) {
      if (!line.menuItem) continue;
      const id = line.menuItem.toString();
      if (id === itemId) continue;
      counts.set(id, (counts.get(id) || 0) + line.qty);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// GET /api/recommendations/mine/usual — "Your usual" strip: this
// customer's own most-ordered items, most frequent first. Requires login —
// there's no personal history to draw on for a guest.
router.get('/mine/usual', customerAuth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.customer.id })
      .select('items')
      .sort({ createdAt: -1 })
      .limit(PERSONAL_HISTORY_ORDER_LIMIT);

    const counts = new Map();
    for (const order of orders) {
      for (const line of order.items) {
        if (!line.menuItem) continue;
        const id = line.menuItem.toString();
        counts.set(id, (counts.get(id) || 0) + line.qty);
      }
    }
    const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
    if (topIds.length === 0) return res.json([]);

    const docs = await MenuItem.find({ _id: { $in: topIds }, available: true });
    const byId = new Map(docs.map(d => [d._id.toString(), d]));
    const ordered = topIds.map(id => byId.get(id)).filter(Boolean);
    res.json(ordered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get your usual order' });
  }
});

// GET /api/recommendations/:itemId — hybrid "frequently paired" suggestions
//   1. PERSONAL signal (only if logged in): items this exact customer has
//      ordered alongside itemId before — ranked first, since "you liked
//      this together" beats "strangers did."
//   2. GLOBAL signal: MenuItem.pairCounts, the co-occurrence count across
//      every order — fills in the rest / covers guests entirely.
//   3. True cold start (brand-new item, no order history anywhere): falls
//      back to other available items in the same category.
router.get('/:itemId', optionalCustomerAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(itemId)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    const item = await MenuItem.findById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const personalIds = req.customer ? await personalPairIds(req.customer.id, itemId) : [];

    const globalPairs = item.pairCounts || new Map();
    const globalSorted = Object.entries(globalPairs.toObject ? globalPairs.toObject() : globalPairs)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    const mergedIds = [];
    for (const id of personalIds) {
      if (mergedIds.length >= 3) break;
      if (!mergedIds.includes(id)) mergedIds.push(id);
    }
    for (const id of globalSorted) {
      if (mergedIds.length >= 3) break;
      if (id !== itemId && !mergedIds.includes(id)) mergedIds.push(id);
    }

    let docs;
    if (mergedIds.length === 0) {
      // Nobody has ever ordered this alongside anything yet (new menu item).
      docs = await MenuItem.find({ _id: { $ne: item._id }, category: item.category, available: true }).limit(3);
    } else {
      const found = await MenuItem.find({ _id: { $in: mergedIds }, available: true });
      const byId = new Map(found.map(d => [d._id.toString(), d]));
      docs = mergedIds.map(id => byId.get(id)).filter(Boolean);
    }

    const personalSet = new Set(personalIds);
    const result = docs.map(d => ({
      ...d.toObject(),
      personalized: personalSet.has(d._id.toString())
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

module.exports = router;