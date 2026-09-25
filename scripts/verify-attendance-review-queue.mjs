import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createJiti } from 'jiti';

nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Faltan las credenciales locales para verificar la cola de asistencia.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { '@': process.cwd() } });
const { findAttendanceSessionForShift, getShiftAttendanceReviewFlag } = jiti('../lib/shift-calculations.ts');
const { getAttendanceSessionReviewFlag } = jiti('../lib/attendance-review.ts');
const { parseDayKeyToDateStr } = jiti('../lib/dates.ts');
const { getGuatemalaDate } = jiti('../lib/scan-history.ts');

async function fetchAll(table, select, orderBy = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).order(orderBy).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const [shifts, sessions, decisions, resolutions] = await Promise.all([
  fetchAll('shifts', '*'),
  fetchAll('attendance_sessions', '*'),
  fetchAll('attendance_session_decisions', 'session_id,intended_shift_keys,attendance_kind,exit_decision,hide_alert', 'session_id'),
  fetchAll('attendance_review_resolutions', 'session_id,resolved_session_id,hide_alert', 'session_id'),
]);
const decisionById = new Map(decisions.map(decision => [decision.session_id, decision]));
const enrichedSessions = sessions.map(session => {
  const decision = decisionById.get(session.id);
  return {
    ...session,
    intended_shift_keys: decision?.intended_shift_keys,
    attendance_kind: decision?.attendance_kind,
    exit_decision: decision?.exit_decision,
    decision_hides_alert: decision?.hide_alert,
  };
});
const resolvedIds = new Set(resolutions.filter(row => row.hide_alert)
  .flatMap(row => [row.session_id, row.resolved_session_id].filter(Boolean)));
const keyOf = row => `${row.volunteer_id}|${row.day_key.toLowerCase().trim()}`;
const shiftsByDay = Object.groupBy(shifts, keyOf);
const sessionsByDay = Object.groupBy(enrichedSessions, keyOf);
const now = new Date();
const pending = [];
const coveredBriefSessionIds = new Set();

for (const shift of shifts) {
  const key = keyOf(shift);
  const daySessions = sessionsByDay[key] || [];
  const dayShifts = shiftsByDay[key] || [];
  const flag = getShiftAttendanceReviewFlag(
    shift.day_key, shift.shift_key, shift, daySessions, dayShifts, shift.volunteer_id, now,
  );
  if (!flag) continue;
  const matching = findAttendanceSessionForShift(
    shift.day_key, shift.shift_key, daySessions, dayShifts, shift.volunteer_id, now,
  );
  if (matching?.id && resolvedIds.has(matching.id)) continue;
  if (flag.includes('no supera el 50%') && matching?.id) coveredBriefSessionIds.add(matching.id);
  if (flag.includes('Salida pendiente') && getGuatemalaDate(now) === parseDayKeyToDateStr(shift.day_key)) continue;
  pending.push({ source: 'shift', id: shift.id, sessionId: matching?.id, dayKey: shift.day_key, shiftKey: shift.shift_key, flag });
}

for (const session of enrichedSessions) {
  if (resolvedIds.has(session.id)) continue;
  const dayShifts = shiftsByDay[keyOf(session)] || [];
  const flag = getAttendanceSessionReviewFlag(session, dayShifts.map(shift => shift.shift_key), now);
  if (!flag || (flag.includes('antes de una hora') && coveredBriefSessionIds.has(session.id))) continue;
  pending.push({ source: 'session', id: session.id, sessionId: session.id, dayKey: session.day_key, flag });
}

console.log(JSON.stringify({ pendingCount: pending.length, pending }, null, 2));
if (pending.length > 0) process.exitCode = 1;
