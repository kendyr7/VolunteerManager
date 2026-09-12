import { parseDayKeyToDateStr } from '@/lib/dates';
import { AttendanceSession, getSessionShiftCompletedAt, inferShiftsForSession } from '@/lib/session-utils';

export const MAX_CORRECTED_SESSION_MINUTES = 18 * 60;

export function validateCorrectedSession(dayKey: string, startedAt: string, endedAt: string, now = Date.now()): string | null {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Ingresa horas válidas de entrada y salida.';
  if (start > now || end > now) return 'La entrada y la salida no pueden estar en el futuro.';
  const minutes = (end - start) / 60000;
  if (minutes < 5 || minutes > MAX_CORRECTED_SESSION_MINUTES) {
    return 'La duración debe ser de al menos 5 minutos y no superar 18 horas.';
  }
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(startedAt ? new Date(start) : new Date(NaN));
  if (localDay !== parseDayKeyToDateStr(dayKey)) return 'La entrada debe corresponder al día de la asistencia.';
  return null;
}

export interface CorrectedShift {
  id: string;
  day_key: string;
  shift_key: string;
  checked_in?: boolean | null;
  checked_in_at?: string | null;
  checked_out?: boolean | null;
  checked_out_at?: string | null;
}

export function calculateAffectedShiftUpdates(
  original: AttendanceSession,
  corrected: AttendanceSession,
  sessions: AttendanceSession[],
  shifts: CorrectedShift[],
) {
  const assignedKeys = shifts.map(shift => shift.shift_key);
  const relatedKeys = (session: AttendanceSession) => new Set<string>(
    inferShiftsForSession(session.day_key, session.started_at, session.ended_at, assignedKeys).map(shift => shift.shiftKey),
  );
  const affected = new Set([...relatedKeys(original), ...relatedKeys(corrected)]);
  const latestSessions = sessions.map(session => session.id === corrected.id ? corrected : session);
  return shifts.filter(shift => affected.has(shift.shift_key)).map(shift => {
    const matching = latestSessions.filter(session => relatedKeys(session).has(shift.shift_key));
    const starts = matching.map(session => session.started_at).sort();
    const completions = matching.flatMap(session => {
      if (!session.ended_at) return [];
      const completedAt = getSessionShiftCompletedAt(session.day_key, shift.shift_key, session.started_at, session.ended_at, assignedKeys);
      return completedAt ? [completedAt] : [];
    }).sort();
    return {
      id: shift.id,
      checked_in: matching.length > 0,
      checked_in_at: starts[0] || null,
      checked_out: completions.length > 0,
      checked_out_at: completions.at(-1) || null,
    };
  });
}
