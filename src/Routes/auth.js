const express = require('express');
const router = express.Router();
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');

// POST /api/auth/login — admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await AdminUser.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (role && user.role !== role) {
      return res.status(403).json({ error: `This account is registered as "${user.role}", not "${role}". Please select the correct role.` });
    }

    // Migrate pre-branch staff accounts as they next sign in. They all belong
    // to the original restaurant branch; without this, new branch-scoped
    // orders are invisible to an old chef/admin/rider session.
    if (user.role !== 'superadmin' && !user.branchId) {
      const Branch = require('../models/Branch');
      const defaultBranch = await Branch.createDefaultBranch();
      user.branchId = defaultBranch._id;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, branchId: user.branchId || null },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, user: { username: user.username, role: user.role, branchId: user.branchId || null } });
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
