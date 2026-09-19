const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { resolveTenant } = require('../utils/tenantScope');

// Middleware: verify a customer JWT (exported for use in orders/complaints routes)
function customerAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Please log in to continue.'
    });
  }

  try {
    const decoded = jwt.verify(
      header.split(' ')[1],
      process.env.JWT_SECRET
    );

    if (decoded.role !== 'customer') {
      return res.status(403).json({
        error: 'Not a customer account.'
      });
    }

    req.customer = decoded;

    next();

  } catch (err) {
    console.error("JWT ERROR:", err);

    return res.status(401).json({
      error: 'Your session expired. Please log in again.'
    });
  }
}

// Middleware: attach req.customer if a valid token is present, but never
// block the request when it's missing — used on routes (like placing an
// order) that must also work for guest checkout. An expired/invalid token
// is treated the same as no token, rather than hard-failing, so a stale
// session left over in localStorage can't block a guest order.
function optionalCustomerAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role === 'customer') {
      req.customer = decoded;
    }
  } catch (err) {
    // Ignore — proceed as guest.
  }

  next();
}

function signCustomerToken(customer) {
  return jwt.sign(
    {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      tenantId: customer.tenantId,
      role: 'customer'
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '30d'
    }
  );
}

function getPhoneVariations(phone) {
  const raw = String(phone || '').trim().replace(/[\s()-]/g, '');
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const list = new Set([raw]);
  if (raw.startsWith('+')) {
    list.add(raw.slice(1));
  } else {
    list.add(`+${raw}`);
  }
  if (digits.startsWith('92') && digits.length >= 10) {
    list.add(`0${digits.slice(2)}`);
    list.add(`+${digits}`);
    list.add(digits);
  } else if (digits.startsWith('0') && digits.length >= 10) {
    list.add(`+92${digits.slice(1)}`);
    list.add(`92${digits.slice(1)}`);
    list.add(digits);
  }
  return Array.from(list);
}

// Link any orders placed as a guest (customer: null) with this phone number
// to the now-authenticated account, so past guest orders show up in "My
// Orders" instead of being stranded forever. Runs on both register and
// login so it also catches guest orders placed *after* the account already
// existed, e.g. on another device without signing in.
async function claimGuestOrders(customer) {
  if (!customer?.phone) return;
  try {
    const phones = getPhoneVariations(customer.phone);
    await Order.updateMany(
      { customer: null, tenantId: customer.tenantId, customerPhone: { $in: phones } },
      { $set: { customer: customer._id } }
    );
  } catch (err) {
    // Never let a claim failure block login/register.
    console.error('Failed to link guest orders to account:', err);
  }
}

// POST /api/customer-auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const tenantId = await resolveTenant(req);

    if (!name || !phone || !password) {
      return res.status(400).json({
        error: 'Name, phone, and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters.'
      });
    }

    const cleanPhone = String(phone || '').trim().replace(/[\s()-]/g, '');
    if (!/^(0\d{9,11}|\+?[1-9]\d{6,14})$/.test(cleanPhone)) {
      return res.status(400).json({
        error: 'Enter a valid phone number (e.g. 03206551696 or +92306551696).'
      });
    }

    if (email && String(email).trim()) {
      const cleanEmail = String(email).trim().toLowerCase();
      const existing = await Customer.findOne({
        $or: [
          { tenantId, email: cleanEmail },
          { tenantId: null, email: cleanEmail },
          { tenantId: { $exists: false }, email: cleanEmail }
        ]
      });

      if (existing) {
        return res.status(409).json({
          error: 'An account with that email already exists. Please sign in.'
        });
      }
    }

    const phoneCandidates = getPhoneVariations(cleanPhone);
    const existingPhone = await Customer.findOne({
      $or: [
        { tenantId, phone: { $in: phoneCandidates } },
        { tenantId: null, phone: { $in: phoneCandidates } },
        { tenantId: { $exists: false }, phone: { $in: phoneCandidates } }
      ]
    });
    if (existingPhone) {
      return res.status(409).json({
        error: 'An account with this phone number already exists. Please sign in.'
      });
    }

    const customer = new Customer({
      name: name.trim(),
      email: email && String(email).trim() ? String(email).trim().toLowerCase() : undefined,
      phone: cleanPhone,
      tenantId,
      password
    });

    await customer.save();
    await claimGuestOrders(customer);

    const token = signCustomerToken(customer);

    res.status(201).json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone
      }
    });

  } catch (err) {
    console.error('Customer registration error:', err);

    if (err.code === 11000) {
      const keyStr = JSON.stringify(err.keyPattern || err.keyValue || {});
      if (keyStr.includes('email') || err.message?.includes('email')) {
        return res.status(409).json({
          error: 'An account with that email already exists. Please sign in.'
        });
      }
      if (keyStr.includes('phone') || err.message?.includes('phone')) {
        return res.status(409).json({
          error: 'An account with this phone number already exists. Please sign in.'
        });
      }
      return res.status(409).json({
        error: 'An account with these details already exists. Please sign in.'
      });
    }

    if (err.name === 'ValidationError') {
      const firstMsg = Object.values(err.errors || {})[0]?.message || 'Invalid customer details.';
      return res.status(400).json({ error: firstMsg });
    }

    res.status(500).json({
      error: 'Could not create account. Please try again.'
    });
  }
});

// POST /api/customer-auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const tenantId = await resolveTenant(req);

    if (!identifier || !password) {
      return res.status(400).json({
        error: 'Email/phone and password are required.'
      });
    }

    const cleanId = String(identifier || '').trim();
    let query;
    if (cleanId.includes('@')) {
      query = {
        $or: [
          { tenantId, email: cleanId.toLowerCase() },
          { tenantId: null, email: cleanId.toLowerCase() },
          { tenantId: { $exists: false }, email: cleanId.toLowerCase() }
        ]
      };
    } else {
      const phoneVars = getPhoneVariations(cleanId);
      query = {
        $or: [
          { tenantId, phone: { $in: phoneVars } },
          { tenantId: null, phone: { $in: phoneVars } },
          { tenantId: { $exists: false }, phone: { $in: phoneVars } }
        ]
      };
    }

    const customer = await Customer.findOne(query);

    if (!customer) {
      return res.status(401).json({
        error: 'Invalid credentials.'
      });
    }

    const match = await customer.comparePassword(password);

    if (!match) {
      return res.status(401).json({
        error: 'Invalid credentials.'
      });
    }

    // Auto-migrate legacy accounts to the default tenant on login
    if (!customer.tenantId && tenantId) {
      customer.tenantId = tenantId;
      await customer.save().catch(e => console.warn('Could not backfill tenantId on login:', e));
    }

    await claimGuestOrders(customer);

    const token = signCustomerToken(customer);

    res.json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone
      }
    });

  } catch (err) {
    console.error('Customer login error:', err);

    res.status(500).json({
      error: 'Login failed.'
    });
  }
});

// GET /api/customer-auth/me
router.get('/me', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.customer.id, tenantId: req.customer.tenantId }).select('-password');

    if (!customer) {
      return res.status(404).json({
        error: 'Account not found.'
      });
    }

    res.json(customer);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Could not load account.'
    });
  }
});

module.exports = router;
module.exports.customerAuth = customerAuth;
module.exports.optionalCustomerAuth = optionalCustomerAuth;
