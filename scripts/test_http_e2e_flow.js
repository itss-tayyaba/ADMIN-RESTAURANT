require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('../src/models/MenuItem');
const Order = require('../src/models/Order');
const Payment = require('../src/models/Payment');
const Tenant = require('../src/models/Tenant');
const Branch = require('../src/models/Branch');
const AdminUser = require('../src/models/AdminUser');

async function testFullHttpFlow() {
  console.log('=== RUNNING FULL HTTP END-TO-END FLOW TEST ===');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const tenant = await Tenant.findOne();
  const branch = await Branch.findOne({ tenantId: tenant._id, isActive: true });
  console.log(`Using Tenant: ${tenant.name} (${tenant._id}), Branch: ${branch.name} (${branch._id})`);

  // Create admin token to query /api/payments/admin/transactions
  const adminToken = jwt.sign(
    { id: 'test-admin', role: 'branch_admin', tenantId: tenant._id, branchId: branch._id, name: 'Test Admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Require server app
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Set mock io
  app.set('io', { to: () => ({ emit: () => {} }) });

  const orderRoutes = require('../src/Routes/orders');
  const paymentRoutes = require('../src/Routes/payments');
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test Express server running at ${baseUrl}`);

  try {
    // 1. Place a real customer test order via POST /api/orders
    console.log('\n--- STEP 1: Place Real Customer Order via POST /api/orders ---');
    const orderPayload = {
      tenantId: tenant._id.toString(),
      branchId: branch._id.toString(),
      items: [
        { name: 'Smoked Beef Brisket', qty: 1, price: 1850 },
        { name: 'Peach Iced Tea', qty: 2, price: 350 }
      ],
      guestName: 'Zainab Bibi (HTTP Test)',
      guestPhone: '03211234567',
      guestEmail: 'zainab.test@example.com',
      orderType: 'dine-in',
      tableNumber: 'T-5',
      paymentMethod: 'jazzcash'
    };

    const placeRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenant._id.toString()
      },
      body: JSON.stringify(orderPayload)
    });

    const orderData = await placeRes.json();
    if (!placeRes.ok) throw new Error(`Place order failed: ${JSON.stringify(orderData)}`);
    console.log(`Order placed successfully: ${orderData.orderNumber} (ID: ${orderData._id})`);
    console.log(`Initial paymentStatus: "${orderData.paymentStatus}", Total: Rs ${orderData.total}`);

    // 2. Initiate payment session via POST /api/payments/initiate
    console.log('\n--- STEP 2: Initiate Sandbox Payment via POST /api/payments/initiate ---');
    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenant._id.toString()
      },
      body: JSON.stringify({
        orderId: orderData._id,
        paymentMethod: 'jazzcash'
      })
    });

    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(`Initiate payment failed: ${JSON.stringify(initData)}`);
    console.log(`Initiate Response:`, initData);

    // 3. Complete Sandbox payment via POST /api/payments/sandbox-complete
    console.log('\n--- STEP 3: Complete Payment via POST /api/payments/sandbox-complete ---');
    const completeRes = await fetch(`${baseUrl}/api/payments/sandbox-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderId: orderData._id,
        provider: 'jazzcash',
        action: 'success'
      })
    });

    const completeData = await completeRes.json();
    if (!completeRes.ok) throw new Error(`Sandbox complete failed: ${JSON.stringify(completeData)}`);
    console.log(`Sandbox complete response:`, completeData);

    // 4. Confirm REQUIREMENT 1: Order's paymentStatus flips to PAID
    console.log('\n--- CONFIRM REQUIREMENT 1: Order paymentStatus flips to PAID ---');
    const orderCheck = await Order.findById(orderData._id);
    const req1Passed = orderCheck.paymentStatus === 'PAID';
    console.log(`Order paymentStatus in DB: "${orderCheck.paymentStatus}" (Txn ID: ${orderCheck.transactionId})`);
    console.log(`Requirement 1 status: ${req1Passed ? '✅ PASSED' : '❌ FAILED'}`);

    // 5. Confirm REQUIREMENT 2: New document appears in Payment collection
    console.log('\n--- CONFIRM REQUIREMENT 2: New document in Payment collection ---');
    const paymentDoc = await Payment.findOne({ orderId: orderData._id });
    const req2Passed = Boolean(paymentDoc && paymentDoc.status === 'PAID');
    console.log(`Payment document in DB: ID = ${paymentDoc?._id}, Method = ${paymentDoc?.paymentMethod}, Status = ${paymentDoc?.status}, Amount = Rs ${paymentDoc?.amount}`);
    console.log(`Requirement 2 status: ${req2Passed ? '✅ PASSED' : '❌ FAILED'}`);

    // 6. Confirm REQUIREMENT 3: Shows up in Transactions & Revenue tab via GET /api/payments/admin/transactions
    console.log('\n--- CONFIRM REQUIREMENT 3: Shows up in Transactions & Revenue tab ---');
    const txRes = await fetch(`${baseUrl}/api/payments/admin/transactions?search=${orderData.orderNumber}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const txData = await txRes.json();
    if (!txRes.ok) throw new Error(`Fetch transactions failed: ${JSON.stringify(txData)}`);

    const matchingTx = (txData.transactions || []).find(t => t.orderNumber === orderData.orderNumber);
    const req3Passed = Boolean(matchingTx && matchingTx.status === 'PAID');
    console.log(`Found matching transaction in Admin Ledger:`, {
      orderNumber: matchingTx?.orderNumber,
      status: matchingTx?.status,
      amount: matchingTx?.amount,
      customerName: matchingTx?.customerName,
      createdAt: matchingTx?.createdAt
    });
    console.log(`Total revenue reported by endpoint: Rs ${txData.stats?.totalRevenue} across ${txData.stats?.paidCount} orders`);
    console.log(`Requirement 3 status: ${req3Passed ? '✅ PASSED' : '❌ FAILED'}`);

    console.log('\n========================================');
    if (req1Passed && req2Passed && req3Passed) {
      console.log('🎉 ALL 3 CHECKS FULLY VALIDATED AND PASSED!');
    } else {
      console.error('❌ ONE OR MORE CHECKS FAILED!');
    }
    console.log('========================================');

  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('Cleaned up server and DB connection.');
  }
}

testFullHttpFlow().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
