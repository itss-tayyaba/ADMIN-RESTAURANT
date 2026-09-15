const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, default: '' },
  orderNumber: { type: String, default: '' },
  subject: { type: String, default: 'General' },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ['new', 'in-progress', 'resolved'],
    default: 'new',
    index: true
  },
  adminNote: { type: String, default: '' }
}, { timestamps: true });

complaintSchema.index({ tenantId: 1, branchId: 1, status: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
