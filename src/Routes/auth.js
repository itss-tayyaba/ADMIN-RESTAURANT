const express = require('express');
const router = express.Router();
const AdminUser = require('../models/AdminUser');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// POST /api/auth/login — admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password, role, tenant } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    let tenantRecord = null;
    if (tenant && role !== 'superadmin') {
      const tenantValue = String(tenant).trim().toLowerCase();
      tenantRecord = await Tenant.findOne({
        $or: [{ slug: tenantValue }, ...(mongoose.isValidObjectId(tenantValue) ? [{ _id: tenantValue }] : [])]
      });
      if (!tenantRecord || !['active', 'trial'].includes(tenantRecord.status)) {
        return res.status(401).json({ error: 'This restaurant is unavailable.' });
      }
    }

    const userQuery = { username: String(username).trim() };
    if (tenantRecord) userQuery.tenantId = tenantRecord._id;
    if (role) {
      if (role === 'admin') userQuery.role = { $in: ['admin', 'owner'] };
      else userQuery.role = role;
    }
    const matches = await AdminUser.find(userQuery).limit(2);
    if (!tenantRecord && matches.length > 1) {
      return res.status(400).json({ error: 'Enter your restaurant code to sign in.' });
    }
    const user = matches[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.active) return res.status(403).json({ error: 'This account has been disabled.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (role && user.role !== role) {
      const isOwnerAdmin = role === 'admin' && user.role === 'owner';
      if (!isOwnerAdmin) {
        return res.status(403).json({ error: 'This account is registered as "' + user.role + '", not "' + role + '". Please select the correct role.' });
      }
    }

    // Auto-link staff to default tenant and branch if missing
    if (user.role !== 'superadmin' && (!user.tenantId || !user.branchId)) {
      const defaultTenant = await Tenant.createDefaultTenant();
      const defaultBranch = await Branch.createDefaultBranch(defaultTenant._id);
      if (!user.tenantId) user.tenantId = defaultTenant._id;
      if (!user.branchId) user.branchId = defaultBranch._id;
      await user.save();
    }

    if (user.role !== 'superadmin') {
      const accountTenant = await Tenant.findById(user.tenantId).select('status');
      if (!accountTenant || !['active', 'trial'].includes(accountTenant.status)) {
        return res.status(403).json({ error: 'This restaurant account is suspended.' });
      }

      if (user.branchId) {
        const accountBranch = await Branch.findById(user.branchId).select('isActive');
        if (accountBranch && accountBranch.isActive === false) {
          return res.status(403).json({ error: 'This branch location is currently suspended.' });
        }
      }
    }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId || null,
        branchId: user.branchId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId || null,
        branchId: user.branchId || null,
        mustChangePassword: Boolean(user.mustChangePassword)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/change-password — User updates their temporary password
router.post('/change-password', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = await AdminUser.findById(decoded.id)
      .populate('tenantId', 'name')
      .populate('branchId', 'name');

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    user.password = newPassword; // Mongoose pre-save hook handles bcrypt hashing
    user.mustChangePassword = false;
    user.passwordStatus = 'changed';
    user.lastPasswordChange = new Date();
    user.passwordChangedBy = user.role === 'owner' ? 'Branch Owner' : 'Branch Admin';
    await user.save();

    // Security Audit Log
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      action: 'password_changed',
      targetUserId: user._id,
      targetUsername: user.username,
      tenantId: user.tenantId?._id || null,
      tenantName: user.tenantId?.name || '',
      branchId: user.branchId?._id || null,
      branchName: user.branchId?.name || '',
      details: `Password changed by ${user.username} (${user.role}).`,
      performedBy: user.role === 'owner' ? 'Branch Owner' : 'Branch Admin',
      performedByRole: user.role,
      ip: req.ip || ''
    }).catch(err => console.error('Audit log error:', err.message));

    // Refreshed token
    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId || null,
        branchId: user.branchId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      message: 'Password updated successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId || null,
        branchId: user.branchId || null,
        mustChangePassword: false
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to change password' });
  }
});

// GET /api/auth/verify — verify token is still valid
router.get('/verify', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

module.exports = router;
