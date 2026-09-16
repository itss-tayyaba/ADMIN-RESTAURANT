const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Branch = require('../models/Branch');
const jwt = require('jsonwebtoken');
const { isAdminRole, resolveBranchId } = require('../utils/branchScope');
const { resolveTenant, addTenantScope } = require('../utils/tenantScope');

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (!isAdminRole(decoded.role)) {
      return res.status(403).json({ error: 'Admin access only.' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function generateOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'EB-' + rand;
}

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// POST /api/orders — place an order
router.post('/', async (req, res) => {
  try {
    const {
      items, orderType, deliveryAddress, deliveryLocation, region, notes,
      guestName, guestPhone, guestEmail, pushToken, tableNumber, branchId,
      paymentMethod, paymentDetails
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const requestedTenantId = await resolveTenant(req);
    let resolvedBranch = null;
    if (branchId) {
      resolvedBranch = await Branch.findOne({ _id: branchId, tenantId: requestedTenantId, isActive: true });
    }
    if (!resolvedBranch) {
      resolvedBranch = await Branch.findOne({ tenantId: requestedTenantId, isActive: true }).sort({ createdAt: 1 });
    }

    const tenantId = resolvedBranch?.tenantId || requestedTenantId;
    if (!resolvedBranch) return res.status(400).json({ error: 'Choose an active branch for this restaurant.' });
    const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const taxRate = resolvedBranch?.taxRate ?? 0.08;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    let customerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        customerId = decoded.id;
      } catch (_) {}
    }

    const orderNumber = generateOrderNumber();
    const otp = orderType === 'delivery' ? generateOtp() : undefined;

    const safeMethod = paymentMethod || 'cash';

    const order = new Order({
      orderNumber,
      tenantId,
      branchId: resolvedBranch?._id || null,
      customer: customerId,
      isGuestOrder: !customerId,
      items,
      subtotal,
      tax,
      total,
      customerName: guestName || 'Customer',
      customerPhone: guestPhone || '',
      customerEmail: guestEmail || '',
      pushTokens: pushToken ? [pushToken] : [],
      orderType: orderType || 'dine-in',
      tableNumber: tableNumber || '',
      deliveryAddress: deliveryAddress || '',
      deliveryLocation: deliveryLocation || null,
      region: region || '',
      notes: notes || '',
      paymentMethod: safeMethod,
      paymentStatus: 'PENDING',
      paymentDetails: {
        provider: safeMethod,
        senderName: paymentDetails?.senderName || '',
        referenceId: paymentDetails?.referenceId || paymentDetails?.transactionId || '',
        accountNumber: paymentDetails?.accountNumber || '',
        amountPaid: 0,
        currency: 'PKR',
        paidAt: null
      },
      otp,
      status: 'pending_admin',
      statusLog: [{ status: 'pending_admin', time: new Date() }]
    });

    await order.save();

    const io = req.app.get('io');
    if (io) {
      if (tenantId) io.to(`tenant:${tenantId}`).emit('order:new', order);
      if (resolvedBranch?._id) io.to(`branch:${resolvedBranch._id}`).emit('order:new', order);
    }
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to place order' });
  }
});

// GET /api/orders — Admin list orders
router.get('/', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin' ? (req.query.tenantId || null) : req.admin.tenantId;
    const branchId = resolveBranchId(req.admin, req.query);

    const filter = {};
    if (tenantId) await addTenantScope(filter, tenantId);
    if (branchId) filter.branchId = branchId;

    const orders = await Order.find(filter)
      .populate('tenantId', 'name slug currency currencySymbol')
      .populate('branchId', 'name code city country')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:orderNumber — public order tracking lookup
router.get('/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber.toUpperCase() })
      .select('+otp')
      .lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// PATCH /api/orders/:id/status — Admin update status
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const query = { _id: req.params.id };
    const tenantId = req.admin.role === 'superadmin' ? req.query.tenantId : req.admin.tenantId;
    if (tenantId) await addTenantScope(query, tenantId);
    const branchId = resolveBranchId(req.admin, req.query);
    if (branchId) query.branchId = branchId;
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = status;
    order.statusLog.push({ status, time: new Date() });
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;
