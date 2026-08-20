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
} from '@/lib/services/committee-area.service';

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
  const scope = await CommitteeAreaService.getShiftAssignmentScope(shiftIds);
  if (!scope || !hasCapability(sessionUser, 'assign_volunteer_areas', scope.committeeId)) {
    throw new AuthorizationError('Las asignaciones no existen o no tienes permiso para administrarlas.');
  }
  const result = await CommitteeAreaService.assignShiftAreas(scope, areaId, actorFrom(sessionUser));
  if (result.success) revalidateAreaManagement();
  return result;
}
