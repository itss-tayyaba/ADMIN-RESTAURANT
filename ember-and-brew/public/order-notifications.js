// FCM is opt-in: browsers require permission from a customer action.
window.getOrderPushToken = async function getOrderPushToken() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return '';
  try {
    const { enabled, firebaseConfig, vapidKey } = await (await fetch('/api/notifications/config')).json();
    if (!enabled || Notification.permission === 'denied') return '';
    if (Notification.permission === 'default' && await Notification.requestPermission() !== 'granted') return '';
    const [appModule, messagingModule, registration] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'), import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js'), navigator.serviceWorker.register('/firebase-messaging-sw.js')
    ]);
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    return await messagingModule.getToken(messagingModule.getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  } catch (error) { console.warn('Push notification setup was skipped:', error.message); return ''; }
};
