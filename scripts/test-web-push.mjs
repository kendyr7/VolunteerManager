import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createECDH } from 'node:crypto';
import vm from 'node:vm';
import { createJiti } from 'jiti';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';

// Entire suite runs locally with synthetic identities. No .env, network or production writes.
const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const { isPushRecipient, isAllowedPushEndpoint, parsePushSubscription, retryDelaySeconds } = await jiti.import('../lib/push/policy.ts');
const { CONFIGURABLE_PERMISSION_DEFAULTS: defaults } = await jiti.import('../lib/role-permissions.ts');
let checks = 0;
function ok(condition, message) { assert.ok(condition, message); checks++; }

const committee = { id: 'coordinator', role: 'Editor', coordinator_type: 'committee', committee_id: 'A', status: 'active' };
const technology = { ...committee, coordinator_type: 'technology' };
ok(isPushRecipient(committee, defaults, 'request', 'A'), 'Own committee request');
ok(!isPushRecipient(committee, defaults, 'request', 'B'), 'No cross-committee request');
ok(!isPushRecipient(committee, defaults, 'request', null), 'Unassigned request fails closed');
ok(!isPushRecipient(committee, { ...defaults, 'role.committee.view_requests': false }, 'request', 'A'), 'Revoked requests capability');
ok(isPushRecipient(technology, defaults, 'request', 'B'), 'Global technology scope');
ok(!isPushRecipient(technology, { ...defaults, 'role.technology.view_volunteers': false }, 'request', 'B'), 'Technology respects actual request list scope');
ok(!isPushRecipient(committee, defaults, 'coverage', 'B'), 'No cross-committee coverage');
ok(isPushRecipient({ ...committee, role: 'Admin' }, defaults, 'coverage', 'B'), 'Admin global coverage');
ok(!isPushRecipient({ ...committee, role: 'Lector' }, defaults, 'request', 'A'), 'No volunteer push');
ok(!isPushRecipient({ ...committee, status: 'archived' }, defaults, 'request', 'A'), 'No archived recipients');

