const firebaseAdmin = require('firebase-admin');

const STATUS_MESSAGES = {
  pending_admin: { title: 'Order received', body: order => `Your order ${order.orderNumber} has been received.` },
  pending_kitchen: { title: 'Order confirmed', body: () => 'Your order has been confirmed and sent to the kitchen.' },
  preparing: { title: 'Your order is being prepared', body: () => 'Our kitchen is preparing your food. 👨‍🍳' },
  ready: { title: 'Your order is ready', body: order => order.orderType === 'delivery' ? 'Your order is ready and will be with you soon. 📦' : 'Your order is ready for pickup. 📦' },
  'out-for-delivery': { title: 'Your order is on the way', body: order => order.deliveryBoyName ? `${order.deliveryBoyName} has been assigned and is on the way. 🛵` : 'Your rider has been assigned and is on the way. 🛵' },
  completed: { title: 'Order delivered', body: order => `Your order ${order.orderNumber} has been delivered. Enjoy your meal! ✅` },
  cancelled: { title: 'Order cancelled', body: order => `Your order ${order.orderNumber} has been cancelled. Please contact the restaurant if you need help.` }
};

function notificationFor(order, status = order.status) {
  const template = STATUS_MESSAGES[status];
  return template && { title: template.title, body: template.body(order), status };
}

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;
  return { projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') };
}

function firebaseMessaging() {
  const credentials = serviceAccountFromEnv();
  if (!credentials) return null;
  if (!firebaseAdmin.apps.length) firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(credentials) });
  return firebaseAdmin.messaging();
}

function customerWhatsAppNumber(phone) {
  let number = String(phone || '').replace(/[^\d+]/g, '');
  if (!number) return '';
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  if (!number.startsWith('+')) number = number.startsWith('0') && number.length === 11 ? `+92${number.slice(1)}` : `+${number}`;
  return `whatsapp:${number}`;
}

async function sendPush(order, message) {
  const tokens = [...new Set((order.pushTokens || []).filter(Boolean))];
  const messaging = firebaseMessaging();
  if (!messaging || !tokens.length) return { sent: 0, skipped: true };
  const link = `/customer?order=${encodeURIComponent(order.orderNumber)}`;
  const response = await messaging.sendEachForMulticast({
    tokens, notification: { title: message.title, body: message.body },
    data: { orderNumber: String(order.orderNumber), status: message.status, link },
    webpush: { notification: { icon: '/images/logo.png' }, fcmOptions: { link } }
  });
  return { sent: response.successCount, failed: response.failureCount };
}

async function sendWhatsApp(order, message) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_CONTENT_SID } = process.env;
  const to = customerWhatsAppNumber(order.customerPhone);
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !to) return { sent: false, skipped: true };
  const form = new URLSearchParams({ To: to, From: TWILIO_WHATSAPP_FROM });
  if (TWILIO_WHATSAPP_CONTENT_SID) {
    // Template variables 1 and 2 should be title and message body in the
    // approved Twilio Content template configured for order updates.
    form.set('ContentSid', TWILIO_WHATSAPP_CONTENT_SID);
    form.set('ContentVariables', JSON.stringify({ 1: message.title, 2: message.body }));
  } else {
    form.set('Body', `${message.title}\n${message.body}`);
  }
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`WhatsApp provider returned ${response.status}`);
  return { sent: true };
}

async function notifyCustomer(order, status = order.status) {
  const message = notificationFor(order, status);
  if (!message) return { skipped: true };
  const results = await Promise.allSettled([sendPush(order, message), sendWhatsApp(order, message)]);
  for (const result of results) if (result.status === 'rejected') console.error('Customer notification failed:', result.reason.message);
  return results;
}

module.exports = { notifyCustomer, notificationFor };
