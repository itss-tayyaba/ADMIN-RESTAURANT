const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, index: true },
  image: { type: String, required: true },
  available: { type: Boolean, default: true },
  pairCounts: {
    type: Map,
    of: Number,
    default: {}
    // Key: menuItemId, Value: co-occurrence count
    // Updated every time an order is placed
  }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);