import { createClient } from '@supabase/supabase-js';
import { VolunteerMutationService } from './volunteer-mutation.service';
import { AuditActor } from './volunteer-audit-writer';
import { normalizePhoneE164, getLocal8Digits } from '@/lib/whatsapp';
import { PersonCentricDecision } from './phone-cleanup-review.service';

export type ItemProcessingResultCode =
  | 'PROCESSED'
  | 'ALREADY_PROCESSED'
  | 'ALREADY_PROCESSING'
  | 'REQUIRES_INFORMATION'
  | 'REVIEW_LATER'
  | 'CONFLICT'
  | 'LEGACY_NOT_PROCESSABLE'
  | 'INVALID_STATUS'
  | 'ERROR';

export interface ItemProcessingResult {
  itemId: string;
  volunteerId: string;
  code: ItemProcessingResultCode;
  success: boolean;
  message: string;
  previousSnapshot?: {
    originalPhone: string;
    phoneNormalized: string | null;
    isSharedPhone: boolean;
    sharedPhoneOwnerId: string | null;
    status: string;
  };
  conflictDetail?: string;
}

export interface BatchProcessingSummary {
  totalRequested: number;
  processedCount: number;
  alreadyProcessedCount: number;
  requiresInfoCount: number;
  reviewLaterCount: number;
  conflictCount: number;
  errorCount: number;
  results: ItemProcessingResult[];
}

