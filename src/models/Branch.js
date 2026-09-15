const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true, lowercase: true },
  country: { type: String, required: true, trim: true },
  countryCode: { type: String, required: true, trim: true, uppercase: true },
  city: { type: String, required: true, trim: true },
  currency: { type: String, required: true, trim: true, uppercase: true },
  currencySymbol: { type: String, required: true, trim: true },
  timezone: { type: String, required: true, trim: true },
  taxRate: { type: Number, required: true, default: 0 },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  heroImage: { type: String, default: '' },
  deliveryZones: { type: [String], default: [] },
  paymentMethods: { type: [String], default: [] },
  location: {
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
  deliveryRadiusKm: { type: Number, default: 5 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

branchSchema.index({ location: '2dsphere' });
branchSchema.index({ tenantId: 1, code: 1 });

branchSchema.statics.createDefaultBranch = async function (tenantId) {
  let existing = await this.findOne({ code: 'default' });
  if (existing) {
    if (!existing.tenantId && tenantId) {
      existing.tenantId = tenantId;
      await existing.save();
    }
    return existing;
  }

  return this.create({
    tenantId: tenantId || null,
    name: 'Ember & Brew — Original',
    code: 'default',
    country: 'Pakistan',
    countryCode: 'PK',
    city: 'Lahore',
    currency: 'PKR',
    currencySymbol: 'Rs',
    timezone: 'Asia/Karachi',
    taxRate: 0.08,
    address: '214 Maple & 5th, Downtown',
    phone: '+92 320 6551696',
    heroImage: '',
    deliveryZones: [],
    paymentMethods: ['Cash on delivery', 'Card', 'Wallet']
  });
};

module.exports = mongoose.model('Branch', branchSchema);
