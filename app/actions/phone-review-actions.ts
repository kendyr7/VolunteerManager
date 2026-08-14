'use server'

import {
  PhoneCleanupReviewService,
  PhoneGroupReviewItem,
  AppliedPhoneReviewGroup,
  SavePersonCentricReviewInput,
  SubmitPerVolunteerGroupReviewInput,
  ExecutionSummaryPreview
} from '@/lib/services/phone-cleanup-review.service';
import {
  PhoneCleanupProcessingService,
  BatchProcessingSummary
} from '@/lib/services/phone-cleanup-processing.service';
import { AuditActor } from '@/lib/services/volunteer-audit-writer';
import { requireCapability } from '@/lib/authorization';

export async function fetchPhoneCleanupGroupsAction(includeProcessed: boolean = false): Promise<{
  success: boolean;
  data: PhoneGroupReviewItem[];
  appliedGroups: AppliedPhoneReviewGroup[];
  error?: string;
}> {
  try {
    await requireCapability('manage_platform_users');
    const [groups, appliedGroups] = await Promise.all([
      PhoneCleanupReviewService.getDuplicatePhoneGroups(includeProcessed),
      PhoneCleanupReviewService.getAppliedPhoneGroups(),
    ]);
    return { success: true, data: groups, appliedGroups };
  } catch (err: any) {
    console.error('Error in fetchPhoneCleanupGroupsAction:', err);
    return { success: false, data: [], appliedGroups: [], error: err.message || 'Error al cargar teléfonos' };
  }
}

export async function savePersonCentricReviewAction(
  input: Omit<SavePersonCentricReviewInput, 'reviewedBy'> & { reviewedBy?: string }
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const authorization = await requireCapability('manage_platform_users');
    const result = await PhoneCleanupReviewService.savePersonCentricReview({
      ...input,
      reviewedBy: authorization.name,
    });
    return { success: result.success, message: result.message };
  } catch (err: any) {
    console.error('Error in savePersonCentricReviewAction:', err);
    return { success: false, message: '', error: err.message || 'Error al guardar el progreso' };
  }
}

/**
 * Controlled Action for applying selected ready-to-process items.
 * Strictly calls PhoneCleanupProcessingService.processSelectedItems.
 */
export async function applyPhoneCleanupItemsAction(
  itemIds: string[],
  dryRun: boolean = true
): Promise<{
  success: boolean;
  summary?: BatchProcessingSummary;
  error?: string;
}> {
  try {
    const authorization = await requireCapability('manage_platform_users');
    const actor: AuditActor = {
      name: authorization.name,
      role: authorization.role,
    };

    const summary = await PhoneCleanupProcessingService.processSelectedItems(itemIds, actor, dryRun);
    return { success: true, summary };
  } catch (err: any) {
    console.error('Error in applyPhoneCleanupItemsAction:', err);
    return { success: false, error: err.message || 'Error al procesar los ítems seleccionados' };
  }
}

export async function submitPhoneCleanupDecisionAction(input: SubmitPerVolunteerGroupReviewInput): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    await requireCapability('manage_platform_users');
    const result = await PhoneCleanupReviewService.submitGroupReviewDecision(input);
    return { success: result.success, message: result.message };
  } catch (err: any) {
    console.error('Error in submitPhoneCleanupDecisionAction:', err);
    return { success: false, message: '', error: err.message || 'Error al guardar decisión' };
  }
}

export async function getExecutionPreviewAction(): Promise<{
  success: boolean;
  data?: ExecutionSummaryPreview;
  error?: string;
}> {
  try {
    await requireCapability('manage_platform_users');
    const preview = await PhoneCleanupReviewService.getExecutionPreview();
    return { success: true, data: preview };
  } catch (err: any) {
    console.error('Error in getExecutionPreviewAction:', err);
    return { success: false, error: err.message || 'Error al calcular resumen' };
  }
}

export async function processApprovedPhoneCleanupDecisionsAction(processedBy: string): Promise<{
  success: boolean;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ volunteerId: string; phoneNormalized: string; error: string }>;
  message: string;
}> {
  try {
    const authorization = await requireCapability('manage_platform_users');
    return await PhoneCleanupReviewService.processApprovedDecisions(authorization.name);
  } catch (err: any) {
    console.error('Error in processApprovedPhoneCleanupDecisionsAction:', err);
    return {
      success: false,
      processedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: [{ volunteerId: 'system', phoneNormalized: 'N/A', error: err.message || 'Error de procesamiento' }],
      message: err.message || 'Error al procesar decisiones aprobadas',
    };
  }
}
