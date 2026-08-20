'use server';

/**
 * volunteer-actions.ts — Server Actions for the `volunteers` domain.
 *
 * ARCHITECTURE CONTRACT:
 * ─────────────────────────────────────────────────────────────────────────────
 * These are the ONLY entry points for client components to mutate volunteers.
 *
 * RULES:
 * 1. Each action validates its input and resolves the authenticated actor from
 *    the server-side session cookie. The client NEVER sends actorName/actorRole.
 * 2. All business logic and DB writes are delegated to VolunteerMutationService.
 * 3. revalidatePath() is deliberately NOT called — Supabase Realtime propagates
 *    changes to Zustand in O(1) for views already connected to the store.
 *
 * PROHIBITED PATTERN — no component may ever do this:
 *   supabase.from('volunteers').update(...)
 *   supabase.from('volunteers').insert(...)
 *   supabase.from('volunteers').delete(...)
 *
 * All volunteer mutations must route through this file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requireCapability, requireVolunteerCapability } from '@/lib/authorization';
import { roleDisplayName } from '@/lib/role-permissions';
import { createActivityLog } from '@/app/actions/activity-actions';
import {
  VolunteerMutationService,
  UpdateProfilePayload,
  CreateVolunteerPayload,
  BulkImportItemPayload,
  UpdateVolunteerStatusRequest,
  MutationResult,
  CreateVolunteerResult,
  BulkImportResult,
  PendingImportException,
  ResolvePendingImportExceptionRequest,
  ResolvePendingImportExceptionResult,
  UpdateStatusResult,
} from '@/lib/services/volunteer-mutation.service';
import { isShiftAvailableForDay } from '@/lib/dates';

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Update volunteer profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates editable profile fields for a volunteer.
 * Returns { skipped: true } when no auditable field changed (no DB write).
 */
export async function updateVolunteerAction(
  volunteerId: string,
  payload: UpdateProfilePayload
): Promise<MutationResult> {
  if (!volunteerId) {
    return { success: false, error: 'volunteerId requerido.' };
  }

  // Resolve actor from session — NEVER from the client payload
  const session = await requireVolunteerCapability('edit_volunteer_personal_info', volunteerId);
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };

  return VolunteerMutationService.updateProfile(volunteerId, payload, actor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Create single volunteer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a single volunteer and registers an individual audit log (target_id = volunteer.id).
 */
export async function createVolunteerAction(
  payload: CreateVolunteerPayload
): Promise<CreateVolunteerResult> {
  if (!payload.firstName || !payload.phone) {
    return { success: false, error: 'Nombre y teléfono son requeridos.' };
  }

  const session = await requireCapability('create_volunteer');
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };

  return VolunteerMutationService.createVolunteer(payload, actor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2b: Bulk import volunteers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bulk imports volunteers and registers individual audit logs for each created volunteer.
 */
export async function bulkImportVolunteersAction(
  items: BulkImportItemPayload[]
): Promise<BulkImportResult> {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      importedCount: 0,
      skippedCount: 0,
      pendingReviewCount: 0,
      pendingReviewIds: [],
      importedVolunteers: [],
      error: 'La lista de importación está vacía.',
    };
  }

  const session = await requireCapability('import_volunteers');
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };

  return VolunteerMutationService.bulkImportVolunteers(items, actor, session.userId);
}

/**
 * Loads phone-conflict imports awaiting approval. This queue is intentionally
 * restricted to administrators even when Technology can import volunteers.
 */
export async function getPendingImportExceptionsAction(): Promise<{
  success: boolean;
  data: PendingImportException[];
  error?: string;
}> {
  try {
    await requireCapability('manage_platform_users');
    const data = await VolunteerMutationService.getPendingImportExceptions();
    return { success: true, data };
  } catch (error) {
    console.error('[getPendingImportExceptionsAction] Failed:', error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'No se pudieron cargar las aprobaciones pendientes.',
    };
  }
}

export async function resolvePendingImportExceptionAction(
  request: ResolvePendingImportExceptionRequest
): Promise<ResolvePendingImportExceptionResult> {
  if (!request.exceptionId) {
    return { success: false, error: 'La solicitud pendiente es requerida.' };
  }

  const session = await requireCapability('manage_platform_users');
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };
  return VolunteerMutationService.resolvePendingImportException(request, actor, session.userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Status transitions (Archive / Restore / Swap)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates volunteer status (and optionally phone), checking phone conflicts server-side.
 */
export async function updateVolunteerStatusAction(
  request: UpdateVolunteerStatusRequest
): Promise<UpdateStatusResult> {
  if (!request.volunteerId || !request.toStatus) {
    return { success: false, reason: 'error', error: 'Parametros requeridos incompletos.' };
  }

  const session = await requireCapability('archive_volunteer');
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };

  return VolunteerMutationService.updateStatus(request, actor);
}

