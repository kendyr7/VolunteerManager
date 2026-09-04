'use client';

const PUSH_PREFERENCE_KEY = 'vm_push_enabled';
const PUSH_INVITE_KEY = 'vm_push_invite_dismissed_v1';
let dismissedInMemory = false;

type PushServerState = {
  configured: boolean;
  active: boolean;
  publicKey?: string;
};

let restorePromise: Promise<boolean> | null = null;

function rememberPushPreference(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(PUSH_PREFERENCE_KEY, '1');
    else localStorage.setItem(PUSH_PREFERENCE_KEY, '0');
  } catch { /* Private browsing may make localStorage unavailable. */ }
}

function hasRememberedPushPreference() {
  try { return localStorage.getItem(PUSH_PREFERENCE_KEY) === '1'; }
  catch { return false; }
}

function explicitlyDisabled() {
  try { return localStorage.getItem(PUSH_PREFERENCE_KEY) === '0'; }
  catch { return false; }
}

export function dismissPushInvite() {
  dismissedInMemory = true;
  try { localStorage.setItem(PUSH_INVITE_KEY, '1'); } catch { /* Best effort on restricted storage. */ }
}

export function isPushInviteDismissed() {
  if (dismissedInMemory || explicitlyDisabled()) return true;
  try {
    if (localStorage.getItem(PUSH_INVITE_KEY) === '1') return true;
    // Preserve dismissals made before they were durable.
    if (sessionStorage.getItem('push-invite-dismissed') === '1') {
      dismissPushInvite();
      return true;
    }
  } catch { /* Storage restrictions must not break settings. */ }
  return false;
}

function keyBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
}

async function readyWorker() {
  await navigator.serviceWorker.register('/sw.js');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('La app no pudo prepararse. Recarga la página e intenta nuevamente.')), 10000);
      }),
    ]);
  } finally { clearTimeout(timeout); }
}

export async function getBrowserPushSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration && 'pushManager' in registration
    ? registration.pushManager.getSubscription()
    : null;
}

export async function ensureBrowserPushSubscription(publicKey: string) {
  const registration = await readyWorker();
  let subscription = await registration.pushManager.getSubscription();
  const expected = keyBytes(publicKey);

  if (subscription) {
    const current = subscription.options.applicationServerKey;
    if (!current || current.byteLength !== expected.length ||
        new Uint8Array(current).some((value, index) => value !== expected[index])) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }

  if (subscription) return { subscription, created: false };
  return {
    subscription: await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected }),
    created: true,
  };
}

export function setBrowserPushPreference(enabled: boolean) {
  rememberPushPreference(enabled);
  if (!enabled) dismissPushInvite();
}

export async function waitForPushRestore() {
  await restorePromise?.catch(() => false);
}

// Reconnect a device only when this browser had already opted in. This never
// calls requestPermission, so a new device still requires an explicit click.
export async function restoreBrowserPushSubscription(state: PushServerState) {
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    if (explicitlyDisabled() || !state.configured || !state.publicKey || !window.isSecureContext ||
        !('serviceWorker' in navigator) || !('PushManager' in window) ||
        !('Notification' in window) || Notification.permission !== 'granted') return false;

    const current = await getBrowserPushSubscription();
    if (explicitlyDisabled()) return false;
    // An existing subscription is reliable evidence of an earlier opt-in and
    // also migrates users who enabled notifications before this preference existed.
    if (current || state.active) rememberPushPreference(true);
    if (!current && !hasRememberedPushPreference()) return false;
    if (current && state.active) return false;

    const { subscription, created } = await ensureBrowserPushSubscription(state.publicKey);
    if (explicitlyDisabled()) {
      if (created) await subscription.unsubscribe().catch(() => false);
      return false;
    }
    const response = await fetch('/api/push/subscription', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) {
      if (created) await subscription.unsubscribe().catch(() => false);
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error || 'No se pudo restaurar la configuración de notificaciones.');
    }
    if (!explicitlyDisabled()) rememberPushPreference(true);
    return true;
  })();

  try { return await restorePromise; }
  finally { restorePromise = null; }
}

// Server revocation prevents messages for the signed-out account. Keep the
// browser subscription so the next authenticated session can restore it. If
// server cleanup failed, unsubscribe locally as a safety fallback while still
// remembering the user's preference for the next login.
export async function preserveBrowserPushOnLogout(serverRevoked: boolean) {
  if (!('serviceWorker' in navigator)) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        const subscription = await getBrowserPushSubscription();
        if (!subscription) return;
        if (!explicitlyDisabled()) rememberPushPreference(true);
        if (!serverRevoked) await subscription.unsubscribe();
      })(),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 2000); }),
    ]);
  } catch { /* Logout must not be held open by browser push cleanup. */ }
  finally { clearTimeout(timeout); }
}
