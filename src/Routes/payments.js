const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const { resolveTenant, addTenantScope } = require('../utils/tenantScope');
const paymentService = require('../services/paymentService');

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

// Helper to emit socket events if io is available
function emitOrderUpdate(req, order, event = 'order:update') {
  const io = req.app.get('io');
  if (!io) return;
  if (order.tenantId) {
    io.to(`tenant:${order.tenantId}`).emit(event, order);
  }
  if (order.branchId) {
    const branchIdStr = order.branchId._id ? order.branchId._id.toString() : order.branchId.toString();
    io.to(`branch:${branchIdStr}`).emit(event, order);
  }
}

/**
 * GET /api/payments/config
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
 * POST /api/payments/initiate
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

    // 1. JazzCash Hosted Checkout
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

      return res.json({
        type: 'form_post',
        endpoint: payload.endpoint,
        method: payload.method,
        fields: payload.fields,
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // 2. Easypaisa Hosted Checkout
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

      return res.json({
        type: 'form_post',
        endpoint: payload.endpoint,
        method: payload.method,
        fields: payload.fields,
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // 3. Card via Official Stripe Gateway
    if (paymentMethod === 'card') {
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

      return res.json({
        type: 'redirect',
        redirectUrl: session.sessionUrl,
        sessionId: session.sessionId,
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // 4. Manual Bank Transfer or Raast (Admin verified)
    if (paymentMethod === 'bank-transfer' || paymentMethod === 'raast') {
      const details = paymentDetails || {};
      order.paymentMethod = paymentMethod;
      order.paymentStatus = 'PENDING';
      order.paymentDetails = {
        provider: paymentMethod,
        senderName: details.senderName || '',
        referenceId: details.referenceId || details.transactionId || '',
        accountNumber: details.accountNumber || '',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR',
        paidAt: null,
        verifiedBy: '',
        verifiedAt: null
      };
      await order.save();
      emitOrderUpdate(req, order);

      return res.json({
        type: 'manual_pending',
        message: 'Deposit details submitted for verification. Staff will verify your payment.',
        paymentStatus: 'PENDING',
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    // 5. Cash on Delivery (COD)
    if (paymentMethod === 'cash') {
      order.paymentMethod = 'cash';
      order.paymentStatus = 'PENDING';
      order.paymentDetails = {
        provider: 'cash',
        amountPaid: order.total,
        currency: tenant?.currency || 'PKR'
      };
      await order.save();
      emitOrderUpdate(req, order);

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
 * POST & GET /api/payments/jazzcash/callback
 * Official JazzCash server callback / redirect IPN
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
      // Prevent duplicate processing
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
 * POST & GET /api/payments/easypaisa/callback
 * Official Easypaisa IPN / return callback
 */
async function handleEasypaisaCallback(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const orderRef = data.orderRefNumber || data.orderRefNum;

    let order = null;
    if (orderRef) {
      // orderRefNum format: EB-ABCDEF-1234
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
 * GET /api/payments/stripe/return
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
      return res.redirect(`${redirectPath}&payment=success`);
    } else {
      order.paymentStatus = 'FAILED';
      await order.save();
      emitOrderUpdate(req, order);
      return res.redirect(`${redirectPath}&payment=failed`);
    }
  } catch (err) {
    console.error('Stripe return error:', err);
    res.status(500).send('Error verifying Stripe payment session');
  }
});

/**
 * PUT /api/payments/orders/:id/verify-manual
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

    const adminName = req.admin.name || req.admin.email || 'Admin Staff';

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
    } else {
      order.paymentStatus = 'FAILED';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        verifiedBy: adminName,
        verifiedAt: new Date(),
        notes: reason || 'Manual deposit verification rejected by admin staff'
      };
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
 * GET /api/payments/settings
 * Admin endpoint: retrieve tenant's payment settings (secrets masked)
 */
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const tenantId = req.admin.role === 'superadmin' ? (req.query.tenantId || req.admin.tenantId) : req.admin.tenantId;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const ps = tenant.paymentSettings || {};
    // Mask sensitive secrets for UI display
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
 * PUT /api/payments/settings
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
      tenant.paymentSettings.jazzcash.enabled = Boolean(jazzcash.enabled);
      if (jazzcash.mode) tenant.paymentSettings.jazzcash.mode = jazzcash.mode;
      if (jazzcash.merchantId !== undefined) tenant.paymentSettings.jazzcash.merchantId = jazzcash.merchantId.trim();
      if (jazzcash.password && jazzcash.password !== '********') tenant.paymentSettings.jazzcash.password = jazzcash.password.trim();
      if (jazzcash.integritySalt && jazzcash.integritySalt !== '********') tenant.paymentSettings.jazzcash.integritySalt = jazzcash.integritySalt.trim();
    }

    if (easypaisa) {
      tenant.paymentSettings.easypaisa.enabled = Boolean(easypaisa.enabled);
      if (easypaisa.mode) tenant.paymentSettings.easypaisa.mode = easypaisa.mode;
      if (easypaisa.storeId !== undefined) tenant.paymentSettings.easypaisa.storeId = easypaisa.storeId.trim();
      if (easypaisa.hashKey && easypaisa.hashKey !== '********') tenant.paymentSettings.easypaisa.hashKey = easypaisa.hashKey.trim();
    }

    if (stripe) {
      tenant.paymentSettings.stripe.enabled = Boolean(stripe.enabled);
      if (stripe.publishableKey !== undefined) tenant.paymentSettings.stripe.publishableKey = stripe.publishableKey.trim();
      if (stripe.secretKey && stripe.secretKey !== '********') tenant.paymentSettings.stripe.secretKey = stripe.secretKey.trim();
    }

    if (bankTransfer) {
      tenant.paymentSettings.bankTransfer.enabled = Boolean(bankTransfer.enabled);
      if (bankTransfer.bankName !== undefined) tenant.paymentSettings.bankTransfer.bankName = bankTransfer.bankName.trim();
      if (bankTransfer.accountTitle !== undefined) tenant.paymentSettings.bankTransfer.accountTitle = bankTransfer.accountTitle.trim();
      if (bankTransfer.iban !== undefined) tenant.paymentSettings.bankTransfer.iban = bankTransfer.iban.trim();
      if (bankTransfer.accountNumber !== undefined) tenant.paymentSettings.bankTransfer.accountNumber = bankTransfer.accountNumber.trim();
      if (bankTransfer.instructions !== undefined) tenant.paymentSettings.bankTransfer.instructions = bankTransfer.instructions.trim();
    }

    if (raast) {
      tenant.paymentSettings.raast.enabled = Boolean(raast.enabled);
      if (raast.iban !== undefined) tenant.paymentSettings.raast.iban = raast.iban.trim();
      if (raast.accountTitle !== undefined) tenant.paymentSettings.raast.accountTitle = raast.accountTitle.trim();
      if (raast.bankName !== undefined) tenant.paymentSettings.raast.bankName = raast.bankName.trim();
      if (raast.instructions !== undefined) tenant.paymentSettings.raast.instructions = raast.instructions.trim();
    }

    if (cashOnDelivery) {
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