/**
 * Swaps activation between an active volunteer and an archived volunteer.
 */
export async function swapVolunteerActivationAction(
  activeVolunteerId: string,
  targetVolunteerId: string
): Promise<MutationResult> {
  if (!activeVolunteerId || !targetVolunteerId) {
    return { success: false, error: 'Voluntarios requeridos incompletos.' };
  }

  const session = await requireCapability('archive_volunteer');
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };

  return VolunteerMutationService.swapVolunteerActivation(activeVolunteerId, targetVolunteerId, actor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: PIN Domain Mutations (Reset PIN)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets a volunteer's PIN to '1234' and registers an audit log (target_id = volunteer.id).
 */
export async function resetVolunteerPinAction(volunteerId: string): Promise<MutationResult> {
  if (!volunteerId) {
    return { success: false, error: 'volunteerId requerido.' };
  }

  const session = await requireVolunteerCapability('edit_volunteer_personal_info', volunteerId);
  const actor = {
    name: session.name,
    role: roleDisplayName(session),
  };

  return VolunteerMutationService.resetPin(volunteerId, actor);
}

/**
 * Toggles a shift assignment for a volunteer using Service Role key.
 */
export async function toggleShiftAction(
  volunteerId: string,
  dayKey: string,
  shiftKey: string,
  assign: boolean
): Promise<MutationResult> {
  if (!volunteerId || !dayKey || !shiftKey) {
    return { success: false, error: 'Parametros incompletos para turno.' };
  }
  if (assign && !isShiftAvailableForDay(dayKey, shiftKey)) {
    return { success: false, error: 'El 5 de septiembre solo permite el turno de simulación T1 (9:00 AM - 2:00 PM).' };
  }
  const session = await requireVolunteerCapability('reschedule_volunteer', volunteerId);
  const result = await VolunteerMutationService.toggleShift(volunteerId, dayKey, shiftKey, assign);
  if (!result.success) return result;

  const auditCreated = await createActivityLog({
    userName: session.name,
    userRole: roleDisplayName(session),
    actionType: 'Edición',
    description: `${assign ? 'Asignó' : 'Quitó'} el turno ${shiftKey} (${dayKey})`,
    details: JSON.stringify({
      context: `${assign ? 'Turno asignado' : 'Turno removido'}: ${dayKey} ${shiftKey}`,
      operation: assign ? 'assign_shift' : 'remove_shift',
      dayKey,
      shiftKey,
    }),
    targetId: volunteerId,
  });

  return auditCreated
    ? result
    : { success: false, error: 'El turno cambió, pero no se pudo registrar la auditoría.' };
}

/**
 * Saves all shift assignments for a volunteer using Service Role key.
 */
export async function saveShiftsAction(
  volunteerId: string,
  shiftsByDay: Record<string, string[]>
): Promise<MutationResult> {
  if (!volunteerId) {
    return { success: false, error: 'volunteerId requerido.' };
  }
  const hasInvalidShift = Object.entries(shiftsByDay).some(([dayKey, shiftKeys]) =>
    shiftKeys.some(shiftKey => !isShiftAvailableForDay(dayKey, shiftKey))
  );
  if (hasInvalidShift) {
    return { success: false, error: 'La jornada del 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).' };
  }
  const session = await requireVolunteerCapability('reschedule_volunteer', volunteerId);
  const result = await VolunteerMutationService.saveShifts(volunteerId, shiftsByDay);
  if (!result.success) return result;

  const assignedShifts = Object.entries(shiftsByDay).flatMap(([dayKey, shiftKeys]) =>
    shiftKeys.map(shiftKey => ({ dayKey, shiftKey }))
  );
  const auditCreated = await createActivityLog({
    userName: session.name,
    userRole: roleDisplayName(session),
    actionType: 'Edición',
    description: 'Actualizó los turnos programados del voluntario',
    details: JSON.stringify({
      context: `${assignedShifts.length} turno(s) programado(s)`,
      operation: 'replace_scheduled_shifts',
      assignedShifts,
    }),
    targetId: volunteerId,
  });

  return auditCreated
    ? result
    : { success: false, error: 'Los turnos cambiaron, pero no se pudo registrar la auditoría.' };
}
