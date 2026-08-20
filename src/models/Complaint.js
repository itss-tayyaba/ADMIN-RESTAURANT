const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, default: '' },
  orderNumber: { type: String, default: '' }, // optional — links complaint to an order if given
  subject: { type: String, default: 'General' },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ['new', 'in-progress', 'resolved'],
    default: 'new',
    index: true
  },
  adminNote: { type: String, default: '' } // internal note admin can leave when resolving
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
