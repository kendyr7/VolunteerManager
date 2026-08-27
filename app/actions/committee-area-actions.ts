'use server';

import { revalidatePath } from 'next/cache';
import {
  AuthorizationError,
  requireAuthenticated,
  requireCapability,
} from '@/lib/authorization';
import { Capability, hasCapability } from '@/lib/role-permissions';
import {
  AreaRequirementInput,
  CommitteeAreaInput,
  CommitteeAreaService,
  MAX_SHIFT_AREA_ASSIGNMENTS,
  ShiftAreaRestoreInput,
} from '@/lib/services/committee-area.service';
import { CommitteeAreaQueryService } from '@/lib/services/committee-area-query.service';

function actorFrom(sessionUser: Awaited<ReturnType<typeof requireCapability>>) {
  return {
    id: sessionUser.userId!,
    name: sessionUser.name,
    role: sessionUser.role,
  };
}

function revalidateAreaManagement() {
  revalidatePath('/shifts');
  revalidatePath('/shifts/areas');
  revalidatePath('/areas');
}

async function requireAreaCapability(areaId: string, capability: Capability) {
  const sessionUser = await requireAuthenticated();
  const area = await CommitteeAreaService.getAreaScope(areaId);
  if (!area || !hasCapability(sessionUser, capability, area.committeeId)) {
    throw new AuthorizationError('El área no existe o no tienes permiso para administrarla.');
  }
  return { area, sessionUser };
}

export async function createCommitteeAreaAction(input: CommitteeAreaInput) {
  const sessionUser = await requireCapability('manage_committee_areas', input.committeeId);
  const result = await CommitteeAreaService.createArea(input, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function updateCommitteeAreaAction(
  areaId: string,
  input: Pick<CommitteeAreaInput, 'name' | 'description'>
) {
  const { sessionUser } = await requireAreaCapability(areaId, 'manage_committee_areas');
  const result = await CommitteeAreaService.updateArea(areaId, input, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function archiveCommitteeAreaAction(areaId: string) {
  const { sessionUser } = await requireAreaCapability(areaId, 'manage_committee_areas');
  const result = await CommitteeAreaService.archiveArea(areaId, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function restoreCommitteeAreaAction(areaId: string) {
  const { sessionUser } = await requireAreaCapability(areaId, 'manage_committee_areas');
  const result = await CommitteeAreaService.restoreArea(areaId, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function saveAreaRequirementsAction(areaId: string, requirements: AreaRequirementInput[]) {
  const { sessionUser } = await requireAreaCapability(areaId, 'manage_area_requirements');
  const result = await CommitteeAreaService.saveRequirements(areaId, requirements, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function assignVolunteerAreasAction(shiftIds: string[], areaId: string | null) {
  const sessionUser = await requireAuthenticated();
  const uniqueShiftIds = Array.from(new Set(shiftIds.filter(Boolean)));
  if (uniqueShiftIds.length === 0 || uniqueShiftIds.length > MAX_SHIFT_AREA_ASSIGNMENTS) {
    return {
      success: false,
      error: `Selecciona entre 1 y ${MAX_SHIFT_AREA_ASSIGNMENTS} turnos por operación.`,
    };
  }
  const scope = await CommitteeAreaService.getShiftAssignmentScope(uniqueShiftIds);
  if (!scope || !hasCapability(sessionUser, 'assign_volunteer_areas', scope.committeeId)) {
    throw new AuthorizationError('Las asignaciones no existen o no tienes permiso para administrarlas.');
  }
  const result = await CommitteeAreaService.assignShiftAreas(scope, areaId, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function restoreVolunteerAreasAction(assignments: ShiftAreaRestoreInput[]) {
  const sessionUser = await requireAuthenticated();
  if (!Array.isArray(assignments)) {
    return { success: false, error: 'La reversión no contiene asignaciones válidas.' };
  }
  const uniqueShiftIds = Array.from(new Set(assignments.map((assignment) => assignment.shiftId).filter(Boolean)));
  if (
    uniqueShiftIds.length === 0
    || uniqueShiftIds.length !== assignments.length
    || uniqueShiftIds.length > MAX_SHIFT_AREA_ASSIGNMENTS
  ) {
    return {
      success: false,
      error: `La reversión debe contener entre 1 y ${MAX_SHIFT_AREA_ASSIGNMENTS} turnos sin duplicados.`,
    };
  }

  const scope = await CommitteeAreaService.getShiftAssignmentScope(uniqueShiftIds);
  if (!scope || !hasCapability(sessionUser, 'assign_volunteer_areas', scope.committeeId)) {
    throw new AuthorizationError('Las asignaciones no existen o no tienes permiso para administrarlas.');
  }
  const result = await CommitteeAreaService.restoreShiftAreas(scope, assignments, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}

export async function getCommitteeAreaManagementDataAction(committeeSlugOrId?: string) {
  return await CommitteeAreaQueryService.getManagementData(committeeSlugOrId);
}
