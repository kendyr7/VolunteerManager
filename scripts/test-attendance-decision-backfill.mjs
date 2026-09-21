import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const manifest = JSON.parse(await readFile(
  new URL('./fixtures/attendance-decision-backfill-2026-09.json', import.meta.url),
  'utf8',
));
const baseMigration = await readFile(
  new URL('../supabase/migrations/20261102000000_attendance_session_decisions.sql', import.meta.url),
  'utf8',
);
const backfillMigration = await readFile(
  new URL('../supabase/migrations/20261103000000_backfill_reviewed_attendance_decisions.sql', import.meta.url),
  'utf8',
);

assert.equal(manifest.source_resolution_count, 44);
assert.equal(manifest.linked_resolution_count, 43);
assert.equal(manifest.deleted_resolution_count, 1);
assert.equal(manifest.decision_row_count, 42);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.volunteers (id uuid primary key);
  create table public.attendance_sessions (
    id uuid primary key,
    volunteer_id uuid not null references public.volunteers(id) on delete cascade,
    day_key text not null,
    started_at timestamptz not null,
    ended_at timestamptz,
    status text not null check (status in ('open', 'completed')),
    auto_closed boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.attendance_review_resolutions (
    session_id uuid primary key,
    resolved_session_id uuid,
    volunteer_id uuid not null references public.volunteers(id) on delete cascade,
    day_key text not null,
    decision text not null default 'reviewed',
    explanation text not null default '',
    correction text not null default '',
    hide_alert boolean not null default false,
    reviewed_by text,
    reviewed_at date,
    resolution_status text not null default 'reviewed',
    original_started_at timestamptz,
    original_ended_at timestamptz,
    resolved_started_at timestamptz,
    resolved_ended_at timestamptz,
    applied_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.activity_logs (
    id uuid primary key default gen_random_uuid(),
    user_name text not null default 'Sistema',
    user_role text not null default 'Admin',
    action_type text not null,
    description text not null,
    details text,
    target_id text,
    created_at timestamptz not null default now()
  );
`);
await db.exec(baseMigration);

const volunteerIds = [...new Set(manifest.source_resolutions.map(row => row.volunteer_id))];
for (const volunteerId of volunteerIds) {
  await db.query('insert into public.volunteers(id) values ($1::uuid)', [volunteerId]);
}
for (const decision of manifest.decisions) {
  await db.query(
    `insert into public.attendance_sessions (
      id, volunteer_id, day_key, started_at, ended_at, status, auto_closed
    ) values ($1::uuid, $2::uuid, $3, '2026-09-10T13:00:00Z', '2026-09-10T17:00:00Z', 'completed', false)`,
    [decision.session_id, decision.volunteer_id, decision.day_key],
  );
}
for (const source of manifest.source_resolutions) {
  await db.query(
    `insert into public.attendance_review_resolutions (
      session_id, resolved_session_id, volunteer_id, day_key, hide_alert, reviewed_by, reviewed_at
    ) values ($1::uuid, $2::uuid, $3::uuid, $4, true, 'Kendyr', '2026-09-16')`,
    [source.session_id, source.expected_resolved_session_id, source.volunteer_id, source.day_key],
  );
}

const snapshot = async table => (await db.query(`select * from public.${table} order by 1`)).rows;
const sessionsBefore = await snapshot('attendance_sessions');
const resolutionsBefore = await snapshot('attendance_review_resolutions');

await db.exec(backfillMigration);

const decisionRows = (await db.query(`
  select session_id, volunteer_id, day_key, intended_shift_keys, attendance_kind,
         exit_decision, reason_code, explanation, hide_alert, source,
         idempotency_key, source_resolution_ids, source_case_ids
  from public.attendance_session_decisions
  order by session_id
`)).rows;
assert.equal(decisionRows.length, 42);

for (const expected of manifest.decisions) {
  const actual = decisionRows.find(row => row.session_id === expected.session_id);
  assert.ok(actual, `Missing decision for ${expected.session_id}`);
  assert.equal(actual.volunteer_id, expected.volunteer_id);
  assert.equal(actual.day_key, expected.day_key);
  assert.deepEqual(actual.intended_shift_keys, expected.intended_shift_keys);
  assert.equal(actual.attendance_kind, 'historical_audit');
  assert.equal(actual.exit_decision, 'admin_corrected');
  assert.equal(actual.reason_code, 'reviewed_attendance_audit_2026_09');
  assert.equal(actual.explanation, expected.explanation);
  assert.equal(actual.hide_alert, true);
  assert.equal(actual.source, 'historical_audit');
  assert.equal(actual.idempotency_key, expected.idempotency_key);
  assert.deepEqual(actual.source_resolution_ids, expected.source_resolution_ids);
  assert.deepEqual(actual.source_case_ids, expected.source_case_ids);
}

const traced = await db.query(`
  select count(*)::int as count
  from public.attendance_review_resolutions resolution
  join public.attendance_session_decisions decision
    on decision.session_id = resolution.resolved_session_id
   and resolution.session_id = any(decision.source_resolution_ids)
  where resolution.resolved_session_id is not null
    and resolution.hide_alert is true
    and decision.hide_alert is true
`);
assert.equal(traced.rows[0].count, 43);

const deleted = manifest.source_resolutions.find(row => !row.expected_resolved_session_id);
assert.ok(deleted);
const deletedTrace = await db.query(`
  select hide_alert, resolved_session_id
  from public.attendance_review_resolutions
  where session_id = $1::uuid
`, [deleted.session_id]);
assert.equal(deletedTrace.rows[0].hide_alert, true);
assert.equal(deletedTrace.rows[0].resolved_session_id, null);

assert.deepEqual(await snapshot('attendance_sessions'), sessionsBefore);
assert.deepEqual(await snapshot('attendance_review_resolutions'), resolutionsBefore);

await db.exec(backfillMigration);
assert.equal((await db.query('select count(*)::int as count from public.attendance_session_decisions')).rows[0].count, 42);
assert.deepEqual(await snapshot('attendance_sessions'), sessionsBefore);
assert.deepEqual(await snapshot('attendance_review_resolutions'), resolutionsBefore);

await db.query(
  `update public.attendance_review_resolutions set hide_alert = false where session_id = $1::uuid`,
  [manifest.source_resolutions[0].session_id],
);
await assert.rejects(
  () => db.exec(backfillMigration),
  /Las 44 resoluciones ya no coinciden con el lote revisado/,
);

await db.close();
console.log('Attendance decision backfill: 44 sources, 42 session decisions, traceability and idempotency verified.');
