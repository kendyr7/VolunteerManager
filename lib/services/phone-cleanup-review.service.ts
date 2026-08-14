import { createClient } from '@supabase/supabase-js';
import { getLocal8Digits, normalizePhoneE164 } from '@/lib/whatsapp';
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';

export type PersonCentricDecision =
  | 'KEEP'
  | 'PHONE_OWNER'
  | 'SHARED_PHONE'
  | 'PHONE_DOES_NOT_BELONG'
  | 'ARCHIVE_DUPLICATE'
  | 'MANUAL_REVIEW';

export type PersonCentricPhoneStatus =
  | 'CURRENT'
  | 'NEW_PHONE_PROVIDED'
  | 'MISSING_INFORMATION';

export type PersonCentricStatus =
  | 'LEGACY'
  | 'SAVED'
  | 'READY_TO_PROCESS'
  | 'REQUIRES_INFORMATION'
  | 'REVIEW_LATER';

export type PersonCentricProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'ERROR'
  | 'CONFLICT'
  | 'REQUIRES_INFORMATION';

export interface PersonCentricItemInput {
  volunteerId: string;
  decision: PersonCentricDecision;
  phoneStatus?: PersonCentricPhoneStatus;
  correctedPhone?: string | null;
  sharedPhoneOwnerId?: string | null;
  sharedPhoneReason?: string | null;
  duplicatePrimaryVolunteerId?: string | null;
  reviewerComment?: string | null;
}

export interface SavePersonCentricReviewInput {
  phoneNormalized: string;
  reviewedBy: string;
  reviewerComment?: string;
  items: PersonCentricItemInput[];
}

export interface VolunteerReviewMember {
  id: string;
  reviewItemId?: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string;
  status: 'active' | 'archived';
  age: number | null;
  committee: string;
  stake: string | null;
  neighborhood: string | null;
  createdAt: string;
  proposedAction?: 'PHONE_OWNER' | 'SHARED_PHONE' | 'ARCHIVE_DUPLICATE' | 'KEEP' | 'MANUAL_REVIEW';
  approvedAction?: 'PHONE_OWNER' | 'SHARED_PHONE' | 'ARCHIVE_DUPLICATE' | 'KEEP' | 'MANUAL_REVIEW';
  decision?: PersonCentricDecision | null;
  phoneStatus?: PersonCentricPhoneStatus;
  sharedPhoneOwnerId?: string | null;
  correctedPhone?: string | null;
  duplicatePrimaryVolunteerId?: string | null;
  reviewItemStatus?: PersonCentricStatus;
  processingStatus?: PersonCentricProcessingStatus;
  processingError?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
  reviewerComment?: string | null;
}

export interface PhoneGroupReviewItem {
  groupId: number;
  phoneNormalized: string;
  local8Digits: string;
  volunteers: VolunteerReviewMember[];
  proposedAction: 'SHARED_PHONE' | 'ARCHIVE_DUPLICATE' | 'NORMALIZE_ONLY' | 'MANUAL_REVIEW';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  isHighRisk: boolean;
  highRiskReason?: string;
  reviewStatus: 'DRAFT' | 'REVIEWED' | 'READY' | 'PROCESSED' | 'NEEDS_INFORMATION' | 'ERROR' | 'REJECTED' | 'PENDING' | 'APPROVED';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerComment?: string;
  decisionAction?: string;
  primaryVolunteerId?: string;
  archivedVolunteerIds?: string[];
  sharedPhoneOwnerId?: string;
  sharedPhoneReason?: string;
}

export interface AppliedPhoneReviewMember {
  reviewItemId: string;
  volunteerId: string;
  fullName: string;
  committee: string;
  status: 'active' | 'archived';
  originalPhone: string;
  resultingPhone: string;
  decision: PersonCentricDecision;
  sharedPhoneOwnerId?: string | null;
  sharedPhoneOwnerName?: string | null;
  duplicatePrimaryVolunteerId?: string | null;
  duplicatePrimaryVolunteerName?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
}

export interface AppliedPhoneReviewGroup {
  reviewId: string;
  phoneNormalized: string;
  processedAt?: string | null;
  processedBy: string[];
  currentMembers: Array<{
    volunteerId: string;
    fullName: string;
    committee: string;
  }>;
  members: AppliedPhoneReviewMember[];
}

