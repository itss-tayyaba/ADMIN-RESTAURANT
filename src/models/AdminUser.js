const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'owner', 'admin', 'chef', 'delivery'],
    default: 'chef'
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
  active: {
    type: Boolean,
    default: true
  },
  region: {
    type: String,
    default: null,
    trim: true
  },
  phone: {
    type: String,
    default: '',
    trim: true
  },
  activeOrders: {
    type: Number,
    default: 0,
    min: 0
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  passwordStatus: {
    type: String,
    enum: ['temporary', 'changed', 'active'],
    default: 'active'
  },
  lastPasswordChange: {
    type: Date,
    default: null
  },
  passwordChangedBy: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Staff names only need to be unique inside one restaurant. This lets every
// customer use familiar credentials such as "admin" or "chef" safely.
adminUserSchema.index({ tenantId: 1, username: 1 }, { unique: true });

adminUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

adminUserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

adminUserSchema.statics.createDefaultSuperadmin = async function() {
  const existing = await this.findOne({ username: 'superadmin' });
  if (existing) return existing;
  return this.create({
    username: 'superadmin',
    password: process.env.DEFAULT_SUPERADMIN_PASSWORD || 'superadmin123',
    name: 'Platform Superadmin',
    role: 'superadmin',
    tenantId: null,
    branchId: null
  });
};

adminUserSchema.statics.createDefaultAdmin = async function(tenantId, branchId) {
  const existing = await this.findOne({ username: 'admin' });
  if (existing) {
    if (!existing.tenantId && tenantId) existing.tenantId = tenantId;
    if (!existing.branchId && branchId) existing.branchId = branchId;
    await existing.save();
    return existing;
  }
  return this.create({
    username: 'admin',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
    name: 'Ember Admin',
    role: 'admin',
    tenantId: tenantId || null,
    branchId: branchId || null
  });
};

adminUserSchema.statics.createDefaultChef = async function(tenantId, branchId) {
  const existing = await this.findOne({ username: 'chef' });
  if (existing) {
    if (!existing.tenantId && tenantId) existing.tenantId = tenantId;
    if (!existing.branchId && branchId) existing.branchId = branchId;
    await existing.save();
    return existing;
  }
  return this.create({
    username: 'chef',
    password: process.env.DEFAULT_CHEF_PASSWORD || 'chef123',
    name: 'Head Chef',
    role: 'chef',
    tenantId: tenantId || null,
    branchId: branchId || null
  });
};

adminUserSchema.statics.createDefaultDelivery = async function(tenantId, branchId) {
  const existing = await this.findOne({ username: 'delivery' });
  if (existing) {
    if (!existing.tenantId && tenantId) existing.tenantId = tenantId;
    if (!existing.branchId && branchId) existing.branchId = branchId;
    await existing.save();
    return existing;
  }
  return this.create({
    username: 'delivery',
    password: process.env.DEFAULT_DELIVERY_PASSWORD || 'delivery123',
    name: 'Main Rider',
    role: 'delivery',
    tenantId: tenantId || null,
    branchId: branchId || null
  });
};

module.exports = mongoose.model('AdminUser', adminUserSchema);
