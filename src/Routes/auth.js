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
        username: user.username,
        role: user.role,
        tenantId: user.tenantId || null,
        branchId: user.branchId || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
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
