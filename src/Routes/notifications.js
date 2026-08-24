const express = require('express');
const router = express.Router();

// Only browser-safe Firebase values belong here. Service-account credentials stay server-only.
router.get('/config', (req, res) => {
  const { FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID, FIREBASE_VAPID_KEY } = process.env;
  const enabled = Boolean(FIREBASE_API_KEY && FIREBASE_PROJECT_ID && FIREBASE_MESSAGING_SENDER_ID && FIREBASE_APP_ID && FIREBASE_VAPID_KEY);
  res.json({ enabled, vapidKey: enabled ? FIREBASE_VAPID_KEY : '', firebaseConfig: enabled ? { apiKey: FIREBASE_API_KEY, authDomain: FIREBASE_AUTH_DOMAIN, projectId: FIREBASE_PROJECT_ID, storageBucket: FIREBASE_STORAGE_BUCKET, messagingSenderId: FIREBASE_MESSAGING_SENDER_ID, appId: FIREBASE_APP_ID } : null });
});
module.exports = router;
