import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createJiti } from 'jiti';

// Offline contract tests exercise the real route with a recording DB adapter.
const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const policy = await jiti.import('../lib/notifications/policy.ts');
const presentation = await jiti.import('../lib/notifications/presentation.ts');
const source = ts.transpileModule(await readFile(new URL('../app/api/notifications/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const owner = randomUUID(), other = randomUUID();
const items = Array.from({ length: 31 }, (_, index) => ({ id: randomUUID(), kind: 'request', title: 'Solicitud', body: 'Detalles',
  url: index ? '/replacements' : 'https://evil.test', created_at: new Date(Date.now() - index * 1000).toISOString(), read_at: null }));
let queries = [], denied = false, scopes = ['kind.eq.request'];
const modules = {
  '@/lib/notifications/policy': policy,
  '@/lib/notifications/presentation': presentation,
  '@/lib/notifications/access': {
    notificationAccess: async () => {
      if (denied) throw new Error('FORBIDDEN');
      return { profileId: owner, scopes, db: {
        from(table) {
          const operations = [['from', table]]; queries.push(operations); let head = false;
          const chain = {};
          for (const method of ['select', 'eq', 'gte', 'lte', 'or', 'order', 'limit', 'is', 'not', 'update', 'in']) {
            chain[method] = (...args) => { operations.push([method, ...args]); if (method === 'select') head = args[1]?.head || false; return chain; };
          }
          chain.then = (resolve, reject) => Promise.resolve({ data: head ? null : items, count: operations.some(op => op[0] === 'is' && op[1] === 'read_at') ? 31 : 7, error: null }).then(resolve, reject);
          return chain;
        },
      } };
    },
    notificationError: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
  },
  '@/lib/push/http': { requireSameOrigin: request => { if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('FORBIDDEN'); } },
};
const exports = {};
vm.runInNewContext(source, { exports, require: name => {
  if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
  return modules[name];
}, URL, Response, Buffer, Date });
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
const request = (method, body, origin = 'https://app.test') => new Request('https://app.test/api/notifications', {
  method, headers: { origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
let result = await exports.GET(request('GET'));
let body = await result.json();
ok(result.status === 200 && body.items.length === 30 && body.nextCursor, 'Bounded page and cursor');
ok(body.items[0].url === '/dashboard', 'Sanitized links');
ok(result.headers.get('Cache-Control') === 'no-store', 'Private response not cached');
ok(queries.length === 3 && queries.every(query => query.some(op => op[0] === 'eq' && op[1] === 'profile_id' && op[2] === owner)), 'List and both counts owned by authenticated profile');
ok(queries.every(query => query.some(op => op[0] === 'or' && op[1] === 'kind.eq.request')), 'List and count enforce scopes');
ok(body.todayCount === 7 && body.unreadCount === 31, 'Today count is independent of unread count and the visible page');
ok(queries[2].some(op => op[0] === 'gte' && op[1] === 'created_at' && op[2] === presentation.notificationDayStart(body.asOf))
  && queries[2].some(op => op[0] === 'lte' && op[1] === 'created_at' && op[2] === body.asOf)
  && queries[2].some(op => op[0] === 'lte' && op[1] === 'inserted_at' && op[2] === body.asOf), 'Today range uses local midnight and the same visibility snapshot');
for (const filter of ['unread', 'read']) {
  queries = [];
  result = await exports.GET(new Request(`https://app.test/api/notifications?filter=${filter}&cursor=${body.nextCursor}`));
  const expected = filter === 'read' ? ['not', 'read_at', 'is', null] : ['is', 'read_at', null];
  ok(result.status === 200 && queries[0].some(op => JSON.stringify(op) === JSON.stringify(expected)), `${filter} filters apply in the database, including paginated history`);
  ok(queries[0].some(op => op[0] === 'eq' && op[1] === 'profile_id' && op[2] === owner)
    && queries[0].some(op => op[0] === 'or' && op[1].includes('kind.eq.request') && op[1].includes('created_at.lt.')), `${filter} preserves account, scope and cursor restrictions`);
  ok(queries[1].some(op => op[0] === 'is' && op[1] === 'read_at' && op[2] === null)
    && !queries[1].some(op => op[0] === 'not'), `${filter} keeps the global unread badge independent of the selected filter`);
  ok(!queries[2].some(op => ['is', 'not', 'limit'].includes(op[0])) && queries[2].some(op => op[0] === 'or' && op[1] === 'kind.eq.request'), `${filter} never narrows today's count to read state or pagination`);
}
queries = [];
result = await exports.PATCH(request('PATCH', { ids: [items[0].id], profileId: other }));
ok(result.status === 200 && queries[0].some(op => op[0] === 'eq' && op[1] === 'profile_id' && op[2] === owner), 'Mutation ignores supplied profile ID');
ok(queries[0].some(op => op[0] === 'is' && op[1] === 'read_at' && op[2] === null), 'Reading is idempotent');
queries = [];
const pushTag = `request:${randomUUID()}`;
result = await exports.PATCH(request('PATCH', { tag: pushTag, recipientId: owner }));
ok(result.status === 200 && queries[0].some(op => op[0] === 'eq' && op[1] === 'dedupe_key' && op[2] === pushTag), 'Native click marks the item by its push tag');
ok(queries[0].some(op => op[0] === 'eq' && op[1] === 'profile_id' && op[2] === owner) && queries[0].some(op => op[0] === 'or'), 'Native read keeps account and permission restrictions');
for (const invalid of [{ tag: pushTag, recipientId: other }, { tag: pushTag }, { tag: 'test', recipientId: owner },
  { tag: pushTag, recipientId: owner, all: true }, { tag: pushTag, recipientId: owner, ids: [items[0].id] }]) {
  queries = []; result = await exports.PATCH(request('PATCH', invalid));
  ok(result.status === 400 && !queries.length, 'Native read rejects wrong account, invalid tag and ambiguous targets');
}
queries = [];
const before = new Date(Date.now() - 5000).toISOString();
result = await exports.PATCH(request('PATCH', { all: true, before }));
ok(result.status === 200 && queries[0].some(op => op[0] === 'lte' && op[1] === 'inserted_at' && op[2] === before), 'Mark-all excludes late-arriving unseen events too');
for (const invalid of [{ all: true }, { all: true, before: '2999-01-01T00:00:00Z' }, { ids: ['not-uuid'] }, { ids: [] }, { ids: Array(31).fill(randomUUID()) }, null]) {
  queries = []; result = await exports.PATCH(request('PATCH', invalid));
  ok(result.status === 400 && !queries.length, 'Invalid mutation cannot touch inbox');
}
queries = []; result = await exports.PATCH(request('PATCH', { ids: [items[0].id] }, 'https://evil.test'));
ok(result.status === 403 && !queries.length, 'Cross-origin mutation forbidden');
denied = true; result = await exports.GET(request('GET')); ok(result.status === 403, 'Ineligible caller denied'); denied = false;
queries = []; scopes = [];
body = await (await exports.GET(request('GET'))).json();
ok(!body.items.length && body.unreadCount === 0 && body.todayCount === 0 && !queries.length, 'No capabilities reveals no history or counts');
ok(presentation.notificationDayStart('2027-01-01T05:59:59Z') === '2026-12-31T06:00:00.000Z', 'Today remains yesterday locally before UTC-6 midnight');
ok(presentation.notificationDayStart('2027-01-01T06:00:00Z') === '2027-01-01T06:00:00.000Z', 'Today changes exactly at local midnight');
ok(presentation.notificationDayStart('2028-03-01T05:59:00Z') === '2028-02-29T06:00:00.000Z', 'Leap-day boundary');
const grouped = presentation.groupNotifications([
  ...['2027-01-01T06:01:00Z', '2027-01-01T06:00:30Z', '2027-01-01T05:59:00Z', '2026-12-30T18:00:00Z'].map(created_at => ({ ...items[0], created_at })),
], '2027-01-01T06:02:00Z');
ok(grouped.length === 3 && grouped[0].label === 'Hoy' && grouped[0].items.length === 2 && grouped[1].label === 'Ayer' && grouped[2].label.includes('2026'), 'Day grouping merges rows and distinguishes yesterday and older years');
ok(presentation.groupNotifications([], '2027-01-01T06:02:00Z').length === 0, 'Empty inbox has no phantom day sections');
ok(presentation.notificationTimeLabel('2027-01-01T06:01:40Z', '2027-01-01T06:02:00Z') === 'Ahora', 'Recent timestamp');
ok(presentation.notificationTimeLabel('2027-01-01T06:01:00Z', '2027-01-01T06:10:00Z') === 'hace 9 min', 'Minute timestamp');
ok(presentation.notificationTimeLabel('2027-01-01T06:01:00Z', '2027-01-01T08:10:00Z') === 'hace 2 h', 'Hour timestamp');
ok(presentation.notificationTimeLabel('2027-01-01T05:59:00Z', '2027-01-01T06:10:00Z') === '23:59', 'Yesterday shows local clock time');
ok(presentation.notificationTodaySummary(0) === 'Tienes 0 notificaciones hoy'
  && presentation.notificationTodaySummary(1) === 'Tienes 1 notificación hoy'
  && presentation.notificationTodaySummary(7) === 'Tienes 7 notificaciones hoy', 'Daily summary handles zero, singular and plural');
// Two independent clients read the same durable account state through the real
// route, rather than relying on either client's optimistic UI.
let activeProfile = owner;
const sharedRows = [owner, other].map(profile_id => ({ ...items[0], id: randomUUID(), profile_id,
  dedupe_key: pushTag, inserted_at: new Date(Date.now() - 1000).toISOString(),
  created_at: new Date(Date.now() - 2000).toISOString(), read_at: null }));
modules['@/lib/notifications/access'].notificationAccess = async () => ({ profileId: activeProfile, scopes: ['kind.eq.request'], db: {
  from() {
    const filters = []; let update; let head = false; let limit = Infinity;
    const query = {
      select(_columns, options) { head = Boolean(options?.head); return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      gte(key, value) { filters.push(row => row[key] >= value); return query; },
      lte(key, value) { filters.push(row => row[key] <= value); return query; },
      is(key, value) { filters.push(row => row[key] === value); return query; },
      not(key, _operator, value) { filters.push(row => row[key] !== value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      or() { filters.push(row => row.kind === 'request'); return query; },
      order() { return query; },
      limit(value) { limit = value; return query; },
      update(value) { update = value; return query; },
      then(resolve, reject) {
        const rows = sharedRows.filter(row => filters.every(filter => filter(row)));
        if (update) rows.forEach(row => Object.assign(row, update));
        return Promise.resolve({ data: head ? null : structuredClone(rows.slice(0, limit)), count: rows.length, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
} });
const unreadRequest = () => new Request('https://app.test/api/notifications?filter=unread');
const deviceA = await (await exports.GET(unreadRequest())).json();
const deviceB = await (await exports.GET(unreadRequest())).json();
ok(deviceA.unreadCount === 1 && deviceB.items[0].id === deviceA.items[0].id, 'Same-account devices share one notification, not per-device copies');
await exports.PATCH(request('PATCH', { ids: [deviceA.items[0].id] }));
const refreshedB = await (await exports.GET(unreadRequest())).json();
const readB = await (await exports.GET(new Request('https://app.test/api/notifications?filter=read'))).json();
ok(refreshedB.unreadCount === 0 && !refreshedB.items.length && Boolean(readB.items[0].read_at), 'Reading on device A updates unread and read lists on device B');
activeProfile = other;
ok((await (await exports.GET(unreadRequest())).json()).unreadCount === 1, 'Other accounts keep independent read state');
await exports.PATCH(request('PATCH', { tag: pushTag, recipientId: owner }));
ok(sharedRows[1].read_at === null, 'Push from a previous login cannot mark the new account read');
await exports.PATCH(request('PATCH', { tag: pushTag, recipientId: other }));
ok((await (await exports.GET(unreadRequest())).json()).unreadCount === 0, 'Native push reading is also visible to another same-account device');
console.log(`Notification API: ${checks} checks passed (ownership, permissions, pagination, validation, CSRF, shared read state).`);
