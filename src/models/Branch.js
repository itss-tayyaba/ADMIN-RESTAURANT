const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },

  // Short unique key used to reference this branch from the customer's
  // location picker and in URLs, e.g. "lahore-pk", "london-uk".
  code: { type: String, required: true, unique: true, trim: true, lowercase: true },

  country: { type: String, required: true, trim: true },
  // ISO 3166-1 alpha-2, e.g. "PK", "GB", "AU" — useful for flags/sorting later.
  countryCode: { type: String, required: true, trim: true, uppercase: true },
  city: { type: String, required: true, trim: true },

  // ISO 4217 currency code + the symbol actually shown on the menu/checkout.
  currency: { type: String, required: true, trim: true, uppercase: true }, // e.g. "PKR"
  currencySymbol: { type: String, required: true, trim: true }, // e.g. "Rs", "£", "A$"

  // IANA timezone, e.g. "Asia/Karachi" — needed later for "open now" logic
  // and for showing order times correctly to each branch's staff.
  timezone: { type: String, required: true, trim: true },

  // Decimal tax rate, e.g. 0.08 for 8%. Matches how Order.tax is computed.
  taxRate: { type: Number, required: true, default: 0 },

  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  // Branch-specific picture for its public landing page.
  heroImage: { type: String, default: '' },
  // Customer-facing delivery areas and payment labels are branch specific.
  // Keep these on the branch rather than in global constants: a London
  // customer must never be offered Faisalabad zones or Pakistan-only methods.
  deliveryZones: { type: [String], default: [] },
  paymentMethods: { type: [String], default: [] },

  // Branch's center point, same GeoJSON convention as Order.deliveryLocation
  // ([longitude, latitude]) — used later for "which branch covers this
  // customer's address" and delivery-radius checks.
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

  // Lets you take a branch offline (e.g. "coming soon" in a new country)
  // without deleting it or breaking historical orders that reference it.
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

branchSchema.index({ location: '2dsphere' });

// Seeds exactly one branch representing the restaurant as it exists today,
// the same way AdminUser.createDefaultAdmin() seeds the first admin. Safe
// to call on every server start — it's a no-op once the branch exists.
//
// IMPORTANT: update the placeholder country/city/currency/timezone/taxRate
// below to match your actual restaurant before deploying this.
branchSchema.statics.createDefaultBranch = async function () {
  const existing = await this.findOne({ code: 'default' });
  if (existing) return existing;

  return this.create({
    name: 'Ember & Brew — Original',
    code: 'default',
    country: 'Pakistan',       // <-- set to your real country
    countryCode: 'PK',         // <-- set to your real ISO country code
    city: 'Lahore',            // <-- set to your real city
    currency: 'PKR',           // <-- set to your real currency code
    currencySymbol: 'Rs',      // <-- set to your real currency symbol
    timezone: 'Asia/Karachi',  // <-- set to your real IANA timezone
    taxRate: 0.08,             // <-- set to your real tax rate
    address: '',
    phone: '',
    heroImage: '',
    deliveryZones: [],
    paymentMethods: ['Cash on delivery']
  });
};

module.exports = mongoose.model('Branch', branchSchema);
