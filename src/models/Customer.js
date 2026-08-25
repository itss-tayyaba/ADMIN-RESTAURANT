const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  // Which branch this customer originally signed up at. Not enforced — a
  // customer can still order from other branches later once that's built.
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^(0\d{9,11}|\+?[1-9]\d{6,14})$/, 'Enter a valid phone number (e.g. 03206551696 or +92306551696).']
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
