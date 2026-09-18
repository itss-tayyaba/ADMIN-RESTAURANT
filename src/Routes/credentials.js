const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const AuditLog = require('../models/AuditLog');

// Middleware: Superadmin only
function superAdminOnly(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Generate cryptographically secure temporary password
function generateTempPassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const allChars = upper + lower + digits + symbols;

  const password = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)]
  ];

  for (let i = 4; i < length; i++) {
    password.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

// Helper: Log security audit event
async function logAuditEvent({
  action,
  targetUserId = null,
  targetUsername = '',
  tenantId = null,
  tenantName = '',
  branchId = null,
  branchName = '',
  details = '',
  performedBy = 'Superadmin',
  performedByRole = 'superadmin',
  ip = ''
}) {
  try {
    await AuditLog.create({
      action,
      targetUserId,
      targetUsername,
      tenantId,
      tenantName,
      branchId,
      branchName,
      details,
      performedBy,
      performedByRole,
      ip
    });
  } catch (err) {
    console.error('Failed to log audit event:', err.message);
  }
}

// -----------------------------------------------------------------------------
// 1. GET /api/credentials — List all restaurant & branch admin credentials
// -----------------------------------------------------------------------------
router.get('/', superAdminOnly, async (req, res) => {
  try {
    const users = await AdminUser.find({})
      .populate('tenantId', 'name slug country status plan billingCycle subscriptionExpiresAt')
      .populate('branchId', 'name code city country isActive')
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();

    const enriched = users.map(u => {
      const tenant = u.tenantId || null;
      const branch = u.branchId || null;

      // Compute trial & subscription info
      let trialStatus = 'no_subscription';
      let trialDaysLeft = null;
      let isTrialExpired = false;

      if (tenant) {
        const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
        if (expiresAt) {
          trialDaysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
        }

        if (tenant.status === 'trial') {
          if (trialDaysLeft !== null && trialDaysLeft < 0) {
            trialStatus = 'trial_expired';
            isTrialExpired = true;
          } else {
            trialStatus = 'in_trial';
          }
        } else if (tenant.status === 'active') {
          trialStatus = 'active_paid';
        } else if (tenant.status === 'suspended') {
          trialStatus = 'suspended';
        }
      }

      // Compute overall account status
      let accountStatus = 'active';
      if (u.active === false) {
        accountStatus = 'disabled';
      } else if (branch && branch.isActive === false) {
        accountStatus = 'branch_suspended';
      } else if (tenant && tenant.status === 'suspended') {
        accountStatus = 'tenant_suspended';
      }

      // Password metadata
      const mustChange = Boolean(u.mustChangePassword);
      const pwdStatus = u.passwordStatus || (mustChange ? 'temporary' : 'changed');

      return {
        _id: u._id,
        username: u.username,
        name: u.name || u.username,
        email: u.email || '',
        role: u.role,
        active: u.active !== false,
        accountStatus,
        tenant: tenant ? {
          _id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          country: tenant.country,
          status: tenant.status,
          plan: tenant.plan || 'pro',
          subscriptionExpiresAt: tenant.subscriptionExpiresAt
        } : null,
        branch: branch ? {
          _id: branch._id,
          name: branch.name,
          code: branch.code,
          city: branch.city,
          country: branch.country,
          isActive: branch.isActive !== false
        } : null,
        trial: {
          status: trialStatus,
          daysLeft: trialDaysLeft,
          isExpired: isTrialExpired,
          expiresAt: tenant?.subscriptionExpiresAt || null,
          plan: tenant?.plan || 'pro'
        },
        passwordSecurity: {
          mustChangePassword: mustChange,
          passwordStatus: pwdStatus,
          lastPasswordChange: u.lastPasswordChange || null,
          passwordChangedBy: u.passwordChangedBy || (pwdStatus === 'changed' ? 'Branch Admin' : 'Superadmin')
        },
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
      };
    });

    res.json({ credentials: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch credentials list' });
  }
});

// -----------------------------------------------------------------------------
// 2. POST /api/credentials/reset-password — Reset password to secure temporary password
// -----------------------------------------------------------------------------
router.post('/reset-password', superAdminOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await AdminUser.findById(userId)
      .populate('tenantId', 'name')
      .populate('branchId', 'name');

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    if (user.role === 'superadmin' && req.admin.id !== String(user._id)) {
      return res.status(403).json({ error: 'Cannot reset another superadmin via this action' });
    }

    const tempPassword = generateTempPassword(12);

    // Save temporary password (bcrypt pre-save hook will hash it)
    user.password = tempPassword;
    user.mustChangePassword = true;
    user.passwordStatus = 'temporary';
    user.lastPasswordChange = new Date();
    user.passwordChangedBy = 'Superadmin';
    await user.save();

    // Audit log
    await logAuditEvent({
      action: 'password_reset',
      targetUserId: user._id,
      targetUsername: user.username,
      tenantId: user.tenantId?._id || null,
      tenantName: user.tenantId?.name || '',
      branchId: user.branchId?._id || null,
      branchName: user.branchId?.name || '',
      details: 'Superadmin reset password. Temporary password generated and must be changed on next login.',
      performedBy: req.admin.username || 'Superadmin',
      performedByRole: 'superadmin',
      ip: req.ip || ''
    });

    res.json({
      success: true,
      message: 'Temporary password generated successfully',
      tempPassword,
      username: user.username,
      name: user.name || user.username,
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
});

// -----------------------------------------------------------------------------
// 3. POST /api/credentials/toggle-status — Suspend or Reactivate account / branch / tenant
// -----------------------------------------------------------------------------
router.post('/toggle-status', superAdminOnly, async (req, res) => {
  try {
    const { userId, action, scope = 'user', extendDays } = req.body;

    if (!userId || !action || !['suspend', 'reactivate'].includes(action)) {
      return res.status(400).json({ error: 'User ID and valid action (suspend/reactivate) are required' });
    }

    const user = await AdminUser.findById(userId)
      .populate('tenantId', 'name status subscriptionExpiresAt')
      .populate('branchId', 'name isActive');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isSuspend = action === 'suspend';
    const performer = req.admin.username || 'Superadmin';

    // 1. Update user account status
    user.active = !isSuspend;
    await user.save();

    // 2. Optionally apply to Branch or Tenant without deleting any data
    let branchUpdated = false;
    let tenantUpdated = false;

    if ((scope === 'branch' || scope === 'all') && user.branchId) {
      await Branch.findByIdAndUpdate(user.branchId._id, { isActive: !isSuspend });
      branchUpdated = true;
    }

    if ((scope === 'tenant' || scope === 'all') && user.tenantId) {
      const updateData = { status: isSuspend ? 'suspended' : 'active' };
      if (!isSuspend && extendDays) {
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + Number(extendDays));
        updateData.subscriptionExpiresAt = newExpiry;
      }
      await Tenant.findByIdAndUpdate(user.tenantId._id, updateData);
      tenantUpdated = true;
    }

    // 3. Audit Log
    const logAction = isSuspend
      ? (scope === 'branch' ? 'branch_suspended' : (scope === 'tenant' ? 'tenant_suspended' : 'account_suspended'))
      : (scope === 'branch' ? 'branch_reactivated' : (scope === 'tenant' ? 'tenant_reactivated' : 'account_reactivated'));

    await logAuditEvent({
      action: logAction,
      targetUserId: user._id,
      targetUsername: user.username,
      tenantId: user.tenantId?._id || null,
      tenantName: user.tenantId?.name || '',
      branchId: user.branchId?._id || null,
      branchName: user.branchId?.name || '',
      details: isSuspend
        ? `Account suspended by ${performer} (Scope: ${scope}). Restaurant data preserved.`
        : `Account reactivated by ${performer} (Scope: ${scope}).`,
      performedBy: performer,
      performedByRole: 'superadmin',
      ip: req.ip || ''
    });

    res.json({
      success: true,
      message: isSuspend ? 'Account suspended successfully' : 'Account reactivated successfully',
      active: user.active,
      branchUpdated,
      tenantUpdated
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update account status' });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/credentials/create-admin — Create branch admin with temporary password
// -----------------------------------------------------------------------------
router.post('/create-admin', superAdminOnly, async (req, res) => {
  try {
    const { tenantId, branchId, username, name, email, role = 'admin' } = req.body;

    if (!tenantId || !username || !username.trim()) {
      return res.status(400).json({ error: 'Restaurant tenant and username are required' });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check duplicate inside tenant
    const existing = await AdminUser.findOne({ tenantId, username: cleanUsername });
    if (existing) {
      return res.status(400).json({ error: `An admin account with username "${cleanUsername}" already exists for this restaurant` });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurant tenant not found' });
    }

    let branch = null;
    if (branchId) {
      branch = await Branch.findById(branchId);
    }

    const tempPassword = generateTempPassword(12);

    const newUser = await AdminUser.create({
      username: cleanUsername,
      password: tempPassword,
      name: (name && name.trim()) || cleanUsername,
      email: (email && email.trim().toLowerCase()) || '',
      role: ['admin', 'owner', 'chef'].includes(role) ? role : 'admin',
      tenantId: tenant._id,
      branchId: branch ? branch._id : null,
      active: true,
      mustChangePassword: true,
      passwordStatus: 'temporary',
      lastPasswordChange: new Date(),
      passwordChangedBy: 'Superadmin'
    });

    // Audit log
    await logAuditEvent({
      action: 'account_created',
      targetUserId: newUser._id,
      targetUsername: newUser.username,
      tenantId: tenant._id,
      tenantName: tenant.name,
      branchId: branch ? branch._id : null,
      branchName: branch ? branch.name : '',
      details: `Branch admin account created by Superadmin with temporary password.`,
      performedBy: req.admin.username || 'Superadmin',
      performedByRole: 'superadmin',
      ip: req.ip || ''
    });

    res.status(201).json({
      success: true,
      message: 'Branch admin account created successfully',
      user: {
        _id: newUser._id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        tenantId: tenant._id,
        branchId: branch ? branch._id : null
      },
      tempPassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create branch admin account' });
  }
});

// -----------------------------------------------------------------------------
// 5. GET /api/credentials/audit-logs — Retrieve security audit trail
// -----------------------------------------------------------------------------
router.get('/audit-logs', superAdminOnly, async (req, res) => {
  try {
    const logs = await AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ auditLogs: logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

module.exports = router;
