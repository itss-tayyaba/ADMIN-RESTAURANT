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
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: false, default: null, index: true },
  // True when this order was placed without a customer account (guest checkout).
  isGuestOrder: { type: Boolean, default: false },
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
  // GeoJSON Point uses [longitude, latitude] (not [latitude, longitude]).
  deliveryLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: {
      type: [Number],
      required: false
    }
  },
  // Updated only by the assigned rider while an order is out for delivery.
  riderLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: { type: [Number], required: false },
    updatedAt: { type: Date, required: false }
  },
  // Fixed region the order falls under (only used for orderType 'delivery').
  // This is what the auto-assignment system matches against a rider's region.
  region: { type: String, default: '' },
  notes: String,
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  deliveryBoyName: { type: String, default: '' },
  deliveryBoyPhone: { type: String, default: '' },
  assignedAt: Date,
  deliveredAt: Date,
  // Hidden from standard query results; selected only while the server verifies it.
  otp: { type: String, select: false },
  otpVerified: { type: Boolean, default: false },
  statusLog: [statusLogSchema]
}, { timestamps: true });

orderSchema.index({ deliveryLocation: '2dsphere' });

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