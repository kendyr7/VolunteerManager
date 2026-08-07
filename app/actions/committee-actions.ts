'use server'

import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { getCurrentUserSession } from '@/lib/auth-helpers';
import { CommitteeMutationService, ShiftCapacities } from '@/lib/services/committee-mutation.service';

async function verifyAdminSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return false;

  const session = verifySessionToken(sessionCookie);
  if (!session || session.role !== 'Admin') return false;

  return true;
}

export async function createCommitteeAction(name: string) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden crear nuevos comités." };
  }

  const sessionUser = await getCurrentUserSession();
  const actor = {
    name: sessionUser.userName || 'Administrador',
    role: sessionUser.userRole || 'Admin',
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
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden archivar comités." };
  }

  const sessionUser = await getCurrentUserSession();
  const actor = {
    name: sessionUser.userName || 'Administrador',
    role: sessionUser.userRole || 'Admin',
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
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden desarchivar comités." };
  }

  const sessionUser = await getCurrentUserSession();
  const actor = {
    name: sessionUser.userName || 'Administrador',
    role: sessionUser.userRole || 'Admin',
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
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden modificar los requerimientos de comités." };
  }

  const sessionUser = await getCurrentUserSession();
  const actor = {
    name: sessionUser.userName || 'Administrador',
    role: sessionUser.userRole || 'Admin',
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

