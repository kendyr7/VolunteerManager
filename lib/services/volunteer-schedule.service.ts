import 'server-only';

import { getAdminSupabase } from '@/lib/supabase/admin';
import type { VolunteerScheduleShift } from '@/lib/types/volunteer-schedule';
import { getShiftDisplayState } from '@/lib/shift-calculations';
import { buildEventDayKeys } from '@/lib/coordinator-data';

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

  static async getScheduleSnapshot(volunteerId: string): Promise<{ shifts: VolunteerScheduleShift[]; sessions: any[] }> {
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

    const allowedDayKeys = new Set(buildEventDayKeys());
    const shifts = (shiftsResult.data || []) as VolunteerScheduleRow[];
    const sessions = ((sessionsResult.data || []) as any[]).filter((s: any) => s.day_key && allowedDayKeys.has(s.day_key));

    return { sessions, shifts: shifts.map((shift) => {
      const display = getShiftDisplayState(shift.day_key, shift.shift_key, shift, sessions, shifts, volunteerId);
      return {
        id: shift.id,
        volunteer_id: shift.volunteer_id,
        day_key: shift.day_key,
        shift_key: shift.shift_key,
        checked_in: display.status === 'in_progress' || display.status === 'completed' || Boolean(display.endAt),
        checked_in_at: display.startAt,
        // The exit is a recorded fact even when a brief visit needs review and
        // does not earn completion credit. Keep the warning on that row.
        checked_out: display.status === 'completed' || Boolean(display.endAt),
        checked_out_at: display.endAt,
        attendance_flag: display.flag,
        area_id: shift.area_id,
        area_name: relationName(shift.committee_areas),
        area_description: relationDescription(shift.committee_areas),
      };
    }) };
  }

  static async getSchedule(volunteerId: string): Promise<VolunteerScheduleShift[]> {
    return (await this.getScheduleSnapshot(volunteerId)).shifts;
  }
}
