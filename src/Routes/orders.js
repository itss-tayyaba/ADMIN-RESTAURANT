const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const MenuItem = require('../models/MenuItem');
const RestaurantTable = require('../models/RestaurantTable');
const Branch = require('../models/Branch');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { customerAuth, optionalCustomerAuth } = require('./customerAuth');
const REGIONS = require('../data/regions');
const REGION_CENTERS = require('../data/regionCenters');
const { haversineKm } = require('../utils/geo');
const { isAdminRole, resolveBranchId, resolvePublicBranchId, addBranchScope } = require('../utils/branchScope');
const { notifyCustomer } = require('../services/notificationService');

// Generates an order number that is NOT guessable/sequential (e.g. EB-4K9QXP).
// Anyone who has this number can look the order up on the public tracking
// page, so it doubles as an access token — it must not be enumerable the
// way "EB-1041, EB-1042, ..." was.
async function generateOrderNumber() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  for (let attempt = 0; attempt < 5; attempt++) {
    let suffix = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) suffix += alphabet[bytes[i] % alphabet.length];
    const candidate = 'EB-' + suffix;
    const exists = await Order.exists({ orderNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique order number');
}


// Middleware: verify admin JWT
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

function customerOrderPayload(order) {
  const payload = order.toObject ? order.toObject() : order;
  const canSeeOtp = payload.orderType === 'delivery'
    && !['pending_admin', 'received'].includes(payload.status)
    && !payload.otpVerified;
  if (!canSeeOtp) delete payload.otp;
  return payload;
}

function normalizePakistanPhone(raw) {
  let value = String(raw || '').trim();
  const hasPlus = value.startsWith('+');
  value = value.replace(/\D/g, '');
  if (hasPlus) value = '92' + value.replace(/^92/, '');
  if (value.startsWith('92') && value.length === 12) value = '0' + value.slice(2);
  return value;
}

const COUNTRY_PHONE_CONFIG = {
  PK: { country: 'Pakistan', dialCode: '92', nationalLength: 10 },
  GB: { country: 'United Kingdom', dialCode: '44', nationalLength: 10 },
  AU: { country: 'Australia', dialCode: '61', nationalLength: 9 }
};

function normalizeInternationalPhone(raw) {
  let value = String(raw || '').trim();
  if (value.startsWith('0') && value.length === 11) {
    return `+92${value.slice(1)}`;
  }
  return value.startsWith('+') ? `+${value.slice(1).replace(/\D/g, '')}` : value.replace(/[\s()-]/g, '');
}

function isValidBranchPhone(phone, countryCode) {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return false;
  const config = COUNTRY_PHONE_CONFIG[countryCode];
  return !config || (phone.startsWith(`+${config.dialCode}`) && phone.length === config.dialCode.length + config.nationalLength + 1);
}

// Supports delivery orders created before OTP confirmation was introduced.
// New orders always receive a code at checkout; legacy accepted orders receive
// one the first time their owner opens the private customer portal.
async function ensureCustomerDeliveryOtp(order) {
  // Orders verified before the completion step was added are safely advanced
  // on their next customer-portal view, so they receive the final Hooray UI.
  if (order.status === 'delivered' && order.otpVerified) {
    const time = new Date();
    await Order.updateOne(
      { _id: order._id, status: 'delivered' },
      { $set: { status: 'completed' }, $push: { statusLog: { status: 'completed', time } } }
    );
    order.status = 'completed';
    order.statusLog.push({ status: 'completed', time });
    return order;
  }

  if (order.orderType === 'delivery' && !['pending_admin', 'received'].includes(order.status) && !order.otpVerified && !order.otp) {
    const otp = crypto.randomInt(100000, 1000000).toString();
    // Avoid a document save here: Order's post-save hook records menu pair
    // counts and should run only when an order is actually created.
    await Order.updateOne({ _id: order._id }, { $set: { otp } });
    order.otp = otp;
  }
  return order;
}

// GET /api/orders/meta/regions — public list of valid delivery regions
router.get('/meta/regions', async (req, res) => {
  const branchId = await resolvePublicBranchId(req.query);
  const branch = branchId ? await Branch.findById(branchId).select('deliveryZones') : null;
  res.json({ regions: branch?.deliveryZones?.length ? branch.deliveryZones : REGIONS });
});

// The browser key is intentionally public, but it must be restricted to the
// website origins in Google Cloud Console.
router.get('/map-config', (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// The browser key is intentionally public, but it must be restricted to the
// website origins in Google Cloud Console.
router.get('/map-config', (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// POST /api/orders — create a new order. Works for a logged-in customer
// (order is linked to their account) or a guest (guestName/guestPhone are
// required instead and no account is created or required).
router.post('/', optionalCustomerAuth, async (req, res) => {
  try {
    const { items, orderType, deliveryAddress, deliveryLocation, notes, region, guestName, guestPhone, guestEmail, tableNumber, pushToken } = req.body;
    const branchId = await resolvePublicBranchId(req.query);
    const branch = branchId ? await Branch.findOne({ _id: branchId, isActive: true }) : null;
    if (!branch) return res.status(400).json({ error: 'Please select an active branch before ordering.' });
    const deliveryZones = branch.deliveryZones?.length ? branch.deliveryZones : REGIONS;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    if (orderType === 'delivery' && !deliveryZones.includes(region)) {
      return res.status(400).json({ error: 'Please choose a valid delivery region.' });
    }

    let validatedLocation;
    if (orderType === 'delivery') {
      const coordinates = deliveryLocation && deliveryLocation.coordinates;
      const isPoint = deliveryLocation && deliveryLocation.type === 'Point';
      const hasCoordinates = Array.isArray(coordinates) && coordinates.length === 2
        && coordinates.every(Number.isFinite);
      if (!isPoint || !hasCoordinates) {
        return res.status(400).json({ error: 'Please select and confirm your delivery location on the map.' });
      }
      const [lng, lat] = coordinates;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'The selected delivery coordinates are invalid.' });
      }

      // Geofence sanity check — the region dropdown and the map pin are
      // otherwise unrelated (the dropdown is just a fixed list; it never
      // reads the pin's coordinates). This catches an obviously mismatched
      // pair, e.g. a pin left over from a search result in another city
      // while "Gulberg" is still selected in the dropdown.
      const center = REGION_CENTERS[region];
      if (center) {
        const distanceKm = haversineKm(lat, lng, center.lat, center.lng);
        if (distanceKm > center.radiusKm) {
          return res.status(400).json({
            error: `That pinned location is about ${distanceKm.toFixed(1)} km from "${region}" — too far for that region. Please recheck the pin on the map or choose the delivery region that actually matches it.`
          });
        }
      }

      validatedLocation = { type: 'Point', coordinates: [lng, lat] };
    }

    let customer = null;
    let orderCustomerName;
    let orderCustomerPhone;
    let orderCustomerEmail = '';

    if (req.customer) {
      customer = await Customer.findById(req.customer.id);
      if (!customer) return res.status(401).json({ error: 'Account not found. Please log in again.' });
      orderCustomerName = customer.name;
      orderCustomerPhone = customer.phone;
      orderCustomerEmail = customer.email || '';
    } else {
      const name = (guestName || '').trim();
      let phone = (guestPhone || '').trim();
      if (name.length < 2) {
        return res.status(400).json({ error: 'Please enter your name.' });
      }
      phone = normalizeInternationalPhone(phone);
      if (!isValidBranchPhone(phone, branch.countryCode)) {
        const config = COUNTRY_PHONE_CONFIG[branch.countryCode];
        const country = config?.country || branch.country;
        const prefix = config ? ` beginning with +${config.dialCode}` : ' including its country code';
        return res.status(400).json({ error: `Please enter a valid ${country} phone number${prefix}.` });
      }
      orderCustomerName = name;
      orderCustomerPhone = phone;
      if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      orderCustomerEmail = (guestEmail || '').trim();
    }

    // Never trust client-submitted prices — look up every item's real price
    // and availability from the menu in the database. A customer could
    // otherwise send { price: 0.01 } for a $10 item.
    for (const i of items) {
      if (!i.menuItemId || !/^[0-9a-fA-F]{24}$/.test(i.menuItemId)) {
        return res.status(400).json({ error: `"${i.name || 'An item'}" is not a valid menu item.` });
      }
      if (!i.qty || i.qty < 1) {
        return res.status(400).json({ error: `Invalid quantity for "${i.name || 'an item'}".` });
      }
    }
    const menuItemIds = items.map(i => i.menuItemId);
    const menuQuery = { _id: { $in: menuItemIds }, available: true };
    await addBranchScope(menuQuery, String(branch._id));
    const menuItemDocs = await MenuItem.find(menuQuery);
    const menuItemById = new Map(menuItemDocs.map(m => [m._id.toString(), m]));

    const missing = items.find(i => !menuItemById.has(i.menuItemId));
    if (missing) {
      return res.status(400).json({ error: `"${missing.name || 'An item'}" is no longer available.` });
    }

    const resolvedItems = items.map(i => {
      const menuItem = menuItemById.get(i.menuItemId);
      return {
        menuItem: menuItem._id,
        name: menuItem.name,
        qty: i.qty,
        price: menuItem.price // server-authoritative price, client value ignored
      };
    });

    const subtotal = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = subtotal * branch.taxRate;

    const orderNumber = await generateOrderNumber();

    const order = new Order({
      orderNumber,
      branchId: branch._id,
      customer: customer ? customer._id : null,
      isGuestOrder: !customer,
      items: resolvedItems,
      subtotal,
      tax,
      total: subtotal + tax,
      customerName: orderCustomerName,
      customerPhone: orderCustomerPhone,
      customerEmail: orderCustomerEmail,
      pushTokens: typeof pushToken === 'string' && pushToken.length <= 4096 ? [pushToken] : [],
      orderType: orderType || 'dine-in',
      // Only meaningful for dine-in — ignore it entirely for takeaway/delivery
      // even if a stray value is sent, so it can never mislabel those orders.
      tableNumber: (orderType || 'dine-in') === 'dine-in' && typeof tableNumber === 'string'
        ? tableNumber.trim().slice(0, 20)
        : '',
      deliveryAddress: orderType === 'delivery' ? (deliveryAddress || '') : '',
      deliveryLocation: orderType === 'delivery' ? validatedLocation : undefined,
      region: orderType === 'delivery' ? (region || '') : '',
      notes: notes || '',
      // Generated at checkout but not shown until the order is accepted.
      otp: orderType === 'delivery' ? crypto.randomInt(100000, 1000000).toString() : undefined,
      otpVerified: false,
      status: 'pending_admin',
      statusLog: [{ status: 'pending_admin', time: new Date() }]
    });

    await order.save();
    await notifyCustomer(order, 'pending_admin');

    // A dine-in order placed via a scanned table QR is the clearest signal
    // you have that a table is actually in use — reflect that on the Floor
    // Plan immediately instead of waiting for a reservation or a manual
    // admin toggle. Deliberately only flips 'available' -> 'occupied':
    // never downgrades a table already flagged 'maintenance', and it's a
    // no-op if the table is already 'occupied'. Clearing it back to
    // 'available' stays a manual admin action (same as today's walk-in
    // flow) — an order reaching 'completed' doesn't mean the guests have
    // actually left the table yet.
    if (order.orderType === 'dine-in' && order.tableNumber) {
      try {
        await RestaurantTable.updateOne(
          { tableNumber: order.tableNumber, manualStatus: 'available' },
          { $set: { manualStatus: 'occupied' } }
        );
      } catch (err) {
        console.error('Failed to auto-mark table occupied:', err);
      }
    }

    res.status(201).json(customerOrderPayload(order));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/mine/list — the logged-in customer's own order history
router.get('/mine/list', customerAuth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.customer.id })
      .select('+otp')
      .sort({ createdAt: -1 });
    await Promise.all(orders.map(ensureCustomerDeliveryOtp));
    res.json(orders.map(customerOrderPayload));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your orders' });
  }
});

// Private tracking details for the customer who owns the order.
router.get('/mine/:orderNumber', customerAuth, async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      customer: req.customer.id
    }).select('+otp');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await ensureCustomerDeliveryOtp(order);
    res.json(customerOrderPayload(order));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// GET /api/orders/stats/summary — dashboard stats (admin only)
