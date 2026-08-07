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

export interface UpdateProfilePayload {
  firstName: string;
  lastName: string;
  phone: string;
  stake?: string | null;
  neighborhood?: string | null;
  committeeId?: string | null;
  age?: number | null;
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
}

export interface MutationResult {
  success: boolean;
  skipped?: boolean;  // true when diff was empty — no update, no audit
  error?: string;
}

export interface UpdateVolunteerStatusRequest {
  volunteerId: string;
  toStatus: 'active' | 'archived';
  newPhone?: string | null;
}

export interface UpdateStatusResult extends MutationResult {
  reason?: 'phone_conflict' | 'not_found' | 'error';
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

  private static async persistVolunteer(
    supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
    payload: CreateVolunteerPayload
  ): Promise<{ data: any | null; error: any | null }> {
    const pin = payload.pin || String(Math.floor(1000 + Math.random() * 9000));
    const { data, error } = await supabase
      .from('volunteers')
      .insert({
        first_name:   payload.firstName,
        last_name:    payload.lastName,
        phone:        payload.phone,
        stake:        payload.stake ?? null,
        neighborhood: payload.neighborhood ?? null,
        committee_id: payload.committeeId ?? null,
        age:          payload.age ?? null,
        pin,
        status:       'active',
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
        .select('first_name, last_name, phone, stake, neighborhood, committee_id, age')
        .eq('id', volunteerId)
        .maybeSingle();

      if (fetchError || !previous) {
        console.error('[VolunteerMutationService.updateProfile] Failed to fetch previous state:', fetchError);
        return { success: false, error: 'No se encontró el voluntario.' };
      }

      // 2. Build the incoming row in the same shape as the DB record
      const incoming: VolunteerRow = {
        first_name:   payload.firstName,
        last_name:    payload.lastName,
        phone:        payload.phone,
        stake:        payload.stake ?? null,
        neighborhood: payload.neighborhood ?? null,
        committee_id: payload.committeeId ?? null,
        age:          payload.age ?? null,
      };

      // 3. Resolve committee names for human-readable diffs
      const committeeNameResolver = async (id: string | null) =>
        this.resolveCommitteeName(supabase, id);

      const changes = await VolunteerDiffBuilder.compute(previous, incoming, committeeNameResolver);

      // 4. Early exit: nothing changed — do NOT write to DB or audit log
      if (changes.length === 0) {
        return { success: true, skipped: true };
      }

      // 5. Apply the DB mutation
      const { error: updateError } = await supabase
        .from('volunteers')
        .update({
          first_name:   payload.firstName,
          last_name:    payload.lastName,
          phone:        payload.phone,
          stake:        payload.stake ?? null,
          neighborhood: payload.neighborhood ?? null,
          committee_id: payload.committeeId ?? null,
          age:          payload.age ?? null,
        })
        .eq('id', volunteerId);

      if (updateError) {
        console.error('[VolunteerMutationService.updateProfile] DB update failed:', updateError);
        return { success: false, error: updateError.message };
      }

      // 6. Write audit log (non-blocking — never reverts the mutation on failure)
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

      // Check if an active volunteer with the same phone number exists
      const { data: existing } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name')
        .eq('phone', payload.phone)
        .neq('status', 'archived')
        .maybeSingle();

      if (existing) {
        return {
          success: false,
          error: `Ya existe un voluntario activo ("${existing.first_name} ${existing.last_name}") con el teléfono ${payload.phone}.`,
        };
      }

      const { data: inserted, error: insertError } = await this.persistVolunteer(supabase, payload);

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
    actor: AuditActor
  ): Promise<BulkImportResult> {
    try {
      const supabase = await getAdminSupabase();
      const importedVolunteers: BulkImportResult['importedVolunteers'] = [];
      const auditPayloads: any[] = [];
      let skippedCount = 0;

      for (const item of items) {
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
      }

      return {
        success: true,
        importedCount: importedVolunteers.length,
        skippedCount,
        importedVolunteers,
      };
    } catch (err) {
      console.error('[VolunteerMutationService.bulkImportVolunteers] Unexpected exception:', err);
      return {
        success: false,
        importedCount: 0,
        skippedCount: items.length,
        importedVolunteers: [],
        error: 'Error inesperado durante la importación masiva.',
      };
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
        const { data: activeVols } = await supabase
          .from('volunteers')
          .select('id, first_name, last_name, phone, stake, neighborhood, committee_id')
          .neq('status', 'archived')
          .neq('id', request.volunteerId);

        const existingActive = activeVols?.find((v) => {
          if (!v.phone) return false;
          return v.phone === targetPhone || v.phone.endsWith(targetPhone.slice(-8));
        });

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
}




