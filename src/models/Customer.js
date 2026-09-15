const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const customerSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^(0\d{9,11}|\+?[1-9]\d{6,14})$/, 'Enter a valid phone number.']
  },
  password: { type: String, required: true }
}, { timestamps: true });

customerSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
customerSchema.index({ tenantId: 1, phone: 1 });

customerSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

customerSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Customer', customerSchema);
