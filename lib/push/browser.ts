'use client';

// Best-effort local revocation complements server cleanup during logout, including
// a database outage. Never delay closing the authenticated session indefinitely.
export async function unsubscribeBrowserPush() {
  if (!('serviceWorker' in navigator)) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (registration && 'pushManager' in registration) {
          const subscription = await registration.pushManager.getSubscription();
          await subscription?.unsubscribe();
        }
      })(),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 2000); }),
    ]);
  } catch { /* Server-side revocation is still attempted. */ }
  finally { clearTimeout(timeout); }
}
