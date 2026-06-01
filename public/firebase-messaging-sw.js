/* Firebase Cloud Messaging service worker for web/PWA push notifications.
 * Uses the compat builds via importScripts (required inside a service worker).
 * Config values below are public Firebase web config (safe to ship). */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBJKZP3AXNI2onYGkXFBw94EkaN77jwnLo',
  authDomain: 'el-node-erp.firebaseapp.com',
  projectId: 'el-node-erp',
  storageBucket: 'el-node-erp.firebasestorage.app',
  messagingSenderId: '58420941278',
  appId: '1:58420941278:web:adf89e6e07b1ddada14d4f',
});

const messaging = firebase.messaging();

// Background messages (app not in focus). Show a single notification, tagged by
// notificationId so repeated deliveries collapse instead of stacking.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'EL Node ERP';
  const body = payload.notification?.body || payload.data?.body || '';
  self.registration.showNotification(title, {
    body,
    icon: '/logo high res tp-01.png',
    badge: '/logo high res tp-01.png',
    tag: payload.data?.notificationId || undefined,
    data: { link: payload.data?.link || '/' },
  });
});

// Focus an existing tab (or open one) and navigate to the notification's link.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(link).catch(() => {});
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
