import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createJiti } from 'jiti';
import { resolve } from 'node:path';

const jiti = createJiti(import.meta.url, { alias: { '@': resolve('.') } });
const { calculateAffectedShiftUpdates, validateCorrectedSession } = jiti(resolve('lib/session-correction.ts'));
assert.match(validateCorrectedSession('jue 10', '2026-09-10T17:00:00Z', '2026-09-10T17:02:00Z', Date.UTC(2026, 8, 12)), /5 minutos/);
const originalSession = {
  id: 'original', volunteer_id: 'volunteer', day_key: 'jue 10',
  started_at: '2026-09-10T17:00:00Z', ended_at: '2026-09-10T21:00:00Z', status: 'completed', auto_closed: false,
};
const correctedSession = { ...originalSession, started_at: '2026-09-10T21:00:00Z', ended_at: '2026-09-11T01:00:00Z' };
const affected = calculateAffectedShiftUpdates(originalSession, correctedSession, [originalSession], [
  { id: 't2', day_key: 'jue 10', shift_key: 'T2' },
  { id: 't3', day_key: 'jue 10', shift_key: 'T3' },
]);
assert(affected.some(shift => shift.id === 't2' && !shift.checked_in && !shift.checked_out));
assert(affected.some(shift => shift.id === 't3' && shift.checked_in && shift.checked_out));

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create table public.volunteers (id uuid primary key, reliability_score integer);
  create table public.shifts (
    id uuid primary key, volunteer_id uuid, day_key text, shift_key text,
    checked_in boolean, checked_in_at timestamptz, checked_out boolean, checked_out_at timestamptz
  );
  create table public.attendance_sessions (
    id uuid primary key, volunteer_id uuid, day_key text,
    started_at timestamptz, ended_at timestamptz, status text, auto_closed boolean, updated_at timestamptz
  );
  create table public.activity_logs (
    id uuid primary key default gen_random_uuid(), user_name text, user_role text,
    action_type text, description text, target_id text, details text
  );
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261030000000_correct_closed_attendance_session.sql', import.meta.url), 'utf8'));

const volunteer = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const shift = '33333333-3333-4333-8333-333333333333';
const otherSession = '44444444-4444-4444-8444-444444444444';
await db.query('insert into public.volunteers values ($1, 80)', [volunteer]);
await db.query("insert into public.shifts values ($1, $2, 'jue 10', 'T2', true, '2026-09-10T17:00:00Z', true, '2026-09-10T21:00:00Z')", [shift, volunteer]);
await db.query("insert into public.attendance_sessions values ($1, $2, 'jue 10', '2026-09-10T17:00:00Z', '2026-09-10T21:00:00Z', 'completed', false, now())", [session, volunteer]);
await db.query("insert into public.activity_logs (user_name, user_role, action_type, description, target_id) values ('Escáner', 'Sistema', 'Check-in', 'Entrada original', $1), ('Escáner', 'Sistema', 'Check-out', 'Salida original', $1)", [volunteer]);

const call = async (startedAt, endedAt, expectedStart = '2026-09-10T17:00:00Z', expectedEnd = '2026-09-10T21:00:00Z') => db.query(`
  select * from public.correct_closed_attendance_session(
    $1::uuid, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5::timestamptz,
    'Salida olvidada, confirmada por coordinación', 'admin-1', 'Administrador', 'Admin',
    $6::jsonb, 100
  )
`, [session, expectedStart, expectedEnd, startedAt, endedAt, JSON.stringify([{
  id: shift, checked_in: true, checked_in_at: startedAt, checked_out: true, checked_out_at: endedAt,
}])]);

await assert.rejects(call('2026-09-10T17:00:00Z', '2026-09-10T17:02:00Z'), /duración|duration/i);
await call('2026-09-10T17:05:00Z', '2026-09-10T20:45:00Z');
const saved = await db.query('select started_at, ended_at from public.attendance_sessions where id = $1', [session]);
assert.equal(saved.rows[0].started_at.toISOString(), '2026-09-10T17:05:00.000Z');
assert.equal(saved.rows[0].ended_at.toISOString(), '2026-09-10T20:45:00.000Z');
const logs = await db.query('select action_type, details from public.activity_logs order by action_type');
assert.equal(logs.rows.length, 3);
const correction = logs.rows.find(log => log.action_type === 'Corrección de asistencia');
assert.equal(new Date(JSON.parse(correction.details).previousEndedAt).toISOString(), '2026-09-10T21:00:00.000Z');
assert.equal(JSON.parse(correction.details).reason, 'Salida olvidada, confirmada por coordinación');
assert(logs.rows.some(log => log.action_type === 'Check-in'));
assert(logs.rows.some(log => log.action_type === 'Check-out'));
const shifted = await db.query('select checked_in_at, checked_out_at from public.shifts where id = $1', [shift]);
assert.equal(shifted.rows[0].checked_out_at.toISOString(), '2026-09-10T20:45:00.000Z');
const reliability = await db.query('select reliability_score from public.volunteers where id = $1', [volunteer]);
assert.equal(reliability.rows[0].reliability_score, 100);
await assert.rejects(call('2026-09-10T17:10:00Z', '2026-09-10T20:30:00Z'), /cambió/i);
await db.query("insert into public.attendance_sessions values ($1, $2, 'jue 10', '2026-09-10T21:00:00Z', '2026-09-10T22:00:00Z', 'completed', false, now())", [otherSession, volunteer]);
await assert.rejects(call('2026-09-10T17:05:00Z', '2026-09-10T21:30:00Z', '2026-09-10T17:05:00Z', '2026-09-10T20:45:00Z'), /solapa/i);
assert.equal((await db.query('select count(*)::int as count from public.activity_logs')).rows[0].count, 3);

console.log('Closed attendance correction transaction: passed');
await db.close();
