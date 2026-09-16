const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  tagline: {
    type: String,
    default: 'Artisan Culinary & Kitchen',
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  logo: {
    type: String,
    default: '/images/app-logo.png'
  },
  banner: {
    type: String,
    default: '/images/app-logo.png'
  },
  theme: {
    primaryColor: { type: String, default: '#D4A853' },
    secondaryColor: { type: String, default: '#C67D5A' },
    accentColor: { type: String, default: '#D4A853' },
    bgDark: { type: String, default: '#0F0E0C' }
  },
  contact: {
    email: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    website: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true }
  },
  socials: {
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    tiktok: { type: String, default: '' }
  },
  currency: {
    type: String,
    default: 'PKR',
    trim: true,
    uppercase: true
  },
  currencySymbol: {
    type: String,
    default: 'Rs',
    trim: true
  },
  settings: {
    allowDelivery: { type: Boolean, default: true },
    allowTakeaway: { type: Boolean, default: true },
    allowDineIn: { type: Boolean, default: true },
    allowReservations: { type: Boolean, default: true },
    taxRate: { type: Number, default: 0.08 }
  },
  ownerName: {
    type: String,
    default: '',
    trim: true
  },
  ownerEmail: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  ownerPhone: {
    type: String,
    default: '',
    trim: true
  },
  country: {
    type: String,
    default: 'Pakistan',
    trim: true
  },
  timezone: {
    type: String,
    default: 'Asia/Karachi',
    trim: true
  },
  plan: {
    type: String,
    enum: ['starter', 'pro', 'enterprise'],
    default: 'pro'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'annual'],
    default: 'monthly'
  },
  subscriptionExpiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  },
  status: {
    type: String,
    enum: ['active', 'trial', 'suspended'],
    default: 'active',
    index: true
  },
  customPlanPrice: {
    type: Number,
    default: null
  },
  subscriptionNotes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

tenantSchema.statics.createDefaultTenant = async function () {
  let tenant = await this.findOne({ slug: 'ember-and-brew' });
  if (!tenant) {
    tenant = await this.create({
      name: 'Ember & Brew',
      slug: 'ember-and-brew',
      tagline: 'Artisan Coffee & Kitchen',
      description: 'Small-batch coffee, seasonal plates, and a warm room to slow down in.',
      logo: '/images/app-logo.png',
      banner: '/images/app-logo.png',
      theme: {
        primaryColor: '#D4A853',
        secondaryColor: '#C67D5A',
        accentColor: '#D4A853',
        bgDark: '#0F0E0C'
      },
      contact: {
        email: 'hello@emberandbrew.co',
        phone: '+92 320 6551696',
        website: 'https://emberandbrew.co',
        address: '214 Maple & 5th, Downtown Historic District'
      },
      currency: 'PKR',
      currencySymbol: 'Rs',
      settings: {
        allowDelivery: true,
        allowTakeaway: true,
        allowDineIn: true,
        allowReservations: true,
        taxRate: 0.08
      },
      ownerName: 'Tayyaba Batool',
      ownerEmail: 'tayyaba@emberandbrew.co',
      ownerPhone: '+923206551696',
      country: 'Pakistan',
      timezone: 'Asia/Karachi',
      plan: 'enterprise',
      status: 'active'
    });
    console.log('✅ Default Tenant (Ember & Brew) created.');
  }

  return tenant;
};

module.exports = mongoose.model('Tenant', tenantSchema);
