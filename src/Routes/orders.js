const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const AdminUser = require('../models/AdminUser');
const REGIONS = require('../data/regions');
const REGION_CENTERS = require('../data/regionCenters');
const jwt = require('jsonwebtoken');
const { isAdminRole, resolveBranchId } = require('../utils/branchScope');
const { resolveTenant, addTenantScope } = require('../utils/tenantScope');
const { customerAuth } = require('./customerAuth');
const { notifyCustomer } = require('../services/notificationService');

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
      paymentMethod, paymentDetails,
      customerName, customerPhone, customerEmail, table, address
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const sanitizedItems = items.map(it => {
      const rawId = it.menuItem || it.menuItemId || it.id || it._id;
      return {
        menuItem: mongoose.isValidObjectId(rawId) ? new mongoose.Types.ObjectId(rawId) : (rawId ? String(rawId) : null),
        name: String(it.name || 'Item'),
        qty: Math.max(1, Number(it.qty) || 1),
        price: Number(it.price) || 0
      };
    });

    const requestedTenantId = await resolveTenant(req);
    let resolvedBranch = null;
    if (branchId && mongoose.isValidObjectId(branchId)) {
      resolvedBranch = await Branch.findOne({ _id: branchId, isActive: true });
    }
    if (!resolvedBranch && requestedTenantId) {
      resolvedBranch = await Branch.findOne({ tenantId: requestedTenantId, isActive: true }).sort({ createdAt: 1 });
    }
    if (!resolvedBranch) {
      resolvedBranch = await Branch.findOne({ isActive: true }).sort({ createdAt: 1 });
    }

    const tenantId = resolvedBranch?.tenantId || requestedTenantId;
    const subtotal = sanitizedItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const taxRate = resolvedBranch?.taxRate ?? 0.08;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    let customerId = null;
    let customerRecord = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        customerId = decoded.id;
        if (customerId) {
          customerRecord = await Customer.findById(customerId).select('name phone email');
        }
      } catch (_) {}
    }

    const orderNumber = generateOrderNumber();
    const finalOrderType = orderType || 'dine-in';
    const otp = finalOrderType === 'delivery' ? generateOtp() : undefined;

    const safeMethod = paymentMethod || 'cash';
    const finalTable = tableNumber || table || '';
    const finalAddress = deliveryAddress || address || '';
    const finalCustomerName = guestName || customerName || req.body.name || customerRecord?.name || 'Customer';
    const finalCustomerPhone = guestPhone || customerPhone || req.body.phone || customerRecord?.phone || (finalOrderType === 'dine-in' ? (finalTable ? `Table ${finalTable}` : 'Dine-in') : 'N/A');
    const finalCustomerEmail = guestEmail || customerEmail || req.body.email || customerRecord?.email || '';

    const order = new Order({
      orderNumber,
      tenantId,
      branchId: resolvedBranch?._id || null,
      customer: customerId,
      isGuestOrder: !customerId,
      items: sanitizedItems,
      subtotal,
      tax,
      total,
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      customerEmail: finalCustomerEmail,
      pushTokens: pushToken ? [pushToken] : [],
      orderType: finalOrderType,
      tableNumber: finalTable,
      deliveryAddress: finalAddress,
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
// GET /api/orders/stats/summary - Admin dashboard overview metrics
router.get('/stats/summary', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin' ? (req.query.tenantId || null) : req.admin.tenantId;
    const branchId = resolveBranchId(req.admin, req.query);
    const filter = {};
    if (tenantId) await addTenantScope(filter, tenantId);
    if (branchId) filter.branchId = branchId;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeFilter = { ...filter, status: { $ne: 'cancelled' } };
    const [totals, todayOrders, pendingCount, popularDishes] = await Promise.all([
      Order.aggregate([{ $match: activeFilter }, { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalOrders: { $sum: 1 } } }]),
      Order.countDocuments({ ...filter, createdAt: { $gte: todayStart } }),
      Order.countDocuments({ ...filter, status: { $in: ['pending_admin', 'pending_kitchen', 'received', 'preparing'] } }),
      Order.aggregate([
        { $match: activeFilter },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', orders: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
        { $sort: { orders: -1 } }, { $limit: 5 },
        { $project: { _id: 0, name: '$_id', qty: '$orders', orders: 1, revenue: 1 } }
      ])
    ]);
    const summary = totals[0] || { totalRevenue: 0, totalOrders: 0 };
    res.json({ totalRevenue: summary.totalRevenue || 0, totalOrders: summary.totalOrders || 0, todayOrders, pendingCount, popularDishes });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
  }
});