router.get('/stats/summary', adminAuth, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const branchId = resolveBranchId(req.admin, req.query);
    const baseFilter = branchId ? { branchId } : {};

    const [allOrders, todayOrders] = await Promise.all([
      Order.find(baseFilter),
      Order.find({ ...baseFilter, createdAt: { $gte: startOfToday } })
    ]);

    const activeStatuses = ['pending_admin', 'pending_kitchen', 'received', 'preparing', 'ready'];
    const totalRevenue = allOrders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0);
    const pendingCount = allOrders.filter(o => activeStatuses.includes(o.status)).length;

    // Tally item quantities for a "popular dishes" ranking
    const itemCounts = {};
    for (const order of allOrders) {
      if (order.status === 'cancelled') continue;
      for (const item of order.items) {
        const key = item.name;
        itemCounts[key] = (itemCounts[key] || 0) + item.qty;
      }
    }
    const popularDishes = Object.entries(itemCounts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    res.json({
      totalRevenue,
      totalOrders: allOrders.length,
      todayOrders: todayOrders.length,
      pendingCount,
      popularDishes
    });
  } catch (err) {
  console.error("========== ORDER ERROR ==========");
  console.error(err);

  res.status(500).json({
    success: false,
    message: err.message,
    errors: err.errors || null,
    stack: err.stack
  });
}
});

