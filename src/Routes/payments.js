const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const Payment = require('../models/Payment');
const { resolveTenant, addTenantScope } = require('../utils/tenantScope');
const paymentService = require('../services/paymentService');

// Middleware: Admin authentication
function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware: Superadmin only
function superAdminOnly(req, res, next) {
  adminAuth(req, res, () => {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    next();
  });
}

// Helper to emit socket events if io is available
function emitOrderUpdate(req, order, event = 'order:update') {
  const io = req.app.get('io');
  if (!io) return;
  if (order.tenantId) {
    const tenantIdStr = order.tenantId._id ? order.tenantId._id.toString() : order.tenantId.toString();
    io.to(`tenant:${tenantIdStr}`).emit(event, order);
  }
  if (order.branchId) {
    const branchIdStr = order.branchId._id ? order.branchId._id.toString() : order.branchId.toString();
    io.to(`branch:${branchIdStr}`).emit(event, order);
  }
}

function toObjectId(id) {
  if (!id) return null;
  if (typeof id === 'object' && id._id) id = id._id;
  const str = String(id);
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : id;
}

/**
 * Helper: Upsert Payment Record
 * Keeps the Payment collection synchronized with every transaction lifecycle event.
 */
async function upsertPaymentRecord({
  order,
  paymentMethod,
  provider,
  transactionId = '',
  status = 'PENDING',
  amount = null,
  currency = null,
  paidAt = null,
  gatewayResponse = null,
  idempotencyKey = null,
  verifiedBy = '',
  notes = ''
}) {
  try {
    const tenantId = order.tenantId?._id || order.tenantId;
    const branchId = order.branchId?._id || order.branchId;
    const finalAmount = amount !== null ? amount : order.total;
    const finalCurrency = currency || order.paymentDetails?.currency || order.tenantId?.currency || 'PKR';

    const updateData = {
      restaurantId: tenantId,
      tenantId,
      branchId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerId: order.customer || null,
      customerName: order.customerName || '',
      customerEmail: order.customerEmail || '',
      customerPhone: order.customerPhone || '',
      paymentMethod,
      provider,
      amount: finalAmount,
      currency: String(finalCurrency).toUpperCase(),
      status: String(status).toUpperCase()
    };

    if (transactionId) updateData.transactionId = transactionId;
    if (paidAt) updateData.paidAt = paidAt;
    if (gatewayResponse) updateData.gatewayResponse = gatewayResponse;
    if (idempotencyKey) updateData.idempotencyKey = idempotencyKey;
    if (verifiedBy) {
      updateData.verifiedBy = verifiedBy;
      updateData.verifiedAt = new Date();
    }
    if (notes) updateData.notes = notes;

    const payment = await Payment.findOneAndUpdate(
      { orderId: order._id },
      { $set: updateData },
      { upsert: true, new: true }
    );
    return payment;
  } catch (err) {
    console.error('Error upserting payment record:', err.message);
    return null;
  }
}

/**
 * 1. GET /api/payments/config
 * Returns active, public payment methods & details for the tenant.
 * Does NOT expose private merchant keys or salts.
 */
router.get('/config', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurant tenant not found' });
    }

    const config = paymentService.getPublicPaymentConfig(tenant);
    res.json({
      tenantId: tenant._id,
      tenantName: tenant.name,
      ...config
    });
  } catch (err) {
    console.error('Payment config error:', err);
    res.status(500).json({ error: 'Failed to load payment configuration' });
  }
});

/**
 * 2. POST /api/payments/initiate
 * Initiates payment session or records manual payment details for an order.
 * Strictly prevents double-payment on already PAID orders.
 */