// GET /api/orders/meta/regions — Public delivery regions list
router.get('/meta/regions', async (req, res) => {
  try {
    const regionSet = new Set(REGIONS);
    try {
      const riderFilter = { role: 'delivery', active: true };
      if (req.query.branchId && mongoose.isValidObjectId(req.query.branchId)) {
        riderFilter.branchId = req.query.branchId;
      }
      const riders = await AdminUser.find(riderFilter).select('region').lean();
      riders.forEach(r => {
        if (r.region && r.region.trim()) regionSet.add(r.region.trim());
      });
    } catch (_) {}

    const regions = Array.from(regionSet);
    res.json({ success: true, regions, regionCenters: REGION_CENTERS });
  } catch (err) {
    res.json({ success: true, regions: REGIONS, regionCenters: REGION_CENTERS });
  }
});

// GET /api/orders/track/:orderNumber — Dedicated public order tracking
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const raw = String(req.params.orderNumber || '').trim().toUpperCase();
    const order = await Order.findOne({ orderNumber: raw })
      .select('+otp')
      .populate('branchId', 'name code city address phone')
      .lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// GET /api/orders/mine/list — Logged-in customer orders list
router.get('/mine/list', customerAuth, async (req, res) => {
  try {
    let customerEmail = req.customer.email;
    let customerPhone = req.customer.phone;

    if (!customerEmail || !customerPhone) {
      const cust = await Customer.findById(req.customer.id).select('email phone');
      if (cust) {
        customerEmail = cust.email || customerEmail;
        customerPhone = cust.phone || customerPhone;
      }
    }

    const orClauses = [{ customer: req.customer.id }];
    if (customerEmail) orClauses.push({ customerEmail });
    if (customerPhone) orClauses.push({ customerPhone });

    const filter = { $or: orClauses };
    const branchId = req.query.branchId;
    if (branchId && mongoose.isValidObjectId(branchId)) {
      filter.branchId = branchId;
    }

    const orders = await Order.find(filter)
      .select('+otp')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// GET /api/orders/mine/:orderNumber — Logged-in customer order tracking lookup
router.get('/mine/:orderNumber', customerAuth, async (req, res) => {
  try {
    const raw = String(req.params.orderNumber || '').trim().toUpperCase();
    const order = await Order.findOne({ orderNumber: raw })
      .select('+otp')
      .populate('branchId', 'name code city address phone')
      .lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// GET /api/orders/:orderNumber — public order tracking lookup
router.get('/:orderNumber', async (req, res) => {
  try {
    const raw = String(req.params.orderNumber || '').trim().toUpperCase();
    const order = await Order.findOne({ orderNumber: raw })
      .select('+otp')
      .populate('branchId', 'name code city address phone')
      .lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// PUT & PATCH /api/orders/:id/status — Admin update status (supports _id or orderNumber)
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const idOrNum = req.params.id;
    const query = mongoose.isValidObjectId(idOrNum)
      ? { $or: [{ _id: idOrNum }, { orderNumber: String(idOrNum).toUpperCase() }] }
      : { orderNumber: String(idOrNum).toUpperCase() };

    const tenantId = req.admin.role === 'superadmin' ? req.query.tenantId : req.admin.tenantId;
    if (tenantId) await addTenantScope(query, tenantId);
    const branchId = resolveBranchId(req.admin, req.query);
    if (branchId) query.branchId = branchId;
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = status;
    order.statusLog.push({ status, time: new Date() });
    await order.save();

    // Trigger push notification, SMS, WhatsApp, and email to customer
    try {
      await notifyCustomer(order, status);
    } catch (notifErr) {
      console.warn('Customer notification failed:', notifErr.message);
    }

    // Broadcast real-time status update to all connected clients
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('order:update', order);
        io.to('order:' + order.orderNumber).emit('order:status', { orderNumber: order.orderNumber, status, order });
        if (order.branchId) io.to('branch:' + order.branchId).emit('order:status', { orderNumber: order.orderNumber, status, order });
        if (order.tenantId) io.to('tenant:' + order.tenantId).emit('order:status', { orderNumber: order.orderNumber, status, order });
      }
    } catch (_) {}

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

router.patch('/:id/status', adminAuth, updateOrderStatus);
router.put('/:id/status', adminAuth, updateOrderStatus);

module.exports = router;
