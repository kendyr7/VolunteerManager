import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runForensicAuditA1() {
  console.log('===========================================================');
  console.log('  FASE A.1: AUDITORÍA FORENSE Y RECUPERACIÓN READ-ONLY    ');
  console.log('===========================================================\n');

  // 1. INVENTARIO DE public.volunteers
  const { count: totalVolunteers } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  const { count: phoneNormNullCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).is('phone_normalized', null);
  const { count: phoneNormNotNullCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);
  const { count: isSharedTrueCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', true);
  const { count: ownerNotNullCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('shared_phone_owner_id', 'is', null);
  const { count: reasonNotNullCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('shared_phone_reason', 'is', null);
  const { count: authByNotNullCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('shared_phone_authorized_by', 'is', null);
  const { count: authAtNotNullCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('shared_phone_authorized_at', 'is', null);

  // Fetch detailed records of volunteers that have non-null phone_normalized or is_shared_phone = true
  const { data: affectedVolunteers } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, phone_normalized, is_shared_phone, shared_phone_owner_id, shared_phone_reason, shared_phone_authorized_by, shared_phone_authorized_at, status')
    .or('phone_normalized.not.is.null,is_shared_phone.eq.true');

  const formattedAffectedVolunteers = (affectedVolunteers || []).map(v => ({
    volunteerId: v.id,
    fullName: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
    phone: v.phone,
    phoneNormalized: v.phone_normalized,
    isSharedPhone: v.is_shared_phone,
    sharedPhoneOwnerId: v.shared_phone_owner_id,
    sharedPhoneReason: v.shared_phone_reason,
    sharedPhoneAuthorizedBy: v.shared_phone_authorized_by,
    sharedPhoneAuthorizedAt: v.shared_phone_authorized_at,
    status: v.status,
  }));

  // 2. AUDITORÍA DE phone_cleanup_reviews
  const { data: rawReviews } = await supabase.from('phone_cleanup_reviews').select('*').order('created_at', { ascending: true });
  const reviewsList = rawReviews || [];

  const reviewsByStatus: Record<string, number> = {};
  reviewsList.forEach(r => {
    reviewsByStatus[r.review_status] = (reviewsByStatus[r.review_status] || 0) + 1;
  });

  // 3. AUDITORÍA DE phone_cleanup_review_items
  const { data: rawItems } = await supabase.from('phone_cleanup_review_items').select('*').order('created_at', { ascending: true });
  const itemsList = rawItems || [];

  // 4. RELACIONAR DECISIONES CON VOLUNTARIOS
  const { data: allVolunteersForJoin } = await supabase.from('volunteers').select('id, first_name, last_name, phone, status');
  const volsMap = new Map<string, any>();
  (allVolunteersForJoin || []).forEach(v => volsMap.set(v.id, v));

  const joinedItems = itemsList.map(item => {
    const vol = volsMap.get(item.volunteer_id);
    const parentRev = reviewsList.find(r => r.id === item.review_id);
    return {
      itemId: item.id,
      reviewId: item.review_id,
      reviewPhoneNormalized: parentRev?.phone_normalized || 'N/A',
      parentReviewStatus: parentRev?.review_status || 'N/A',
      parentReviewedBy: parentRev?.reviewed_by || 'N/A',
      parentReviewedAt: parentRev?.reviewed_at || 'N/A',
      volunteerId: item.volunteer_id,
      fullName: vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'NO ENCONTRADO EN BD',
      currentVolunteerPhone: vol?.phone || 'N/A',
      currentVolunteerStatus: vol?.status || 'N/A',
      originalPhoneInReview: item.original_phone || vol?.phone || 'N/A',
      proposedAction: item.proposed_action,
      approvedAction: item.approved_action,
      correctedPhone: item.corrected_phone || null,
      sharedPhoneOwnerId: item.shared_phone_owner_id || null,
      reviewerComment: item.reviewer_comment || null,
      itemProcessingStatus: item.processing_status,
      itemProcessingError: item.processing_error || null,
      itemProcessedAt: item.processed_at || null,
      itemProcessedBy: item.processed_by || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });

  // 5. CLASIFICAR LAS DECISIONES EXISTENTES
  const classifiedItems = joinedItems.map(item => {
    let classification = 'G. NO SE PUEDE DETERMINAR';
    let reasoning = '';

    const revBy = item.parentReviewedBy || '';
    const procBy = item.itemProcessedBy || '';
    const comment = item.reviewerComment || '';

    // Check if test script artifact
    const isTestActor = revBy.includes('Tester') || revBy.includes('Test') || procBy.includes('Tester') || procBy.includes('Test');
    const isCustomUserComment = comment.includes('No es su numero') || comment.includes('no es su numero') || comment.includes('revisar con');

    if (item.itemProcessingStatus === 'PROCESSED') {
      if (isTestActor) {
        classification = 'B. POSIBLE PRUEBA AUTOMATIZADA';
        reasoning = `Ejecutado por actor de prueba/test: "${revBy || procBy}"`;
      } else {
        classification = 'D. YA PROCESADO';
        reasoning = `Procesado exitosamente por ${procBy || revBy} el ${item.itemProcessedAt}`;
      }
    } else if (isCustomUserComment) {
      classification = 'A. POSIBLE DECISIÓN MANUAL';
      reasoning = `Contiene comentario administrativo libre registrado por usuario: "${comment}"`;
    } else if (isTestActor) {
      classification = 'B. POSIBLE PRUEBA AUTOMATIZADA';
      reasoning = `Registrado por script de test: "${revBy}"`;
    } else if (comment.includes('Decisión individual por voluntario registrada') || comment.includes('Plan de saneamiento pre-evaluado')) {
      classification = 'C. PLAN AUTOMÁTICO';
      reasoning = `Comentario genérico precargado de sugerencias de plan algorítmico`;
    } else if (item.itemProcessingStatus === 'PENDING') {
      classification = 'E. PENDIENTE';
      reasoning = `Registrado en estado PENDING sin procesar`;
    } else {
      classification = 'G. NO SE PUEDE DETERMINAR';
      reasoning = `Origen no atribuible con certeza a prueba o usuario humano`;
    }

    // Check if phone conflict (current phone in volunteers != review phone)
    if (item.currentVolunteerPhone !== 'N/A' && item.originalPhoneInReview !== 'N/A' && item.currentVolunteerPhone !== item.originalPhoneInReview) {
      classification = 'F. CONFLICTIVO';
      reasoning = `El teléfono en volunteers (${item.currentVolunteerPhone}) difiere del registrado en el ítem (${item.originalPhoneInReview})`;
    }

    return {
      ...item,
      classification,
      reasoning,
    };
  });

  // 6. REVISAR activity_logs
  const { data: activityLogsRaw } = await supabase
    .from('activity_logs')
    .select('*')
    .or('action.ilike.%phone%,action.ilike.%shared%,action.ilike.%duplicate%,action.ilike.%archive%,action.ilike.%cleanup%,description.ilike.%phone%,description.ilike.%teléfono%,description.ilike.%duplicado%,description.ilike.%archivado%')
    .order('created_at', { ascending: false });

  const phoneActivityLogs = (activityLogsRaw || []).map(l => ({
    id: l.id,
    actorId: l.actor_id,
    actorName: l.actor_name,
    action: l.action,
    entityType: l.entity_type,
    entityId: l.entity_id,
    description: l.description,
    createdAt: l.created_at,
  }));

  // 7. VERIFICAR ARCHIVOS LOCALES EN SCRATCH / STORE
  const scratchStoreFile = path.join(process.cwd(), 'scratch', 'phone-cleanup-reviews-store.json');
  let scratchStoreData: any = null;
  let scratchStoreExists = false;

  if (fs.existsSync(scratchStoreFile)) {
    scratchStoreExists = true;
    try {
      scratchStoreData = JSON.parse(fs.readFileSync(scratchStoreFile, 'utf-8'));
    } catch {}
  }

  // BUILD SUMMARY REPORT DATA
  const reportObj = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_FORENSIC_AUDIT',
    volunteersInventory: {
      totalVolunteers,
      phoneNormalizedNull: phoneNormNullCount,
      phoneNormalizedNotNull: phoneNormNotNullCount,
      isSharedPhoneTrue: isSharedTrueCount,
      sharedPhoneOwnerNotNull: ownerNotNullCount,
      sharedPhoneReasonNotNull: reasonNotNullCount,
      sharedPhoneAuthorizedByNotNull: authByNotNullCount,
      sharedPhoneAuthorizedAtNotNull: authAtNotNullCount,
      affectedVolunteersDetail: formattedAffectedVolunteers,
    },
    reviewsInventory: {
      totalReviews: reviewsList.length,
      statusCounts: reviewsByStatus,
      reviewsList,
    },
    itemsInventory: {
      totalItems: itemsList.length,
      classifiedItems,
    },
    activityLogsInventory: {
      totalPhoneRelatedLogs: phoneActivityLogs.length,
      logs: phoneActivityLogs,
    },
    localBackupInventory: {
      scratchStoreExists,
      scratchStoreFile,
      scratchStoreParentsCount: scratchStoreData?.parents ? Object.keys(scratchStoreData.parents).length : 0,
      scratchStoreItemsCount: scratchStoreData?.items ? Object.keys(scratchStoreData.items).length : 0,
    },
    zeroMutationsProof: {
      volunteersUpdated: 0,
      volunteersInserted: 0,
      volunteersDeleted: 0,
      reviewsModified: 0,
      reviewItemsModified: 0,
    },
  };

  // 8. GENERAR SCRATCH/PHASE-A1-FORENSIC-REPORT.JSON
  const jsonPath = path.join(process.cwd(), 'scratch', 'phase-a1-forensic-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(reportObj, null, 2), 'utf-8');
  console.log(`✅ Archivo JSON creado en: ${jsonPath}`);

  // 9. GENERAR SCRATCH/PHASE-A1-FORENSIC-REPORT.MD
  const mdLines: string[] = [];
  mdLines.push('# 🔬 FASE A.1: REPORTE FORENSE DE ESTADO Y RECUPERACIÓN (READ-ONLY)');
  mdLines.push(`**Fecha de Generación**: ${reportObj.generatedAt}\n`);
  mdLines.push('> [!IMPORTANT]');
  mdLines.push('> **GARANTÍA ABSOLUTA DE INTEGRIDAD (CERO MUTACIONES)**:');
  mdLines.push('> * **VOLUNTARIOS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEWS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEW ITEMS MODIFICADOS**: `0`');
  mdLines.push('> * **TABLAS CREADAS O BORRADAS**: `0`\n');

  mdLines.push('---');
  mdLines.push('## 1. Inventario de `public.volunteers`');
  mdLines.push(`- **Total de Voluntarios**: \`${totalVolunteers}\``);
  mdLines.push(`- **Con \`phone_normalized\` IS NULL**: \`${phoneNormNullCount}\``);
  mdLines.push(`- **Con \`phone_normalized\` IS NOT NULL**: \`${phoneNormNotNullCount}\``);
  mdLines.push(`- **Con \`is_shared_phone\` = true**: \`${isSharedTrueCount}\``);
  mdLines.push(`- **Con \`shared_phone_owner_id\` IS NOT NULL**: \`${ownerNotNullCount}\``);
  mdLines.push(`- **Con \`shared_phone_reason\` IS NOT NULL**: \`${reasonNotNullCount}\``);
  mdLines.push(`- **Con \`shared_phone_authorized_by\` IS NOT NULL**: \`${authByNotNullCount}\``);
  mdLines.push(`- **Con \`shared_phone_authorized_at\` IS NOT NULL**: \`${authAtNotNullCount}\`\n`);

  mdLines.push('### Detalle de Voluntarios Afectados (`phone_normalized` o `is_shared_phone`)');
  mdLines.push('| Volunteer ID | Nombre | Teléfono Actual | Phone Normalized | Is Shared | Owner ID | Reason | Authorized By | Status |');
  mdLines.push('| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :---: |');
  formattedAffectedVolunteers.forEach(v => {
    mdLines.push(`| \`${v.volunteerId.substring(0, 8)}...\` | ${v.fullName} | \`${v.phone}\` | \`${v.phoneNormalized || 'NULL'}\` | \`${v.isSharedPhone}\` | \`${v.sharedPhoneOwnerId ? v.sharedPhoneOwnerId.substring(0, 8) + '...' : 'NULL'}\` | ${v.sharedPhoneReason || 'NULL'} | ${v.sharedPhoneAuthorizedBy || 'NULL'} | \`${v.status}\` |`);
  });

  mdLines.push('\n---');
  mdLines.push('## 2. Inventario de `phone_cleanup_reviews`');
  mdLines.push(`- **Total de Registros en Supabase**: \`${reviewsList.length}\``);
  mdLines.push('**Distribución por Estado**:');
  Object.entries(reviewsByStatus).forEach(([status, count]) => {
    mdLines.push(`  - \`${status}\`: ${count}`);
  });

  mdLines.push('\n| Review ID | Teléfono Normalizado | Risk Level | Confidence | Review Status | Reviewed By | Reviewed At | Comment |');
  mdLines.push('| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- |');
  reviewsList.forEach(r => {
    mdLines.push(`| \`${r.id.substring(0, 8)}...\` | \`${r.phone_normalized}\` | \`${r.risk_level}\` | \`${r.confidence}\` | \`${r.review_status}\` | ${r.reviewed_by || 'NULL'} | ${r.reviewed_at || 'NULL'} | ${r.reviewer_comment || 'NULL'} |`);
  });

  mdLines.push('\n---');
  mdLines.push('## 3. Inventario de `phone_cleanup_review_items` (Con JOIN a `volunteers`)');
  mdLines.push(`- **Total de Ítems en Supabase**: \`${itemsList.length}\`\n`);

  mdLines.push('| Volunteer ID | Nombre Voluntario | Teléfono Actual | Acción Aprobada | Teléfono Corregido | Status Proc. | Clasificación Forense | Comentario Revisor |');
  mdLines.push('| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |');
  classifiedItems.forEach(item => {
    mdLines.push(`| \`${item.volunteerId.substring(0, 8)}...\` | ${item.fullName} | \`${item.currentVolunteerPhone}\` | \`${item.approvedAction}\` | \`${item.correctedPhone || 'NULL'}\` | \`${item.itemProcessingStatus}\` | **${item.classification}** | ${item.reviewerComment || 'NULL'} |`);
  });

  mdLines.push('\n---');
  mdLines.push('## 4. Clasificación y Desglose Forense de Decisiones');
  const classCounts: Record<string, number> = {};
  classifiedItems.forEach(i => {
    classCounts[i.classification] = (classCounts[i.classification] || 0) + 1;
  });

  Object.entries(classCounts).forEach(([cls, count]) => {
    mdLines.push(`- **${cls}**: ${count} registros`);
  });

  mdLines.push('\n---');
  mdLines.push('## 5. Auditoría de `activity_logs` Relacionados con Teléfonos');
  mdLines.push(`- **Total de Eventos Encontrados**: \`${phoneActivityLogs.length}\`\n`);
  if (phoneActivityLogs.length > 0) {
    mdLines.push('| ID Log | Actor | Acción | Entidad | Fecha | Descripción |');
    mdLines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
    phoneActivityLogs.slice(0, 15).forEach(l => {
      mdLines.push(`| \`${l.id}\` | ${l.actorName || 'Sistema'} | \`${l.action}\` | \`${l.entityType}:${l.entityId ? l.entityId.substring(0, 8) + '...' : ''}\` | ${l.createdAt} | ${l.description || ''} |`);
    });
  } else {
    mdLines.push('_No se encontraron eventos específicos de mutación de teléfonos en activity_logs._');
  }

  mdLines.push('\n---');
  mdLines.push('## 6. Auditoría de Archivos Locales en `scratch/`');
  mdLines.push(`- **Archivo Backup Local (\`phone-cleanup-reviews-store.json\`)**: ${scratchStoreExists ? 'EXISTE' : 'NO EXISTE'}`);
  if (scratchStoreExists) {
    mdLines.push(`  - Grupos registrados en JSON local: \`${reportObj.localBackupInventory.scratchStoreParentsCount}\``);
    mdLines.push(`  - Mapa de ítems registrados en JSON local: \`${reportObj.localBackupInventory.scratchStoreItemsCount}\``);
  }

  mdLines.push('\n===========================================================');
  mdLines.push('FASE A.1: COMPLETE');
  mdLines.push('VOLUNTEERS MODIFICADOS: 0');
  mdLines.push('REVIEWS MODIFICADOS: 0');
  mdLines.push('REVIEW ITEMS MODIFICADOS: 0');
  mdLines.push('===========================================================');

  const mdPath = path.join(process.cwd(), 'scratch', 'phase-a1-forensic-report.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ Archivo Markdown creado en: ${mdPath}`);

  console.log('\n===========================================================');
  console.log('FASE A.1: COMPLETE');
  console.log('VOLUNTEERS MODIFICADOS: 0');
  console.log('REVIEWS MODIFICADOS: 0');
  console.log('REVIEW ITEMS MODIFICADOS: 0');
  console.log('===========================================================');
  console.log('\nSIGUIENTE PASO: REVISIÓN HUMANA DEL REPORTE FORENSE');
}

runForensicAuditA1().catch(console.error);
