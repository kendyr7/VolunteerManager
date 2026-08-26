/**
 * VolunteerMutationService
 *
 * The SINGLE orchestrator for all mutations on the `volunteers` table.
 * No React component or other service should write to `volunteers` directly.
 *
 * ARCHITECTURE CONTRACT:
 * - Reads previous volunteer state from DB before applying changes.
 * - Delegates diff computation to VolunteerDiffBuilder.
 * - Executes the DB mutation using the admin Supabase client.
 * - Delegates audit-log writing to VolunteerAuditWriter (never throws).
 * - Does NOT call revalidatePath(); Supabase Realtime propagates updates
 *   to the Zustand store in O(1) without a server round-trip.
 *
 * CONSISTENCY POLICY:
 * If the DB mutation succeeds but the audit log INSERT fails, the volunteer
 * record is NOT reverted. The audit failure is logged for investigation.
 *
 * ADDING NEW OPERATIONS:
 * Add methods to this class (e.g., createVolunteer, updateStatus, resetPin).
 * Do NOT add mutation logic elsewhere.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { VolunteerDiffBuilder, VolunteerRow } from './volunteer-diff-builder';
import { VolunteerAuditWriter, AuditActor, WriteEditAuditPayload } from './volunteer-audit-writer';
import { getLocal8Digits, normalizePhoneE164 } from '@/lib/whatsapp';
import {
  findPotentialVolunteerNameMatches,
  VolunteerNameCandidate,
} from '@/lib/volunteer-name-matching';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';
import { broadcastShiftSync } from './shift-broadcast.service';
import {
  findPendingShiftChangeTargetConflict,
  pendingShiftConflictMessage,
} from './shift-change-request.service';

export interface UpdateProfilePayload {
  firstName: string;
  lastName: string;
  phone: string;
  stake?: string | null;
  neighborhood?: string | null;
  committeeId?: string | null;
  age?: number | null;
  allowSharedPhone?: boolean;
}

export interface CreateVolunteerPayload {
  firstName: string;
  lastName: string;
  phone: string;
  stake?: string | null;
  neighborhood?: string | null;
  committeeId?: string | null;
  age?: number | null;
  pin?: string | null;
  allowSharedPhone?: boolean;
}

export interface PhoneConflictVolunteer {
  id: string;
  name: string;
}

export interface BulkImportItemPayload {
  firstName: string;
  lastName: string;
  phone: string;
  stake?: string | null;
  neighborhood?: string | null;
  committeeId?: string | null;
  committeeName?: string;
  age?: number | null;
  pin?: string | null;
  sourceRow?: number | null;
  sendWelcomeMessage?: boolean;
}

export interface MutationResult {
  success: boolean;
  skipped?: boolean;  // true when diff was empty — no update, no audit
  error?: string;
  reason?: 'phone_conflict' | 'not_found' | 'error';
  conflictingVolunteers?: PhoneConflictVolunteer[];
}

export interface UpdateVolunteerStatusRequest {
  volunteerId: string;
  toStatus: 'active' | 'archived';
  newPhone?: string | null;
}

export interface UpdateStatusResult extends MutationResult {
  conflictingVolunteer?: {
    id: string;
    name: string;
    phone: string;
    stake: string;
    ward: string;
    committee: string;
  };
}

export interface CreateVolunteerResult extends MutationResult {
  volunteer?: {
    id: string;
    pin: string;
  };
}

export interface BulkImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  pendingReviewCount: number;
  pendingReviewIds: string[];
  importedVolunteers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    pin: string;
    committeeName?: string;
  }>;
  error?: string;
}

export interface PendingImportPhoneCandidate {
  id: string;
  name: string;
  phone: string;
  committeeName: string;
  isSharedPhone: boolean;
  sharedPhoneOwnerId: string | null;
  matchScore?: number;
}

export interface PendingImportException {
  id: string;
  sourceRow: number | null;
  firstName: string;
  lastName: string;
  phone: string;
  phoneNormalized: string;
  age: number | null;
  neighborhood: string | null;
  stake: string | null;
  committeeId: string | null;
  committeeName: string;
  submittedByName: string;
  submittedByRole: string;
  submittedAt: string;
  sendWelcomeMessage: boolean;
  conflictType: 'phone_conflict' | 'name_match';
  candidates: PendingImportPhoneCandidate[];
}

export type ResolvePendingImportExceptionRequest =
  | {
      exceptionId: string;
      resolution: 'shared_phone';
      ownerVolunteerId: string;
      reason: string;
    }
  | {
      exceptionId: string;
      resolution: 'corrected_phone';
      correctedPhone: string;
    }
  | {
      exceptionId: string;
      resolution: 'confirmed_distinct_person';
    }
  | {
      exceptionId: string;
      resolution: 'rejected';
      reason: string;
    };

export interface ResolvePendingImportExceptionResult extends MutationResult {
  createdVolunteer?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    pin: string;
    sendWelcomeMessage: boolean;
  };
}

export class VolunteerMutationService {
  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private static async resolveCommitteeName(
    supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
    committeeId: string | null
  ): Promise<string | null> {
    if (!committeeId) return null;
    const { data } = await supabase
      .from('committees')
      .select('name')
      .eq('id', committeeId)
      .maybeSingle();
    return data?.name ?? null;
  }

  private static async findActivePhoneConflict(
    supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
    phoneInput: string,
    excludeVolunteerId?: string
  ): Promise<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    stake: string;
    neighborhood: string;
    committee_id: string | null;
  } | null> {
    const matches = await this.findActivePhoneConflicts(supabase, phoneInput, excludeVolunteerId);
    return matches[0] || null;
  }

  private static async findActivePhoneConflicts(
    supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
    phoneInput: string,
    excludeVolunteerId?: string
  ): Promise<Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    stake: string;
    neighborhood: string;
    committee_id: string | null;
    is_shared_phone: boolean;
    shared_phone_owner_id: string | null;
  }>> {
    if (!phoneInput) return [];
    const local8 = getLocal8Digits(phoneInput);
    if (!local8 || local8.length !== 8) return [];

    const targetVariants = Array.from(new Set([
      phoneInput.trim(),
      `+505${local8}`,
      `505${local8}`,
      local8
    ])).filter(Boolean);

    let query = supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, stake, neighborhood, committee_id, is_shared_phone, shared_phone_owner_id')
      .in('phone', targetVariants)
      .neq('status', 'archived');

    if (excludeVolunteerId) {
      query = query.neq('id', excludeVolunteerId);
    }

    const { data: matches } = await query;
    if (!matches || matches.length === 0) return [];

    return matches.filter(v => {
      if (excludeVolunteerId && v.id === excludeVolunteerId) return false;
      return getLocal8Digits(v.phone) === local8;
    });
  }

  private static async queueImportException(
    supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
    item: BulkImportItemPayload,
    conflictVolunteerId: string,
    conflictType: 'phone_conflict' | 'name_match',
    actor: AuditActor,
    actorUserId: string | null,
    batchId: string
  ): Promise<{ id: string | null; error?: string }> {
    const phoneNormalized = normalizePhoneE164(item.phone);
    if (!phoneNormalized) {
      return { id: null, error: 'El número telefónico no es válido.' };
    }

    const row = {
      batch_id: batchId,
      source_row: item.sourceRow ?? null,
      first_name: item.firstName.trim(),
      last_name: item.lastName.trim(),
      phone: phoneNormalized,
      phone_normalized: phoneNormalized,
      age: item.age ?? null,
      neighborhood: item.neighborhood ?? null,
      stake: item.stake ?? null,
      committee_id: item.committeeId ?? null,
      conflicting_volunteer_id: conflictVolunteerId,
      conflict_type: conflictType,
      send_welcome_message: item.sendWelcomeMessage === true,
      submitted_by_user_id: actorUserId,
      submitted_by_name: actor.name,
      submitted_by_role: actor.role,
    };

    const { data, error } = await supabase
      .from('volunteer_import_exceptions')
      .insert(row)
      .select('id')
      .single();

    if (!error && data?.id) return { id: data.id };

    // A repeated click or a retried batch can encounter the partial unique
    // index. Reuse the existing pending item instead of creating a duplicate.
    if (error?.code === '23505') {
      let existingQuery = supabase
        .from('volunteer_import_exceptions')
        .select('id')
        .eq('status', 'pending')
        .eq('phone_normalized', phoneNormalized)
        .ilike('first_name', item.firstName.trim())
        .ilike('last_name', item.lastName.trim());
      existingQuery = item.committeeId
        ? existingQuery.eq('committee_id', item.committeeId)
        : existingQuery.is('committee_id', null);
      const { data: existing } = await existingQuery.maybeSingle();
      if (existing?.id) return { id: existing.id };
    }

    console.error('[VolunteerMutationService.queueImportException] Failed to queue exception:', error);
    return {
      id: null,
      error: error?.message || 'No se pudo enviar el número compartido a revisión.',
    };
  }

  private static async persistVolunteer(
    supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
    payload: CreateVolunteerPayload,
    sharedPhone?: { ownerId: string; reason: string; authorizedBy: string }
  ): Promise<{ data: any | null; error: any | null }> {
    const pin = payload.pin || String(Math.floor(1000 + Math.random() * 9000));
    const phoneNormalized = normalizePhoneE164(payload.phone);
    const { data, error } = await supabase
      .from('volunteers')
      .insert({
        first_name:   payload.firstName,
        last_name:    payload.lastName,
        phone:        phoneNormalized || payload.phone,
        phone_normalized: phoneNormalized,
        stake:        payload.stake ?? null,
        neighborhood: payload.neighborhood ?? null,
        committee_id: payload.committeeId ?? null,
        age:          payload.age ?? null,
        pin,
        status:       'active',
        is_shared_phone: Boolean(sharedPhone),
        shared_phone_owner_id: sharedPhone?.ownerId ?? null,
        shared_phone_reason: sharedPhone?.reason ?? null,
        shared_phone_authorized_by: sharedPhone?.authorizedBy ?? null,
        shared_phone_authorized_at: sharedPhone ? new Date().toISOString() : null,
      })
      .select()
      .single();

    return { data, error };
  }

  // ---------------------------------------------------------------------------
  // Step 1: Update volunteer profile fields
  // ---------------------------------------------------------------------------

  /**
   * Updates editable profile fields for an existing volunteer.
   * Returns { skipped: true } when no auditable fields changed — no DB write
   * is performed, keeping both the volunteers table and activity_logs clean.
   */
  static async updateProfile(
    volunteerId: string,
    payload: UpdateProfilePayload,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      const supabase = await getAdminSupabase();

      // 1. Read the current state from DB
      const { data: previous, error: fetchError } = await supabase
        .from('volunteers')
        .select('first_name, last_name, phone, stake, neighborhood, committee_id, age, is_shared_phone, shared_phone_owner_id, shared_phone_reason, shared_phone_authorized_by, shared_phone_authorized_at')
        .eq('id', volunteerId)
        .maybeSingle();

      if (fetchError || !previous) {
        console.error('[VolunteerMutationService.updateProfile] Failed to fetch previous state:', fetchError);
        return { success: false, error: 'No se encontró el voluntario.' };
      }

      // 2. Validate phone format & canonical conflict if phone changed
      const normPhone = normalizePhoneE164(payload.phone);
      if (!normPhone) {
        return { success: false, error: 'El número de teléfono debe tener exactamente 8 dígitos.' };
      }

      const phoneChanged = getLocal8Digits(previous.phone) !== getLocal8Digits(payload.phone);
      let sharedPhoneUpdate: Record<string, unknown> = {};
      if (phoneChanged) {
        const conflicts = await this.findActivePhoneConflicts(supabase, payload.phone, volunteerId);
        if (conflicts.length > 0 && !payload.allowSharedPhone) {
          return {
            success: false,
            reason: 'phone_conflict',
            error: 'Este número de teléfono ya está compartido por otros voluntarios activos.',
            conflictingVolunteers: conflicts.map(conflict => ({
              id: conflict.id,
              name: `${conflict.first_name || ''} ${conflict.last_name || ''}`.trim(),
            })),
          };
        }

        if (conflicts.length > 0) {
          if (actor.role !== 'Administrador') {
            return { success: false, error: 'Solo un administrador puede autorizar un número compartido.' };
          }
          const owner = conflicts.find(conflict => !conflict.is_shared_phone);
          if (!owner) {
            return { success: false, error: 'No se encontró un titular activo para este número compartido.' };
          }
          sharedPhoneUpdate = {
            is_shared_phone: true,
            shared_phone_owner_id: owner.id,
            shared_phone_reason: 'Número compartido confirmado al editar el perfil',
            shared_phone_authorized_by: actor.name,
            shared_phone_authorized_at: new Date().toISOString(),
          };
        } else {
          sharedPhoneUpdate = {
            is_shared_phone: false,
            shared_phone_owner_id: null,
            shared_phone_reason: null,
            shared_phone_authorized_by: null,
            shared_phone_authorized_at: null,
          };
        }
      }

      // 3. Build the incoming row in the same shape as the DB record
      const incoming: VolunteerRow = {
        first_name:   payload.firstName,
        last_name:    payload.lastName,
        phone:        normPhone,
        stake:        payload.stake ?? null,
        neighborhood: payload.neighborhood ?? null,
        committee_id: payload.committeeId ?? null,
        age:          payload.age ?? null,
      };

      // 4. Resolve committee names for human-readable diffs
      const committeeNameResolver = async (id: string | null) =>
        this.resolveCommitteeName(supabase, id);

      const changes = await VolunteerDiffBuilder.compute(previous, incoming, committeeNameResolver);

      // 5. Early exit: nothing changed — do NOT write to DB or audit log
      if (changes.length === 0) {
        return { success: true, skipped: true };
      }

      const traceId = realtimeDebugLogger.generateTraceId();
      const startTime = performance.now();

      realtimeDebugLogger.addLog({
        traceId,
        stage: 'MUTATION_START',
        table: 'volunteers',
        eventType: 'UPDATE',
        volunteerId,
        volunteerName: `${payload.firstName} ${payload.lastName}`.trim(),
        details: `MUTATION START: updating neighborhood -> "${payload.neighborhood || ''}"`,
        payload: { firstName: payload.firstName, neighborhood: payload.neighborhood },
        oldValue: previous?.neighborhood,
        newValue: payload.neighborhood,
      });

      console.log('[MUTATION SERVICE][updateProfile] Payload:', {
        volunteerId,
        firstName: payload.firstName,
        neighborhood: payload.neighborhood,
        committeeId: payload.committeeId,
      });

      // 6. Apply the DB mutation
      const { data: updatedRecord, error: updateError } = await supabase
        .from('volunteers')
        .update({
          first_name:   payload.firstName,
          last_name:    payload.lastName,
          phone:        normPhone,
          stake:        payload.stake ?? null,
          neighborhood: payload.neighborhood ?? null,
          committee_id: payload.committeeId ?? null,
          age:          payload.age ?? null,
          ...sharedPhoneUpdate,
        })
        .eq('id', volunteerId)
        .select('*')
        .single();

      const latencyMs = Math.round(performance.now() - startTime);

      console.log('[MUTATION SERVICE][updateProfile] DB Result:', {
        error: updateError,
        returnedNeighborhood: updatedRecord?.neighborhood,
        updated_at: updatedRecord?.updated_at,
      });

      if (updateError) {
        console.error('[VolunteerMutationService.updateProfile] DB update failed:', updateError);
        realtimeDebugLogger.addLog({
          traceId,
          stage: 'DB_ERROR',
          table: 'volunteers',
          volunteerId,
          details: `DATABASE UPDATE FAILED: ${updateError.message}`,
        });
        return { success: false, error: updateError.message };
      }

      realtimeDebugLogger.addLog({
        traceId,
        stage: 'DB_SUCCESS',
        table: 'volunteers',
        volunteerId,
        volunteerName: `${payload.firstName} ${payload.lastName}`.trim(),
        details: `DATABASE UPDATE SUCCESS in ${latencyMs}ms (updated_at: ${updatedRecord?.updated_at})`,
        latencyMs: { db: latencyMs, total: latencyMs },
      });

      // 7. Write audit log (non-blocking — never reverts the mutation on failure)
      await VolunteerAuditWriter.write({
        actionType:  'Edición',
        volunteerId,
        description: 'Actualizó perfil',
        actor,
        changes,
      });

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.updateProfile] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al actualizar el voluntario.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: Single volunteer creation
  // ---------------------------------------------------------------------------

  /**
   * Creates a single volunteer record and writes an audit log with target_id = volunteer.id.
   */
  static async createVolunteer(
    payload: CreateVolunteerPayload,
    actor: AuditActor
  ): Promise<CreateVolunteerResult> {
    try {
      const supabase = await getAdminSupabase();

      // 1. Validate phone format
      const normPhone = normalizePhoneE164(payload.phone);
      if (!normPhone) {
        return {
          success: false,
          error: 'El número de teléfono debe tener exactamente 8 dígitos.',
        };
      }

      // 2. Canonical conflict check against active volunteers
      const conflicts = await this.findActivePhoneConflicts(supabase, payload.phone);

      if (conflicts.length > 0 && !payload.allowSharedPhone) {
        return {
          success: false,
          reason: 'phone_conflict',
          error: 'Este número de teléfono ya está compartido por otros voluntarios activos.',
          conflictingVolunteers: conflicts.map(conflict => ({
            id: conflict.id,
            name: `${conflict.first_name || ''} ${conflict.last_name || ''}`.trim(),
          })),
        };
      }

      let sharedPhone: { ownerId: string; reason: string; authorizedBy: string } | undefined;
      if (conflicts.length > 0) {
        if (actor.role !== 'Administrador') {
          return { success: false, error: 'Solo un administrador puede autorizar un número compartido.' };
        }
        const owner = conflicts.find(conflict => !conflict.is_shared_phone);
        if (!owner) {
          return { success: false, error: 'No se encontró un titular activo para este número compartido.' };
        }
        sharedPhone = {
          ownerId: owner.id,
          reason: 'Número compartido confirmado al crear el voluntario',
          authorizedBy: actor.name,
        };
      }

      const { data: inserted, error: insertError } = await this.persistVolunteer(supabase, payload, sharedPhone);

      if (insertError || !inserted) {
        console.error('[VolunteerMutationService.createVolunteer] DB insert failed:', insertError);
        return { success: false, error: insertError?.message || 'Error al crear voluntario.' };
      }

      const committeeName = await this.resolveCommitteeName(supabase, inserted.committee_id);

      // Audit log entry with target_id set to the new volunteer's ID
      await VolunteerAuditWriter.write({
        actionType:  'Creación',
        volunteerId: inserted.id,
        description: `Creó al voluntario "${inserted.first_name} ${inserted.last_name || ''}"`.trim(),
        actor,
        context: {
          phone: inserted.phone,
          committee: committeeName || 'Sin comité',
          age: inserted.age,
          sharedPhoneOwnerId: sharedPhone?.ownerId ?? null,
        },
      });

      return {
        success: true,
        volunteer: {
          id: inserted.id,
          pin: inserted.pin,
        },
      };
    } catch (err) {
      console.error('[VolunteerMutationService.createVolunteer] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al crear voluntario.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2b: Bulk volunteer import
  // ---------------------------------------------------------------------------

  /**
   * Executes bulk volunteer import, creating each volunteer and generating
   * individual audit log entries (each with its own target_id = volunteer.id).
   */
  static async bulkImportVolunteers(
    items: BulkImportItemPayload[],
    actor: AuditActor,
    actorUserId: string | null = null
  ): Promise<BulkImportResult> {
    try {
      const supabase = await getAdminSupabase();
      const importedVolunteers: BulkImportResult['importedVolunteers'] = [];
      const auditPayloads: any[] = [];
      let skippedCount = 0;
      const pendingReviewIds: string[] = [];
      const batchId = crypto.randomUUID();

      const { data: activeVolunteerRows, error: activeVolunteerError } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone, committee_id')
        .neq('status', 'archived');
      if (activeVolunteerError) {
        return {
          success: false,
          importedCount: 0,
          skippedCount: items.length,
          pendingReviewCount: 0,
          pendingReviewIds: [],
          importedVolunteers: [],
          error: `No se pudieron validar posibles duplicados: ${activeVolunteerError.message}`,
        };
      }

      const nameCandidates: VolunteerNameCandidate[] = (activeVolunteerRows || []).map(volunteer => ({
        id: volunteer.id,
        name: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim(),
        phone: volunteer.phone || '',
        committeeId: volunteer.committee_id || null,
      }));

      for (const item of items) {
        const norm = normalizePhoneE164(item.phone);
        const local8 = getLocal8Digits(item.phone);

        if (!norm || !local8 || local8.length !== 8) {
          console.error(`[VolunteerMutationService.bulkImportVolunteers] Invalid phone format for ${item.firstName}: ${item.phone}`);
          skippedCount++;
          continue;
        }

        // A previous row in this batch has already been inserted by the time
        // this query runs, so both database and intra-file conflicts follow
        // the same persistent approval flow.
        const dbConflict = await this.findActivePhoneConflict(supabase, item.phone);
        if (dbConflict) {
          const queued = await this.queueImportException(
            supabase,
            item,
            dbConflict.id,
            'phone_conflict',
            actor,
            actorUserId,
            batchId
          );
          if (queued.id) {
            if (!pendingReviewIds.includes(queued.id)) pendingReviewIds.push(queued.id);
          } else {
            console.error(`[VolunteerMutationService.bulkImportVolunteers] Could not queue phone conflict for ${item.firstName}:`, queued.error);
            skippedCount++;
          }
          continue;
        }

        const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim();
        const possibleNameMatch = findPotentialVolunteerNameMatches(fullName, nameCandidates, 1)[0];
        if (possibleNameMatch) {
          const queued = await this.queueImportException(
            supabase,
            item,
            possibleNameMatch.id,
            'name_match',
            actor,
            actorUserId,
            batchId
          );
          if (queued.id) {
            if (!pendingReviewIds.includes(queued.id)) pendingReviewIds.push(queued.id);
          } else {
            console.error(`[VolunteerMutationService.bulkImportVolunteers] Could not queue possible name duplicate for ${item.firstName}:`, queued.error);
            skippedCount++;
          }
          continue;
        }

        const { data: inserted, error } = await this.persistVolunteer(supabase, item);

        if (error || !inserted) {
          console.error(`[VolunteerMutationService.bulkImportVolunteers] Failed to import ${item.firstName}:`, error);
          skippedCount++;
          continue;
        }

        const commName = item.committeeName || (await this.resolveCommitteeName(supabase, inserted.committee_id));

        importedVolunteers.push({
          id: inserted.id,
          firstName: inserted.first_name,
          lastName: inserted.last_name || '',
          phone: inserted.phone,
          pin: inserted.pin,
          committeeName: commName || undefined,
        });

        nameCandidates.push({
          id: inserted.id,
          name: `${inserted.first_name || ''} ${inserted.last_name || ''}`.trim(),
          phone: inserted.phone || '',
          committeeId: inserted.committee_id || null,
        });

        // Individual audit log payload for each imported volunteer
        auditPayloads.push({
          actionType:  'Creación',
          volunteerId: inserted.id,
          description: `Importó al voluntario "${inserted.first_name} ${inserted.last_name || ''}"`.trim(),
          actor,
          context: {
            phone: inserted.phone,
            committee: commName || 'Sin comité',
            source: 'Importación Masiva',
          },
        });
      }

      // Write all individual audit logs in a single call
      if (auditPayloads.length > 0) {
        await VolunteerAuditWriter.write(auditPayloads);

        // One global summary keeps the batch visible in Settings without
        // replacing the individual target_id entries used by each profile.
        const { error: summaryError } = await supabase.from('activity_logs').insert({
          user_name: actor.name,
          user_role: actor.role,
          action_type: 'Creación',
          description: `Importó masivamente ${importedVolunteers.length} voluntario(s)`,
          details: JSON.stringify({
            type: 'import_batch_summary',
            totalCount: importedVolunteers.length,
            importedBy: actor.name,
            volunteerIds: importedVolunteers.map(volunteer => volunteer.id),
          }),
          target_id: null,
        });
        if (summaryError) {
          console.error('[VolunteerMutationService.bulkImportVolunteers] Failed to write batch audit summary:', summaryError);
        }
      }

      return {
        success: true,
        importedCount: importedVolunteers.length,
        skippedCount,
        pendingReviewCount: pendingReviewIds.length,
        pendingReviewIds,
        importedVolunteers,
      };
    } catch (err) {
      console.error('[VolunteerMutationService.bulkImportVolunteers] Unexpected exception:', err);
      return {
        success: false,
        importedCount: 0,
        skippedCount: items.length,
        pendingReviewCount: 0,
        pendingReviewIds: [],
        importedVolunteers: [],
        error: 'Error inesperado durante la importación masiva.',
      };
    }
  }

  static async getPendingImportExceptions(): Promise<PendingImportException[]> {
    const supabase = await getAdminSupabase();
    const { data: exceptions, error } = await supabase
      .from('volunteer_import_exceptions')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('[VolunteerMutationService.getPendingImportExceptions] Failed to load queue:', error);
      throw new Error(error.message);
    }
    if (!exceptions?.length) return [];

    const [{ data: volunteers }, { data: committees }] = await Promise.all([
      supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone, committee_id, is_shared_phone, shared_phone_owner_id')
        .neq('status', 'archived'),
      supabase.from('committees').select('id, name'),
    ]);

    const committeeNames = new Map((committees || []).map(row => [row.id, row.name || 'Sin comité']));
    const candidatesByPhone = new Map<string, PendingImportPhoneCandidate[]>();
    const candidatesById = new Map<string, PendingImportPhoneCandidate>();
    const nameCandidates: VolunteerNameCandidate[] = [];

    for (const volunteer of volunteers || []) {
      const local8 = getLocal8Digits(volunteer.phone || '');
      if (!local8 || local8.length !== 8) continue;
      const list = candidatesByPhone.get(local8) || [];
      const candidate = {
        id: volunteer.id,
        name: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim(),
        phone: volunteer.phone || '',
        committeeName: committeeNames.get(volunteer.committee_id) || 'Sin comité',
        isSharedPhone: volunteer.is_shared_phone === true,
        sharedPhoneOwnerId: volunteer.shared_phone_owner_id || null,
      };
      list.push(candidate);
      candidatesByPhone.set(local8, list);
      candidatesById.set(volunteer.id, candidate);
      nameCandidates.push({
        id: volunteer.id,
        name: candidate.name,
        phone: candidate.phone,
        committeeId: volunteer.committee_id || null,
      });
    }

    return exceptions.map(row => {
      const conflictType = row.conflict_type === 'name_match' ? 'name_match' : 'phone_conflict';
      let candidates: PendingImportPhoneCandidate[];

      if (conflictType === 'name_match') {
        const matches = findPotentialVolunteerNameMatches(
          `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          nameCandidates
        );
        candidates = matches.flatMap(match => {
          const candidate = candidatesById.get(match.id);
          return candidate ? [{ ...candidate, matchScore: match.score }] : [];
        });

        const originallyMatched = candidatesById.get(row.conflicting_volunteer_id);
        if (originallyMatched && !candidates.some(candidate => candidate.id === originallyMatched.id)) {
          candidates.unshift(originallyMatched);
        }
      } else {
        candidates = candidatesByPhone.get(getLocal8Digits(row.phone_normalized || row.phone || '')) || [];
      }

      return {
        id: row.id,
        sourceRow: row.source_row ?? null,
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
        phoneNormalized: row.phone_normalized || '',
        age: row.age ?? null,
        neighborhood: row.neighborhood || null,
        stake: row.stake || null,
        committeeId: row.committee_id || null,
        committeeName: committeeNames.get(row.committee_id) || 'Sin comité',
        submittedByName: row.submitted_by_name || 'Usuario desconocido',
        submittedByRole: row.submitted_by_role || '',
        submittedAt: row.submitted_at,
        sendWelcomeMessage: row.send_welcome_message === true,
        conflictType,
        candidates,
      };
    });
  }

  static async resolvePendingImportException(
    request: ResolvePendingImportExceptionRequest,
    actor: AuditActor,
    actorUserId: string | null
  ): Promise<ResolvePendingImportExceptionResult> {
    try {
      const supabase = await getAdminSupabase();
      const { data: pending, error: pendingError } = await supabase
        .from('volunteer_import_exceptions')
        .select('*')
        .eq('id', request.exceptionId)
        .eq('status', 'pending')
        .maybeSingle();

      if (pendingError || !pending) {
        return { success: false, error: 'La solicitud ya fue procesada o no existe.' };
      }

      const reviewedAt = new Date().toISOString();
      const reviewBase = {
        reviewed_by_user_id: actorUserId,
        reviewed_by_name: actor.name,
        reviewed_by_role: actor.role,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      };

      if (request.resolution === 'rejected') {
        const reason = request.reason.trim();
        if (reason.length < 3) {
          return { success: false, error: 'Indica por qué se descartará esta importación.' };
        }
        const { error } = await supabase
          .from('volunteer_import_exceptions')
          .update({
            ...reviewBase,
            status: 'rejected',
            resolution: 'rejected',
            review_reason: reason,
          })
          .eq('id', pending.id)
          .eq('status', 'pending');
        if (error) return { success: false, error: error.message };

        await VolunteerAuditWriter.write({
          actionType: 'Seguridad',
          volunteerId: null,
          description: `Descartó la importación pendiente de "${pending.first_name} ${pending.last_name || ''}"`.trim(),
          actor,
          context: {
            operation: 'reject_import_phone_exception',
            phone: pending.phone_normalized,
            reason,
            exceptionId: pending.id,
          },
        });
        return { success: true };
      }

      let phoneToCreate = pending.phone_normalized;
      let sharedOwnerId: string | null = null;
      let sharedReason: string | null = null;
      const conflictType = pending.conflict_type === 'name_match' ? 'name_match' : 'phone_conflict';

      if (conflictType === 'name_match') {
        if (request.resolution !== 'confirmed_distinct_person') {
          return { success: false, error: 'Confirma que se trata de una persona diferente o descarta la fila.' };
        }
        const phoneConflict = await this.findActivePhoneConflict(supabase, phoneToCreate);
        if (phoneConflict) {
          return {
            success: false,
            error: `Mientras se revisaba la fila, el teléfono fue asignado a ${phoneConflict.first_name} ${phoneConflict.last_name || ''}.`,
          };
        }
      } else if (request.resolution === 'corrected_phone') {
        const normalized = normalizePhoneE164(request.correctedPhone);
        if (!normalized) {
          return { success: false, error: 'El teléfono corregido debe tener exactamente 8 dígitos.' };
        }
        const conflict = await this.findActivePhoneConflict(supabase, normalized);
        if (conflict) {
          return {
            success: false,
            error: `El teléfono corregido ya pertenece a ${conflict.first_name} ${conflict.last_name || ''}.`,
          };
        }
        phoneToCreate = normalized;
      } else if (request.resolution === 'shared_phone') {
        const reason = request.reason.trim();
        if (reason.length < 3) {
          return { success: false, error: 'La razón del número compartido es obligatoria.' };
        }

        const { data: owner } = await supabase
          .from('volunteers')
          .select('id, first_name, last_name, phone, status')
          .eq('id', request.ownerVolunteerId)
          .maybeSingle();
        if (
          !owner ||
          owner.status === 'archived' ||
          getLocal8Digits(owner.phone || '') !== getLocal8Digits(pending.phone_normalized || '')
        ) {
          return { success: false, error: 'Selecciona un titular activo que use este mismo número.' };
        }

        const { error: ownerUpdateError } = await supabase
          .from('volunteers')
          .update({
            phone_normalized: pending.phone_normalized,
            is_shared_phone: false,
            shared_phone_owner_id: null,
            shared_phone_reason: null,
            shared_phone_authorized_by: null,
            shared_phone_authorized_at: null,
          })
          .eq('id', owner.id);
        if (ownerUpdateError) {
          return {
            success: false,
            error: `No se pudo establecer el titular: ${ownerUpdateError.message}`,
          };
        }

        sharedOwnerId = owner.id;
        sharedReason = reason;
      } else {
        return { success: false, error: 'Selecciona una resolución válida para el número repetido.' };
      }

      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const insertPayload: Record<string, unknown> = {
        first_name: pending.first_name,
        last_name: pending.last_name || '',
        phone: phoneToCreate,
        phone_normalized: phoneToCreate,
        stake: pending.stake ?? null,
        neighborhood: pending.neighborhood ?? null,
        committee_id: pending.committee_id ?? null,
        age: pending.age ?? null,
        pin,
        status: 'active',
        is_shared_phone: request.resolution === 'shared_phone',
        shared_phone_owner_id: sharedOwnerId,
        shared_phone_reason: sharedReason,
        shared_phone_authorized_by: sharedOwnerId ? actor.name : null,
        shared_phone_authorized_at: sharedOwnerId ? reviewedAt : null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('volunteers')
        .insert(insertPayload)
        .select('id, first_name, last_name, phone, pin')
        .single();
      if (insertError || !inserted) {
        return { success: false, error: insertError?.message || 'No se pudo crear el voluntario.' };
      }

      const { error: finalizeError } = await supabase
        .from('volunteer_import_exceptions')
        .update({
          ...reviewBase,
          status: 'approved',
          resolution: request.resolution,
          corrected_phone: request.resolution === 'corrected_phone' ? phoneToCreate : null,
          created_volunteer_id: inserted.id,
          review_reason: request.resolution === 'shared_phone'
            ? sharedReason
            : request.resolution === 'confirmed_distinct_person'
              ? 'El administrador confirmó que es una persona diferente.'
              : 'Teléfono corregido por un administrador.',
        })
        .eq('id', pending.id)
        .eq('status', 'pending');

      if (finalizeError) {
        console.error('[VolunteerMutationService.resolvePendingImportException] Volunteer created but queue finalization failed:', finalizeError);
      }

      const committeeName = await this.resolveCommitteeName(supabase, pending.committee_id);
      await VolunteerAuditWriter.write({
        actionType: 'Creación',
        volunteerId: inserted.id,
        description: `Aprobó e importó al voluntario "${inserted.first_name} ${inserted.last_name || ''}"`.trim(),
        actor,
        context: {
          operation: 'approve_import_phone_exception',
          conflictType,
          resolution: request.resolution,
          phone: inserted.phone,
          committee: committeeName || 'Sin comité',
          sharedPhoneOwnerId: sharedOwnerId,
          reason: sharedReason,
          exceptionId: pending.id,
        },
      });

      return {
        success: true,
        createdVolunteer: {
          id: inserted.id,
          firstName: inserted.first_name,
          lastName: inserted.last_name || '',
          phone: inserted.phone,
          pin: inserted.pin,
          sendWelcomeMessage: pending.send_welcome_message === true,
        },
      };
    } catch (error) {
      console.error('[VolunteerMutationService.resolvePendingImportException] Unexpected exception:', error);
      return { success: false, error: 'Error inesperado al resolver la importación pendiente.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Status transitions (Archive / Restore / Swap)
  // ---------------------------------------------------------------------------

  /**
   * Updates status (and optionally phone) for a volunteer, checking phone conflict
   * server-side and generating structured audit log diffs.
   */
  static async updateStatus(
    request: UpdateVolunteerStatusRequest,
    actor: AuditActor,
    operationId?: string
  ): Promise<UpdateStatusResult> {
    try {
      const supabase = await getAdminSupabase();

      // 1. Fetch current volunteer state
      const { data: previous, error: fetchError } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone, status, stake, neighborhood, committee_id')
        .eq('id', request.volunteerId)
        .maybeSingle();

      if (fetchError || !previous) {
        return { success: false, reason: 'not_found', error: 'No se encontró el voluntario.' };
      }

      const targetPhone = request.newPhone || previous.phone;

      // 2. Validate phone conflict when activating/unarchiving
      if (request.toStatus === 'active' && targetPhone) {
        const normTarget = normalizePhoneE164(targetPhone);
        if (!normTarget) {
          return {
            success: false,
            reason: 'error',
            error: 'El número de teléfono debe tener exactamente 8 dígitos.',
          };
        }

        const existingActive = await this.findActivePhoneConflict(supabase, targetPhone, request.volunteerId);

        if (existingActive) {
          const commName = await this.resolveCommitteeName(supabase, existingActive.committee_id);
          return {
            success: false,
            reason: 'phone_conflict',
            error: `El teléfono ${targetPhone} ya pertenece a un voluntario activo.`,
            conflictingVolunteer: {
              id: existingActive.id,
              name: `${existingActive.first_name || ''} ${existingActive.last_name || ''}`.trim(),
              phone: existingActive.phone || targetPhone,
              stake: existingActive.stake || '',
              ward: existingActive.neighborhood || '',
              committee: commName || '',
            },
          };
        }
      }

      // 3. Build incoming state & compute structured diff
      const incoming: VolunteerRow = {
        ...previous,
        status: request.toStatus,
        phone: targetPhone,
      };

      const changes = await VolunteerDiffBuilder.compute(previous, incoming);

      if (changes.length === 0) {
        return { success: true, skipped: true };
      }

      // 4. Update DB
      const updateData: Record<string, any> = { status: request.toStatus };
      if (request.newPhone) {
        updateData.phone = request.newPhone;
      }

      const { error: updateError } = await supabase
        .from('volunteers')
        .update(updateData)
        .eq('id', request.volunteerId);

      if (updateError) {
        console.error('[VolunteerMutationService.updateStatus] Update failed:', updateError);
        return { success: false, reason: 'error', error: updateError.message };
      }

      // 5. Deduce action_type & description
      let actionType: 'Archivado' | 'Restaurado' | 'Edición' = 'Edición';
      if (previous.status === 'active' && request.toStatus === 'archived') {
        actionType = 'Archivado';
      } else if (previous.status === 'archived' && request.toStatus === 'active') {
        actionType = 'Restaurado';
      }

      const desc = actionType === 'Archivado' ? 'Archivó voluntario' : actionType === 'Restaurado' ? 'Restauró voluntario' : 'Actualizó estado';

      // 6. Write audit log
      await VolunteerAuditWriter.write({
        actionType,
        volunteerId: request.volunteerId,
        description: desc,
        actor,
        changes,
        operationId,
      });

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.updateStatus] Unexpected exception:', err);
      return { success: false, reason: 'error', error: 'Error inesperado al actualizar estado.' };
    }
  }

  /**
   * Explicit business use-case: Swaps volunteer activation by archiving an active volunteer
   * and restoring an archived volunteer in two transactionally linked operations.
   */
  static async swapVolunteerActivation(
    activeVolunteerId: string,
    targetVolunteerId: string,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      const operationId = crypto.randomUUID();

      // 1. Archive active volunteer
      const archiveRes = await this.updateStatus(
        { volunteerId: activeVolunteerId, toStatus: 'archived' },
        actor,
        operationId
      );

      if (!archiveRes.success) {
        return { success: false, error: archiveRes.error || 'Error al archivar el voluntario activo.' };
      }

      // 2. Activate target volunteer
      const activateRes = await this.updateStatus(
        { volunteerId: targetVolunteerId, toStatus: 'active' },
        actor,
        operationId
      );

      if (!activateRes.success) {
        return { success: false, error: activateRes.error || 'Error al activar el voluntario.' };
      }

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.swapVolunteerActivation] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al intercambiar estado de voluntarios.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: PIN Domain Mutations (Reset / Change / Initial Setup)
  // ---------------------------------------------------------------------------

  /**
   * Helper function to validate PIN security rules without logging credentials.
   */
  static validatePinSecurity(pin: string, allowRange = false): { isValid: boolean; error?: string } {
    const isNumeric = /^[0-9]+$/.test(pin);
    const minLength = 4;
    const maxLength = allowRange ? 6 : 4;

    if (!pin || pin.length < minLength || pin.length > maxLength || !isNumeric) {
      const lenText = allowRange ? 'entre 4 y 6 dígitos' : 'exactamente 4 dígitos';
      return { isValid: false, error: `El PIN debe ser únicamente numérico y tener ${lenText}.` };
    }
    if (pin === '1234') {
      return { isValid: false, error: "No puedes elegir el PIN por defecto '1234' por motivos de seguridad." };
    }
    if (/^(\d)\1+$/.test(pin)) {
      return { isValid: false, error: "Por motivos de seguridad, no utilices un PIN repetitivo (ej: 1111, 2222)." };
    }

    let asc = true;
    let desc = true;
    for (let i = 0; i < pin.length - 1; i++) {
      const diff = pin.charCodeAt(i + 1) - pin.charCodeAt(i);
      if (diff !== 1) asc = false;
      if (diff !== -1) desc = false;
    }
    if (asc || desc) {
      return { isValid: false, error: "Por motivos de seguridad, no utilices un PIN secuencial (ej: 1234, 4321)." };
    }

    return { isValid: true };
  }

  /**
   * Administrative PIN reset: Sets volunteer PIN to '1234' and registers an audit log.
   */
  static async resetPin(volunteerId: string, actor: AuditActor): Promise<MutationResult> {
    try {
      const supabase = await getAdminSupabase();

      const { data: volunteer, error: fetchErr } = await supabase
        .from('volunteers')
        .select('id')
        .eq('id', volunteerId)
        .maybeSingle();

      if (fetchErr || !volunteer) {
        return { success: false, error: 'No se encontró el voluntario para resetear PIN.' };
      }

      const { error: updateErr } = await supabase
        .from('volunteers')
        .update({ pin: '1234' })
        .eq('id', volunteerId);

      if (updateErr) {
        console.error('[VolunteerMutationService.resetPin] Update failed:', updateErr);
        return { success: false, error: 'Error al resetear el PIN.' };
      }

      // Audit log (NEVER includes the PIN value itself)
      await VolunteerAuditWriter.write({
        actionType:  'Seguridad',
        volunteerId,
        description: 'Restableció el PIN del voluntario',
        actor,
        context: {
          operation: 'pin_reset',
        },
      });

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.resetPin] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al resetear el PIN.' };
    }
  }

  /**
   * Self-service PIN change: Validates current PIN, verifies new PIN security, and writes audit log.
   */
  static async changePin(
    volunteerId: string,
    currentPin: string,
    newPin: string,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      const supabase = await getAdminSupabase();

      const { data: volunteer, error: fetchErr } = await supabase
        .from('volunteers')
        .select('id, pin')
        .eq('id', volunteerId)
        .maybeSingle();

      if (fetchErr || !volunteer) {
        return { success: false, error: 'Usuario no encontrado para actualizar PIN.' };
      }

      if (volunteer.pin !== currentPin) {
        return { success: false, error: 'El PIN actual ingresado es incorrecto.' };
      }

      const val = this.validatePinSecurity(newPin, false);
      if (!val.isValid) {
        return { success: false, error: val.error };
      }

      const { error: updateErr } = await supabase
        .from('volunteers')
        .update({ pin: newPin })
        .eq('id', volunteerId);

      if (updateErr) {
        console.error('[VolunteerMutationService.changePin] Update failed:', updateErr);
        return { success: false, error: 'Error al actualizar el PIN.' };
      }

      // Audit log (NEVER includes currentPin or newPin)
      await VolunteerAuditWriter.write({
        actionType:  'Seguridad',
        volunteerId,
        description: 'Actualizó su PIN de seguridad',
        actor,
        context: {
          operation: 'pin_change',
        },
      });

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.changePin] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al actualizar el PIN.' };
    }
  }

  /**
   * Initial PIN setup: Sets initial PIN for a volunteer and registers audit log.
   */
  static async setInitialPin(
    volunteerId: string,
    newPin: string,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      const supabase = await getAdminSupabase();

      const { data: volunteer, error: fetchErr } = await supabase
        .from('volunteers')
        .select('id')
        .eq('id', volunteerId)
        .maybeSingle();

      if (fetchErr || !volunteer) {
        return { success: false, error: 'Usuario no encontrado tras actualizar PIN.' };
      }

      const val = this.validatePinSecurity(newPin, true);
      if (!val.isValid) {
        return { success: false, error: val.error };
      }

      const { error: updateErr } = await supabase
        .from('volunteers')
        .update({ pin: newPin })
        .eq('id', volunteerId);

      if (updateErr) {
        console.error('[VolunteerMutationService.setInitialPin] Update failed:', updateErr);
        return { success: false, error: 'No se pudo actualizar el PIN.' };
      }

      // Audit log (NEVER includes the PIN value)
      await VolunteerAuditWriter.write({
        actionType:  'Seguridad',
        volunteerId,
        description: 'Configuró su PIN inicial',
        actor,
        context: {
          operation: 'initial_pin_setup',
        },
      });

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.setInitialPin] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al configurar PIN inicial.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5: Mass Committee Unlinking
  // ---------------------------------------------------------------------------

  /**
   * Mass unlinks all volunteers from a committee when the committee is archived or deleted.
   * Performs ONE batch UPDATE and writes ONE batch activity_logs INSERT with target_id = volunteer.id per volunteer.
   */
  static async unlinkVolunteersFromCommittee(
    committeeId: string,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      const supabase = await getAdminSupabase();

      // 1. Fetch committee name & affected volunteers
      const { data: committee } = await supabase
        .from('committees')
        .select('name')
        .eq('id', committeeId)
        .maybeSingle();

      const committeeName = committee?.name || 'Comité';

      const { data: affectedVolunteers, error: fetchErr } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, committee_id')
        .eq('committee_id', committeeId);

      if (fetchErr) {
        console.error('[VolunteerMutationService.unlinkVolunteersFromCommittee] Fetch failed:', fetchErr);
        return { success: false, error: 'Error al recuperar voluntarios del comité.' };
      }

      if (!affectedVolunteers || affectedVolunteers.length === 0) {
        return { success: true, skipped: true };
      }

      // 2. Perform SINGLE batch UPDATE
      const { error: updateErr } = await supabase
        .from('volunteers')
        .update({ committee_id: null })
        .eq('committee_id', committeeId);

      if (updateErr) {
        console.error('[VolunteerMutationService.unlinkVolunteersFromCommittee] Batch UPDATE failed:', updateErr);
        return { success: false, error: updateErr.message };
      }

      // 3. Construct array of audit log events (1 event per affected volunteer)
      const auditEvents: WriteEditAuditPayload[] = affectedVolunteers.map((vol) => ({
        actionType: 'Edición',
        volunteerId: vol.id,
        description: 'Desvinculó al voluntario del comité',
        actor,
        changes: [
          {
            field: 'committee_id',
            label: 'Comité',
            oldValue: committeeName,
            newValue: 'Sin comité',
          },
        ],
      }));

      // 4. Perform SINGLE batch INSERT to activity_logs
      await VolunteerAuditWriter.write(auditEvents);

      return { success: true };
    } catch (err) {
      console.error('[VolunteerMutationService.unlinkVolunteersFromCommittee] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al desvincular voluntarios del comité.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 6: Apply Phone Cleanup Decision (Phase 3 Execution)
  // ---------------------------------------------------------------------------

  /**
   * Applies an approved phone cleanup decision for a single volunteer.id.
   * Performs validation, phone conflict checks, DB update, and audit logging.
   */
  static async applyPhoneCleanupDecision(
    payload: {
      volunteerId: string;
      approvedAction: 'PHONE_OWNER' | 'SHARED_PHONE' | 'ARCHIVE_DUPLICATE' | 'KEEP' | 'MANUAL_REVIEW';
      phoneInput?: string | null;
      sharedPhoneOwnerId?: string | null;
      sharedPhoneReason?: string | null;
      authorizedBy: string;
    },
    actor: AuditActor
  ): Promise<{ success: boolean; skipped?: boolean; reason?: string; error?: string }> {
    try {
      const supabase = await getAdminSupabase();

      // 1. Fetch previous state from DB
      const { data: previous, error: fetchErr } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone, status, phone_normalized, is_shared_phone, shared_phone_owner_id')
        .eq('id', payload.volunteerId)
        .maybeSingle();

      if (fetchErr || !previous) {
        return { success: false, reason: 'not_found', error: 'No se encontró el voluntario.' };
      }

      // 2. MANUAL_REVIEW -> Skipped
      if (payload.approvedAction === 'MANUAL_REVIEW') {
        return { success: true, skipped: true };
      }

      // 3. ARCHIVE_DUPLICATE -> Use safe updateStatus
      if (payload.approvedAction === 'ARCHIVE_DUPLICATE') {
        if (previous.status === 'archived') {
          return { success: true, skipped: true };
        }
        const statusRes = await this.updateStatus(
          { volunteerId: payload.volunteerId, toStatus: 'archived' },
          actor
        );
        return statusRes;
      }

      // 4. PHONE_OWNER, SHARED_PHONE, KEEP -> Phone normalization & DB update
      const phoneToUse = (payload.phoneInput && payload.phoneInput.trim()) ? payload.phoneInput.trim() : previous.phone;
      const normPhone = normalizePhoneE164(phoneToUse);

      if (!normPhone) {
        return { success: false, reason: 'invalid_phone', error: `El número de teléfono "${phoneToUse}" no es válido (debe tener 8 dígitos de Nicaragua).` };
      }

      const isShared = payload.approvedAction === 'SHARED_PHONE';

      // Conflict check if not shared phone
      if (!isShared) {
        const conflict = await this.findActivePhoneConflict(supabase, phoneToUse, payload.volunteerId);
        if (conflict) {
          // If conflict is within the same local 8-digit phone group (the group being remediated into PHONE_OWNER + SHARED_PHONE), allow it.
          const isSamePhoneGroup = getLocal8Digits(conflict.phone) === getLocal8Digits(phoneToUse);
          if (!isSamePhoneGroup) {
            return {
              success: false,
              reason: 'phone_conflict',
              error: `El teléfono ${normPhone} ya pertenece a otro voluntario activo (${`${conflict.first_name || ''} ${conflict.last_name || ''}`.trim()}).`,
            };
          }
        }
      }

      const updateData: any = {
        phone_normalized: normPhone,
        is_shared_phone: isShared,
        shared_phone_owner_id: isShared ? payload.sharedPhoneOwnerId ?? null : null,
        shared_phone_reason: isShared ? payload.sharedPhoneReason ?? null : null,
        shared_phone_authorized_by: isShared ? payload.authorizedBy : null,
        shared_phone_authorized_at: isShared ? new Date().toISOString() : null,
      };

      if (payload.phoneInput && payload.phoneInput.trim() && getLocal8Digits(payload.phoneInput) !== getLocal8Digits(previous.phone)) {
        updateData.phone = payload.phoneInput.trim();
      }

      const { error: updateErr } = await supabase
        .from('volunteers')
        .update(updateData)
        .eq('id', payload.volunteerId);

      if (updateErr) {
        console.error('[VolunteerMutationService.applyPhoneCleanupDecision] DB update failed:', updateErr);
        return { success: false, reason: 'error', error: updateErr.message };
      }

      // Write audit log
      await VolunteerAuditWriter.write({
        actionType: 'Seguridad',
        volunteerId: payload.volunteerId,
        description: `Aplicó saneamiento telefónico (${payload.approvedAction})`,
        actor,
        context: {
          operation: 'phone_cleanup_remediation',
          approvedAction: payload.approvedAction,
          phoneNormalized: normPhone,
          isSharedPhone: isShared,
          sharedPhoneOwnerId: payload.sharedPhoneOwnerId ?? null,
        },
      });

      return { success: true };
    } catch (err: any) {
      console.error('[VolunteerMutationService.applyPhoneCleanupDecision] Unexpected exception:', err);
      return { success: false, reason: 'error', error: err.message || 'Error inesperado al aplicar saneamiento telefónico.' };
    }
  }

  /**
   * Toggles (inserts or deletes) a single shift assignment for a volunteer using Service Role key.
   */
  static async toggleShift(
    volunteerId: string,
    dayKey: string,
    shiftKey: string,
    assign: boolean
  ): Promise<MutationResult> {
    console.log('[SHIFT ACTION] started:', { volunteerId, dayKey, shiftKey, assign });
    try {
      const supabase = await getAdminSupabase();

      if (assign) {
        const { data: existingAssignment, error: existingAssignmentError } = await supabase
          .from('shifts')
          .select('id')
          .eq('volunteer_id', volunteerId)
          .eq('day_key', dayKey)
          .eq('shift_key', shiftKey)
          .maybeSingle();
        if (existingAssignmentError) {
          return { success: false, error: existingAssignmentError.message };
        }

        if (!existingAssignment) {
          const conflict = await findPendingShiftChangeTargetConflict(
            supabase,
            volunteerId,
            [{ dayKey, shiftKey }]
          );
          if (conflict) {
            return { success: false, error: pendingShiftConflictMessage(conflict) };
          }
        }

        const { data: insertedShift, error } = await supabase
          .from('shifts')
          .upsert(
            {
              volunteer_id: volunteerId,
              day_key: dayKey,
              shift_key: shiftKey,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'volunteer_id,day_key,shift_key' }
          )
          .select('id, volunteer_id, day_key, shift_key, updated_at')
          .single();

        if (error) {
          console.error('[SHIFT ACTION] DB UPSERT error:', error);
          return { success: false, error: error.message };
        }

        console.log('[SHIFT ACTION] DB UPSERT completed:', insertedShift?.id);
        if (insertedShift) {
          broadcastShiftSync({
            eventType: 'INSERT',
            table: 'shifts',
            record: insertedShift,
          });
        }
      } else {
        const { data: existingShift } = await supabase
          .from('shifts')
          .select('id, volunteer_id, day_key, shift_key')
          .eq('volunteer_id', volunteerId)
          .eq('day_key', dayKey)
          .eq('shift_key', shiftKey)
          .maybeSingle();

        const { error } = await supabase
          .from('shifts')
          .delete()
          .eq('volunteer_id', volunteerId)
          .eq('day_key', dayKey)
          .eq('shift_key', shiftKey);

        if (error) {
          console.error('[SHIFT ACTION] DB DELETE error:', error);
          return { success: false, error: error.message };
        }

        console.log('[SHIFT ACTION] DB DELETE completed:', existingShift?.id);
        if (existingShift) {
          broadcastShiftSync({
            eventType: 'DELETE',
            table: 'shifts',
            record: existingShift,
          });
        }
      }

      console.log('[SHIFT ACTION] returning response success: true');
      return { success: true };
    } catch (err: any) {
      console.error('[SHIFT ACTION] Exception:', err);
      return { success: false, error: err.message || 'Error al actualizar turno' };
    }
  }

  /**
   * Replaces all shifts for a volunteer with new assignments using Service Role key.
   */
  static async saveShifts(
    volunteerId: string,
    shiftsByDay: Record<string, string[]>
  ): Promise<MutationResult> {
    try {
      const supabase = await getAdminSupabase();

      // Fetch existing shifts before deleting
      const { data: oldShifts } = await supabase
        .from('shifts')
        .select('id, volunteer_id, day_key, shift_key')
        .eq('volunteer_id', volunteerId);

      const oldAssignmentKeys = new Set(
        (oldShifts || []).map(shift => `${shift.day_key}\u0000${shift.shift_key}`)
      );
      const newlyAssignedShifts = Object.entries(shiftsByDay).flatMap(([dayKey, shiftKeys]) =>
        shiftKeys
          .filter(shiftKey => !oldAssignmentKeys.has(`${dayKey}\u0000${shiftKey}`))
          .map(shiftKey => ({ dayKey, shiftKey }))
      );
      const conflict = await findPendingShiftChangeTargetConflict(
        supabase,
        volunteerId,
        newlyAssignedShifts
      );
      if (conflict) {
        return { success: false, error: pendingShiftConflictMessage(conflict) };
      }

      // Delete existing shifts
      const { error: delErr } = await supabase
        .from('shifts')
        .delete()
        .eq('volunteer_id', volunteerId);

      if (delErr) {
        console.error('[VolunteerMutationService.saveShifts] DELETE error:', delErr);
        return { success: false, error: delErr.message };
      }

      if (oldShifts && oldShifts.length > 0) {
        for (const oldS of oldShifts) {
          broadcastShiftSync({
            eventType: 'DELETE',
            table: 'shifts',
            record: oldS,
          });
        }
      }

      // Build insert rows
      const insertRows: any[] = [];
      const nowIso = new Date().toISOString();
      for (const [dayKey, shiftKeys] of Object.entries(shiftsByDay)) {
        for (const shiftKey of shiftKeys) {
          insertRows.push({
            volunteer_id: volunteerId,
            day_key: dayKey,
            shift_key: shiftKey,
            updated_at: nowIso,
          });
        }
      }

      if (insertRows.length > 0) {
        const { data: newShifts, error: insErr } = await supabase
          .from('shifts')
          .insert(insertRows)
          .select('id, volunteer_id, day_key, shift_key, updated_at');

        if (insErr) {
          console.error('[VolunteerMutationService.saveShifts] INSERT error:', insErr);
          return { success: false, error: insErr.message };
        }

        if (newShifts && newShifts.length > 0) {
          for (const ns of newShifts) {
            broadcastShiftSync({
              eventType: 'INSERT',
              table: 'shifts',
              record: ns,
            });
          }
        }
      }

      return { success: true };
    } catch (err: any) {
      console.error('[VolunteerMutationService.saveShifts] Exception:', err);
      return { success: false, error: err.message || 'Error al guardar turnos' };
    }
  }
}
