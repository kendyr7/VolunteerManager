'use server'

import { requireCapability } from '@/lib/authorization';
import { CommitteeMutationService, ShiftCapacities } from '@/lib/services/committee-mutation.service';

export async function createCommitteeAction(name: string) {
  const sessionUser = await requireCapability('manage_committees');
  const actor = {
    name: sessionUser.name,
    role: sessionUser.role,
  };

  const res = await CommitteeMutationService.createCommittee(name, actor);
  if (!res.success) {
    return { error: res.error };
  }
  return { success: true, committee: res.committee };
}

export async function archiveCommitteeAction(
  committeeId: string,
  expectedName: string,
  inputName: string,
  deleteText: string
) {
  const sessionUser = await requireCapability('manage_committees');
  const actor = {
    name: sessionUser.name,
    role: sessionUser.role,
  };

  const res = await CommitteeMutationService.archiveCommittee(
    committeeId,
    expectedName,
    inputName,
    deleteText,
    actor
  );

  if (!res.success) {
    return { error: res.error };
  }
  return { success: true };
}

export async function unarchiveCommitteeAction(committeeId: string) {
  const sessionUser = await requireCapability('manage_committees');
  const actor = {
    name: sessionUser.name,
    role: sessionUser.role,
  };

  const res = await CommitteeMutationService.unarchiveCommittee(committeeId, actor);
  if (!res.success) {
    return { error: res.error };
  }
  return { success: true };
}

export async function updateCommitteeRequirementsAction(
  selectedCommitteeNames: string[],
  capacities: ShiftCapacities
) {
  const sessionUser = await requireCapability('manage_committees');
  const actor = {
    name: sessionUser.name,
    role: sessionUser.role,
  };

  const res = await CommitteeMutationService.updateShiftRequirements(
    selectedCommitteeNames,
    capacities,
    actor
  );

  if (!res.success) {
    return { error: res.error };
  }
  return { success: true };
}
