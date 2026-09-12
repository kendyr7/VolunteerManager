import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createJiti } from 'jiti';
import { resolve } from 'node:path';

const jiti = createJiti(import.meta.url, { alias: { '@': resolve('.') } });
const { calculateShiftUpdatesAfterSessionRemoval } = jiti(resolve('lib/session-correction.ts'));
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.volunteers (id uuid primary key);
  create table public.shifts (
    id uuid primary key, volunteer_id uuid, day_key text, shift_key text,
    checked_in boolean, checked_in_at timestamptz, checked_out boolean, checked_out_at timestamptz
  );
  create table public.attendance_sessions (
    id uuid primary key, volunteer_id uuid, day_key text,
    started_at timestamptz, ended_at timestamptz, status text, auto_closed boolean,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create table public.activity_logs (
    id uuid primary key default gen_random_uuid(), user_name text, user_role text,
    action_type text, description text, target_id text, details text
  );
`);
for (const migration of [
  '20261028000000_add_reliability_score_to_volunteers.sql',
  '20261030000000_correct_closed_attendance_session.sql',
  '20261031000000_undo_open_attendance_checkin.sql',
]) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
}

const volunteer = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const t2 = '33333333-3333-4333-8333-333333333333';
const t3 = '44444444-4444-4444-8444-444444444444';
const closed = '55555555-5555-4555-8555-555555555555';
await db.query('insert into public.volunteers values ($1, 80)', [volunteer]);
await db.query("insert into public.shifts values ($1, $3, 'jue 10', 'T2', true, '2026-09-10T17:00:00Z', true, '2026-09-10T20:00:00Z'), ($2, $3, 'jue 10', 'T3', true, '2026-09-10T17:00:00Z', false, null)", [t2, t3, volunteer]);
await db.query("insert into public.attendance_sessions (id, volunteer_id, day_key, started_at, status, auto_closed) values ($1, $2, 'jue 10', '2026-09-10T17:00:00Z', 'open', false)", [session, volunteer]);
await db.query("insert into public.attendance_sessions (id, volunteer_id, day_key, started_at, ended_at, status, auto_closed) values ($1, $2, 'jue 10', '2026-09-10T12:00:00Z', '2026-09-10T15:00:00Z', 'completed', false)", [closed, volunteer]);
await db.query("insert into public.activity_logs (user_name, action_type, description, target_id) values ('Escáner', 'Check-in', 'Entrada original', $1)", [volunteer]);

const removed = { id: session, volunteer_id: volunteer, day_key: 'jue 10', started_at: '2026-09-10T17:00:00Z', ended_at: null, status: 'open' };
const updates = calculateShiftUpdatesAfterSessionRemoval(removed, [], [
  { id: t2, day_key: 'jue 10', shift_key: 'T2' },
  { id: t3, day_key: 'jue 10', shift_key: 'T3' },
]);
assert.deepEqual(updates.map(update => update.id).sort(), [t2, t3].sort());
assert(updates.every(update => !update.checked_in && !update.checked_out));

const call = (shiftUpdates = updates, expected = removed.started_at) => db.query(`
  select public.undo_open_attendance_checkin(
    $1::uuid, 'jue 10', 'T3', $2::uuid, $3::timestamptz,
    'admin-1', 'Administrador', 'Admin', $4::jsonb, 100
  ) as result
`, [volunteer, session, expected, JSON.stringify(shiftUpdates)]);

await assert.rejects(call([{ ...updates[0], id: '66666666-6666-4666-8666-666666666666' }, updates[1]]), /afectado/);
assert.equal((await db.query('select count(*)::int as count from public.attendance_sessions')).rows[0].count, 2);
const result = await call();
assert.equal(result.rows[0].result.removedSession.id, session);
const remaining = await db.query('select id from public.attendance_sessions');
assert.deepEqual(remaining.rows.map(row => row.id), [closed]);
const shifts = await db.query('select checked_in, checked_out, checked_in_at, checked_out_at from public.shifts');
assert(shifts.rows.every(row => !row.checked_in && !row.checked_out && !row.checked_in_at && !row.checked_out_at));
const logs = await db.query('select action_type, details from public.activity_logs order by action_type');
assert.equal(logs.rows.length, 2);
const undo = logs.rows.find(row => row.action_type === 'Deshacer');
assert.equal(JSON.parse(undo.details).removedSession.id, session);
assert.equal(JSON.parse(undo.details).previousShifts.length, 2);
assert(logs.rows.some(row => row.action_type === 'Check-in'));
await assert.rejects(call(), /cambió/);

// Older check-ins may have only a legacy shift flag and no session.
await db.query("update public.shifts set checked_in = true, checked_in_at = '2026-09-10T21:00:00Z' where id = $1", [t3]);
const legacy = await db.query(`
  select public.undo_open_attendance_checkin(
    $1::uuid, 'jue 10', 'T3', null::uuid, null::timestamptz,
    'admin-1', 'Administrador', 'Admin', $2::jsonb, 100
  ) as result
`, [volunteer, JSON.stringify([{ id: t3, checked_in: false, checked_in_at: null, checked_out: false, checked_out_at: null }])]);
assert.equal(legacy.rows[0].result.removedSession, null);
assert.equal((await db.query('select checked_in from public.shifts where id = $1', [t3])).rows[0].checked_in, false);
assert.equal((await db.query('select count(*)::int as count from public.attendance_sessions')).rows[0].count, 1);

console.log('Open check-in undo transaction: passed');
await db.close();
