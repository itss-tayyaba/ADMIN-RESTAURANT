const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: true,
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null,
    index: true
  },
  customerName: {
    type: String,
    default: '',
    trim: true
  },
  customerEmail: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  customerPhone: {
    type: String,
    default: '',
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank-transfer', 'cod', 'cash'],
    required: true,
    set: (v) => {
      if (!v) return 'cash';
      const s = String(v).toLowerCase().trim();
      if (s.includes('stripe')) return 'stripe';
      if (s.includes('card')) return 'card';
      if (s.includes('jazz')) return 'jazzcash';
      if (s.includes('easy')) return 'easypaisa';
      if (s.includes('raast')) return 'raast';
      if (s.includes('bank')) return 'bank-transfer';
      if (s.includes('cod')) return 'cod';
      return 'cash';
    },
    index: true
  },
  provider: {
    type: String,
    required: true,
    trim: true
  },
  transactionId: {
    type: String,
    default: '',
    index: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR',
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'],
    default: 'PENDING',
    index: true,
    set: (v) => (v ? String(v).toUpperCase() : 'PENDING')
  },
  paidAt: {
    type: Date,
    default: null
  },
  refundedAt: {
    type: Date,
    default: null
  },
  refundAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  refundReason: {
    type: String,
    default: '',
    trim: true
  },
  refundId: {
    type: String,
    default: '',
    trim: true
  },
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  verifiedBy: {
    type: String,
    default: '',
    trim: true
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  notes: {
    type: String,
    default: '',
    trim: true
  }
}, { timestamps: true });

paymentSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
paymentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);