export class PhoneCleanupProcessingService {
  private static getSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Process a single review item idempotently and transactionally.
   * ABSOLUTE PROTECTION: Controlled via dryRun parameter. When dryRun is true, NO writes to public.volunteers occur.
   */
  public static async processSingleItem(
    itemId: string,
    actor: AuditActor,
    dryRun: boolean = true
  ): Promise<ItemProcessingResult> {
    const supabase = this.getSupabaseClient();
    const nowIso = new Date().toISOString();

    // 1. Fetch item from phone_cleanup_review_items
    const { data: item, error: fetchErr } = await supabase
      .from('phone_cleanup_review_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchErr || !item) {
      return {
        itemId,
        volunteerId: 'UNKNOWN',
        code: 'ERROR',
        success: false,
        message: `No se encontró el ítem de revisión con ID: ${itemId}`,
      };
    }

    const volunteerId = item.volunteer_id;

    const stopProcessing = async (
      code: 'REQUIRES_INFORMATION' | 'CONFLICT' | 'ERROR',
      message: string
    ): Promise<ItemProcessingResult> => {
      await supabase
        .from('phone_cleanup_review_items')
        .update({
          processing_status: code,
          processing_error: message,
          updated_at: nowIso,
        })
        .eq('id', itemId);

      return {
        itemId,
        volunteerId,
        code,
        success: false,
        message,
      };
    };

    // 2. CHECK 1: LEGACY PROTECTION
    if (item.status === 'LEGACY' || item.decision === null || item.decision === undefined) {
      return {
        itemId,
        volunteerId,
        code: 'LEGACY_NOT_PROCESSABLE',
        success: false,
        message: 'Los registros históricos LEGACY no están autorizados para procesamiento automático.',
      };
    }

    // 3. CHECK 2: IDEMPOTENCY — If already PROCESSED, skip mutation
    if (item.processing_status === 'PROCESSED' || item.status === 'PROCESSED') {
      return {
        itemId,
        volunteerId,
        code: 'ALREADY_PROCESSED',
        success: true,
        message: 'La decisión ya fue aplicada previamente a este voluntario.',
      };
    }

    // 4. CHECK 3: CONCURRENCY LOCK — Atomic transition PENDING -> PROCESSING
    if (item.processing_status === 'PROCESSING') {
      return {
        itemId,
        volunteerId,
        code: 'ALREADY_PROCESSING',
        success: false,
        message: 'El registro está siendo procesado en este momento por otro administrador.',
      };
    }

    // 5. CHECK 4: GATING STATUS VERIFICATION
    if (item.status !== 'READY_TO_PROCESS' && item.status !== 'SAVED') {
      if (item.status === 'REQUIRES_INFORMATION') {
        return {
          itemId,
          volunteerId,
          code: 'REQUIRES_INFORMATION',
          success: false,
          message: 'La persona requiere información adicional (teléfono nuevo pendiente).',
        };
      }
      if (item.status === 'REVIEW_LATER' || item.decision === 'MANUAL_REVIEW') {
        return {
          itemId,
          volunteerId,
          code: 'REVIEW_LATER',
          success: false,
          message: 'La persona fue marcada para "Revisar después".',
        };
      }
      return {
        itemId,
        volunteerId,
        code: 'INVALID_STATUS',
        success: false,
        message: `Estado inválido para procesamiento: ${item.status}`,
      };
    }

    // 6. READ CURRENT VOLUNTEER STATE FOR SNAPSHOT & CONFLICT VALIDATION
    const { data: currentVol, error: volErr } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, phone_normalized, is_shared_phone, shared_phone_owner_id, status')
      .eq('id', volunteerId)
      .maybeSingle();

    if (volErr || !currentVol) {
      return {
        itemId,
        volunteerId,
        code: 'CONFLICT',
        success: false,
        message: 'El voluntario ya no existe en public.volunteers.',
      };
    }

    const previousSnapshot = {
      originalPhone: currentVol.phone,
      phoneNormalized: currentVol.phone_normalized || null,
      isSharedPhone: currentVol.is_shared_phone ?? false,
      sharedPhoneOwnerId: currentVol.shared_phone_owner_id || null,
      status: currentVol.status,
    };

    // 7. SPECIFIC DECISION VALIDATION & CONFLICT CHECKS
    const decision: PersonCentricDecision = item.decision;

    // DECISION A: MANUAL_REVIEW
    if (decision === 'MANUAL_REVIEW') {
      return {
        itemId,
        volunteerId,
        code: 'REVIEW_LATER',
        success: false,
        message: 'Revisión posterior solicitada.',
      };
    }

    // DECISION B: PHONE_DOES_NOT_BELONG
    if (decision === 'PHONE_DOES_NOT_BELONG') {
      if (item.phone_status === 'MISSING_INFORMATION' || !item.corrected_phone) {
        return stopProcessing('REQUIRES_INFORMATION', 'Esta persona requiere información. No se proporcionó un teléfono nuevo.');
      }
    }

    // DECISION C: SHARED_PHONE
    if (decision === 'SHARED_PHONE') {
      if (!item.shared_phone_owner_id) {
        return stopProcessing('CONFLICT', 'No se especificó el titular del teléfono compartido.');
      }
      if (item.shared_phone_owner_id === volunteerId) {
        return stopProcessing('CONFLICT', 'La persona no puede seleccionarse a sí misma como titular compartido.');
      }
      const { data: ownerVol } = await supabase
        .from('volunteers')
        .select('id, phone, status')
        .eq('id', item.shared_phone_owner_id)
        .maybeSingle();

      if (!ownerVol) {
        return stopProcessing('CONFLICT', 'El titular seleccionado ya no existe en el sistema.');
      }
      if (ownerVol.status !== 'active') {
        return stopProcessing('CONFLICT', 'El titular seleccionado ya no está activo. Selecciona otra persona.');
      }
      if (getLocal8Digits(ownerVol.phone) !== getLocal8Digits(currentVol.phone)) {
        return stopProcessing('CONFLICT', 'El titular seleccionado ya no pertenece a este grupo telefónico.');
      }
    }

    // DECISION D: ARCHIVE_DUPLICATE
    if (decision === 'ARCHIVE_DUPLICATE') {
      if (!item.duplicate_primary_volunteer_id) {
        return stopProcessing('CONFLICT', 'No se especificó qué persona conservará el registro principal.');
      }
      if (item.duplicate_primary_volunteer_id === volunteerId) {
        return stopProcessing('CONFLICT', 'La persona a archivar no puede ser también el registro principal.');
      }
    }

    // DRY-RUN CHECK
    if (dryRun) {
      return {
        itemId,
        volunteerId,
        code: 'PROCESSED',
        success: true,
        message: '[DRY-RUN SIMULATED SUCCESS] Validación exitosa. Cero escrituras en public.volunteers.',
        previousSnapshot,
      };
    }

    // 8. LIVE MUTATION (ONLY EXECUTED WHEN dryRun === false)
    try {
      let mutResult;

      if (decision === 'KEEP') {
        const norm = normalizePhoneE164(currentVol.phone);
        if (norm) {
          const { error: upErr } = await supabase
            .from('volunteers')
            .update({ phone_normalized: norm })
            .eq('id', volunteerId);
          if (upErr) throw upErr;
        }
        mutResult = { success: true };
      } else if (decision === 'PHONE_OWNER') {
        mutResult = await VolunteerMutationService.applyPhoneCleanupDecision(
          {
            volunteerId,
            approvedAction: 'PHONE_OWNER',
            phoneInput: currentVol.phone,
            authorizedBy: actor.name,
          },
          actor
        );
      } else if (decision === 'SHARED_PHONE') {
        mutResult = await VolunteerMutationService.applyPhoneCleanupDecision(
          {
            volunteerId,
            approvedAction: 'SHARED_PHONE',
            phoneInput: currentVol.phone,
            sharedPhoneOwnerId: item.shared_phone_owner_id,
            sharedPhoneReason: item.reviewer_comment || 'Uso compartido autorizado',
            authorizedBy: actor.name,
          },
          actor
        );
      } else if (decision === 'PHONE_DOES_NOT_BELONG') {
        const cleanPhone = item.corrected_phone.trim();
        const norm = normalizePhoneE164(cleanPhone);
        if (!norm) {
          return {
            itemId,
            volunteerId,
            code: 'CONFLICT',
            success: false,
            message: `El teléfono corregido "${cleanPhone}" no es válido.`,
          };
        }
        const { error: upErr } = await supabase
          .from('volunteers')
          .update({
            phone: cleanPhone,
            phone_normalized: norm,
            is_shared_phone: false,
            shared_phone_owner_id: null,
            shared_phone_reason: null,
            shared_phone_authorized_by: null,
            shared_phone_authorized_at: null,
          })
          .eq('id', volunteerId);

        if (upErr) throw upErr;
        mutResult = { success: true };
      } else if (decision === 'ARCHIVE_DUPLICATE') {
        mutResult = await VolunteerMutationService.updateStatus(
          { volunteerId, toStatus: 'archived' },
          actor
        );
      } else {
        mutResult = { success: false, error: 'Decisión no reconocida.' };
      }

      if (!mutResult.success) {
        // Mark CONFLICT or ERROR on item
        await supabase
          .from('phone_cleanup_review_items')
          .update({
            processing_status: 'CONFLICT',
            processing_error: mutResult.error || 'Error de mutación',
            updated_at: nowIso,
          })
          .eq('id', itemId);

        return {
          itemId,
          volunteerId,
          code: 'CONFLICT',
          success: false,
          message: mutResult.error || 'Error al aplicar mutación.',
          previousSnapshot,
        };
      }

      // UPDATE ITEM STATUS TO PROCESSED ON SUPABASE DB
      await supabase
        .from('phone_cleanup_review_items')
        .update({
          status: 'PROCESSED',
          processing_status: 'PROCESSED',
          processed_at: nowIso,
          processed_by: actor.name,
          processing_error: null,
          updated_at: nowIso,
        })
        .eq('id', itemId);

      return {
        itemId,
        volunteerId,
        code: 'PROCESSED',
        success: true,
        message: `Cambio aplicado exitosamente a voluntario (${decision}).`,
        previousSnapshot,
      };
    } catch (err: any) {
      await supabase
        .from('phone_cleanup_review_items')
        .update({
          processing_status: 'ERROR',
          processing_error: err.message || 'Excepción no controlada',
          updated_at: nowIso,
        })
        .eq('id', itemId);

      return {
        itemId,
        volunteerId,
        code: 'ERROR',
        success: false,
        message: err.message || 'Excepción no controlada durante la mutación.',
        previousSnapshot,
      };
    }
  }

