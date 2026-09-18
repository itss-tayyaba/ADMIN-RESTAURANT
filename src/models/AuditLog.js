const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'account_created',
      'password_changed',
      'password_reset',
      'account_suspended',
      'account_reactivated',
      'branch_suspended',
      'branch_reactivated',
      'tenant_suspended',
      'tenant_reactivated'
    ],
    index: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
    index: true
  },
  targetUsername: {
    type: String,
    default: '',
    trim: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  tenantName: {
    type: String,
    default: ''
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null,
    index: true
  },
  branchName: {
    type: String,
    default: ''
  },
  details: {
    type: String,
    default: ''
  },
  performedBy: {
    type: String,
    required: true,
    default: 'Superadmin'
  },
  performedByRole: {
    type: String,
    default: 'superadmin'
  },
  ip: {
    type: String,
    default: ''
  }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