export interface PerVolunteerDecisionItem {
  volunteerId: string;
  approvedAction: 'PHONE_OWNER' | 'SHARED_PHONE' | 'ARCHIVE_DUPLICATE' | 'KEEP' | 'MANUAL_REVIEW';
  decision?: PersonCentricDecision | null;
  sharedPhoneOwnerId?: string;
  correctedPhone?: string | null;
  reviewerComment?: string;
  processingStatus?: PersonCentricProcessingStatus;
  processingError?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
}

export interface SubmitPerVolunteerGroupReviewInput {
  phoneNormalized: string;
  reviewStatus: 'APPROVED' | 'REJECTED';
  reviewedBy: string;
  reviewerComment: string;
  decisions?: PerVolunteerDecisionItem[];
  decisionAction?: string;
  primaryVolunteerId?: string;
  archivedVolunteerIds?: string[];
  sharedPhoneOwnerId?: string;
  sharedPhoneReason?: string;
}

export interface ExecutionSummaryPreview {
  totalToProcess: number;
  sharedPhoneCount: number;
  archiveCount: number;
  normalizeCount: number;
  manualReviewCount: number;
}

export class PhoneCleanupReviewService {
  /**
   * Get Supabase client helper
   */
  private static getSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Helper for tests backward compatibility
   */
  public static clearInMemoryReviewsStore() {
    // No-op in Person-Centric Supabase implementation
  }

