import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.volunteers (
    id uuid primary key,
    first_name text,
    last_name text
  );

  create table public.attendance_sessions (
    id uuid primary key,
    volunteer_id uuid not null references public.volunteers(id) on delete cascade,
    day_key varchar(20) not null,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    status varchar(20) not null default 'open' check (status in ('open', 'completed')),
    auto_closed boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint test_attendance_open_ended check (
      (status = 'open' and ended_at is null) or (status = 'completed' and ended_at is not null)
    ),
    constraint test_attendance_chronology check (ended_at is null or ended_at >= started_at)
  );
  create unique index test_one_open_session
    on public.attendance_sessions(volunteer_id) where status = 'open';

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

const migration = await readFile(
  new URL('../supabase/migrations/20261102000000_attendance_session_decisions.sql', import.meta.url),
  'utf8',
);
await db.exec(migration);

const volunteerA = '00000000-0000-4000-8000-000000000001';
const volunteerB = '00000000-0000-4000-8000-000000000002';
const volunteerC = '00000000-0000-4000-8000-000000000003';
await db.query(
  `insert into public.volunteers(id, first_name, last_name)
   values ($1, 'Ana', 'Prueba'), ($2, 'Luis', 'Prueba'), ($3, 'Marta', 'Prueba')`,
  [volunteerA, volunteerB, volunteerC],
);

const openSessionId = '10000000-0000-4000-8000-000000000001';
const openParams = [
  openSessionId,
  volunteerA,
  'jue 17',
  '2026-09-17T14:05:00Z',
  ['T2'],
  'scheduled',
  'scanner_shift_selected',
  '',
  'actor-1',
  'Coordinador Prueba',
  'Coordinador',
  'scan-a-1',
];
const openResult = await db.query(
  `select public.open_attendance_session_with_decision(
    $1::uuid, $2::uuid, $3, $4::timestamptz, $5::text[], $6, $7, $8, $9, $10, $11, $12
  ) as payload`,
  openParams,
);
assert.equal(openResult.rows[0].payload.alreadyOpen, false);

const replayResult = await db.query(
  `select public.open_attendance_session_with_decision(
    $1::uuid, $2::uuid, $3, $4::timestamptz, $5::text[], $6, $7, $8, $9, $10, $11, $12
  ) as payload`,
  openParams,
);
assert.equal(replayResult.rows[0].payload.idempotentReplay, true);

const decisionAfterOpen = await db.query(
  `select intended_shift_keys, attendance_kind, hide_alert
   from public.attendance_session_decisions where session_id = $1::uuid`,
  [openSessionId],
);
assert.deepEqual(decisionAfterOpen.rows[0].intended_shift_keys, ['T2']);
assert.equal(decisionAfterOpen.rows[0].attendance_kind, 'scheduled');
assert.equal(decisionAfterOpen.rows[0].hide_alert, true);

await db.query(
  `select public.close_attendance_session_with_decision(
    $1::uuid, $2::uuid, $3::timestamptz, $4::text[], $5, $6, $7, $8, $9, $10
  )`,
  [
    openSessionId,
    volunteerA,
    '2026-09-17T14:20:00Z',
    ['T2'],
    'confirmed_short',
    'short_visit_confirmed_by_coordinator',
    'Salida breve confirmada.',
    'actor-1',
    'Coordinador Prueba',
    'Coordinador',
  ],
);
const closed = await db.query(
  `select session.status, session.ended_at, decision.exit_decision, decision.hide_alert
   from public.attendance_sessions session
   join public.attendance_session_decisions decision on decision.session_id = session.id
   where session.id = $1::uuid`,
  [openSessionId],
);
assert.equal(closed.rows[0].status, 'completed');
assert.equal(closed.rows[0].exit_decision, 'confirmed_short');
assert.equal(closed.rows[0].hide_alert, true);

const staleId = '20000000-0000-4000-8000-000000000001';
await db.query(
  `insert into public.attendance_sessions(id, volunteer_id, day_key, started_at)
   values ($1::uuid, $2::uuid, 'mié 16', '2026-09-16T13:00:00Z')`,
  [staleId, volunteerB],
);
const newSessionId = '20000000-0000-4000-8000-000000000002';
const resolved = await db.query(
  `select public.resolve_stale_and_open_attendance(
    $1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5, $6::timestamptz,
    $7::text[], $8::text[], $9, $10, $11, $12, $13
  ) as payload`,
  [
    staleId,
    newSessionId,
    volunteerB,
    '2026-09-16T18:00:00Z',
    'jue 17',
    '2026-09-17T14:00:00Z',
    ['T1'],
    ['T2'],
    'scheduled',
    'actor-1',
    'Coordinador Prueba',
    'Coordinador',
    'resolve-b-1',
  ],
);
assert.equal(resolved.rows[0].payload.session.id, newSessionId);
const resolvedSessions = await db.query(
  `select id, status, auto_closed from public.attendance_sessions
   where volunteer_id = $1::uuid order by started_at`,
  [volunteerB],
);
assert.deepEqual(
  resolvedSessions.rows.map(row => [row.id, row.status, row.auto_closed]),
  [[staleId, 'completed', true], [newSessionId, 'open', false]],
);

const rollbackStaleId = '30000000-0000-4000-8000-000000000001';
await db.query(
  `insert into public.attendance_sessions(id, volunteer_id, day_key, started_at)
   values ($1::uuid, $2::uuid, 'mié 16', '2026-09-16T15:00:00Z')`,
  [rollbackStaleId, volunteerC],
);
await assert.rejects(() => db.query(
  `select public.resolve_stale_and_open_attendance(
    $1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5, $6::timestamptz,
    $7::text[], $8::text[], $9, $10, $11, $12, $13
  )`,
  [
    rollbackStaleId,
    '30000000-0000-4000-8000-000000000002',
    volunteerC,
    '2026-09-16T14:00:00Z',
    'jue 17',
    '2026-09-17T14:00:00Z',
    ['T1'],
    ['T2'],
    'scheduled',
    'actor-1',
    'Coordinador Prueba',
    'Coordinador',
    'resolve-c-1',
  ],
));
const afterRollback = await db.query(
  `select status, ended_at from public.attendance_sessions where id = $1::uuid`,
  [rollbackStaleId],
);
assert.equal(afterRollback.rows[0].status, 'open');
assert.equal(afterRollback.rows[0].ended_at, null);

const auditCounts = await db.query(`
  select
    (select count(*)::int from public.attendance_scan_events) as scan_events,
    (select count(*)::int from public.activity_logs) as activity_logs
`);
assert.equal(auditCounts.rows[0].scan_events, 3);
assert.equal(auditCounts.rows[0].activity_logs, 3);

await db.close();
console.log('Attendance decisions migration: atomicity, idempotency and audit trail verified.');
