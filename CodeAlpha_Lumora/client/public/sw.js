/* Lumora service worker: makes the app installable and shows push notifications.
   It deliberately caches nothing, so a new deploy is always picked up straight away. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // required by some browsers for installability; network handles everything

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // if the app is open and in front, the in-app pop-up already shows it
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
      await self.registration.showNotification(d.title || 'Lumora', {
        body: d.body || '',
        icon: d.icon || '/icons/icon-192.png',
        badge: d.badge || '/icons/badge-96.png',
        tag: d.tag || undefined,
        renotify: !!d.tag,
        data: { url: d.url || '/' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const mine = wins.find((w) => w.url.startsWith(self.location.origin));
      if (mine) {
        await mine.focus();
        mine.postMessage({ type: 'navigate', url: new URL(target).pathname + new URL(target).search });
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});