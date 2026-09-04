'use client';

const CHANGE_KEY = 'vm_notification_change_v1';

// Only an invalidation signal is shared. Each tab fetches its own authenticated
// account state; no notification content or user identity is put in storage.
export function announceNotificationRead() {
  try { localStorage.setItem(CHANGE_KEY, `${Date.now()}:${Math.random()}`); } catch { /* Polling remains available. */ }
}

export function watchNotificationChanges(refresh: () => void, panelOpen: boolean) {
  const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh(); };
  const timer = setTimeout(visibleRefresh, 0);
  // Other devices cannot use a local storage event. Reconcile with the server
  // while visible, and immediately when returning to the app.
  const interval = setInterval(visibleRefresh, panelOpen ? 5000 : 30000);
  const onStorage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) visibleRefresh(); };
  const onMessage = (event: MessageEvent) => { if (event.data?.type === 'notifications-updated') visibleRefresh(); };
  window.addEventListener('focus', visibleRefresh);
  window.addEventListener('online', visibleRefresh);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', visibleRefresh);
  navigator.serviceWorker?.addEventListener('message', onMessage);
  return () => {
    clearTimeout(timer); clearInterval(interval);
    window.removeEventListener('focus', visibleRefresh);
    window.removeEventListener('online', visibleRefresh);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', visibleRefresh);
    navigator.serviceWorker?.removeEventListener('message', onMessage);
  };
}