router.post('/initiate', async (req, res) => {
  try {
    const { orderId, paymentMethod, paymentDetails, returnUrl } = req.body;
    if (!orderId || !paymentMethod) {
      return res.status(400).json({ error: 'Order ID and paymentMethod are required.' });
    }

    const tenantId = await resolveTenant(req);
    const order = await Order.findById(orderId).populate('tenantId').populate('branchId');

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Tenant isolation check
    if (order.tenantId && tenantId && order.tenantId._id.toString() !== tenantId.toString()) {
      return res.status(403).json({ error: 'Access denied: Tenant mismatch.' });
    }

    // Duplicate payment protection
    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({
        error: 'This order has already been paid for.',
        paymentStatus: order.paymentStatus,
        transactionId: order.transactionId
      });
    }

    const tenant = order.tenantId || (await Tenant.findById(tenantId));
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    // A. JazzCash Hosted Checkout
    if (paymentMethod === 'jazzcash') {
      const callbackUrl = returnUrl || `${baseUrl}/api/payments/jazzcash/callback`;
      const payload = paymentService.generateJazzCashPayload(order, tenant, callbackUrl);

      order.paymentMethod = 'jazzcash';
      order.paymentStatus = 'PROCESSING';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        provider: 'jazzcash',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR'
      };
      await order.save();

      await upsertPaymentRecord({
        order,
        paymentMethod: 'jazzcash',
        provider: 'jazzcash',
        status: 'PROCESSING',
        transactionId: payload.txnRefNo,
        notes: 'JazzCash payment form generated'
      });

      return res.json({
        type: 'form_post',
        endpoint: payload.endpoint,
        method: payload.method,
        fields: payload.fields,
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // B. Easypaisa Hosted Checkout
    if (paymentMethod === 'easypaisa') {
      const callbackUrl = returnUrl || `${baseUrl}/api/payments/easypaisa/callback`;
      const payload = paymentService.generateEasypaisaPayload(order, tenant, callbackUrl);

      order.paymentMethod = 'easypaisa';
      order.paymentStatus = 'PROCESSING';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        provider: 'easypaisa',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR'
      };
      await order.save();

      await upsertPaymentRecord({
        order,
        paymentMethod: 'easypaisa',
        provider: 'easypaisa',
        status: 'PROCESSING',
        transactionId: payload.orderRefNum,
        notes: 'Easypaisa payment form generated'
      });

      return res.json({
        type: 'form_post',
        endpoint: payload.endpoint,
        method: payload.method,
        fields: payload.fields,
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // C. Card via Official Stripe Gateway
    if (paymentMethod === 'card' || paymentMethod === 'stripe') {
      const session = await paymentService.createStripeSession(order, tenant, baseUrl);

      order.paymentMethod = 'card';
      order.paymentStatus = 'PROCESSING';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        provider: 'card (stripe)',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR'
      };
      await order.save();

      await upsertPaymentRecord({
        order,
        paymentMethod: 'stripe',
        provider: 'stripe',
        status: 'PROCESSING',
        transactionId: session.sessionId,
        notes: 'Stripe checkout session created'
      });

      return res.json({
        type: 'redirect',
        redirectUrl: session.sessionUrl,
        sessionId: session.sessionId,
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // D. Manual Bank Transfer or Raast (Admin verified)
    if (paymentMethod === 'bank-transfer' || paymentMethod === 'raast') {
      const details = paymentDetails || {};
      const refId = details.referenceId || details.transactionId || '';
      order.paymentMethod = paymentMethod;
      order.paymentStatus = 'PENDING';
      order.paymentDetails = {
        provider: paymentMethod,
        senderName: details.senderName || '',
        referenceId: refId,
        accountNumber: details.accountNumber || '',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR',
        paidAt: null,
        verifiedBy: '',
        verifiedAt: null
      };
      await order.save();
      emitOrderUpdate(req, order);

      await upsertPaymentRecord({
        order,
        paymentMethod,
        provider: paymentMethod,
        status: 'PENDING',
        transactionId: refId,
        notes: `Customer submitted deposit reference: ${refId}`
      });

      return res.json({
        type: 'manual_pending',
        message: 'Deposit details submitted for verification. Staff will verify your payment.',
        paymentStatus: 'PENDING',
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // E. Cash on Delivery (COD)
    if (paymentMethod === 'cash' || paymentMethod === 'cod') {
      order.paymentMethod = 'cash';
      order.paymentStatus = 'PENDING';
      order.paymentDetails = {
        provider: 'cash',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR'
      };
      await order.save();
      emitOrderUpdate(req, order);

      await upsertPaymentRecord({
        order,
        paymentMethod: 'cod',
        provider: 'cash',
        status: 'PENDING',
        notes: 'Order placed as Cash on Delivery. Awaiting customer OTP upon delivery.'
      });

      return res.json({
        type: 'cod',
        message: 'Cash on Delivery order confirmed.',
        paymentStatus: 'PENDING',
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    return res.status(400).json({ error: `Unsupported payment method: ${paymentMethod}` });
  } catch (err) {
    console.error('Payment initiation error:', err);
    res.status(500).json({ error: err.message || 'Payment initiation failed' });
  }
});

/**
 * 3. POST /api/payments/stripe/webhook
 * Official Stripe webhook endpoint for cryptographic signature verification.
 * Automatically marks Payment & Order as PAID, FAILED, or REFUNDED.
 */
router.post('/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    const rawBody = req.rawBody || (typeof req.body === 'string' ? Buffer.from(req.body) : req.body);
    event = paymentService.verifyStripeWebhook(rawBody, sig, null);
  } catch (err) {
    console.error('Stripe webhook signature verification error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    const eventId = event.id;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId || session.client_reference_id;
      const transactionId = typeof session.payment_intent === 'object' && session.payment_intent
        ? session.payment_intent.id
        : (session.payment_intent || session.id);

      if (orderId) {
        const order = await Order.findById(orderId).populate('tenantId').populate('branchId');
        if (order) {
          if (order.paymentStatus !== 'PAID') {
            order.paymentStatus = 'PAID';
            order.transactionId = transactionId;
            order.paymentDetails = {
              ...(order.paymentDetails || {}),
              provider: 'card (stripe)',
              amountPaid: session.amount_total ? session.amount_total / 100 : order.total,
              currency: (session.currency || 'pkr').toUpperCase(),
              paidAt: new Date(),
              referenceId: transactionId,
              rawResponse: { sessionId: session.id, eventId }
            };
            await order.save();
            emitOrderUpdate(req, order);
          }

          await upsertPaymentRecord({
            order,
            paymentMethod: 'stripe',
            provider: 'stripe',
            transactionId,
            status: 'PAID',
            amount: session.amount_total ? session.amount_total / 100 : order.total,
            currency: (session.currency || 'pkr').toUpperCase(),
            paidAt: new Date(),
            gatewayResponse: session,
            idempotencyKey: eventId,
            notes: 'Verified via Stripe webhook checkout.session.completed'
          });
        }
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        const order = await Order.findById(orderId).populate('tenantId').populate('branchId');
        if (order && order.paymentStatus !== 'PAID') {
          order.paymentStatus = 'PAID';
          order.transactionId = pi.id;
          order.paymentDetails = {
            ...(order.paymentDetails || {}),
            provider: 'card (stripe)',
            amountPaid: pi.amount ? pi.amount / 100 : order.total,
            currency: (pi.currency || 'pkr').toUpperCase(),
            paidAt: new Date(),
            referenceId: pi.id
          };
          await order.save();
          emitOrderUpdate(req, order);

          await upsertPaymentRecord({
            order,
            paymentMethod: 'stripe',
            provider: 'stripe',
            transactionId: pi.id,
            status: 'PAID',
            amount: pi.amount ? pi.amount / 100 : order.total,
            currency: (pi.currency || 'pkr').toUpperCase(),
            paidAt: new Date(),
            gatewayResponse: pi,
            idempotencyKey: event.id
          });
        }
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.paymentStatus !== 'PAID') {
          order.paymentStatus = 'FAILED';
          await order.save();
          emitOrderUpdate(req, order);

          await upsertPaymentRecord({
            order,
            paymentMethod: 'stripe',
            provider: 'stripe',
            transactionId: pi.id,
            status: 'FAILED',
            gatewayResponse: pi,
            notes: pi.last_payment_error?.message || 'Stripe card payment failed'
          });
        }
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;
      if (paymentIntentId) {
        const payment = await Payment.findOne({ transactionId: paymentIntentId });
        if (payment) {
          payment.status = 'REFUNDED';
          payment.refundedAt = new Date();
          payment.refundAmount = charge.amount_refunded ? charge.amount_refunded / 100 : payment.amount;
          payment.refundReason = 'Stripe webhook charge.refunded';
          await payment.save();

          const order = await Order.findById(payment.orderId);
          if (order) {
            order.paymentStatus = 'REFUNDED';
            await order.save();
            emitOrderUpdate(req, order);
          }
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

/**
 * 4. GET /api/payments/stripe/return
 * Server-side verification of Stripe Checkout session upon customer redirect
 */
router.get('/stripe/return', async (req, res) => {
  try {
    const { session_id, orderId } = req.query;
    if (!session_id || !orderId) {
      return res.status(400).send('Missing session_id or orderId');
    }

    const order = await Order.findById(orderId).populate('tenantId').populate('branchId');
    if (!order) {
      return res.status(404).send('Order not found');
    }

    const tenant = order.tenantId;
    const result = await paymentService.verifyStripeSession(session_id, tenant);

    const redirectPath = `/order/${order.branchId?.code || ''}?orderNumber=${order.orderNumber}`;

    if (result.isSuccess) {
      if (order.paymentStatus !== 'PAID') {
        order.paymentStatus = 'PAID';
        order.transactionId = result.transactionId;
        order.paymentDetails = {
          provider: 'card (stripe)',
          amountPaid: result.amountPaid || order.total,
          currency: result.currency || 'PKR',
          paidAt: new Date(),
          referenceId: result.transactionId,
          rawResponse: { sessionId: session_id }
        };
        await order.save();
        emitOrderUpdate(req, order);
      }

      await upsertPaymentRecord({
        order,
        paymentMethod: 'stripe',
        provider: 'stripe',
        transactionId: result.transactionId,
        status: 'PAID',
        amount: result.amountPaid || order.total,
        currency: result.currency || 'PKR',
        paidAt: new Date(),
        gatewayResponse: result.raw,
        notes: 'Verified via Stripe return redirect'
      });

      return res.redirect(`${redirectPath}&payment=success`);
    } else {
      order.paymentStatus = 'FAILED';
      await order.save();
      emitOrderUpdate(req, order);

      await upsertPaymentRecord({
        order,
        paymentMethod: 'stripe',
        provider: 'stripe',
        transactionId: result.transactionId,
        status: 'FAILED',
        notes: 'Stripe checkout session was not completed or failed'
      });

      return res.redirect(`${redirectPath}&payment=failed`);
    }
  } catch (err) {
    console.error('Stripe return error:', err);
    res.status(500).send('Error verifying Stripe payment session');
  }
});

/**
 * 5. POST & GET /api/payments/jazzcash/callback
 * Official JazzCash server callback / redirect IPN with HMAC check
 */
async function handleJazzCashCallback(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const orderId = data.ppmpf_1;
    const tenantId = data.ppmpf_2;

    let order = null;
    if (orderId) {
      order = await Order.findById(orderId).populate('tenantId').populate('branchId');
    }
    if (!order && data.pp_BillReference) {
      order = await Order.findOne({ orderNumber: new RegExp(data.pp_BillReference, 'i') }).populate('tenantId').populate('branchId');
    }

    if (!order) {
      return res.status(404).send('Order not found for JazzCash payment notification.');
    }

    const tenant = order.tenantId || (await Tenant.findById(tenantId));
    const result = paymentService.verifyJazzCashCallback(data, tenant);

    const redirectPath = `/order/${order.branchId?.code || ''}?orderNumber=${order.orderNumber}`;

    if (result.isSuccess) {
      if (order.paymentStatus !== 'PAID') {
        order.paymentStatus = 'PAID';
        order.transactionId = result.transactionId;
        order.paymentDetails = {
          provider: 'jazzcash',
          amountPaid: result.amountPaid || order.total,
          currency: 'PKR',
          paidAt: new Date(),
          referenceId: result.transactionId,
          rawResponse: result.raw
        };
        await order.save();
        emitOrderUpdate(req, order);
      }

      await upsertPaymentRecord({
        order,
        paymentMethod: 'jazzcash',
        provider: 'jazzcash',
        transactionId: result.transactionId,
        status: 'PAID',
        amount: result.amountPaid || order.total,
        currency: 'PKR',
        paidAt: new Date(),
        gatewayResponse: result.raw,
        idempotencyKey: result.transactionId,
        notes: 'Verified via JazzCash IPN callback'
      });

      return res.redirect(`${redirectPath}&payment=success`);
    } else {
      order.paymentStatus = 'FAILED';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        provider: 'jazzcash',
        rawResponse: result.raw,
        failureReason: result.responseMessage || 'JazzCash payment rejected'
      };
      await order.save();
      emitOrderUpdate(req, order);

      await upsertPaymentRecord({
        order,
        paymentMethod: 'jazzcash',
        provider: 'jazzcash',
        transactionId: result.transactionId,
        status: 'FAILED',
        gatewayResponse: result.raw,
        notes: result.responseMessage || 'JazzCash payment rejected'
      });

      return res.redirect(`${redirectPath}&payment=failed&msg=${encodeURIComponent(result.responseMessage || 'Transaction failed')}`);
    }
  } catch (err) {
    console.error('JazzCash callback error:', err);
    res.status(500).send('Error processing JazzCash payment callback');
  }
}

router.post('/jazzcash/callback', handleJazzCashCallback);
router.get('/jazzcash/callback', handleJazzCashCallback);

/**
 * 6. POST & GET /api/payments/easypaisa/callback
 * Official Easypaisa IPN / return callback
 */
async function handleEasypaisaCallback(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const orderRef = data.orderRefNumber || data.orderRefNum;

    let order = null;
    if (orderRef) {
      const cleanRef = orderRef.split('-').slice(0, 2).join('-');
      order = await Order.findOne({ orderNumber: new RegExp(cleanRef, 'i') }).populate('tenantId').populate('branchId');
    }

    if (!order) {
      return res.status(404).send('Order not found for Easypaisa callback.');
    }

    const tenant = order.tenantId;
    const result = paymentService.verifyEasypaisaCallback(data, tenant);
    const redirectPath = `/order/${order.branchId?.code || ''}?orderNumber=${order.orderNumber}`;

    if (result.isSuccess) {
      if (order.paymentStatus !== 'PAID') {
        order.paymentStatus = 'PAID';
        order.transactionId = result.transactionId;
        order.paymentDetails = {
          provider: 'easypaisa',
          amountPaid: result.amountPaid || order.total,
          currency: 'PKR',
          paidAt: new Date(),
          referenceId: result.transactionId,
          rawResponse: result.raw
        };
        await order.save();
        emitOrderUpdate(req, order);
      }

      await upsertPaymentRecord({
        order,
        paymentMethod: 'easypaisa',
        provider: 'easypaisa',
        transactionId: result.transactionId,
        status: 'PAID',
        amount: result.amountPaid || order.total,
        currency: 'PKR',
        paidAt: new Date(),
        gatewayResponse: result.raw,
        idempotencyKey: result.transactionId,
        notes: 'Verified via Easypaisa callback'
      });

      return res.redirect(`${redirectPath}&payment=success`);
    } else {
      order.paymentStatus = 'FAILED';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        provider: 'easypaisa',
        rawResponse: result.raw
      };
      await order.save();
      emitOrderUpdate(req, order);

      await upsertPaymentRecord({
        order,
        paymentMethod: 'easypaisa',
        provider: 'easypaisa',
        transactionId: result.transactionId,
        status: 'FAILED',
        gatewayResponse: result.raw,
        notes: result.responseMessage || 'Easypaisa payment rejected'
      });

      return res.redirect(`${redirectPath}&payment=failed`);
    }
  } catch (err) {
    console.error('Easypaisa callback error:', err);
    res.status(500).send('Error processing Easypaisa callback');
  }
}

router.post('/easypaisa/callback', handleEasypaisaCallback);
router.get('/easypaisa/callback', handleEasypaisaCallback);

/**
 * 7. PUT /api/payments/orders/:id/verify-manual
 * Admin endpoint: Approve or Reject a manual bank transfer or Raast payment
 */
router.put('/orders/:id/verify-manual', adminAuth, async (req, res) => {
  try {
    const { approved, reason } = req.body;
    const order = await Order.findById(req.params.id).populate('tenantId').populate('branchId');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Tenant authorization check
    if (req.admin.role !== 'superadmin' && req.admin.tenantId) {
      if (order.tenantId && order.tenantId._id.toString() !== req.admin.tenantId.toString()) {
        return res.status(403).json({ error: 'Access denied to this order.' });
      }
    }

    const adminName = req.admin.name || req.admin.username || req.admin.email || 'Admin Staff';

    if (approved) {
      order.paymentStatus = 'PAID';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        amountPaid: order.total,
        paidAt: new Date(),
        verifiedBy: adminName,
        verifiedAt: new Date(),
        notes: reason || 'Manual deposit verified by admin staff'
      };

      await upsertPaymentRecord({
        order,
        paymentMethod: order.paymentMethod || 'raast',
        provider: order.paymentDetails?.provider || order.paymentMethod || 'raast',
        transactionId: order.paymentDetails?.referenceId || order.transactionId || '',
        status: 'PAID',
        paidAt: new Date(),
        verifiedBy: adminName,
        notes: reason || 'Approved manually by admin'
      });
    } else {
      order.paymentStatus = 'FAILED';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        verifiedBy: adminName,
        verifiedAt: new Date(),
        notes: reason || 'Manual deposit verification rejected by admin staff'
      };

      await upsertPaymentRecord({
        order,
        paymentMethod: order.paymentMethod || 'raast',
        provider: order.paymentDetails?.provider || order.paymentMethod || 'raast',
        transactionId: order.paymentDetails?.referenceId || order.transactionId || '',
        status: 'FAILED',
        verifiedBy: adminName,
        notes: reason || 'Rejected manually by admin'
      });
    }

    await order.save();
    emitOrderUpdate(req, order);

    res.json({
      success: true,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      paymentDetails: order.paymentDetails
    });
  } catch (err) {
    console.error('Manual verification error:', err);
    res.status(500).json({ error: 'Failed to verify manual payment' });
  }
});

/**
 * 8. POST /api/payments/:id/refund
 * Admin & Superadmin endpoint: Issue a full or partial refund
 */
router.post('/:id/refund', adminAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment transaction record not found' });
    }

    // Tenant isolation check
    if (req.admin.role !== 'superadmin' && req.admin.tenantId) {
      if (payment.tenantId.toString() !== req.admin.tenantId.toString()) {
        return res.status(403).json({ error: "Access denied: Cannot refund another restaurant's payment" });
      }
    }

    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ error: 'This payment has already been refunded.' });
    }

    if (payment.status !== 'PAID') {
      return res.status(400).json({ error: `Only PAID payments can be refunded. Current status: "${payment.status}"` });
    }

    const { refundAmount, reason } = req.body;
    const amountToRefund = refundAmount ? Number(refundAmount) : payment.amount;
    const refundReasonText = reason || 'Customer requested refund';

    let stripeRefundResult = null;
    const isStripe = payment.paymentMethod === 'stripe' || payment.paymentMethod === 'card' || payment.provider.toLowerCase().includes('stripe');

    if (isStripe && payment.transactionId) {
      const tenant = await Tenant.findById(payment.tenantId);
      stripeRefundResult = await paymentService.createStripeRefund(
        payment.transactionId,
        amountToRefund,
        refundReasonText,
        tenant
      );
    }

    payment.status = 'REFUNDED';
    payment.refundedAt = new Date();
    payment.refundAmount = amountToRefund;
    payment.refundReason = refundReasonText;
    payment.refundId = stripeRefundResult?.refundId || `REF-${Date.now()}`;
    payment.verifiedBy = req.admin.name || req.admin.username || 'Admin Staff';
    payment.notes = (payment.notes ? payment.notes + ' | ' : '') + `Refunded by ${payment.verifiedBy}: ${refundReasonText}`;
    await payment.save();

    const order = await Order.findById(payment.orderId).populate('tenantId').populate('branchId');
    if (order) {
      order.paymentStatus = 'REFUNDED';
      order.status = 'cancelled';
      order.statusLog.push({ status: 'cancelled', time: new Date() });
      await order.save();
      emitOrderUpdate(req, order);
    }

    res.json({
      success: true,
      message: isStripe ? 'Stripe refund executed successfully' : 'Refund processed and logged successfully',
      payment,
      stripeRefund: stripeRefundResult
    });
  } catch (err) {
    console.error('Refund processing error:', err);
    res.status(500).json({ error: err.message || 'Failed to process refund' });
  }
});

/**
 * 9. GET /api/payments/admin/transactions
 * Branch Admin endpoint: Retrieve paginated payment transactions with stats
 */
router.get('/admin/transactions', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin'
      ? (req.query.tenantId || req.admin.tenantId)
      : req.admin.tenantId;

    const branchId = req.admin.role === 'superadmin'
      ? (req.query.branchId || null)
      : (req.admin.branchId || req.query.branchId || null);

    const filter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (branchId) filter.branchId = branchId;

    const { method, status, search, limit = 50, page = 1 } = req.query;

    if (method && method !== 'all') {
      if (method === 'card' || method === 'stripe') filter.paymentMethod = { $in: ['card', 'stripe'] };
      else if (method === 'cod' || method === 'cash') filter.paymentMethod = { $in: ['cod', 'cash'] };
      else filter.paymentMethod = method;
    }

    if (status && status !== 'all') {
      filter.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { orderNumber: new RegExp(q, 'i') },
        { transactionId: new RegExp(q, 'i') },
        { customerName: new RegExp(q, 'i') },
        { customerEmail: new RegExp(q, 'i') },
        { customerPhone: new RegExp(q, 'i') }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, totalCount] = await Promise.all([
      Payment.find(filter)
        .populate('orderId', 'orderNumber status orderType tableNumber items subtotal tax total')
        .populate('branchId', 'name code city currency currencySymbol')
        .populate('tenantId', 'name slug currency currencySymbol')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Payment.countDocuments(filter)
    ]);

    // Aggregate stats for this scope
    const baseScope = {};
    if (tenantId) baseScope.tenantId = toObjectId(tenantId);
    if (branchId) baseScope.branchId = toObjectId(branchId);

    const statsAgg = await Payment.aggregate([
      { $match: baseScope },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalRefund: { $sum: '$refundAmount' }
        }
      }
    ]);

    let totalRevenue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let failedCount = 0;
    let failedAmount = 0;
    let refundCount = 0;
    let refundAmount = 0;

    statsAgg.forEach(s => {
      const st = (s._id || '').toUpperCase();
      if (st === 'PAID') {
        totalRevenue += s.totalAmount || 0;
        paidCount += s.count || 0;
      } else if (st === 'PENDING' || st === 'PROCESSING') {
        pendingCount += s.count || 0;
        pendingAmount += s.totalAmount || 0;
      } else if (st === 'FAILED' || st === 'CANCELLED') {
        failedCount += s.count || 0;
        failedAmount += s.totalAmount || 0;
      } else if (st === 'REFUNDED') {
        refundCount += s.count || 0;
        refundAmount += s.totalRefund || s.totalAmount || 0;
      }
    });

    res.json({
      success: true,
      stats: {
        totalRevenue,
        paidCount,
        pendingCount,
        pendingAmount,
        failedCount,
        failedAmount,
        refundCount,
        refundAmount,
        totalTransactions: totalCount
      },
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch payment transactions' });
  }
});

/**
 * 10. GET /api/payments/superadmin/overview
 * Superadmin endpoint: Cross-tenant platform payment analytics & global ledger
 */
router.get('/superadmin/overview', superAdminOnly, async (req, res) => {
  try {
    const { tenantId, branchId, method, status, search, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (branchId) filter.branchId = branchId;
    if (method && method !== 'all') {
      if (method === 'card' || method === 'stripe') filter.paymentMethod = { $in: ['card', 'stripe'] };
      else if (method === 'cod' || method === 'cash') filter.paymentMethod = { $in: ['cod', 'cash'] };
      else filter.paymentMethod = method;
    }
    if (status && status !== 'all') filter.status = status.toUpperCase();
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { orderNumber: new RegExp(q, 'i') },
        { transactionId: new RegExp(q, 'i') },
        { customerName: new RegExp(q, 'i') },
        { customerEmail: new RegExp(q, 'i') }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const baseScope = {};
    if (tenantId) baseScope.tenantId = toObjectId(tenantId);
    if (branchId) baseScope.branchId = toObjectId(branchId);
    const matchStage = Object.keys(baseScope).length ? [{ $match: baseScope }] : [];

    const [transactions, totalCount, statsAgg, byProviderAgg] = await Promise.all([
      Payment.find(filter)
        .populate('tenantId', 'name slug currency')
        .populate('branchId', 'name code city currency')
        .populate('orderId', 'orderNumber status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Payment.countDocuments(filter),
      Payment.aggregate([
        ...matchStage,
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            totalRefund: { $sum: '$refundAmount' }
          }
        }
      ]),
      Payment.aggregate([
        ...matchStage,
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ])
    ]);

    let totalRevenue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let refundCount = 0;
    let refundAmount = 0;

    statsAgg.forEach(s => {
      const st = (s._id || '').toUpperCase();
      if (st === 'PAID') {
        totalRevenue += s.totalAmount || 0;
        paidCount += s.count || 0;
      } else if (st === 'PENDING' || st === 'PROCESSING') {
        pendingCount += s.count || 0;
      } else if (st === 'FAILED' || st === 'CANCELLED') {
        failedCount += s.count || 0;
      } else if (st === 'REFUNDED') {
        refundCount += s.count || 0;
        refundAmount += s.totalRefund || s.totalAmount || 0;
      }
    });

    res.json({
      success: true,
      stats: {
        totalRevenue,
        paidCount,
        pendingCount,
        failedCount,
        refundCount,
        refundAmount,
        totalTransactions: totalCount
      },
      byProvider: byProviderAgg,
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (err) {
    console.error('Superadmin payment overview error:', err);
    res.status(500).json({ error: 'Failed to retrieve platform payment overview' });
  }
});

/**
 * 11. GET /api/payments/settings
 * Admin endpoint: retrieve tenant's payment settings (secrets masked)
 */
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin' ? (req.query.tenantId || req.admin.tenantId) : req.admin.tenantId;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const ps = tenant.paymentSettings || {};
    const safeSettings = {
      jazzcash: {
        enabled: Boolean(ps.jazzcash?.enabled),
        mode: ps.jazzcash?.mode || 'sandbox',
        merchantId: ps.jazzcash?.merchantId || '',
        isConfigured: Boolean(ps.jazzcash?.merchantId && ps.jazzcash?.password && ps.jazzcash?.integritySalt)
      },
      easypaisa: {
        enabled: Boolean(ps.easypaisa?.enabled),
        mode: ps.easypaisa?.mode || 'sandbox',
        storeId: ps.easypaisa?.storeId || '',
        isConfigured: Boolean(ps.easypaisa?.storeId && ps.easypaisa?.hashKey)
      },
      stripe: {
        enabled: Boolean(ps.stripe?.enabled),
        publishableKey: ps.stripe?.publishableKey || '',
        isConfigured: Boolean(ps.stripe?.secretKey)
      },
      bankTransfer: {
        enabled: ps.bankTransfer?.enabled !== false,
        bankName: ps.bankTransfer?.bankName || '',
        accountTitle: ps.bankTransfer?.accountTitle || '',
        iban: ps.bankTransfer?.iban || '',
        accountNumber: ps.bankTransfer?.accountNumber || '',
        instructions: ps.bankTransfer?.instructions || ''
      },
      raast: {
        enabled: ps.raast?.enabled !== false,
        iban: ps.raast?.iban || '',
        accountTitle: ps.raast?.accountTitle || '',
        bankName: ps.raast?.bankName || '',
        instructions: ps.raast?.instructions || ''
      },
      cashOnDelivery: {
        enabled: ps.cashOnDelivery?.enabled !== false
      }
    };

    res.json(safeSettings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payment settings' });
  }
});

/**
 * 12. PUT /api/payments/settings
 * Admin endpoint: update tenant's payment settings
 */
router.put('/settings', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin' ? (req.body.tenantId || req.admin.tenantId) : req.admin.tenantId;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (!tenant.paymentSettings) tenant.paymentSettings = {};

    const { jazzcash, easypaisa, stripe, bankTransfer, raast, cashOnDelivery } = req.body;

    if (jazzcash) {
      tenant.paymentSettings.jazzcash = tenant.paymentSettings.jazzcash || {};
      tenant.paymentSettings.jazzcash.enabled = Boolean(jazzcash.enabled);
      if (jazzcash.mode) tenant.paymentSettings.jazzcash.mode = jazzcash.mode;
      if (jazzcash.merchantId !== undefined) tenant.paymentSettings.jazzcash.merchantId = jazzcash.merchantId.trim();
      if (jazzcash.password && jazzcash.password !== '********') tenant.paymentSettings.jazzcash.password = jazzcash.password.trim();
      if (jazzcash.integritySalt && jazzcash.integritySalt !== '********') tenant.paymentSettings.jazzcash.integritySalt = jazzcash.integritySalt.trim();
    }

    if (easypaisa) {
      tenant.paymentSettings.easypaisa = tenant.paymentSettings.easypaisa || {};
      tenant.paymentSettings.easypaisa.enabled = Boolean(easypaisa.enabled);
      if (easypaisa.mode) tenant.paymentSettings.easypaisa.mode = easypaisa.mode;
      if (easypaisa.storeId !== undefined) tenant.paymentSettings.easypaisa.storeId = easypaisa.storeId.trim();
      if (easypaisa.hashKey && easypaisa.hashKey !== '********') tenant.paymentSettings.easypaisa.hashKey = easypaisa.hashKey.trim();
    }

    if (stripe) {
      tenant.paymentSettings.stripe = tenant.paymentSettings.stripe || {};
      tenant.paymentSettings.stripe.enabled = Boolean(stripe.enabled);
      if (stripe.publishableKey !== undefined) tenant.paymentSettings.stripe.publishableKey = stripe.publishableKey.trim();
      if (stripe.secretKey && stripe.secretKey !== '********') tenant.paymentSettings.stripe.secretKey = stripe.secretKey.trim();
      if (stripe.webhookSecret && stripe.webhookSecret !== '********') tenant.paymentSettings.stripe.webhookSecret = stripe.webhookSecret.trim();
    }

    if (bankTransfer) {
      tenant.paymentSettings.bankTransfer = tenant.paymentSettings.bankTransfer || {};
      tenant.paymentSettings.bankTransfer.enabled = Boolean(bankTransfer.enabled);
      if (bankTransfer.bankName !== undefined) tenant.paymentSettings.bankTransfer.bankName = bankTransfer.bankName.trim();
      if (bankTransfer.accountTitle !== undefined) tenant.paymentSettings.bankTransfer.accountTitle = bankTransfer.accountTitle.trim();
      if (bankTransfer.iban !== undefined) tenant.paymentSettings.bankTransfer.iban = bankTransfer.iban.trim();
      if (bankTransfer.accountNumber !== undefined) tenant.paymentSettings.bankTransfer.accountNumber = bankTransfer.accountNumber.trim();
      if (bankTransfer.instructions !== undefined) tenant.paymentSettings.bankTransfer.instructions = bankTransfer.instructions.trim();
    }

    if (raast) {
      tenant.paymentSettings.raast = tenant.paymentSettings.raast || {};
      tenant.paymentSettings.raast.enabled = Boolean(raast.enabled);
      if (raast.iban !== undefined) tenant.paymentSettings.raast.iban = raast.iban.trim();
      if (raast.accountTitle !== undefined) tenant.paymentSettings.raast.accountTitle = raast.accountTitle.trim();
      if (raast.bankName !== undefined) tenant.paymentSettings.raast.bankName = raast.bankName.trim();
      if (raast.instructions !== undefined) tenant.paymentSettings.raast.instructions = raast.instructions.trim();
    }

    if (cashOnDelivery) {
      tenant.paymentSettings.cashOnDelivery = tenant.paymentSettings.cashOnDelivery || {};
      tenant.paymentSettings.cashOnDelivery.enabled = Boolean(cashOnDelivery.enabled);
    }

    tenant.markModified('paymentSettings');
    await tenant.save();

    res.json({ message: 'Payment settings updated successfully' });
  } catch (err) {
    console.error('Update payment settings error:', err);
    res.status(500).json({ error: 'Failed to update payment settings' });
  }
});

module.exports = router;