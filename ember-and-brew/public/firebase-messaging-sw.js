importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
fetch('/api/notifications/config').then(response => response.json()).then(({ enabled, firebaseConfig }) => {
  if (!enabled) return;
  firebase.initializeApp(firebaseConfig);
  firebase.messaging();
}).catch(() => {});
