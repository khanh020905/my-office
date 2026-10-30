// My Office on a phone (registered by the page, ui/notify.js): it shows the office's notifications (Claude's answers, an
// approval waiting) even with the office closed and the phone locked, and a tap opens the office, at the group chat for
// an answer. Nothing is cached: the office is live or it is nothing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'My Office', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/apple-icon.png', badge: '/icon-512.png', data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) { open.postMessage({ k: 'open', url }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
