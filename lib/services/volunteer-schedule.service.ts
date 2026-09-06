import 'server-only';

import { getAdminSupabase } from '@/lib/supabase/admin';
import type { VolunteerScheduleShift } from '@/lib/types/volunteer-schedule';
import { findAttendanceSessionForShift } from '@/lib/shift-calculations';

interface VolunteerScheduleRow {
  id: string;
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  checked_in: boolean | null;
  checked_in_at: string | null;
  checked_out: boolean | null;
  checked_out_at: string | null;
  area_id: string | null;
  committee_areas:
    | { name: string; description: string | null }
    | Array<{ name: string; description: string | null }>
    | null;
}

export interface VolunteerScheduleScope {
  id: string;
  committeeId: string | null;
  status: string | null;
}

function relationName(value: VolunteerScheduleRow['committee_areas']): string | null {
  if (Array.isArray(value)) return value[0]?.name || null;
  return value?.name || null;
}

function relationDescription(value: VolunteerScheduleRow['committee_areas']): string | null {
  if (Array.isArray(value)) return value[0]?.description || null;
  return value?.description || null;
}

export class VolunteerScheduleService {
  static async getVolunteerScope(volunteerId: string): Promise<VolunteerScheduleScope | null> {
    if (!volunteerId) return null;
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase
      .from('volunteers')
      .select('id, committee_id, status')
      .eq('id', volunteerId)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id, committeeId: data.committee_id, status: data.status };
  }

  static async getSchedule(volunteerId: string): Promise<VolunteerScheduleShift[]> {
    const supabase = await getAdminSupabase();
    const [shiftsResult, sessionsResult] = await Promise.all([
      supabase
        .from('shifts')
        .select('id, volunteer_id, day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at, area_id, committee_areas(name, description)')
        .eq('volunteer_id', volunteerId)
        .order('day_key')
        .order('shift_key'),
      supabase
        .from('attendance_sessions')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .order('started_at', { ascending: false }),
    ]);
    if (shiftsResult.error) throw new Error(`No se pudo cargar el horario del voluntario: ${shiftsResult.error.message}`);
    if (sessionsResult.error) throw new Error(`No se pudo cargar la asistencia del voluntario: ${sessionsResult.error.message}`);

    const shifts = (shiftsResult.data || []) as VolunteerScheduleRow[];
    const sessions = sessionsResult.data || [];

    return shifts.map((shift) => {
      const attendanceSession = findAttendanceSessionForShift(
        shift.day_key,
        shift.shift_key,
        sessions,
        shifts,
        volunteerId,
      );
      const sessionCompleted = attendanceSession?.status === 'completed' && Boolean(attendanceSession.ended_at);

      return {
        id: shift.id,
        volunteer_id: shift.volunteer_id,
        day_key: shift.day_key,
        shift_key: shift.shift_key,
        checked_in: attendanceSession ? true : shift.checked_in,
        checked_in_at: attendanceSession?.started_at || shift.checked_in_at,
        checked_out: attendanceSession ? sessionCompleted : shift.checked_out,
        checked_out_at: attendanceSession?.ended_at || shift.checked_out_at,
        area_id: shift.area_id,
        area_name: relationName(shift.committee_areas),
        area_description: relationDescription(shift.committee_areas),
      };
    });
  }
}
