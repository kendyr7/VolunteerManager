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

import { getCurrentUserSession } from '@/lib/auth-helpers';
import {
  VolunteerMutationService,
  UpdateProfilePayload,
  CreateVolunteerPayload,
  BulkImportItemPayload,
  UpdateVolunteerStatusRequest,
  MutationResult,
  CreateVolunteerResult,
  BulkImportResult,
  UpdateStatusResult,
} from '@/lib/services/volunteer-mutation.service';

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
  const session = await getCurrentUserSession();
  const actor = {
    name: session.userName || 'Administrador',
    role: session.userRole || 'Admin',
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

  const session = await getCurrentUserSession();
  const actor = {
    name: session.userName || 'Administrador',
    role: session.userRole || 'Admin',
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
      importedVolunteers: [],
      error: 'La lista de importación está vacía.',
    };
  }

  const session = await getCurrentUserSession();
  const actor = {
    name: session.userName || 'Administrador',
    role: session.userRole || 'Admin',
  };

  return VolunteerMutationService.bulkImportVolunteers(items, actor);
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

  const session = await getCurrentUserSession();
  const actor = {
    name: session.userName || 'Administrador',
    role: session.userRole || 'Admin',
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

  const session = await getCurrentUserSession();
  const actor = {
    name: session.userName || 'Administrador',
    role: session.userRole || 'Admin',
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

  const session = await getCurrentUserSession();
  const actor = {
    name: session.userName || 'Administrador',
    role: session.userRole || 'Admin',
  };

  return VolunteerMutationService.resetPin(volunteerId, actor);
}