  /**
   * FASE C: Save Person-Centric Review Decision directly to Supabase DB.
   * ABSOLUTE PROTECTION: GUARANTEED ZERO MUTATIONS ON public.volunteers.
   */
  public static async savePersonCentricReview(input: SavePersonCentricReviewInput): Promise<{
    success: boolean;
    reviewId: string;
    message: string;
  }> {
    if (!input.reviewedBy || !input.reviewedBy.trim()) {
      throw new Error('ValidationError: Debe indicar el nombre del administrador revisor (reviewedBy).');
    }

    if (!input.phoneNormalized || !input.phoneNormalized.trim()) {
      throw new Error('ValidationError: El teléfono normalizado es obligatorio.');
    }

    if (!input.items || input.items.length === 0) {
      throw new Error('ValidationError: Debe incluir al menos una persona en la revisión.');
    }

    // VALIDATION 1: Max 1 PHONE_OWNER per phone
    const owners = input.items.filter(i => i.decision === 'PHONE_OWNER');
    if (owners.length > 1) {
      throw new Error('ValidationError: Solo se permite 1 TITULAR DEL TELÉFONO (PHONE_OWNER) por número.');
    }

    // VALIDATION 2: SHARED_PHONE requires a valid PHONE_OWNER in the same input or group
    const sharedItems = input.items.filter(i => i.decision === 'SHARED_PHONE');
    if (sharedItems.length > 0) {
      if (owners.length === 0 && !sharedItems.some(s => s.sharedPhoneOwnerId)) {
        throw new Error('ValidationError: Las personas con "COMPARTE ESTE TELÉFONO" requieren seleccionar un TITULAR DEL TELÉFONO válido.');
      }
    }

    const supabase = this.getSupabaseClient();
    const nowIso = new Date().toISOString();

    // 1. Fetch raw volunteer phones for original_phone preservation
    const volIds = input.items.map(i => i.volunteerId);
    const { data: rawVols, error: volErr } = await supabase
      .from('volunteers')
      .select('id, phone')
      .in('id', volIds);

    if (volErr || !rawVols) {
      throw new Error(`DatabaseError: Error al consultar los voluntarios en Supabase: ${volErr?.message}`);
    }

    const volPhoneMap = new Map<string, string>();
    rawVols.forEach(v => volPhoneMap.set(v.id, v.phone || ''));

    // 2. UPSERT Parent Review Group in phone_cleanup_reviews
    const { data: parentData, error: parentErr } = await supabase
      .from('phone_cleanup_reviews')
      .upsert(
        {
          phone_normalized: input.phoneNormalized,
          review_status: 'APPROVED',
          reviewed_by: input.reviewedBy,
          reviewed_at: nowIso,
          reviewer_comment: input.reviewerComment || 'Revisión centrada en personas guardada.',
          updated_at: nowIso,
        },
        { onConflict: 'phone_normalized' }
      )
      .select('id')
      .single();

    if (parentErr || !parentData) {
      throw new Error(`DatabaseError: Error al guardar la revisión padre en Supabase: ${parentErr?.message}`);
    }

    const reviewId = parentData.id;

    // 3. UPSERT Item Decisions in phone_cleanup_review_items (Unique on review_id, volunteer_id)
    const itemRows = input.items.map(item => {
      const origPhone = volPhoneMap.get(item.volunteerId) || 'N/A';
      let phoneStatus: PersonCentricPhoneStatus = 'CURRENT';
      let itemStatus: PersonCentricStatus = 'SAVED';
      let processingStatus: PersonCentricProcessingStatus = 'PENDING';
      let cleanCorrectedPhone: string | null = null;

      if (item.decision === 'PHONE_DOES_NOT_BELONG') {
        if (item.correctedPhone && item.correctedPhone.trim().length >= 8) {
          const norm = normalizePhoneE164(item.correctedPhone.trim());
          cleanCorrectedPhone = norm ? norm.replace('+505', '') : item.correctedPhone.trim();
          phoneStatus = 'NEW_PHONE_PROVIDED';
          itemStatus = 'READY_TO_PROCESS';
          processingStatus = 'PENDING';
        } else {
          phoneStatus = 'MISSING_INFORMATION';
          itemStatus = 'REQUIRES_INFORMATION';
          processingStatus = 'PENDING';
          cleanCorrectedPhone = null;
        }
      } else if (item.decision === 'MANUAL_REVIEW') {
        phoneStatus = 'CURRENT';
        itemStatus = 'REVIEW_LATER';
        processingStatus = 'PENDING';
      } else if (item.decision === 'KEEP' || item.decision === 'PHONE_OWNER' || item.decision === 'SHARED_PHONE' || item.decision === 'ARCHIVE_DUPLICATE') {
        phoneStatus = 'CURRENT';
        itemStatus = 'READY_TO_PROCESS';
        processingStatus = 'PENDING';
      }

      const legacyApprovedAction = (item.decision === 'PHONE_DOES_NOT_BELONG' ? 'MANUAL_REVIEW' : item.decision) || 'MANUAL_REVIEW';

      return {
        review_id: reviewId,
        volunteer_id: item.volunteerId,
        proposed_action: 'MANUAL_REVIEW',
        approved_action: legacyApprovedAction,
        original_phone: origPhone,
        decision: item.decision,
        phone_status: phoneStatus,
        corrected_phone: cleanCorrectedPhone,
        shared_phone_owner_id: item.sharedPhoneOwnerId || (owners.length > 0 ? owners[0].volunteerId : null),
        duplicate_primary_volunteer_id: item.duplicatePrimaryVolunteerId || null,
        reviewer_comment: item.reviewerComment || item.sharedPhoneReason || null,
        status: itemStatus,
        processing_status: processingStatus,
        updated_at: nowIso,
      };
    });

    const { error: itemsErr } = await supabase
      .from('phone_cleanup_review_items')
      .upsert(itemRows, { onConflict: 'review_id,volunteer_id' });

    if (itemsErr) {
      throw new Error(`DatabaseError: Error al guardar los ítems de revisión en Supabase: ${itemsErr.message}`);
    }

    return {
      success: true,
      reviewId,
      message: `Revisión guardada y persistida en Supabase PostgreSQL para ${input.items.length} personas.`,
    };
  }