// GET /api/orders — list all orders (admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;
    const branchId = resolveBranchId(req.admin, req.query);
    if (branchId) query.branchId = branchId;
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id — get single order (for tracking)
// Guests never create an account, so this public, order-number-gated route
// is the only place they can ever see their delivery OTP. The order number
// itself is the unguessable access token (see generateOrderNumber above),
// so anyone who has it is treated as the order owner here — same trust
// model already used for guest checkout itself.
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.id }).select('+otp');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await ensureCustomerDeliveryOtp(order);
    // Live rider GPS is private to the customer who owns the order.
    const publicOrder = customerOrderPayload(order);
    delete publicOrder.riderLocation;
    res.json(publicOrder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/orders/:id/status — update order status (admin only)
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending_admin', 'pending_kitchen', 'received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const existing = await Order.findOne({ orderNumber: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    if (existing.status === 'pending_admin' && !['pending_kitchen', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'A pending admin order can only be approved for the kitchen or rejected.' });
    }
    if (status === 'pending_kitchen' && existing.status !== 'pending_admin') {
      return res.status(400).json({ error: 'Only an admin-approved order can be sent to the kitchen.' });
    }
    if (['pending_kitchen', 'received', 'preparing'].includes(existing.status) && status !== existing.status) {
      return res.status(400).json({ error: 'This order is controlled by the kitchen.' });
    }

    const deliveryOnlyStatuses = ['out-for-delivery', 'delivered'];
    if (existing.orderType !== 'delivery' && deliveryOnlyStatuses.includes(status)) {
      return res.status(400).json({ error: `"${status}" only applies to delivery orders.` });
    }
    if (existing.orderType === 'delivery' && status === 'delivered') {
      return res.status(400).json({ error: 'Delivery orders must be completed with the customer OTP.' });
    }

    const update = {
      $set: { status },
      $push: { statusLog: { status, time: new Date() } }
    };
    if (['completed', 'cancelled'].includes(status)) update.$unset = { riderLocation: 1 };

    const order = await Order.findOneAndUpdate(
      { orderNumber: req.params.id },
      update,
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await notifyCustomer(order, status);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

module.exports = router;
