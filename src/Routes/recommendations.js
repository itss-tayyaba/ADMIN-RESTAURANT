const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');

// GET /api/recommendations/:itemId — AI "frequently paired" suggestions
// Uses co-occurrence counts stored in MenuItem.pairCounts
router.get('/:itemId', async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Get pair counts and sort by frequency
    const pairs = item.pairCounts || new Map();
    const sorted = Object.entries(pairs.toObject ? pairs.toObject() : pairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (sorted.length === 0) {
      // Fallback: return popular items from same category
      const fallback = await MenuItem.find({
        _id: { $ne: item._id },
        category: item.category,
        available: true
      }).limit(3);
      return res.json(fallback);
    }

    const recommended = await MenuItem.find({
      _id: { $in: sorted.map(s => s[0]) },
      available: true
    });

    // Attach score for potential weighting in frontend
    const scoreMap = Object.fromEntries(sorted);
    const result = recommended.map(r => ({
      ...r.toObject(),
      pairScore: scoreMap[r._id.toString()] || 0
    })).sort((a, b) => b.pairScore - a.pairScore);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

module.exports = router;