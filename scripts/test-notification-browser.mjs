import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pushSource = await compile('../lib/push/browser.ts');
const syncSource = await compile('../lib/notifications/browser-sync.ts');
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
function browser(localStorage = storage(), sessionStorage = storage()) {
  const exports = {}; const calls = [];
  let current;
  const subscription = {
    options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test' }),
    unsubscribe: async () => { calls.push('unsubscribe'); current = null; return true; },
  };
  current = subscription;
  const registration = { pushManager: {
    getSubscription: async () => current,
    subscribe: async () => { calls.push('subscribe'); current = subscription; return current; },
  } };
  const Notification = { permission: 'granted', requestPermission: () => { throw Error('No automatic permission prompts'); } };
  const context = { exports, localStorage, sessionStorage, Notification,
    window: { isSecureContext: true, PushManager: {}, Notification },
    navigator: { serviceWorker: { getRegistration: async () => registration, register: async () => registration, ready: Promise.resolve(registration) } },
    fetch: async () => { calls.push('POST'); return { ok: true }; },
    atob, Uint8Array, setTimeout, clearTimeout,
  };
  vm.runInNewContext(pushSource, context);
  return { api: exports, calls, Notification, localStorage, clearSubscription: () => { current = null; } };
}
const state = { configured: true, active: false, publicKey: 'AQID' };
let b = browser();
b.api.dismissPushInvite();
ok(b.api.isPushInviteDismissed(), 'Dismissal applies immediately');
b = browser(b.localStorage);
ok(b.api.isPushInviteDismissed(), 'New browser session preserves invite dismissal');
const legacy = storage(); legacy.setItem('push-invite-dismissed', '1');
b = browser(storage(), legacy);
ok(b.api.isPushInviteDismissed() && browser(b.localStorage).api.isPushInviteDismissed(), 'Session-only dismissal migrates to persistent storage');
b = browser();
b.api.setBrowserPushPreference(false);
ok(!(await b.api.restoreBrowserPushSubscription(state)) && !b.calls.length, 'Explicit opt-out defeats a leftover native subscription');
await b.api.preserveBrowserPushOnLogout(true);
ok(!(await browser(b.localStorage).api.restoreBrowserPushSubscription(state)), 'Logout cannot erase explicit opt-out');
b.api.setBrowserPushPreference(true);
ok(await b.api.restoreBrowserPushSubscription(state), 'Manual activation can override opt-out');
b = browser();
await b.api.preserveBrowserPushOnLogout(true);
ok(!b.calls.includes('unsubscribe') && await b.api.restoreBrowserPushSubscription(state), 'Normal logout preserves authorization and restores on login');
b = browser();
await b.api.preserveBrowserPushOnLogout(false);
ok(b.calls.includes('unsubscribe') && await b.api.restoreBrowserPushSubscription(state) && b.calls.includes('subscribe'), 'Failed server revocation uses local cleanup but remembers opt-in');
b = browser(); b.clearSubscription();
ok(!(await b.api.restoreBrowserPushSubscription(state)) && !b.calls.length, 'New browser never auto-subscribes');
b = browser(); b.Notification.permission = 'denied';
ok(!(await b.api.restoreBrowserPushSubscription(state)) && !b.calls.length, 'Blocked permission never auto-subscribes');
const restricted = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
b = browser(restricted, restricted); b.api.dismissPushInvite();
ok(b.api.isPushInviteDismissed(), 'Restricted storage still remembers dismissal for the current page');

const events = () => {
  const handlers = new Map();
  return { addEventListener: (type, handler) => handlers.set(type, handler), removeEventListener: type => handlers.delete(type),
    fire: (type, payload) => handlers.get(type)?.(payload), handlers };
};
const win = events(), doc = { ...events(), visibilityState: 'visible' }, sw = events();
const timers = new Map(), intervals = new Map(); let timerId = 0;
const sync = {};
vm.runInNewContext(syncSource, { exports: sync, window: win, document: doc, navigator: { serviceWorker: sw }, localStorage: storage(), Date, Math,
  setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  setInterval: (fn, ms) => { intervals.set(++timerId, { fn, ms }); return timerId; }, clearInterval: id => intervals.delete(id) });
let refreshed = 0;
let stop = sync.watchNotificationChanges(() => refreshed++, true);
ok([...intervals.values()][0].ms === 5000, 'Visible panel reconciles account state every five seconds');
for (const fn of timers.values()) fn();
win.fire('focus'); win.fire('online'); sw.fire('message', { data: { type: 'notifications-updated' } });
win.fire('storage', { key: 'vm_notification_change_v1' });
ok(refreshed === 5, 'Initial load, foreground, reconnect, push click and other-tab reads refresh');
doc.visibilityState = 'hidden';
for (const { fn } of intervals.values()) fn();
ok(refreshed === 5, 'Hidden devices do not poll');
doc.visibilityState = 'visible'; doc.fire('visibilitychange');
ok(refreshed === 6, 'Returning device fetches shared read state immediately');
stop();
ok(!timers.size && !intervals.size && !win.handlers.size && !doc.handlers.size && !sw.handlers.size, 'Unmount removes timers and listeners');
stop = sync.watchNotificationChanges(() => refreshed++, false);
ok([...intervals.values()][0].ms === 30000, 'Closed panel polls less often');
stop();
console.log(`Notification browser: ${checks} checks passed (persistent opt-out, restoration, cross-device refresh signals).`);