for (const endpoint of ['https://fcm.googleapis.com/fcm/send/test', 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://web.push.apple.com/test']) ok(isAllowedPushEndpoint(endpoint), `Supported push provider ${new URL(endpoint).hostname}`);
for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.test/x', 'https://evilpush.apple.com/x', 'https://fcm.googleapis.com:444/x', 'https://user:pass@fcm.googleapis.com/x', 'file:///etc/passwd']) ok(!isAllowedPushEndpoint(endpoint), 'Reject arbitrary/unsafe endpoint');
const key = createECDH('prime256v1'); key.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
ok(parsePushSubscription(subscription).endpoint === subscription.endpoint, 'Valid encryption keys');
assert.throws(() => parsePushSubscription({ ...subscription, keys: { p256dh: 'bad', auth: 'bad' } })); checks++;
ok(retryDelaySeconds(1) === 60 && retryDelaySeconds(3) === 240 && retryDelaySeconds(9) === 3600, 'Bounded backoff');

const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE profiles(id uuid PRIMARY KEY);
    CREATE TABLE volunteers(id uuid PRIMARY KEY, committee_id uuid);
    CREATE TABLE shift_change_requests(id uuid PRIMARY KEY, status text);
    CREATE TABLE shifts(id uuid PRIMARY KEY, volunteer_id uuid REFERENCES volunteers(id), day_key text, shift_key text, checked_in boolean DEFAULT false);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261025000000_web_push.sql', import.meta.url), 'utf8'));
  const user = randomUUID(), volunteer = randomUUID(), committeeId = randomUUID(), device = randomUUID(), subId = randomUUID();
  await db.query('INSERT INTO profiles VALUES ($1)', [user]);
  await db.query('INSERT INTO volunteers VALUES ($1,$2)', [volunteer, committeeId]);
  await db.query("INSERT INTO shift_change_requests VALUES ($1,'pending')", [randomUUID()]);
  ok((await db.query('SELECT count(*)::int AS n FROM push_events')).rows[0].n === 0, 'No outbox without subscribers');
  await db.query(`INSERT INTO push_subscriptions(id,device_id,profile_id,endpoint,p256dh,auth,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,now()+interval '1 day')`, [subId, device, user, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
  const requestId = randomUUID();
  await db.query("INSERT INTO shift_change_requests VALUES ($1,'pending')", [requestId]);
  ok((await db.query('SELECT count(*)::int AS n FROM push_events WHERE request_id=$1', [requestId])).rows[0].n === 1, 'Request outbox transactional insert');
  await db.exec('BEGIN');
  await db.query("INSERT INTO shift_change_requests VALUES ($1,'pending')", [randomUUID()]);
  await db.exec('ROLLBACK');
  ok((await db.query('SELECT count(*)::int AS n FROM push_events')).rows[0].n === 1, 'Rollback also rolls back notification');
  const shift = randomUUID();
  await db.query("INSERT INTO shifts(id,volunteer_id,day_key,shift_key) VALUES ($1,$2,'jue 10','T1')", [shift, volunteer]);
  await db.query('UPDATE shifts SET checked_in=true WHERE id=$1', [shift]);
  ok((await db.query('SELECT count(*)::int AS n FROM push_events')).rows[0].n === 1, 'No push for routine attendance');
  await db.query('DELETE FROM shifts WHERE id=$1', [shift]);
  const coverage = (await db.query("SELECT * FROM push_events WHERE kind='coverage'")).rows[0];
  ok(coverage.committee_id === committeeId && coverage.day_key === 'jue 10', 'Removal captures previous slot and committee');
  await db.exec('BEGIN');
  await db.query("INSERT INTO shifts(id,volunteer_id,day_key,shift_key) VALUES ($1,$2,'vie 11','T1'),($3,$2,'vie 11','T1')", [randomUUID(), volunteer, randomUUID()]);
  await db.query("DELETE FROM shifts WHERE day_key='vie 11'");
  await db.exec('COMMIT');
  ok((await db.query("SELECT count(*)::int AS n FROM push_events WHERE day_key='vie 11'")).rows[0].n === 1, 'Bulk transaction deduplicates a slot');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT endpoint FROM public.push_subscriptions'), /permission denied/); checks++;
    await assert.rejects(db.query('SELECT public.claim_push_worker($1)', [randomUUID()]), /permission denied/); checks++;
    await db.exec('RESET ROLE');
  }
  const lease1 = randomUUID(), lease2 = randomUUID();
  ok((await db.query('SELECT claim_push_worker($1) AS acquired', [lease1])).rows[0].acquired, 'Worker acquires lease');
  ok(!(await db.query('SELECT claim_push_worker($1) AS acquired', [lease2])).rows[0].acquired, 'Concurrent worker rejected');
  await db.exec("UPDATE push_worker_lease SET expires_at=now()-interval '1 second'");
  ok((await db.query('SELECT claim_push_worker($1) AS acquired', [lease2])).rows[0].acquired, 'Crash lease can be recovered');
  for (let i = 0; i < 2; i++) await db.query(`INSERT INTO push_deliveries(event_id,subscription_id,dedupe_key,payload,expires_at)
    VALUES ($1,$2,'same-slot','{}',now()+interval '1 day') ON CONFLICT(subscription_id,dedupe_key) DO NOTHING`, [coverage.id, subId]);
  ok((await db.query('SELECT count(*)::int AS n FROM push_deliveries')).rows[0].n === 1, 'Per-device delivery idempotency');
  await db.query('DELETE FROM push_subscriptions WHERE id=$1', [subId]);
  ok((await db.query('SELECT count(*)::int AS n FROM push_deliveries')).rows[0].n === 0, 'Unsubscribe removes queued deliveries');

  // The follow-up migration upgrades an already-installed push schema in place.
  await db.exec('ALTER TABLE shift_change_requests ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()');
  await db.exec(await readFile(new URL('../supabase/migrations/20261026000000_notification_inbox.sql', import.meta.url), 'utf8'));
  const internalRequest = randomUUID();
  await db.query("INSERT INTO shift_change_requests(id,status) VALUES ($1,'pending')", [internalRequest]);
  ok((await db.query('SELECT count(*)::int AS n FROM push_events WHERE request_id=$1 AND inbox_processed_at IS NULL', [internalRequest])).rows[0].n === 1, 'Internal event exists without any push subscriber');
  const internalShift = randomUUID();
  await db.query("INSERT INTO shifts(id,volunteer_id,day_key,shift_key) VALUES ($1,$2,'sab 12','T1')", [internalShift, volunteer]);
  await db.query('DELETE FROM shifts WHERE id=$1', [internalShift]);
  ok((await db.query("SELECT count(*)::int AS n FROM push_events WHERE kind='coverage' AND day_key='sab 12'")).rows[0].n === 1, 'Coverage outbox independent of push consent');
  const notificationId = randomUUID();
  await db.query(`INSERT INTO notification_inbox(id,profile_id,kind,committee_id,dedupe_key,title,body,url)
    VALUES ($1,$2,'request',$3,'request:test','Solicitud','Detalles','/replacements')`, [notificationId, user, committeeId]);
  await db.query('UPDATE notification_inbox SET read_at=now() WHERE id=$1 AND profile_id=$2', [notificationId, user]);
  await db.query(`INSERT INTO notification_inbox(profile_id,kind,committee_id,dedupe_key,title,body,url)
    VALUES ($1,'request',$2,'request:test','Solicitud','Detalles','/replacements') ON CONFLICT(profile_id,dedupe_key) DO NOTHING`, [user, committeeId]);
  ok((await db.query('SELECT count(*)::int AS n FROM notification_inbox WHERE read_at IS NOT NULL')).rows[0].n === 1, 'Retry preserves read receipt and one item per account');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT * FROM notification_inbox'), /permission denied/); checks++;
    await assert.rejects(db.query('UPDATE notification_inbox SET read_at=now()'), /permission denied/); checks++;
    await db.exec('RESET ROLE');
  }
} finally { await db.close(); }

// Service-worker tests exercise notification rendering and safe navigation without browser permission.
const handlers = new Map(); const shown = []; const opened = [];
const context = vm.createContext({ URL, self: {
  location: { origin: 'https://example.test' },
  addEventListener: (type, handler) => handlers.set(type, handler),
  registration: { showNotification: async (title, options) => shown.push({ title, options }) },
  clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
} });
vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
let pending;
handlers.get('push')({ data: { json: () => ({ title: 'Solicitud', body: 'Revisar', tag: 'one', url: 'https://evil.test' }) }, waitUntil: task => { pending = task; } });
await pending;
ok(shown[0].options.data.url === 'https://example.test/dashboard', 'Push cannot inject external URL');
ok(shown[0].options.icon === '/app-icon-192.png', 'Expanded notification keeps the full-color app icon');
ok(shown[0].options.badge === '/notification-badge-96.png', 'Status bar uses a dedicated monochrome badge');
const badge = sharp(await readFile(new URL('../public/notification-badge-96.png', import.meta.url)));
const badgeMetadata = await badge.metadata();
ok(badgeMetadata.width === 96 && badgeMetadata.height === 96 && badgeMetadata.hasAlpha, 'Badge is 96px PNG with alpha');
const { data: badgePixels, info: badgeInfo } = await badge.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let visiblePixels = 0;
let allVisiblePixelsWhite = true;
let transparentEdge = true;
for (let y = 0; y < badgeInfo.height; y++) {
  for (let x = 0; x < badgeInfo.width; x++) {
    const offset = (y * badgeInfo.width + x) * 4;
    if (badgePixels[offset + 3] > 0) {
      visiblePixels++;
      if (badgePixels[offset] !== 255 || badgePixels[offset + 1] !== 255 || badgePixels[offset + 2] !== 255) allVisiblePixelsWhite = false;
      if (x === 0 || y === 0 || x === badgeInfo.width - 1 || y === badgeInfo.height - 1) transparentEdge = false;
    }
  }
}
ok(visiblePixels > 0 && visiblePixels < badgeInfo.width * badgeInfo.height / 2, 'Badge is a visible silhouette, not an opaque square');
ok(allVisiblePixelsWhite && transparentEdge, 'Badge preserves white mark and transparent padding');
handlers.get('push')({ data: { json: () => { throw new Error('invalid'); } }, waitUntil: task => { pending = task; } });
await pending;
ok(shown[1].title === 'Volunteer Manager', 'Malformed payload remains user-visible');
handlers.get('notificationclick')({ notification: { close() {}, data: { url: '/replacements?tab=pending' } }, waitUntil: task => { pending = task; } });
await pending;
ok(opened[0] === 'https://example.test/replacements?tab=pending', 'Click opens intended authenticated route');
console.log(`Web Push: ${checks} checks passed (policies, SSRF, PostgreSQL outbox, lease, deduplication, service worker).`);
