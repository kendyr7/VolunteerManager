import type { SupabaseClient } from '@supabase/supabase-js';
import { getAvailableShiftKeys } from '@/lib/dates';

export type CoverageLevel = 'unconfigured' | 'deficit' | 'at_requirement' | 'covered';

export interface CoverageAssignment {
  volunteerId: string;
  dayKey: string;
  shiftKey: string;
  checkedOut: boolean;
}

export interface CoverageSlot {
  dayKey: string;
  shiftKey: string;
  count: number;
  required: number;
}

export interface CommitteeCoverageSnapshot {
  assignments: CoverageAssignment[];
  slots: CoverageSlot[];
}

interface RequirementRow {
  shift_key: string;
  required: number | null;
}

interface AssignmentRow {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  checked_out?: boolean | null;
  checked_out_at?: string | null;
}

export interface ShiftChangeImpactSlot extends CoverageSlot {
  projectedCount: number;
  level: CoverageLevel;
  role: 'source' | 'target' | 'both' | null;
}

export interface ShiftChangeImpactDay {
  dayKey: string;
  slots: ShiftChangeImpactSlot[];
}

export interface ShiftChangeCoverageImpact {
  requestId: string;
  volunteerName: string;
  committeeName: string;
  status: string;
  canApprove: boolean;
  targetFull: boolean;
  sourceWouldBeUnderstaffed: boolean;
  recommendation: 'blocked' | 'warning' | 'safe';
  message: string;
  days: ShiftChangeImpactDay[];
}

export function getCoverageLevel(count: number, required: number): CoverageLevel {
  if (required <= 0) return 'unconfigured';
  if (count < required) return 'deficit';
  if (count === required) return 'at_requirement';
  return 'covered';
}

export function isCoverageComplete(slot: CoverageSlot | undefined): boolean {
  return Boolean(slot && slot.required > 0 && slot.count >= slot.required);
}

export async function getCommitteeCoverageSnapshot(
  supabase: SupabaseClient,
  committeeId: string,
  requestedDayKeys: string[]
): Promise<CommitteeCoverageSnapshot> {
  const dayKeys = [...new Set(requestedDayKeys.filter(Boolean))];
  if (dayKeys.length === 0) return { assignments: [], slots: [] };

  const [requirementsResult, assignmentsResult] = await Promise.all([
    supabase
      .from('committee_shift_requirements')
      .select('shift_key, required')
      .eq('committee_id', committeeId),
    supabase
      .from('shifts')
      .select('volunteer_id, day_key, shift_key, checked_out, checked_out_at, volunteers!inner(committee_id, status)')
      .eq('volunteers.committee_id', committeeId)
      .or('status.is.null,status.neq.archived', { referencedTable: 'volunteers' })
      .in('day_key', dayKeys),
  ]);

  if (requirementsResult.error) {
    throw new Error(`No se pudo consultar la cobertura requerida: ${requirementsResult.error.message}`);
  }
  if (assignmentsResult.error) {
    throw new Error(`No se pudieron consultar las asignaciones actuales: ${assignmentsResult.error.message}`);
  }

  const requirements = new Map<string, number>();
  ((requirementsResult.data || []) as RequirementRow[]).forEach(row => {
    requirements.set(row.shift_key, Number(row.required) || 0);
  });

  const assignments = ((assignmentsResult.data || []) as AssignmentRow[]).map(row => ({
    volunteerId: row.volunteer_id,
    dayKey: row.day_key,
    shiftKey: row.shift_key,
    checkedOut: Boolean(row.checked_out || row.checked_out_at),
  }));

  const counts = new Map<string, number>();
  assignments.forEach(assignment => {
    const key = `${assignment.dayKey}:${assignment.shiftKey}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const slots = dayKeys.flatMap(dayKey =>
    getAvailableShiftKeys(dayKey).map(shiftKey => ({
      dayKey,
      shiftKey,
      count: counts.get(`${dayKey}:${shiftKey}`) || 0,
      required: requirements.get(shiftKey) || 0,
    }))
  );

  return { assignments, slots };
}
