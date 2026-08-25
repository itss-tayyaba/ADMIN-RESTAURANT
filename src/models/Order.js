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
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: false, default: null, index: true },
  isGuestOrder: { type: Boolean, default: false },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending_admin', 'pending_kitchen', 'received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled'],
    default: 'pending_admin',
    index: true
  },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, default: '', trim: true },
  pushTokens: { type: [String], default: [] },
  orderType: { type: String, enum: ['dine-in', 'takeaway', 'delivery'], default: 'dine-in' },
  tableNumber: { type: String, default: '', trim: true },
  deliveryAddress: { type: String, default: '' },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'pending', 'paid', 'failed'],
    default: 'unpaid'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'jazzcash', 'easypaisa'],
    default: 'cash'
  },
  transactionId: { type: String, default: '' },
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
  riderLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: { type: [Number], required: false },
    updatedAt: { type: Date, required: false }
  },
  region: { type: String, default: '' },
  notes: { type: String, default: '' },
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  deliveryBoyName: { type: String, default: '' },
  deliveryBoyPhone: { type: String, default: '' },
  assignedAt: Date,
  deliveredAt: Date,
  otp: { type: String, select: false },
  otpVerified: { type: Boolean, default: false },
  statusLog: [statusLogSchema]
}, { timestamps: true });

orderSchema.index({ deliveryLocation: '2dsphere' });

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
