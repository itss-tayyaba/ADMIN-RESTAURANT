const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, index: true },
  image: { type: String, required: true },
  available: { type: Boolean, default: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  pairCounts: {
    type: Map,
    of: Number,
    default: {}
  }
}, { timestamps: true });

menuItemSchema.index({ tenantId: 1, category: 1 });
menuItemSchema.index({ tenantId: 1, branchId: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
