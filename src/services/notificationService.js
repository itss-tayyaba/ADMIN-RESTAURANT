const firebaseAdmin = require('firebase-admin');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

// ============================================
// STATUS MESSAGE GENERATORS
// ============================================
const STATUS_TEMPLATES = {
  pending_admin: {
    title: 'Order Received & Confirmed',
    subject: order => `Order Confirmed: #${order.orderNumber} — Ember & Brew`,
    body: order => `🎉 Thank you for your order, ${order.customerName || 'Customer'}! Your order #${order.orderNumber} (${formatCurrency(order.total)}) has been received and confirmed. Order Type: ${capitalize(order.orderType || 'dine-in')}.`
  },
  pending_kitchen: {
    title: 'Order Confirmed',
    subject: order => `Order Confirmed: #${order.orderNumber} — Ember & Brew`,
    body: order => `🎉 Your order #${order.orderNumber} has been confirmed and sent to the kitchen.`
  },
  received: {
    title: 'Order Received',
    subject: order => `Order Received: #${order.orderNumber} — Ember & Brew`,
    body: order => `🎉 Your order #${order.orderNumber} has been received.`
  },
  preparing: {
    title: 'Preparing Your Food',
    subject: order => `Preparing Order #${order.orderNumber} 👨‍🍳 — Ember & Brew`,
    body: order => `👨‍🍳 Our kitchen has started preparing your order #${order.orderNumber}.`
  },
  ready: {
    title: 'Order Ready',
    subject: order => `Order #${order.orderNumber} is Ready! 📦 — Ember & Brew`,
    body: order => order.orderType === 'delivery'
      ? `📦 Your order #${order.orderNumber} is freshly packed and ready for dispatch.`
      : `📦 Your order #${order.orderNumber} is ready for pickup/dine-in.`
  },
  'out-for-delivery': {
    title: 'Out for Delivery — Delivery OTP Inside',
    subject: order => `🛵 Order #${order.orderNumber} Out for Delivery (OTP: ${order.otp || 'Ready'})`,
    body: order => {
      const riderInfo = order.deliveryBoyName ? ` with rider ${order.deliveryBoyName}${order.deliveryBoyPhone ? ' (' + order.deliveryBoyPhone + ')' : ''}` : '';
      const otpText = order.otp ? `\n\n🔑 YOUR DELIVERY OTP IS: ${order.otp}\nPlease share this OTP code with the rider when receiving your food to verify delivery.` : '';
      return `🛵 Your order #${order.orderNumber} is on the way${riderInfo}!${otpText}`;
    }
  },
  delivered: {
    title: 'Order Delivered',
    subject: order => `Order #${order.orderNumber} Delivered ✅ — Ember & Brew`,
    body: order => `✅ Your order #${order.orderNumber} has been delivered. Enjoy your meal! Thank you for ordering from Ember & Brew.`
  },
  completed: {
    title: 'Order Completed',
    subject: order => `Order #${order.orderNumber} Completed ✅ — Ember & Brew`,
    body: order => `✅ Your order #${order.orderNumber} has been delivered and completed. Enjoy your meal!`
  },
  cancelled: {
    title: 'Order Cancelled',
    subject: order => `Order #${order.orderNumber} Cancelled — Ember & Brew`,
    body: order => `❌ Your order #${order.orderNumber} has been cancelled. If you need any assistance, please contact the restaurant.`
  }
};

function formatCurrency(val) {
  const num = Number(val);
  return Number.isFinite(num) ? `Rs ${num.toFixed(2)}` : 'Rs 0.00';
}

function capitalize(str) {
  return String(str || '').replace(/^[a-z]/, m => m.toUpperCase());
}

function notificationFor(order, status = order.status) {
  const template = STATUS_TEMPLATES[status] || STATUS_TEMPLATES.pending_admin;
  return {
    title: template.title,
    subject: template.subject(order),
    body: template.body(order),
    status
  };
}

// ============================================
// FIREBASE PUSH NOTIFICATIONS
// ============================================
function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch (_) {}
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;
  return { projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') };
}

function firebaseMessaging() {
  const credentials = serviceAccountFromEnv();
  if (!credentials) return null;
  if (!firebaseAdmin.apps.length) {
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(credentials) });
  }
  return firebaseAdmin.messaging();
}

