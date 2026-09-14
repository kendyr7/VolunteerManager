import { getAvailableShiftKeys, getOfficialShiftTime, isOperationalEventDay, parseDayKeyToDateStr } from '@/lib/dates';
import { getGuatemalaDate } from '@/lib/scan-history';
import { inferAdditionalCompletedShifts } from '@/lib/session-utils';

export interface ReviewableAttendanceSession {
  day_key: string;
  started_at: string;
  ended_at?: string | null;
  status: string;
}

/** Session-level exceptions, including records that have no scheduled shift row. */
export function getAttendanceSessionReviewFlag(
  session: ReviewableAttendanceSession,
  assignedShiftKeys: string[],
  now = new Date(),
): string | null {
  const day = parseDayKeyToDateStr(session.day_key);
  const start = new Date(session.started_at).getTime();
  const end = session.ended_at ? new Date(session.ended_at).getTime() : null;

  if (!isOperationalEventDay(session.day_key)) return 'Asistencia en una fecha fuera del cronograma oficial';
  if (!Number.isFinite(start) || getGuatemalaDate(session.started_at) !== day) {
    return 'La fecha de entrada no coincide con el día de la asistencia';
  }
  if (end !== null && (!Number.isFinite(end) || end < start)) return 'Hora de salida inválida';
  if (session.status === 'open' && end !== null) return 'Sesión abierta con salida registrada';
  if (session.status !== 'open' && end === null) return 'Sesión finalizada sin hora de salida';
  if (session.status === 'open') {
    if (day < getGuatemalaDate(now)) return 'Salida pendiente de un día anterior';
    if (assignedShiftKeys.length === 0 && day === getGuatemalaDate(now)) {
      const lastEndHour = Math.max(...getAvailableShiftKeys(session.day_key)
        .map(key => getOfficialShiftTime(session.day_key, key).endHour));
      const lastEnd = new Date(`${day}T00:00:00-06:00`).getTime() + lastEndHour * 3600000;
      if (now.getTime() >= lastEnd) return 'Salida pendiente después del último turno del día';
    }
    return null;
  }
  if (end !== null && end - start < 60 * 60 * 1000) {
    return 'Salida registrada antes de una hora; verificar si hubo doble escaneo';
  }
  if (end !== null && assignedShiftKeys.length === 0
    && inferAdditionalCompletedShifts(session.day_key, session.started_at, session.ended_at, []).length === 0) {
    return 'Asistencia sin turno programado ni turno adicional acreditable';
  }
  return null;
}
