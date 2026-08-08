import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runReconciliationA2() {
  console.log('===========================================================');
  console.log('  FASE A.2: RECONCILIACIÓN HUMANA Y MATRIZ READ-ONLY     ');
  console.log('===========================================================\n');

  // Fetch all 44 review items
  const { data: rawItems, error: errItems } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (errItems || !rawItems) {
    console.error('Error fetching review items:', errItems?.message);
    return;
  }

  // Fetch all reviews
  const { data: rawReviews } = await supabase.from('phone_cleanup_reviews').select('*');
  const reviewsMap = new Map<string, any>();
  (rawReviews || []).forEach(r => reviewsMap.set(r.id, r));

  // Fetch all volunteers for JOIN
  const { data: rawVolunteers } = await supabase.from('volunteers').select('*');
  const volsMap = new Map<string, any>();
  (rawVolunteers || []).forEach(v => volsMap.set(v.id, v));

  // Build complete joined item structures
  const fullJoinedItems = rawItems.map(item => {
    const vol = volsMap.get(item.volunteer_id);
    const parentRev = reviewsMap.get(item.review_id);
    const ownerVol = item.shared_phone_owner_id ? volsMap.get(item.shared_phone_owner_id) : null;

    const comment = item.reviewer_comment || parentRev?.reviewer_comment || '';
    const revBy = parentRev?.reviewed_by || '';
    const procBy = item.processed_by || '';
    const isTestActor = revBy.includes('Tester') || revBy.includes('Test') || procBy.includes('Tester') || procBy.includes('Test');
    const isCustomUserComment = comment.includes('No es su numero') || comment.includes('no es su numero') || comment.includes('revisar con');

    let category = 'INDETERMINADO';
    if (item.processing_status === 'PROCESSED') {
      if (isTestActor) {
        category = 'PRUEBA_AUTOMATIZADA';
      } else {
        category = 'PROCESADO';
      }
    } else if (isCustomUserComment) {
      category = 'POSIBLE_DECISION_MANUAL';
    } else if (isTestActor) {
      category = 'PRUEBA_AUTOMATIZADA';
    } else if (comment.includes('Decisión individual por voluntario registrada') || comment.includes('Plan de saneamiento pre-evaluado')) {
      category = 'PLAN_AUTOMATICO';
    } else if (item.processing_status === 'PENDING') {
      category = 'PENDIENTE';
    } else {
      category = 'INDETERMINADO';
    }

    // Determine concrete change performed
    let concreteChange = 'Ninguno (Sin procesar)';
    if (item.processing_status === 'PROCESSED') {
      if (item.approved_action === 'PHONE_OWNER') {
        concreteChange = `Establecido como Titular. phone_normalized: "${vol?.phone_normalized || 'N/A'}", is_shared_phone: false.`;
      } else if (item.approved_action === 'SHARED_PHONE') {
        concreteChange = `Teléfono Compartido Autorizado. Owner: "${ownerVol ? ownerVol.first_name + ' ' + ownerVol.last_name : item.shared_phone_owner_id}".`;
      } else if (item.approved_action === 'ARCHIVE_DUPLICATE') {
        concreteChange = `Registro duplicado archivado. Voluntario status: "${vol?.status}".`;
      } else if (item.approved_action === 'KEEP') {
        concreteChange = `Mantiene teléfono actual. phone_normalized: "${vol?.phone_normalized || item.corrected_phone}".`;
      } else {
        concreteChange = `Acción procesada: ${item.approved_action}`;
      }
    }

    return {
      itemId: item.id,
      reviewId: item.review_id,
      parentPhoneNormalized: parentRev?.phone_normalized || 'N/A',
      parentReviewStatus: parentRev?.review_status || 'N/A',
      parentReviewedBy: revBy,
      volunteerId: item.volunteer_id,
      fullName: vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'NO ENCONTRADO EN BD',
      currentVolunteerPhone: vol?.phone || 'N/A',
      phoneBeforeProcessing: 'NO DISPONIBLE', // Historical phone before mutation not stored separately in legacy schema
      currentPhoneNormalized: vol?.phone_normalized || null,
      currentIsSharedPhone: vol?.is_shared_phone ?? false,
      currentSharedPhoneOwnerId: vol?.shared_phone_owner_id || null,
      currentOwnerFullName: ownerVol ? `${ownerVol.first_name || ''} ${ownerVol.last_name || ''}`.trim() : null,
      originalDecision: item.approved_action,
      proposedAction: item.proposed_action,
      correctedPhone: item.corrected_phone || null,
      processingStatus: item.processing_status,
      processedAt: item.processed_at || null,
      processedBy: item.processed_by || null,
      reviewerComment: comment || null,
      category,
      concreteChange,
    };
  });

  // Group by category
  const processed24 = fullJoinedItems.filter(i => i.category === 'PROCESSED');
  const manual7 = fullJoinedItems.filter(i => i.category === 'POSIBLE_DECISION_MANUAL');
  const autoPlan5 = fullJoinedItems.filter(i => i.category === 'PLAN_AUTOMATICO');
  const tests3 = fullJoinedItems.filter(i => i.category === 'PRUEBA_AUTOMATIZADA');
  const indeterminate5 = fullJoinedItems.filter(i => i.category === 'INDETERMINADO' || i.category === 'PENDIENTE');

  // CONFLICT DETECTION
  const conflicts: Array<{ id: string; volunteerName: string; severity: 'ALTO' | 'MEDIO' | 'BAJO'; description: string }> = [];

  // Check 1: Volunteers with multiple review items
  const volItemCounts = new Map<string, number>();
  fullJoinedItems.forEach(i => volItemCounts.set(i.volunteerId, (volItemCounts.get(i.volunteerId) || 0) + 1));
  volItemCounts.forEach((count, volId) => {
    if (count > 1) {
      const vol = volsMap.get(volId);
      conflicts.push({
        id: volId,
        volunteerName: vol ? `${vol.first_name} ${vol.last_name}` : volId,
        severity: 'ALTO',
        description: `El voluntario posee ${count} decisiones/ítems de revisión registrados en diferentes reviews.`,
      });
    }
  });

  // Check 2: Corrected phone mismatch with phone_normalized in DB
  fullJoinedItems.forEach(i => {
    if (i.correctedPhone && i.currentPhoneNormalized && i.correctedPhone !== i.currentPhoneNormalized.replace('+505', '')) {
      conflicts.push({
        id: i.volunteerId,
        volunteerName: i.fullName,
        severity: 'MEDIO',
        description: `Discrepancia de teléfono: corrected_phone ("${i.correctedPhone}") no coincide con phone_normalized en DB ("${i.currentPhoneNormalized}")`,
      });
    }
  });

  // Check 3: Shared phone owner no longer exists or is archived
  fullJoinedItems.forEach(i => {
    if (i.currentSharedPhoneOwnerId) {
      const owner = volsMap.get(i.currentSharedPhoneOwnerId);
      if (!owner) {
        conflicts.push({
          id: i.volunteerId,
          volunteerName: i.fullName,
          severity: 'ALTO',
          description: `El shared_phone_owner_id (${i.currentSharedPhoneOwnerId}) ya no existe en public.volunteers.`,
        });
      } else if (owner.status === 'archived') {
        conflicts.push({
          id: i.volunteerId,
          volunteerName: i.fullName,
          severity: 'MEDIO',
          description: `El shared_phone_owner (${owner.first_name} ${owner.last_name}) está archivado.`,
        });
      }
    }
  });

  // Check 4: Item marked PROCESSED but no phone_normalized in volunteers
  fullJoinedItems.forEach(i => {
    if (i.processingStatus === 'PROCESSED' && !i.currentPhoneNormalized && i.currentVolunteerPhone !== 'N/A') {
      conflicts.push({
        id: i.volunteerId,
        volunteerName: i.fullName,
        severity: 'BAJO',
        description: `El ítem figura como PROCESSED pero phone_normalized está NULL en public.volunteers.`,
      });
    }
  });

  // GENERATE JSON REPORT
  const jsonReport = {
    generatedAt: new Date().toISOString(),
    mode: 'FASE_A2_READ_ONLY_RECONCILIATION',
    summary: {
      totalItems: fullJoinedItems.length,
      processedCount: processed24.length,
      manualDecisionCount: manual7.length,
      autoPlanCount: autoPlan5.length,
      testCount: tests3.length,
      indeterminateCount: indeterminate5.length,
      conflictsCount: conflicts.length,
    },
    processed24,
    manual7,
    autoPlan5,
    tests3,
    indeterminate5,
    globalCrossJoinMatrix: fullJoinedItems,
    conflicts,
    zeroMutationsProof: {
      volunteersUpdated: 0,
      reviewsModified: 0,
      reviewItemsModified: 0,
      activityLogsModified: 0,
    },
  };

  const jsonPath = path.join(process.cwd(), 'scratch', 'phase-a2-human-reconciliation.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  console.log(`✅ Archivo JSON creado en: ${jsonPath}`);

  // GENERATE MARKDOWN REPORT
  const mdLines: string[] = [];
  mdLines.push('# FASE A.2 — MATRIZ HUMANA DE RECONCILIACIÓN');
  mdLines.push(`**Fecha de Diagnóstico**: ${jsonReport.generatedAt}\n`);
  mdLines.push('> [!IMPORTANT]');
  mdLines.push('> **INTEGRIDAD DE DATOS (CERO MUTACIONES)**:');
  mdLines.push('> * **VOLUNTARIOS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEWS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEW ITEMS MODIFICADOS**: `0`');
  mdLines.push('> * **ACTIVITY LOGS MODIFICADOS**: `0`');
  mdLines.push('> * **ESTADO**: Cero decisiones nuevas ejecutadas en base de datos.\n');

  // 1. 24 PROCESADOS
  mdLines.push('---');
  mdLines.push('## 1. 24 ÍTEMS YA PROCESADOS');
  mdLines.push(`Total de registros en estado \`PROCESSED\`: \`${processed24.length}\`\n`);
  mdLines.push('| Volunteer ID | Nombre Completo | Teléfono Anterior | Teléfono Actual | Phone Normalized | Is Shared | Owner Nombre | Decisión Original | Corrected Phone | Status Proc. | Procesado Por | Comentario | Cambio Concreto Realizado |');
  mdLines.push('| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :---: | :--- | :--- | :--- |');
  processed24.forEach(i => {
    mdLines.push(`| \`${i.volunteerId.substring(0, 8)}...\` | ${i.fullName} | \`${i.phoneBeforeProcessing}\` | \`${i.currentVolunteerPhone}\` | \`${i.currentPhoneNormalized || 'NULL'}\` | \`${i.currentIsSharedPhone}\` | ${i.currentOwnerFullName || 'N/A'} | \`${i.originalDecision}\` | \`${i.correctedPhone || 'NULL'}\` | \`${i.processingStatus}\` | ${i.processedBy || 'Sistema'} | ${i.reviewerComment || 'Sin comentario'} | ${i.concreteChange} |`);
  });

  // 2. 7 POSIBLES DECISIONES MANUALES
  mdLines.push('\n---');
  mdLines.push('## 2. 7 POSIBLES DECISIONES MANUALES');
  mdLines.push('Registros con comentarios administrativos libres registrados por coordinadores humanos. **Evidencia directa sin interpretación automática**:\n');
  mdLines.push('| Volunteer ID | Nombre | Teléfono Actual | Original Phone | Decisión | Corrected Phone | Comentario del Revisor | Revisor | Reviewed At | Status Item | Review ID |');
  mdLines.push('| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |');
  manual7.forEach(i => {
    mdLines.push(`| \`${i.volunteerId.substring(0, 8)}...\` | ${i.fullName} | \`${i.currentVolunteerPhone}\` | \`${i.parentPhoneNormalized}\` | \`${i.originalDecision}\` | \`${i.correctedPhone || 'NULL'}\` | **"${i.reviewerComment}"** | ${i.parentReviewedBy} | ${i.processedAt || 'Pendiente'} | \`${i.processingStatus}\` | \`${i.reviewId.substring(0, 8)}...\` |`);
  });

  // 3. 5 PLANES AUTOMÁTICOS
  mdLines.push('\n---');
  mdLines.push('## 3. 5 PLANES AUTOMÁTICOS');
  mdLines.push('> ⚠️ **ESTO ES UNA SUGERENCIA AUTOMÁTICA, NO UNA DECISIÓN HUMANA CONFIRMADA.**\n');
  mdLines.push('| Volunteer ID | Nombre | Teléfono Actual | Decisión Propuesta | Comentario | Status | Processing Status | Review ID |');
  mdLines.push('| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |');
  autoPlan5.forEach(i => {
    mdLines.push(`| \`${i.volunteerId.substring(0, 8)}...\` | ${i.fullName} | \`${i.currentVolunteerPhone}\` | \`${i.originalDecision}\` | ${i.reviewerComment || 'N/A'} | \`${i.parentReviewStatus}\` | \`${i.processingStatus}\` | \`${i.reviewId.substring(0, 8)}...\` |`);
  });

  // 4. 3 PRUEBAS AUTOMATIZADAS
  mdLines.push('\n---');
  mdLines.push('## 4. 3 PRUEBAS AUTOMATIZADAS');
  mdLines.push('> 🧪 **ESTE REGISTRO CORRESPONDE A UNA PRUEBA AUTOMATIZADA DE DESARROLLO/TEST.**\n');
  mdLines.push('| Volunteer ID | Nombre | Decisión | Revisor/Actor | Comentario | Processing Status |');
  mdLines.push('| :--- | :--- | :---: | :--- | :--- | :---: |');
  tests3.forEach(i => {
    mdLines.push(`| \`${i.volunteerId.substring(0, 8)}...\` | ${i.fullName} | \`${i.originalDecision}\` | \`${i.parentReviewedBy}\` | ${i.reviewerComment || 'N/A'} | \`${i.processingStatus}\` |`);
  });

  // 5. 5 INDETERMINADOS
  mdLines.push('\n---');
  mdLines.push('## 5. 5 INDETERMINADOS');
  mdLines.push('Registros cuyo origen no puede ser atribuido con certeza absoluta a una acción manual o script:\n');
  mdLines.push('| Volunteer ID | Nombre | Teléfono | Decisión | Revisor | Comentario | Razón de Indeterminación |');
  mdLines.push('| :--- | :--- | :--- | :---: | :--- | :--- | :--- |');
  indeterminate5.forEach(i => {
    mdLines.push(`| \`${i.volunteerId.substring(0, 8)}...\` | ${i.fullName} | \`${i.currentVolunteerPhone}\` | \`${i.originalDecision}\` | ${i.parentReviewedBy || 'N/A'} | ${i.reviewerComment || 'NULL'} | Estado \`${i.processingStatus}\` / \`${i.parentReviewStatus}\` sin metadatos suficientes. |`);
  });

  // 6. MATRIZ GLOBAL CROSS-JOIN
  mdLines.push('\n---');
  mdLines.push('## 6. MATRIZ GLOBAL DE CRUZADO CONTRA `public.volunteers` (44 ÍTEMS)');
  mdLines.push('| volunteer_id | Nombre | Teléfono Actual | Decisión Histórica | Estado Histórico | ¿Procesado? | ¿Parece Prueba? | ¿Parece Manual? |');
  mdLines.push('| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |');
  fullJoinedItems.forEach(i => {
    const isProc = i.processingStatus === 'PROCESSED' ? 'SÍ' : 'NO';
    const isTest = i.category === 'PRUEBA_AUTOMATIZADA' ? 'SÍ' : 'NO';
    const isMan = i.category === 'POSIBLE_DECISION_MANUAL' ? 'SÍ' : 'NO';
    mdLines.push(`| \`${i.volunteerId.substring(0, 8)}...\` | ${i.fullName} | \`${i.currentVolunteerPhone}\` | \`${i.originalDecision}\` | \`${i.processingStatus}\` | ${isProc} | ${isTest} | ${isMan} |`);
  });

  // 7. CONFLICTOS DETECTADOS
  mdLines.push('\n---');
  mdLines.push('## 7. CONFLICTOS DETECTADOS');
  if (conflicts.length > 0) {
    mdLines.push('| Severidad | ID Voluntario | Nombre | Descripción del Conflicto |');
    mdLines.push('| :---: | :--- | :--- | :--- |');
    conflicts.forEach(c => {
      mdLines.push(`| **${c.severity}** | \`${c.id.substring(0, 8)}...\` | ${c.volunteerName} | ${c.description} |`);
    });
  } else {
    mdLines.push('_No se detectaron conflictos críticos de integridad de datos._');
  }

  // 8. PERSONAS QUE REQUIEREN REVISIÓN
  mdLines.push('\n---');
  mdLines.push('## 8. PERSONAS QUE REQUIEREN REVISIÓN HUMANA');
  const pendingReviewPeople = fullJoinedItems.filter(i => i.processingStatus !== 'PROCESSED');
  mdLines.push(`Existen **${pendingReviewPeople.length} voluntariados** cuya decisión no ha sido ejecutada o requiere confirmación en la nueva UI:\n`);
  pendingReviewPeople.forEach((p, idx) => {
    mdLines.push(`${idx + 1}. **${p.fullName}** (\`${p.currentVolunteerPhone}\`) - Decisión previa: \`${p.originalDecision}\` (Comentario: "${p.reviewerComment || 'Sin comentario'}")`);
  });

  // 9. DATOS QUE PODEMOS PRESERVAR VS DATOS QUE NO DEBEMOS REUTILIZAR
  mdLines.push('\n---');
  mdLines.push('## 9. DATOS A PRESERVAR VS NO REUTILIZAR');
  mdLines.push('### 🟢 DATOS A PRESERVAR:');
  mdLines.push('- Los **7 comentarios libres** de la UI (*"Mario No es su numero"*, *"Jose, no es su numero"*, etc.), como evidencia directa de que el teléfono no pertenece a la persona.');
  mdLines.push('- Los **24 registros procesados** en `volunteers` (se mantienen intactos con su `phone_normalized` y `is_shared_phone`).');
  mdLines.push('\n### 🔴 DATOS QUE NO DEBEMOS REUTILIZAR AUTOMÁTICAMENTE:');
  mdLines.push('- Las **3 decisiones provenientes de pruebas automatizadas** de scripts (`AdminDrevelTester`, etc.).');
  mdLines.push('- Las sugerencias algorítmicas de los **5 planes automáticos** como si fuesen decisiones finales aprobadas.');

  mdLines.push('\n===========================================================');
  mdLines.push('FASE A.2: COMPLETE');
  mdLines.push('VOLUNTEERS MODIFICADOS: 0');
  mdLines.push('REVIEWS MODIFICADOS: 0');
  mdLines.push('REVIEW ITEMS MODIFICADOS: 0');
  mdLines.push('ACTIVITY LOGS MODIFICADOS: 0');
  mdLines.push('===========================================================');

  const mdPath = path.join(process.cwd(), 'scratch', 'phase-a2-human-reconciliation.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ Archivo Markdown creado en: ${mdPath}`);

  console.log('\n===========================================================');
  console.log('FASE A.2: COMPLETE');
  console.log('VOLUNTEERS MODIFICADOS: 0');
  console.log('REVIEWS MODIFICADOS: 0');
  console.log('REVIEW ITEMS MODIFICADOS: 0');
  console.log('ACTIVITY LOGS MODIFICADOS: 0');
  console.log('===========================================================');
  console.log('\nNO SE HA TOMADO NINGUNA DECISIÓN NUEVA.');
}

runReconciliationA2().catch(console.error);