  /**
   * Load all duplicate phone groups with raw volunteer records and saved Supabase review decisions.
   * Preserves historical legacy rows with status = 'LEGACY' and decision = NULL.
   */
  public static async getDuplicatePhoneGroups(includeProcessed: boolean = false): Promise<PhoneGroupReviewItem[]> {
    const supabase = this.getSupabaseClient();

    // 1. Fetch raw volunteers (READ-ONLY)
    const rawVolunteers = await fetchAllRowsStrict<any>(
      supabase,
      'volunteers',
      'id, first_name, last_name, email, phone, status, age, stake, neighborhood, committee_id, created_at, committees(name)',
      query => query.order('created_at', { ascending: true })
    );

    // 2. Fetch existing review records directly from Supabase DB tables
    const dbReviewsMap = new Map<string, any>();
    const dbItemsMap = new Map<string, Map<string, any>>();

    try {
      const dbReviews = await fetchAllRowsStrict<any>(supabase, 'phone_cleanup_reviews');
      if (Array.isArray(dbReviews)) {
        dbReviews.forEach(r => dbReviewsMap.set(r.phone_normalized, r));
      }

      const dbItems = await fetchAllRowsStrict<any>(supabase, 'phone_cleanup_review_items');
      if (Array.isArray(dbItems)) {
        const reviewPhoneById = new Map<string, string>(
          Array.from(dbReviewsMap.values()).map((review: any) => [review.id, review.phone_normalized])
        );
        dbItems.forEach(item => {
          const phone = reviewPhoneById.get(item.review_id);
          if (phone) {
            const subMap = dbItemsMap.get(phone) || new Map<string, any>();
            subMap.set(item.volunteer_id, {
              reviewItemId: item.id,
              volunteerId: item.volunteer_id,
              originalPhone: item.original_phone,
              decision: item.decision || null, // Preserves NULL for LEGACY rows
              approvedAction: item.approved_action, // Preserves LEGACY action
              proposedAction: item.proposed_action, // Preserves LEGACY action
              phoneStatus: item.phone_status || 'CURRENT',
              sharedPhoneOwnerId: item.shared_phone_owner_id,
              correctedPhone: item.corrected_phone,
              duplicatePrimaryVolunteerId: item.duplicate_primary_volunteer_id,
              reviewItemStatus: item.status || 'LEGACY',
              processingStatus: item.processing_status || 'PENDING',
              processingError: item.processing_error,
              processedAt: item.processed_at,
              processedBy: item.processed_by,
              reviewerComment: item.reviewer_comment,
            });
            dbItemsMap.set(phone, subMap);
          }
        });
      }
    } catch (error) {
      throw new Error(`No se pudo cargar el estado completo de las revisiones: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }

    const volunteers: VolunteerReviewMember[] = rawVolunteers.map(v => ({
      id: v.id,
      firstName: v.first_name || '',
      lastName: v.last_name || '',
      fullName: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
      email: v.email || null,
      phone: v.phone || '',
      status: v.status as 'active' | 'archived',
      age: v.age ?? null,
      committee: (v as any).committees?.name || 'Sin comité',
      stake: v.stake || null,
      neighborhood: v.neighborhood || null,
      createdAt: v.created_at,
    }));

    // Group by 8-digit phone
    const phoneMap = new Map<string, VolunteerReviewMember[]>();
    volunteers.forEach(v => {
      if (!v.phone) return;
      const local8 = getLocal8Digits(v.phone);
      if (!local8 || local8.length !== 8) return;
      const list = phoneMap.get(local8) || [];
      list.push(v);
      phoneMap.set(local8, list);
    });

    const groupItems: PhoneGroupReviewItem[] = [];
    let groupIndex = 1;

    phoneMap.forEach((vols, local8) => {
      if (vols.length > 1) {
        const normPhone = normalizePhoneE164(vols[0].phone) || `+505${local8}`;
        const activeVols = vols.filter(v => v.status === 'active');

        // Evaluate risk & proposal
        const hasMinors = vols.some(v => typeof v.age === 'number' && v.age < 18);
        const hasAdults = vols.some(v => typeof v.age === 'number' && v.age >= 18);
        const isMassive = activeVols.length >= 3;

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
        let proposedAction: PhoneGroupReviewItem['proposedAction'] = 'MANUAL_REVIEW';
        let isHighRisk = false;
        let highRiskReason = '';
        let reason = '';

        if (isMassive) {
          isHighRisk = true;
          riskLevel = 'HIGH';
          confidence = 'LOW';
          highRiskReason = `Grupo masivo con ${activeVols.length} voluntarios activos.`;
        } else if (hasMinors && hasAdults) {
          isHighRisk = true;
          riskLevel = 'HIGH';
          confidence = 'HIGH';
          highRiskReason = 'Presencia de menores de edad compartiendo teléfono con adultos.';
        }

        if (activeVols.length <= 1) {
          proposedAction = 'NORMALIZE_ONLY';
          confidence = 'HIGH';
          reason = 'Existe 1 solo voluntario activo y perfiles archivados.';
        } else if (hasMinors && hasAdults) {
          proposedAction = 'SHARED_PHONE';
          confidence = 'HIGH';
          reason = 'Adulto tutor y menor de edad comparten teléfono de contacto.';
        } else if (vols.length === 2) {
          proposedAction = 'SHARED_PHONE';
          confidence = 'MEDIUM';
          reason = 'Integrantes activos independientes compartiendo teléfono.';
        } else {
          proposedAction = 'MANUAL_REVIEW';
          confidence = 'LOW';
          reason = 'Conflicto de múltiples voluntariados activos. Requiere revisión manual.';
        }

        // Merge saved review record from Supabase DB
        const activeReview = dbReviewsMap.get(normPhone);
        const itemsMap = dbItemsMap.get(normPhone);

        const adultOwner = vols.find(v => typeof v.age === 'number' && v.age >= 18) || vols[0];

        const volsWithDecisions: VolunteerReviewMember[] = vols.map(v => {
          const itemDecision = itemsMap?.get(v.id);
          let proposedVolAction: VolunteerReviewMember['proposedAction'] = 'MANUAL_REVIEW';

          if (proposedAction === 'NORMALIZE_ONLY') {
            proposedVolAction = 'KEEP';
          } else if (proposedAction === 'SHARED_PHONE') {
            proposedVolAction = v.id === adultOwner.id ? 'PHONE_OWNER' : 'SHARED_PHONE';
          } else if ((proposedAction as string) === 'ARCHIVE_DUPLICATE') {
            proposedVolAction = v.id === adultOwner.id ? 'KEEP' : 'ARCHIVE_DUPLICATE';
          }

          return {
            ...v,
            reviewItemId: itemDecision?.reviewItemId || null,
            proposedAction: proposedVolAction,
            approvedAction: itemDecision?.approvedAction,
            decision: itemDecision?.decision || null, // NULL for LEGACY rows
            phoneStatus: itemDecision?.phoneStatus || 'CURRENT',
            sharedPhoneOwnerId: itemDecision?.sharedPhoneOwnerId || (proposedVolAction === 'SHARED_PHONE' ? adultOwner.id : null),
            correctedPhone: itemDecision?.correctedPhone || null,
            duplicatePrimaryVolunteerId: itemDecision?.duplicatePrimaryVolunteerId || null,
            reviewItemStatus: itemDecision?.reviewItemStatus || 'LEGACY',
            processingStatus: itemDecision?.processingStatus || 'PENDING',
            processingError: itemDecision?.processingError || null,
            processedAt: itemDecision?.processedAt || null,
            processedBy: itemDecision?.processedBy || null,
            reviewerComment: itemDecision?.reviewerComment || null,
          };
        });

        const allVolsProcessed = volsWithDecisions.length > 0 && volsWithDecisions.every(v => v.processingStatus === 'PROCESSED' || v.status === 'archived');
        const isDbProcessed = activeReview?.review_status === 'PROCESSED' || activeReview?.reviewStatus === 'PROCESSED';
        const computedReviewStatus = (allVolsProcessed || isDbProcessed) ? 'PROCESSED' : ((activeReview?.review_status || activeReview?.reviewStatus || 'PENDING') as PhoneGroupReviewItem['reviewStatus']);

        if (!includeProcessed && computedReviewStatus === 'PROCESSED') {
          return;
        }

        groupItems.push({
          groupId: groupIndex++,
          phoneNormalized: normPhone,
          local8Digits: local8,
          volunteers: volsWithDecisions,
          proposedAction,
          riskLevel,
          confidence,
          reason,
          isHighRisk,
          highRiskReason: isHighRisk ? highRiskReason : undefined,
          reviewStatus: computedReviewStatus,
          reviewedBy: activeReview?.reviewed_by || activeReview?.reviewedBy,
          reviewedAt: activeReview?.reviewed_at || activeReview?.reviewedAt,
          reviewerComment: activeReview?.reviewer_comment || activeReview?.reviewerComment,
          decisionAction: activeReview?.decision_action || activeReview?.decisionAction,
          primaryVolunteerId: activeReview?.primary_volunteer_id || activeReview?.primaryVolunteerId,
          archivedVolunteerIds: activeReview?.archived_volunteer_ids || activeReview?.archivedVolunteerIds,
          sharedPhoneOwnerId: activeReview?.shared_phone_owner_id || activeReview?.sharedPhoneOwnerId,
          sharedPhoneReason: activeReview?.shared_phone_reason || activeReview?.sharedPhoneReason,
        });
      }
    });

    return groupItems.sort((a, b) => {
      if (a.riskLevel === 'HIGH' && b.riskLevel !== 'HIGH') return -1;
      if (a.riskLevel !== 'HIGH' && b.riskLevel === 'HIGH') return 1;
      if (a.confidence === 'LOW' && b.confidence !== 'LOW') return -1;
      if (a.confidence !== 'LOW' && b.confidence === 'LOW') return 1;
      return b.volunteers.length - a.volunteers.length;
    });
  }

  /**
   * Audit history grouped by the original phone review. This intentionally
   * reads review items directly instead of rebuilding history from current
   * duplicate phones, because a corrected phone is no longer part of its
   * original duplicate group.
   */
  public static async getAppliedPhoneGroups(): Promise<AppliedPhoneReviewGroup[]> {
    const supabase = this.getSupabaseClient();
    const [rawVolunteers, reviews, items] = await Promise.all([
      fetchAllRowsStrict<any>(
        supabase,
        'volunteers',
        'id, first_name, last_name, phone, status, committee_id, committees(name)'
      ),
      fetchAllRowsStrict<any>(supabase, 'phone_cleanup_reviews', 'id, phone_normalized'),
      fetchAllRowsStrict<any>(
        supabase,
        'phone_cleanup_review_items',
        'id, review_id, volunteer_id, original_phone, corrected_phone, decision, processing_status, processed_at, processed_by, shared_phone_owner_id, duplicate_primary_volunteer_id'
      ),
    ]);

    const volunteerById = new Map(rawVolunteers.map(volunteer => [volunteer.id, volunteer]));
    const phoneByReviewId = new Map(reviews.map(review => [review.id, review.phone_normalized]));
    const currentMembersByPhone = new Map<string, AppliedPhoneReviewGroup['currentMembers']>();
    const groups = new Map<string, AppliedPhoneReviewGroup>();

    rawVolunteers
      .filter(volunteer => volunteer.status === 'active' && volunteer.phone)
      .forEach(volunteer => {
        const phoneNormalized = normalizePhoneE164(volunteer.phone);
        if (!phoneNormalized) return;
        const currentMembers = currentMembersByPhone.get(phoneNormalized) || [];
        currentMembers.push({
          volunteerId: volunteer.id,
          fullName: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim(),
          committee: volunteer?.committees?.name || 'Sin comité',
        });
        currentMembersByPhone.set(phoneNormalized, currentMembers);
      });

    items
      .filter(item => item.processing_status === 'PROCESSED' && item.decision)
      .forEach(item => {
        const phoneNormalized = phoneByReviewId.get(item.review_id);
        if (!phoneNormalized) return;

        const volunteer = volunteerById.get(item.volunteer_id);
        const sharedOwner = item.shared_phone_owner_id
          ? volunteerById.get(item.shared_phone_owner_id)
          : null;
        const duplicatePrimary = item.duplicate_primary_volunteer_id
          ? volunteerById.get(item.duplicate_primary_volunteer_id)
          : null;

        const fullName = volunteer
          ? `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim()
          : 'Voluntario no disponible';
        const resultingPhone = volunteer?.phone || item.corrected_phone || item.original_phone || phoneNormalized;

        const group: AppliedPhoneReviewGroup = groups.get(item.review_id) || {
          reviewId: item.review_id,
          phoneNormalized,
          processedAt: null,
          processedBy: [],
          currentMembers: currentMembersByPhone.get(phoneNormalized) || [],
          members: [],
        };

        group.members.push({
          reviewItemId: item.id,
          volunteerId: item.volunteer_id,
          fullName,
          committee: volunteer?.committees?.name || 'Sin comité',
          status: volunteer?.status === 'archived' ? 'archived' : 'active',
          originalPhone: item.original_phone || phoneNormalized,
          resultingPhone,
          decision: item.decision as PersonCentricDecision,
          sharedPhoneOwnerId: item.shared_phone_owner_id,
          sharedPhoneOwnerName: sharedOwner
            ? `${sharedOwner.first_name || ''} ${sharedOwner.last_name || ''}`.trim()
            : null,
          duplicatePrimaryVolunteerId: item.duplicate_primary_volunteer_id,
          duplicatePrimaryVolunteerName: duplicatePrimary
            ? `${duplicatePrimary.first_name || ''} ${duplicatePrimary.last_name || ''}`.trim()
            : null,
          processedAt: item.processed_at,
          processedBy: item.processed_by,
        });

        if (item.processed_at && (!group.processedAt || item.processed_at > group.processedAt)) {
          group.processedAt = item.processed_at;
        }
        if (item.processed_by && !group.processedBy.includes(item.processed_by)) {
          group.processedBy.push(item.processed_by);
        }

        groups.set(item.review_id, group);
      });

    return Array.from(groups.values())
      .map(group => ({
        ...group,
        members: group.members.sort((left, right) => {
          if (left.decision === 'PHONE_OWNER' && right.decision !== 'PHONE_OWNER') return -1;
          if (left.decision !== 'PHONE_OWNER' && right.decision === 'PHONE_OWNER') return 1;
          return left.fullName.localeCompare(right.fullName, 'es', { sensitivity: 'base' });
        }),
      }))
      .sort((left, right) => (right.processedAt || '').localeCompare(left.processedAt || ''));
  }

