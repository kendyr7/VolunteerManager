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
    data: { url: safeNotificationUrl(payload.url),
      tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 200) : null,
      recipientId: typeof payload.recipientId === 'string' ? payload.recipientId : null },
  }), self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    windows.forEach(client => client.postMessage({ type: 'notifications-updated' }));
  })]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  // Save the reading without delaying opening the app (required on mobile).
  const saveRead = async () => {
    const { tag, recipientId } = event.notification.data || {};
    if (!tag || !recipientId) return; // Older pushes have no account binding.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, recipientId }), signal: controller.signal,
      });
      if (response.ok) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        windows.forEach(client => client.postMessage({ type: 'notifications-updated' }));
      }
    } catch { /* Offline or signed out: opening the app must still work. */ }
    finally { clearTimeout(timeout); }
  };
  event.waitUntil(Promise.all([saveRead(), (async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find(client => client.url === url);
    if (exact) return exact.focus();
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing && 'navigate' in existing) {
      const navigated = await existing.navigate(url);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url);
  })()]));
});