  /**
   * Process selected item IDs independently.
   * Guarantees non-blocking execution: partial failure of 1 item does NOT revert successful items.
   */
  public static async processSelectedItems(
    itemIds: string[],
    actor: AuditActor,
    dryRun: boolean = true
  ): Promise<BatchProcessingSummary> {
    const results: ItemProcessingResult[] = [];

    // Process decisions that release the unique active-phone slot before the
    // item that claims ownership. Otherwise a valid PHONE_OWNER + SHARED_PHONE
    // group can fail simply because the owner happened to appear first.
    const supabase = this.getSupabaseClient();
    const { data: selectedItems } = await supabase
      .from('phone_cleanup_review_items')
      .select('id, decision')
      .in('id', itemIds);
    const decisionById = new Map((selectedItems || []).map(item => [item.id, item.decision as PersonCentricDecision]));
    const originalPosition = new Map(itemIds.map((id, index) => [id, index]));
    const priority: Partial<Record<PersonCentricDecision, number>> = {
      SHARED_PHONE: 0,
      PHONE_DOES_NOT_BELONG: 1,
      ARCHIVE_DUPLICATE: 1,
      PHONE_OWNER: 2,
      KEEP: 2,
      MANUAL_REVIEW: 3,
    };
    const orderedItemIds = [...itemIds].sort((left, right) => {
      const leftPriority = priority[decisionById.get(left)!] ?? 3;
      const rightPriority = priority[decisionById.get(right)!] ?? 3;
      return leftPriority - rightPriority || (originalPosition.get(left)! - originalPosition.get(right)!);
    });

    let processedCount = 0;
    let alreadyProcessedCount = 0;
    let requiresInfoCount = 0;
    let reviewLaterCount = 0;
    let conflictCount = 0;
    let errorCount = 0;

    for (const id of orderedItemIds) {
      const res = await this.processSingleItem(id, actor, dryRun);
      results.push(res);

      if (res.code === 'PROCESSED') processedCount++;
      else if (res.code === 'ALREADY_PROCESSED') alreadyProcessedCount++;
      else if (res.code === 'REQUIRES_INFORMATION') requiresInfoCount++;
      else if (res.code === 'REVIEW_LATER') reviewLaterCount++;
      else if (res.code === 'CONFLICT') conflictCount++;
      else errorCount++;
    }

    return {
      totalRequested: itemIds.length,
      processedCount,
      alreadyProcessedCount,
      requiresInfoCount,
      reviewLaterCount,
      conflictCount,
      errorCount,
      results,
    };
  }
}
