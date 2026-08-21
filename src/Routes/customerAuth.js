const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

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
      role: 'customer'
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '30d'
    }
  );
}

// Link any orders placed as a guest (customer: null) with this phone number
// to the now-authenticated account, so past guest orders show up in "My
// Orders" instead of being stranded forever. Runs on both register and
// login so it also catches guest orders placed *after* the account already
// existed, e.g. on another device without signing in.
async function claimGuestOrders(customer) {
  if (!customer?.phone) return;
  try {
    await Order.updateMany(
      { customer: null, customerPhone: customer.phone },
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

    if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
      return res.status(400).json({
        error: 'Enter a valid international phone number.'
      });
    }

    if (email) {
      const existing = await Customer.findOne({
        email: email.toLowerCase()
      });

      if (existing) {
        return res.status(409).json({
          error: 'An account with that email already exists.'
        });
      }
    }

    const customer = new Customer({
      name,
      email: email || '',
      phone,
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
        email: customer.email,
        phone: customer.phone
      }
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Could not create account.'
    });
  }
});

// POST /api/customer-auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        error: 'Email/phone and password are required.'
      });
    }

    const query = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { phone: identifier.trim() };

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

    await claimGuestOrders(customer);

    const token = signCustomerToken(customer);

    res.json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone
      }
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Login failed.'
    });
  }
});

// GET /api/customer-auth/me
router.get('/me', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.id).select('-password');

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
