import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createJiti } from 'jiti';

// Execute the actual worker with an in-memory Supabase adapter and fake transport.
// No environment files, real credentials, HTTP requests or database connections.
const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const policy = await jiti.import('../lib/push/policy.ts');
const roles = await jiti.import('../lib/role-permissions.ts');
const dates = await jiti.import('../lib/dates.ts');
const source = ts.transpileModule(await readFile(new URL('../lib/push/service.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const inboxSource = ts.transpileModule(await readFile(new URL('../lib/notifications/worker.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const vapid = crypto.createECDH('prime256v1'); vapid.generateKeys();
const deviceKey = crypto.createECDH('prime256v1'); deviceKey.generateKeys();
const config = { publicKey: vapid.getPublicKey().toString('base64url'), privateKey: vapid.getPrivateKey().toString('base64url'), subject: 'mailto:test@example.test' };
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }

function fixture(options = {}) {
  const now = options.now || Date.now();
  const Clock = options.now ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  } : Date;
  const tables = {
    profiles: [{ id: 'coordinator', role: 'Editor', coordinator_type: 'committee', committee_id: 'A', status: 'active' }],
    volunteers: [{ id: 'volunteer', committee_id: 'A', status: 'active' }],
    shift_change_requests: [{ id: 'request', volunteer_id: 'volunteer', status: 'pending' }],
    system_settings: [], committees: [{ id: 'A', status: 'active' }],
    committee_shift_requirements: [{ committee_id: 'A', shift_key: 'T1', required: 3 }], shifts: [],
    push_events: [{ id: 'event', kind: 'request', request_id: 'request', event_key: 'request:request', created_at: new Date(now - 1000).toISOString(), processed_at: null, inbox_processed_at: null }],
    push_subscriptions: [{ id: 'sub', profile_id: 'coordinator', endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      p256dh: deviceKey.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url'),
      requests_enabled: true, coverage_enabled: true, expires_at: new Date(now + 86400000).toISOString(), created_at: new Date(now - 5000).toISOString() }],
    push_deliveries: [], push_worker_lease: [], notification_inbox: [],
  };
  const sends = [];
  const db = {
    rpc: async () => ({ data: !options.busy, error: null }),
    from(table) {
      const filters = []; let operation = 'select'; let values; let conflict; let single = false; let maximum = Infinity; let skip = 0; let order; let head = false;
      const query = {
        select(_columns, settings) { head = settings?.head || false; return query; },
        eq(key, value) { filters.push(row => key.split('.').reduce((item, part) => item?.[part], row) === value); return query; },
        neq(key, value) { filters.push(row => key.split('.').reduce((item, part) => item?.[part], row) !== value); return query; },
        gt(key, value) { filters.push(row => row[key] > value); return query; },
        lt(key, value) { filters.push(row => row[key] < value); return query; },
        lte(key, value) { filters.push(row => row[key] <= value); return query; },
        is(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, value) { filters.push(row => value.includes(row[key])); return query; },
        order(key) { order = key; return query; },
        limit(value) { maximum = value; return query; },
        range(from, to) { skip = from; maximum = to - from + 1; return query; },
        maybeSingle() { single = true; return query; },
        update(value) { operation = 'update'; values = value; return query; },
        delete() { operation = 'delete'; return query; },
        upsert(value, settings) { operation = 'upsert'; values = Array.isArray(value) ? value : [value]; conflict = settings.onConflict.split(','); return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            options.onQuery?.({ table, operation, tables });
            if (options.failPermissions && table === 'system_settings') return { data: null, error: { message: 'unavailable' } };
            let rows = tables[table].filter(row => filters.every(filter => filter(row)));
            if (order) rows.sort((a, b) => String(a[order]).localeCompare(String(b[order])));
            rows = rows.slice(skip, skip + maximum);
            if (operation === 'upsert') {
              for (const value of values) if (!tables[table].some(row => conflict.every(key => row[key] === value[key]))) {
                tables[table].push({ id: crypto.randomUUID(), status: 'pending', attempts: 0, next_attempt_at: new Clock().toISOString(), created_at: new Clock().toISOString(), processed_at: null, inbox_processed_at: null, read_at: null, ...value });
              }
            } else if (operation === 'update') rows.forEach(row => Object.assign(row, values));
            else if (operation === 'delete') {
              tables[table] = tables[table].filter(row => !rows.includes(row));
              if (table === 'push_subscriptions') tables.push_deliveries = tables.push_deliveries.filter(job => !rows.some(sub => sub.id === job.subscription_id));
            }
            return { data: head ? null : single ? structuredClone(rows[0] || null) : structuredClone(rows), error: null, count: rows.length };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const modules = {
    'server-only': {}, 'node:crypto': crypto, 'next/server': { after: () => {} },
    '@/lib/supabase/admin': { getAdminSupabase: async () => db },
    './config': { getPushConfig: () => options.disabled ? null : config },
    './policy': policy, '@/lib/role-permissions': roles, '@/lib/dates': dates,
    'web-push': { sendNotification: async (subscription, body, settings) => {
      sends.push({ subscription, body: JSON.parse(body), settings });
      if (options.sendStatus) throw { statusCode: options.sendStatus };
    } },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  }, Date: Clock, Intl, console }, { filename: 'web-push-worker-test.js' });
  const inboxExports = {};
  vm.runInNewContext(inboxSource, { exports: inboxExports, require: name => {
    if (name === '@/lib/push/service') return exports;
    if (name === '@/lib/push/policy') return policy;
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  }, Date: Clock, console });
  return { tables, sends, run: exports.dispatchPushQueue, inbox: inboxExports.dispatchNotificationInbox };
}

let f = fixture();
await f.run();
ok(f.sends.length === 1 && f.tables.push_deliveries[0].status === 'sent', 'Pending request delivered');
ok(f.sends[0].settings.TTL <= 3600 && f.sends[0].settings.topic.length === 32, 'Transport TTL and stable topic');
ok(!f.sends[0].body.body.includes('volunteer'), 'No volunteer identifiers in visible text');
await f.run();
ok(f.sends.length === 1, 'Repeating dispatch does not resend completed delivery');

for (const code of [429, 500]) {
  f = fixture({ sendStatus: code }); await f.run();
  ok(f.tables.push_deliveries[0].status === 'pending' && f.tables.push_deliveries[0].attempts === 1, `Retry transient ${code}`);
  await f.run(); ok(f.sends.length === 1, 'Retry does not run before backoff');
  for (let attempt = 2; attempt <= 5; attempt++) {
    f.tables.push_deliveries[0].next_attempt_at = new Date(0).toISOString(); await f.run();
  }
  ok(f.sends.length === 5 && f.tables.push_deliveries[0].status === 'failed', 'Retry stops after five attempts');
}
for (const code of [404, 410]) {
  f = fixture({ sendStatus: code }); await f.run();
  ok(!f.tables.push_subscriptions.length && !f.tables.push_deliveries.length, `${code} removes subscription and pending work`);
}
f = fixture({ sendStatus: 400 }); await f.run();
ok(f.tables.push_deliveries[0].status === 'failed', 'Permanent error does not retry');

for (const change of [
  tables => { tables.profiles[0].committee_id = 'B'; },
  tables => { tables.profiles[0].role = 'Lector'; },
  tables => { tables.profiles[0].status = 'archived'; },
  tables => { tables.push_subscriptions[0].requests_enabled = false; },
  tables => { tables.push_subscriptions[0].created_at = new Date(Date.now() + 1000).toISOString(); },
  tables => { tables.shift_change_requests[0].status = 'approved'; },
]) {
  f = fixture({ onQuery: ({ table, operation, tables }) => {
    if (table === 'push_deliveries' && operation === 'select') change(tables);
  } });
  await f.run();
  ok(f.sends.length === 0 && f.tables.push_deliveries[0].status === 'skipped', 'Delivery revalidates current recipient, consent and request');
}
f = fixture({ busy: true }); ok((await f.run()).busy && !f.sends.length, 'Concurrent worker exits without sends');
f = fixture({ disabled: true }); ok(!(await f.run()).enabled && !f.sends.length, 'Disabled configuration is inert');
f = fixture({ failPermissions: true }); await assert.rejects(f.run(), /unavailable/); checks++;
ok(f.sends.length === 0, 'Unavailable permission settings fail closed');

// Use the real operational calendar, independent of the day the suite is run.
const day = dates.getOperationalEventDays()[0];
const dayKey = dates.formatDateShort(day);
const shiftKey = dates.getAvailableShiftKeys(day)[0];
const hour = dates.getOfficialShiftTime(day, shiftKey).startHour;
const start = Date.parse(`${dates.parseDayKeyToDateStr(day)}T${String(hour).padStart(2, '0')}:00:00-06:00`);
function coverageFixture(beforeMs) {
  const test = fixture({ now: start - beforeMs });
  Object.assign(test.tables.push_events[0], { kind: 'coverage', committee_id: 'A', day_key: dayKey, shift_key: shiftKey });
  test.tables.committee_shift_requirements[0].shift_key = shiftKey;
  return test;
}
f = coverageFixture(30 * 60000); await f.run();
ok(f.sends.length === 1 && f.sends[0].body.url === '/dashboard', 'Imminent understaffed shift sends coverage alert');
ok(f.sends[0].settings.TTL === 1800 && f.sends[0].settings.urgency === 'high', 'Coverage TTL ends at shift start');
f.tables.push_events.push({ ...f.tables.push_events[0], id: 'second-coverage', event_key: 'second-coverage', processed_at: null });
await f.run(); ok(f.sends.length === 1, 'Separate coverage events share daily deduplication');
f = coverageFixture(49 * 3600000); await f.run(); ok(!f.sends.length, 'No coverage alert outside 48-hour window');
f = coverageFixture(-60000); await f.run(); ok(!f.sends.length, 'No stale coverage after shift starts');
f = coverageFixture(3600000);
f.tables.shifts = Array.from({ length: 3 }, (_, index) => ({ id: index, day_key: dayKey, shift_key: shiftKey, volunteers: { committee_id: 'A', status: 'active' } }));
await f.run(); ok(!f.sends.length, 'Recovered coverage suppresses pending alert');

const configExports = {};
const testEnvironment = { PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: config.publicKey, VAPID_PRIVATE_KEY: config.privateKey, VAPID_SUBJECT: config.subject };
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../lib/push/config.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: configExports, require: name => name === 'node:crypto' ? crypto : {}, process: { env: testEnvironment }, Buffer, URL });
ok(Boolean(configExports.getPushConfig()), 'Valid VAPID pair accepted');
testEnvironment.VAPID_PUBLIC_KEY = deviceKey.getPublicKey().toString('base64url');
ok(configExports.getPushConfig() === null, 'Mismatched VAPID pair rejected before permission prompt');

f = fixture({ disabled: true }); f.tables.push_subscriptions = [];
await f.inbox();
ok(f.tables.notification_inbox.length === 1 && !f.sends.length, 'Internal inbox works without VAPID configuration or subscriptions');
ok(f.tables.push_events[0].processed_at === null && Boolean(f.tables.push_events[0].inbox_processed_at), 'Internal processing leaves external push cursor untouched');
f.tables.notification_inbox[0].read_at = new Date().toISOString();
f.tables.push_events[0].inbox_processed_at = null;
await f.inbox();
ok(f.tables.notification_inbox.length === 1 && Boolean(f.tables.notification_inbox[0].read_at), 'Processing replay does not reset account-level read receipt');
f = fixture(); f.tables.profiles.push({ ...f.tables.profiles[0], id: 'other', committee_id: 'B' });
await f.inbox();
ok(f.tables.notification_inbox.length === 1 && f.tables.notification_inbox[0].profile_id === 'coordinator', 'Internal fan-out respects committee scope');
await f.run(); ok(f.sends.length === 1, 'External push still sends after internal inbox materialization');
f = fixture(); f.tables.profiles[0].status = 'inactive'; await f.inbox();
ok(!f.tables.notification_inbox.length, 'Inactive profile excluded from inbox generation');
f = fixture({ busy: true }); ok((await f.inbox()).busy && !f.tables.notification_inbox.length, 'Inbox shares exclusion lock');
f = fixture({ failPermissions: true }); await assert.rejects(f.inbox(), /unavailable/); checks++;

const inboxPolicy = await jiti.import('../lib/notifications/policy.ts');
const ownCommittee = crypto.randomUUID();
const scopedProfile = { id: crypto.randomUUID(), role: 'Editor', coordinator_type: 'committee', committee_id: ownCommittee, status: 'active' };
const ownScopes = inboxPolicy.notificationScopes(scopedProfile, roles.CONFIGURABLE_PERMISSION_DEFAULTS);
ok(ownScopes.length === 2 && ownScopes.every(scope => scope.includes(`committee_id.eq.${ownCommittee}`)), 'Inbox query scopes both categories to own committee');
ok(inboxPolicy.notificationScopes({ ...scopedProfile, role: 'Admin' }, roles.CONFIGURABLE_PERMISSION_DEFAULTS).join(',') === 'kind.eq.request,kind.eq.coverage', 'Admin gets both global notification scopes');
ok(inboxPolicy.notificationScopes({ ...scopedProfile, role: 'Lector' }, roles.CONFIGURABLE_PERMISSION_DEFAULTS).length === 0, 'Reader cannot query internal notifications');
ok(inboxPolicy.notificationScopes(scopedProfile, { ...roles.CONFIGURABLE_PERMISSION_DEFAULTS, 'role.committee.view_requests': false }).length === 1, 'Revoked request permission removes request query scope');
ok(inboxPolicy.safeNotificationLink('https://evil.test/') === '/dashboard', 'Internal notification link cannot leave app');
assert.throws(() => inboxPolicy.parseNotificationCursor(Buffer.from(JSON.stringify({ date: '2026-09-09T12:00:00Z),profile_id.neq.x', id: crypto.randomUUID() })).toString('base64url'))); checks++;
const cursor = inboxPolicy.parseNotificationCursor(Buffer.from(JSON.stringify({ date: '2026-09-09T12:00:00.000000+00:00', id: crypto.randomUUID() })).toString('base64url'));
ok(inboxPolicy.notificationFilter(ownScopes, cursor).includes('id.lt.'), 'Pagination breaks timestamp ties with ID');
console.log(`Web Push worker: ${checks} checks passed (delivery, retries, revocation, concurrency, failure states).`);
