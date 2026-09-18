import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createJiti } from 'jiti';

nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { '@': process.cwd() } });
const { getShiftDisplayState, findAttendanceSessionForShift } = jiti('../lib/shift-calculations.ts');
const { getOperationalEventDays, formatDateShort } = jiti('../lib/dates.ts');
const { getGuatemalaDayKey } = jiti('../lib/scan-history.ts');

async function fetchAll(table, select, configure = query => query, orderBy = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(
      supabase.from(table).select(select),
    ).order(orderBy).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const eventDayKeys = getOperationalEventDays().map(date => formatDateShort(date));
const [volunteers, shifts, sessions, resolutions] = await Promise.all([
  fetchAll('volunteers', 'id,first_name,last_name,status'),
  fetchAll('shifts', '*', query => query.in('day_key', eventDayKeys)),
  fetchAll('attendance_sessions', '*', query => query.in('day_key', eventDayKeys)),
  fetchAll(
    'attendance_review_resolutions',
    'session_id,resolved_session_id,hide_alert',
    query => query.eq('hide_alert', true),
    'session_id',
  ),
]);

const volunteerById = new Map(volunteers.map(volunteer => [volunteer.id, volunteer]));
const shiftsByVolunteerDay = Object.groupBy(
  shifts,
  shift => `${shift.volunteer_id}|${shift.day_key.toLowerCase().trim()}`,
);
const sessionsByVolunteerDay = Object.groupBy(
  sessions,
  session => `${session.volunteer_id}|${session.day_key.toLowerCase().trim()}`,
);
const resolvedSessionIds = new Set(resolutions.flatMap(resolution => (
  [resolution.session_id, resolution.resolved_session_id].filter(Boolean)
)));
const todayKey = getGuatemalaDayKey(new Date());
const historical = [];
const current = [];

for (const shift of shifts) {
  const key = `${shift.volunteer_id}|${shift.day_key.toLowerCase().trim()}`;
  const dayShifts = shiftsByVolunteerDay[key] || [];
  const daySessions = sessionsByVolunteerDay[key] || [];
  const display = getShiftDisplayState(
    shift.day_key,
    shift.shift_key,
    shift,
    daySessions,
    dayShifts,
    shift.volunteer_id,
    new Date(),
  );
  if (!display.flag) continue;

  const matching = findAttendanceSessionForShift(
    shift.day_key,
    shift.shift_key,
    daySessions,
    dayShifts,
    shift.volunteer_id,
    new Date(),
  );
  if (matching?.id && resolvedSessionIds.has(matching.id)) continue;

  const volunteer = volunteerById.get(shift.volunteer_id);
  const row = {
    volunteer: `${volunteer?.first_name || ''} ${volunteer?.last_name || ''}`.trim(),
    dayKey: shift.day_key,
    shiftKey: shift.shift_key,
    flag: display.flag,
    sessionId: matching?.id || null,
  };
  if (shift.day_key === todayKey) current.push(row);
  else historical.push(row);
}

console.log(JSON.stringify({
  todayKey,
  historicalAlerts: historical.length,
  currentDayAlerts: current.length,
  historical,
  current,
}, null, 2));

if (historical.length > 0) {
  process.exitCode = 1;
}