async function sendPush(order, message) {
  const tokens = [...new Set((order.pushTokens || []).filter(Boolean))];
  const messaging = firebaseMessaging();
  if (!messaging || !tokens.length) return { sent: 0, skipped: true };
  const link = `/customer?order=${encodeURIComponent(order.orderNumber)}`;
  try {
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: { orderNumber: String(order.orderNumber), status: message.status, link },
      webpush: { notification: { icon: '/images/logo.png' }, fcmOptions: { link } }
    });
    return { sent: response.successCount, failed: response.failureCount };
  } catch (err) {
    console.warn('[Push Notification Error]', err.message);
    return { sent: 0, error: err.message };
  }
}

// ============================================
// EMAIL NOTIFICATIONS (NODEMAILER)
// ============================================
let emailTransporter = null;

function getEmailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, EMAIL_SERVICE } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (emailTransporter) return emailTransporter;

  if (EMAIL_SERVICE || (SMTP_HOST && SMTP_HOST.includes('gmail.com'))) {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: String(SMTP_PASS).replace(/\s+/g, '') }
    });
    return emailTransporter;
  }
  if (SMTP_HOST) {
    emailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: String(SMTP_PASS).replace(/\s+/g, '') }
    });
    return emailTransporter;
  }
  return null;
}

function buildOrderEmailHtml(order, message) {
  const isOutForDelivery = message.status === 'out-for-delivery';
  const hasOtp = Boolean(order.otp);
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsRows = items.map(item => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #2e2c28; color: #F5F0E8; font-size: 14px;">
        <strong>${item.qty}x</strong> ${escapeHtml(item.name)}
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #2e2c28; color: #D4A853; text-align: right; font-size: 14px; font-weight: 600;">
        ${formatCurrency((item.price || 0) * (item.qty || 1))}
      </td>
    </tr>
  `).join('');

  const otpBadgeHtml = (isOutForDelivery && hasOtp) ? `
    <div style="background: #2A2012; border: 2px solid #D4A853; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 6px 0; color: #D4A853; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">YOUR DELIVERY OTP CODE</p>
      <div style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #FFFFFF; text-shadow: 0 0 12px rgba(212,168,83,0.5);">
        ${escapeHtml(order.otp)}
      </div>
      <p style="margin: 10px 0 0 0; color: #C4BCB0; font-size: 13px;">Please give this 6-digit OTP code to your rider to verify and receive your food.</p>
    </div>
  ` : '';

  const riderHtml = (order.deliveryBoyName) ? `
    <div style="background: #1A1917; border: 1px solid #2E2C28; border-radius: 10px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0 0 4px 0; color: #8A8478; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Delivery Rider</p>
      <p style="margin: 0; color: #F5F0E8; font-size: 15px; font-weight: 600;">${escapeHtml(order.deliveryBoyName)} ${order.deliveryBoyPhone ? '· ' + escapeHtml(order.deliveryBoyPhone) : ''}</p>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 24px 12px; background-color: #0F0E0C; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F0E8;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #1A1917; border: 1px solid #2E2C28; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <!-- Header -->
        <tr>
          <td style="padding: 28px 24px 20px; text-align: center; border-bottom: 1px solid #2E2C28; background: linear-gradient(180deg, #242220 0%, #1A1917 100%);">
            <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #D4A853; letter-spacing: 1px;">Ember <em>&amp;</em> Brew</h1>
            <p style="margin: 6px 0 0 0; color: #8A8478; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px;">Order Updates &amp; Notifications</p>
          </td>
        </tr>
        <!-- Main Content -->
        <tr>
          <td style="padding: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <span style="font-size: 18px; font-weight: 700; color: #FFFFFF;">Order #${escapeHtml(order.orderNumber)}</span>
              <span style="background: #2E2C28; color: #D4A853; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">${escapeHtml(order.orderType || 'dine-in')}</span>
            </div>
            
            <p style="font-size: 15px; line-height: 1.5; color: #F5F0E8; margin: 0 0 16px 0;">
              ${message.body.replace(/\n/g, '<br>')}
            </p>

            ${otpBadgeHtml}
            ${riderHtml}

            <!-- Items Breakdown -->
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #2E2C28;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #8A8478;">Order Summary</h3>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${itemsRows}
              </table>
            </div>

            <!-- Totals -->
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed #2E2C28;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px;">
                <tr>
                  <td style="padding: 4px 0; color: #8A8478;">Subtotal</td>
                  <td style="padding: 4px 0; color: #F5F0E8; text-align: right;">${formatCurrency(order.subtotal)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #8A8478;">Tax</td>
                  <td style="padding: 4px 0; color: #F5F0E8; text-align: right;">${formatCurrency(order.tax)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0 0 0; color: #FFFFFF; font-size: 16px; font-weight: 700;">Total</td>
                  <td style="padding: 10px 0 0 0; color: #D4A853; font-size: 18px; font-weight: 700; text-align: right;">${formatCurrency(order.total)}</td>
                </tr>
              </table>
            </div>

            ${order.deliveryAddress ? `
              <div style="margin-top: 20px; padding: 12px; background: #242220; border-radius: 8px; font-size: 13px; color: #C4BCB0;">
                <strong style="color: #D4A853;">Delivery Address:</strong> ${escapeHtml(order.deliveryAddress)}
              </div>
            ` : ''}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding: 20px 24px; text-align: center; border-top: 1px solid #2E2C28; background-color: #141311; color: #8A8478; font-size: 12px; line-height: 1.5;">
            Thank you for dining with <strong>Ember &amp; Brew</strong>.<br>
            If you have questions about your order, please contact our restaurant directly.
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendEmail(toEmail, subject, htmlContent, textContent) {
  if (!toEmail) return { sent: false, skipped: true };
  const transporter = getEmailTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.EMAIL_FROM || '"Ember & Brew" <orders@emberandbrew.com>';

  if (!transporter) {
    console.log(`[Email Notification - Dev Mode] To: ${toEmail} | Subject: ${subject}\nBody: ${textContent}`);
    return { sent: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent
    });
    console.log(`[Email Sent] MessageId: ${info.messageId} to ${toEmail}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[Email Error] Failed sending to ${toEmail}:`, err.message);
    return { sent: false, error: err.message };
  }
}

// ============================================
// SMS NOTIFICATIONS (TWILIO / GENERIC GATEWAY)
// ============================================
function customerStandardPhone(phone) {
  let number = String(phone || '').replace(/[^\d+]/g, '');
  if (!number) return '';
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  if (!number.startsWith('+')) {
    number = number.startsWith('0') && number.length === 11 ? `+92${number.slice(1)}` : `+${number}`;
  }
  return number;
}

async function sendSMS(rawPhone, text) {
  const to = customerStandardPhone(rawPhone);
  if (!to) return { sent: false, skipped: true };

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_SMS_FROM, SMS_GATEWAY_URL, SMS_GATEWAY_API_KEY } = process.env;

  // 1. Generic SMS Gateway Webhook
  if (SMS_GATEWAY_URL) {
    try {
      const response = await fetch(SMS_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SMS_GATEWAY_API_KEY ? { Authorization: `Bearer ${SMS_GATEWAY_API_KEY}` } : {})
        },
        body: JSON.stringify({ to, message: text }),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`SMS gateway responded ${response.status}`);
      return { sent: true, provider: 'gateway' };
    } catch (err) {
      console.warn('[SMS Gateway Error]', err.message);
    }
  }

  // 2. Twilio SMS
  const fromNumber = TWILIO_PHONE_NUMBER || TWILIO_SMS_FROM;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && fromNumber) {
    try {
      const form = new URLSearchParams({ To: to, From: fromNumber, Body: text });
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Twilio status ${response.status}`);
      }
      return { sent: true, provider: 'twilio-sms' };
    } catch (err) {
      console.warn('[Twilio SMS Error]', err.message);
      return { sent: false, error: err.message };
    }
  }

  // Fallback Dev Log
  console.log(`[SMS Notification - Dev Mode] To: ${to}\n${text}`);
  return { sent: true, simulated: true };
}

// ============================================
// WHATSAPP NOTIFICATIONS (TWILIO / CLOUD API)
// ============================================
function customerWhatsAppNumber(phone) {
  const number = customerStandardPhone(phone);
  return number ? `whatsapp:${number}` : '';
}

async function sendWhatsApp(rawPhone, message) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_CONTENT_SID, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN } = process.env;
  const toWhatsApp = customerWhatsAppNumber(rawPhone);
  const plainPhone = customerStandardPhone(rawPhone).replace(/^\+/, '');
  if (!toWhatsApp) return { sent: false, skipped: true };

  // 1. Meta WhatsApp Cloud API
  if (WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN && plainPhone) {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: plainPhone,
          type: 'text',
          text: { body: `*${message.title}*\n\n${message.body}` }
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok) return { sent: true, provider: 'whatsapp-cloud-api' };
    } catch (err) {
      console.warn('[WhatsApp Cloud API Error]', err.message);
    }
  }

  // 2. Twilio WhatsApp
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
    try {
      const form = new URLSearchParams({ To: toWhatsApp, From: TWILIO_WHATSAPP_FROM });
      if (TWILIO_WHATSAPP_CONTENT_SID) {
        form.set('ContentSid', TWILIO_WHATSAPP_CONTENT_SID);
        form.set('ContentVariables', JSON.stringify({ 1: message.title, 2: message.body }));
      } else {
        form.set('Body', `*${message.title}*\n\n${message.body}`);
      }
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`WhatsApp provider returned ${response.status}`);
      return { sent: true, provider: 'twilio-whatsapp' };
    } catch (err) {
      console.warn('[Twilio WhatsApp Error]', err.message);
      return { sent: false, error: err.message };
    }
  }

  // Fallback Dev Log
  console.log(`[WhatsApp Notification - Dev Mode] To: ${toWhatsApp}\n*${message.title}*\n${message.body}`);
  return { sent: true, simulated: true };
}

// ============================================
// MAIN ORDER NOTIFICATION DISPATCHER
// ============================================
async function notifyCustomer(order, status = order.status) {
  try {
    if (!order) return { skipped: true };

    // If OTP is required but not selected on the order instance, query it
    if (!order.otp && order._id) {
      try {
        const OrderModel = mongoose.model('Order');
        const docWithOtp = await OrderModel.findById(order._id).select('+otp customerEmail customer');
        if (docWithOtp) {
          if (docWithOtp.otp) order.otp = docWithOtp.otp;
          if (docWithOtp.customerEmail && !order.customerEmail) order.customerEmail = docWithOtp.customerEmail;
          if (docWithOtp.customer && !order.customer) order.customer = docWithOtp.customer;
        }
      } catch (_) {}
    }

    // Resolve customer email if linked to account
    let emailTo = order.customerEmail || '';
    if (!emailTo && order.customer) {
      try {
        const CustomerModel = mongoose.model('Customer');
        const cust = await CustomerModel.findById(order.customer).select('email');
        if (cust?.email) emailTo = cust.email;
      } catch (_) {}
    }

    const message = notificationFor(order, status);
    const emailHtml = buildOrderEmailHtml(order, message);
    const smsText = `[Ember & Brew] ${message.title}: ${message.body}`;

    const tasks = [
      sendPush(order, message),
      sendSMS(order.customerPhone, smsText),
      sendWhatsApp(order.customerPhone, message)
    ];

    if (emailTo) {
      tasks.push(sendEmail(emailTo, message.subject, emailHtml, message.body));
    }

    const results = await Promise.allSettled(tasks);
    for (const res of results) {
      if (res.status === 'rejected') {
        console.error('Customer notification channel failed:', res.reason?.message || res.reason);
      }
    }
    return results;
  } catch (err) {
    console.error('Failed to dispatch customer notification:', err.message);
    return { error: err.message };
  }
}

// ============================================
// RESERVATION NOTIFICATIONS
// ============================================
async function notifyReservation(reservation, status = reservation.status) {
  try {
    if (!reservation) return { skipped: true };
    const guestName = reservation.guestName || 'Valued Guest';
    const date = reservation.date || '';
    const time = reservation.time || '';
    const guests = reservation.guests || 2;
    const tableNum = reservation.tableNumber ? String(reservation.tableNumber) : '';

    let title = '';
    let subject = '';
    let body = '';
    let badgeText = '';
    let badgeColor = '#D4A853';

    if (status === 'confirmed') {
      title = 'Table Reservation Confirmed! 🎉';
      subject = `🎉 Table Confirmed for ${date} at ${time} — Ember & Brew`;
      body = `Great news, ${guestName}! Your reservation for ${guests} guest${guests > 1 ? 's' : ''} on ${date} at ${time} has been confirmed${tableNum ? ` at Table ${tableNum}` : ''}. We look forward to hosting you at Ember & Brew!`;
      badgeText = tableNum ? `TABLE RESERVED: TABLE ${tableNum}` : 'RESERVATION CONFIRMED';
      badgeColor = '#657558';
    } else if (status === 'cancelled') {
      title = 'Reservation Cancelled';
      subject = `Table Reservation Cancelled — Ember & Brew`;
      body = `Hello ${guestName}, your reservation on ${date} at ${time} has been cancelled. If you wish to reschedule, please visit our website.`;
      badgeText = 'RESERVATION CANCELLED';
      badgeColor = '#9A5638';
    } else {
      title = 'Reservation Request Received';
      subject = `Table Request Received for ${date} at ${time} — Ember & Brew`;
      body = `Hello ${guestName}, we have received your reservation request for ${guests} guest${guests > 1 ? 's' : ''} on ${date} at ${time}. Our host team is reviewing table availability and will confirm shortly!`;
      badgeText = 'REQUEST RECEIVED · PENDING CONFIRMATION';
      badgeColor = '#C4923A';
    }

    const message = { title, subject, body, status };
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin: 0; padding: 0; background-color: #0B0A08; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #F5F0E8;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0B0A08; padding: 30px 10px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #141310; border: 1px solid #2E2C28; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                <tr>
                  <td style="padding: 28px 32px; border-bottom: 1px solid #2E2C28; background: linear-gradient(180deg, #1C1A16 0%, #141310 100%);">
                    <h1 style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 700; color: #F5F0E8;">
                      Ember <em style="color: #D4A853; font-style: normal;">&amp;</em> Brew
                    </h1>
                    <p style="margin: 4px 0 0 0; color: #A8A296; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;">Table Reservation</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <div style="display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}55; margin-bottom: 16px;">
                      ${badgeText}
                    </div>
                    <h2 style="margin: 0 0 12px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 22px; color: #FFFFFF;">${title}</h2>
                    <p style="margin: 0 0 24px 0; color: #D4CEBF; font-size: 15px; line-height: 1.6;">${body}</p>

                    <div style="background-color: #1C1A16; border: 1px solid #2E2C28; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding-bottom: 10px; color: #8A8478; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Guest</td>
                          <td align="right" style="padding-bottom: 10px; color: #F5F0E8; font-weight: 600; font-size: 14px;">${escapeHtml(guestName)}</td>
                        </tr>
                        <tr>
                          <td style="padding-bottom: 10px; color: #8A8478; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Date &amp; Time</td>
                          <td align="right" style="padding-bottom: 10px; color: #D4A853; font-weight: 700; font-size: 14px;">${escapeHtml(date)} at ${escapeHtml(time)}</td>
                        </tr>
                        <tr>
                          <td style="padding-bottom: 10px; color: #8A8478; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Party Size</td>
                          <td align="right" style="padding-bottom: 10px; color: #F5F0E8; font-weight: 600; font-size: 14px;">${guests} Guests</td>
                        </tr>
                        ${tableNum ? `
                        <tr>
                          <td style="padding-top: 10px; border-top: 1px solid #2E2C28; color: #8A8478; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Assigned Table</td>
                          <td align="right" style="padding-top: 10px; border-top: 1px solid #2E2C28; color: #657558; font-weight: 800; font-size: 16px;">Table ${escapeHtml(tableNum)}</td>
                        </tr>` : ''}
                      </table>
                    </div>

                    <p style="margin: 0; font-size: 13px; color: #8A8478; line-height: 1.5;">
                      Need to make changes? You can view your status anytime in your <a href="https://admin-restaurant-six.vercel.app/customer.html" style="color: #D4A853; text-decoration: underline;">Customer Portal</a>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 32px; border-top: 1px solid #2E2C28; background-color: #100F0D; text-align: center;">
                    <p style="margin: 0; color: #6E685E; font-size: 12px;">Ember &amp; Brew · Artisan Coffee &amp; Kitchen</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const smsText = `[Ember & Brew] ${title}: ${body}`;

    const tasks = [
      sendSMS(reservation.phone, smsText),
      sendWhatsApp(reservation.phone, message)
    ];

    if (reservation.email) {
      tasks.push(sendEmail(reservation.email, subject, emailHtml, body));
    }

    const results = await Promise.allSettled(tasks);
    for (const res of results) {
      if (res.status === 'rejected') {
        console.error('Reservation notification channel error:', res.reason?.message || res.reason);
      }
    }
    return results;
  } catch (err) {
    console.error('Failed to send reservation notification:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  notifyCustomer,
  notifyReservation,
  notificationFor,
  sendEmail,
  sendSMS,
  sendWhatsApp,
  sendPush
};
