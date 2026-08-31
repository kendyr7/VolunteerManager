self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass-through fetch for basic PWA installability
});

function safeNotificationUrl(value) {
  try {
    const target = new URL(value || '/dashboard', self.location.origin);
    if (target.origin === self.location.origin && /^\/(dashboard|replacements|settings)(\/|\?|$)/.test(target.pathname + target.search)) return target.href;
  } catch { /* Fall back to an authenticated same-origin page. */ }
  return new URL('/dashboard', self.location.origin).href;
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Always show a visible notification. */ }
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 100) : 'Volunteer Manager';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 300) : 'Tienes un aviso pendiente. Abre la app para revisarlo.';
  event.waitUntil(Promise.all([self.registration.showNotification(title, { body, icon: '/app-icon-192.png', badge: '/notification-badge-96.png',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 200) : 'volunteer-manager',
    data: { url: safeNotificationUrl(payload.url) },
  }), self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    windows.forEach(client => client.postMessage({ type: 'notifications-updated' }));
  })]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find(client => client.url === url);
    if (exact) return exact.focus();
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing && 'navigate' in existing) {
      const navigated = await existing.navigate(url);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url);
  })());
});
