const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{11}$/, 'Phone number must be exactly 11 digits.']
  },
  password: { type: String, required: true }
}, { timestamps: true });

// A customer can be looked up by email OR phone, but at least email should
// be unique when present so it can double as a login handle.
customerSchema.index({ email: 1 }, { unique: true, sparse: true });

customerSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

customerSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Customer', customerSchema);