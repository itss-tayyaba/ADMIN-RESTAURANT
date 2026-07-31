const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

// Middleware: verify a customer JWT (exported for use in orders/complaints routes)
function customerAuth(req, res, next) {
  const header = req.headers.authorization;

  console.log("Authorization Header:", header);

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

    console.log("Decoded JWT:", decoded);

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

function signCustomerToken(customer) {
  return jwt.sign(
    {
      id: customer._id,
      name: customer.name,
      role: 'customer'
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '30d'
    }
  );
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

    if (!/^\d{11}$/.test(phone)) {
      return res.status(400).json({
        error: 'Phone number must be exactly 11 digits.'
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