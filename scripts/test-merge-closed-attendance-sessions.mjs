import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': resolve('.') } });
const { calculateAffectedShiftUpdates, getSessionsOverlappingCorrection } = jiti(resolve('lib/session-correction.ts'));
const { getVolunteerProfileMetrics } = jiti(resolve('lib/services/volunteer-profile.service.ts'));
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
await db.exec(await readFile(new URL('../supabase/migrations/20260914052837_merge_closed_attendance_sessions.sql', import.meta.url), 'utf8'));

const volunteerId = '11111111-1111-4111-8111-111111111111';
const priorId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const shiftIds = ['44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444442',
  '44444444-4444-4444-8444-444444444443', '44444444-4444-4444-8444-444444444444'];
const day = 'jue 10';
const at = time => `2026-09-10T${time}:00-06:00`;
const prior = { id: priorId, volunteer_id: volunteerId, day_key: day,
  started_at: at('06:58'), ended_at: at('14:55'), status: 'completed', auto_closed: false };
const target = { id: targetId, volunteer_id: volunteerId, day_key: day,
  started_at: at('14:56'), ended_at: at('20:38'), status: 'completed', auto_closed: false };
const corrected = { ...target, started_at: at('06:58'), ended_at: at('20:38') };
const shifts = shiftIds.map((id, index) => ({ id, volunteer_id: volunteerId, day_key: day,
  shift_key: `T${index + 1}`, checked_in: true, checked_in_at: index < 2 ? prior.started_at : target.started_at,
  checked_out: true, checked_out_at: index < 2 ? prior.ended_at : target.ended_at }));

assert.deepEqual(getSessionsOverlappingCorrection(target, corrected, [prior, target]).absorbed.map(item => item.id), [priorId]);
assert.equal(getSessionsOverlappingCorrection(target, { ...corrected, started_at: at('10:00') }, [prior, target]).blocking.length, 1);
const updates = calculateAffectedShiftUpdates(target, corrected, [prior, target], shifts, [priorId]);
assert.equal(updates.length, 4);
assert(updates.every(update => update.checked_in && update.checked_out));
assert.equal(getVolunteerProfileMetrics(volunteerId, shifts, [], [prior, target]).totalWorkedMinutes, 819);
const mergedMetrics = getVolunteerProfileMetrics(volunteerId, shifts, [], [corrected]);
assert.equal(mergedMetrics.totalWorkedMinutes, 820);
assert.equal(mergedMetrics.sessionsList.length, 1);
assert.equal(mergedMetrics.scheduledCompletedShiftsCount, 4);

await db.query('insert into public.volunteers values ($1, 50)', [volunteerId]);
for (const shift of shifts) {
  await db.query('insert into public.shifts values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [shift.id, shift.volunteer_id, shift.day_key, shift.shift_key, shift.checked_in,
      shift.checked_in_at, shift.checked_out, shift.checked_out_at]);
}
for (const session of [prior, target]) {
  await db.query('insert into public.attendance_sessions values ($1,$2,$3,$4,$5,$6,$7,now())',
    [session.id, session.volunteer_id, session.day_key, session.started_at, session.ended_at,
      session.status, session.auto_closed]);
}
await db.query("insert into public.activity_logs (user_name,user_role,action_type,description,target_id) values ('Escáner','Sistema','Check-in','Entrada original',$1), ('Escáner','Sistema','Check-out','Salida original',$1)", [volunteerId]);

const call = (absorbed, shiftUpdates = updates, startedAt = corrected.started_at) => db.query(`
  select * from public.merge_closed_attendance_sessions(
    $1::uuid, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5::timestamptz,
    $6::jsonb, 'Jornada continua confirmada', 'admin-1', 'Administrador', 'Admin', $7::jsonb, 100
  )
`, [targetId, target.started_at, target.ended_at, startedAt, corrected.ended_at,
  JSON.stringify(absorbed), JSON.stringify(shiftUpdates)]);
const snapshot = [{ id: priorId, started_at: prior.started_at, ended_at: prior.ended_at }];
await assert.rejects(call([{ ...snapshot[0], ended_at: at('14:54') }]), /cambió/i);
await assert.rejects(call(snapshot, updates, at('10:00')), /totalmente cubiertas/i);
await assert.rejects(call(snapshot, [{ ...updates[0], id: '55555555-5555-4555-8555-555555555555' }]), /turno afectado/i);
assert.equal((await db.query('select count(*)::int as total from public.attendance_sessions')).rows[0].total, 2);

await call(snapshot);
const remaining = await db.query('select id, started_at, ended_at from public.attendance_sessions');
assert.equal(remaining.rows.length, 1);
assert.equal(remaining.rows[0].id, targetId);
assert.equal(remaining.rows[0].started_at.toISOString(), new Date(corrected.started_at).toISOString());
assert.equal(remaining.rows[0].ended_at.toISOString(), new Date(corrected.ended_at).toISOString());
assert.equal((remaining.rows[0].ended_at - remaining.rows[0].started_at) / 60000, 820);
assert.equal((await db.query('select count(*)::int as total from public.shifts where checked_in and checked_out')).rows[0].total, 4);
assert.equal((await db.query('select reliability_score from public.volunteers')).rows[0].reliability_score, 100);
const logs = await db.query('select action_type, details from public.activity_logs');
assert.equal(logs.rows.length, 3);
assert(logs.rows.some(log => log.action_type === 'Check-in'));
assert(logs.rows.some(log => log.action_type === 'Check-out'));
const merge = logs.rows.find(log => log.action_type === 'Corrección de asistencia');
assert.equal(JSON.parse(merge.details).absorbedSessions[0].id, priorId);
assert.equal(JSON.parse(merge.details).reason, 'Jornada continua confirmada');
assert.equal(JSON.parse(merge.details).changes.length, 2);

console.log('Merge closed attendance sessions: passed');
await db.close();
