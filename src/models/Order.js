const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: String,
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true }
});

const statusLogSchema = new mongoose.Schema({
  status: { type: String, required: true },
  time: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled'],
    default: 'received',
    index: true
  },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  orderType: { type: String, enum: ['dine-in', 'takeaway', 'delivery'] },
  deliveryAddress: String,
  // Fixed region the order falls under (only used for orderType 'delivery').
  // This is what the auto-assignment system matches against a rider's region.
  region: { type: String, default: '' },
  notes: String,
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  deliveryBoyName: { type: String, default: '' },
  deliveryBoyPhone: { type: String, default: '' },
  assignedAt: Date,
  deliveredAt: Date,
  statusLog: [statusLogSchema]
}, { timestamps: true });

// After saving an order, update pair counts for AI recommendations
orderSchema.post('save', async function() {
  if (this.items.length < 2) return;
  const MenuItem = mongoose.model('MenuItem');
  const itemIds = this.items.map(i => i.menuItem?.toString()).filter(Boolean);

  for (let i = 0; i < itemIds.length; i++) {
    for (let j = 0; j < itemIds.length; j++) {
      if (i === j) continue;
      await MenuItem.updateOne(
        { _id: itemIds[i] },
        { $inc: { [`pairCounts.${itemIds[j]}`]: 1 } }
      );
    }
  }
});

module.exports = mongoose.model('Order', orderSchema);