  /**
   * Legacy method maintained for backward compatibility with old Server Actions.
   */
  public static async submitGroupReviewDecision(input: SubmitPerVolunteerGroupReviewInput): Promise<{
    success: boolean;
    reviewId?: string;
    message: string;
  }> {
    const itemsPayload: PersonCentricItemInput[] = (input.decisions || []).map(d => ({
      volunteerId: d.volunteerId,
      decision: (d.approvedAction as PersonCentricDecision) || 'MANUAL_REVIEW',
      sharedPhoneOwnerId: d.sharedPhoneOwnerId,
      correctedPhone: d.correctedPhone,
    }));

    const res = await this.savePersonCentricReview({
      phoneNormalized: input.phoneNormalized,
      reviewedBy: input.reviewedBy,
      reviewerComment: input.reviewerComment,
      items: itemsPayload,
    });

    return {
      success: res.success,
      reviewId: res.reviewId,
      message: res.message,
    };
  }

  /**
   * Previews execution counts for pending APPROVED decisions
   */
  public static async getExecutionPreview(): Promise<ExecutionSummaryPreview> {
    const groups = await this.getDuplicatePhoneGroups(false);

    let sharedPhoneCount = 0;
    let archiveCount = 0;
    let normalizeCount = 0;
    let manualReviewCount = 0;
    let totalToProcess = 0;

    groups.forEach(g => {
      g.volunteers.forEach(v => {
        if (v.reviewItemStatus === 'REVIEW_LATER' || v.processingStatus === 'PENDING') {
          manualReviewCount++;
        } else if (v.reviewItemStatus === 'READY_TO_PROCESS' && v.processingStatus !== 'PROCESSED') {
          totalToProcess++;
          if (v.decision === 'SHARED_PHONE') sharedPhoneCount++;
          else if (v.decision === 'ARCHIVE_DUPLICATE') archiveCount++;
          else if (v.decision === 'PHONE_OWNER' || v.decision === 'KEEP') normalizeCount++;
        }
      });
    });

    return {
      totalToProcess,
      sharedPhoneCount,
      archiveCount,
      normalizeCount,
      manualReviewCount,
    };
  }

  /**
   * Disabled in Phase C until Phase F authorization.
   */
  public static async processApprovedDecisions(processedBy: string): Promise<{
    success: boolean;
    processedCount: number;
    skippedCount: number;
    errorCount: number;
    errors: Array<{ volunteerId: string; phoneNormalized: string; error: string }>;
    message: string;
  }> {
    throw new Error('PhaseCProtectionError: El procesamiento real de voluntarios está deshabilitado en la Fase C.');
  }
}
