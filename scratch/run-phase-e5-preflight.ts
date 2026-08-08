import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { normalizePhoneE164, getLocal8Digits } from '../lib/whatsapp';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface PreflightItemAudit {
  index: number;
  itemId: string;
  reviewId: string;
  volunteerId: string;
  fullName: string;
  currentPhone: string;
  originalPhone: string;
  decision: string;
  phoneStatus: string;
  correctedPhone: string | null;
  sharedPhoneOwnerId: string | null;
  sharedPhoneOwnerName?: string | null;
  duplicatePrimaryVolunteerId: string | null;
  duplicatePrimaryName?: string | null;
  status: string;
  processingStatus: string;
  reviewerComment: string | null;
  resultCategory: 'READY' | 'CONFLICT' | 'NOT_ELIGIBLE' | 'REQUIRES_INFORMATION';
  reason: string;
  beforeState: {
    phone: string;
    phoneNormalized: string | null;
    isSharedPhone: boolean;
    sharedPhoneOwnerId: string | null;
    status: string;
  };
  afterStateExpected: {
    phone: string;
    phoneNormalized: string | null;
    isSharedPhone: boolean;
    sharedPhoneOwnerId: string | null;
    status: string;
  };
}

async function runPhaseE5Preflight() {
  console.log('===========================================================');
  console.log('  FASE E5: PREFLIGHT AUDIT DE REGISTROS READY_TO_PROCESS   ');
  console.log('  REGLA ABSOLUTA: 100% READ-ONLY (0 MUTACIONES EN BD)       ');
  console.log('===========================================================\n');

  // 1. Fetch exact candidate items from Supabase DB
  const { data: rawItems, error: itemsErr } = await supabase
    .from('phone_cleanup_review_items')
    .select('*, phone_cleanup_reviews(phone_normalized)')
    .eq('status', 'READY_TO_PROCESS')
    .eq('processing_status', 'PENDING')
    .not('decision', 'is', null);

  if (itemsErr) {
    console.error('Error fetching review items:', itemsErr.message);
    return;
  }

  const candidateItems = rawItems || [];
  console.log(`1. Registros encontrados con status = READY_TO_PROCESS y processing_status = PENDING: ${candidateItems.length}`);

  // Fetch all volunteers for JOIN & cross-validation
  const { data: allVols } = await supabase.from('volunteers').select('id, first_name, last_name, phone, phone_normalized, is_shared_phone, shared_phone_owner_id, status');
  const volsMap = new Map<string, any>();
  (allVols || []).forEach(v => volsMap.set(v.id, v));

  const preflightResults: PreflightItemAudit[] = [];

  let readyCount = 0;
  let conflictCount = 0;
  let notEligibleCount = 0;
  let reqInfoCount = 0;

  candidateItems.forEach((item, idx) => {
    const vol = volsMap.get(item.volunteer_id);
    const fullName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'NO ENCONTRADO EN BD';
    const parentPhone = (item.phone_cleanup_reviews as any)?.phone_normalized || 'N/A';

    const beforeState = {
      phone: vol?.phone || 'N/A',
      phoneNormalized: vol?.phone_normalized || null,
      isSharedPhone: vol?.is_shared_phone ?? false,
      sharedPhoneOwnerId: vol?.shared_phone_owner_id || null,
      status: vol?.status || 'unknown',
    };

    let afterStateExpected = { ...beforeState };
    let resultCategory: 'READY' | 'CONFLICT' | 'NOT_ELIGIBLE' | 'REQUIRES_INFORMATION' = 'READY';
    let reason = 'Validación pre-flight 100% correcta.';

    // CHECK A: Volunteer existence
    if (!vol) {
      resultCategory = 'CONFLICT';
      reason = 'El voluntario no existe en public.volunteers.';
      conflictCount++;
    } else if (item.status === 'LEGACY') {
      resultCategory = 'NOT_ELIGIBLE';
      reason = 'Los registros LEGACY no están autorizados para procesamiento automático.';
      notEligibleCount++;
    } else if (item.decision === 'MANUAL_REVIEW') {
      resultCategory = 'NOT_ELIGIBLE';
      reason = 'La decisión MANUAL_REVIEW debe ser atendida posteriormente.';
      notEligibleCount++;
    } else if (item.decision === 'KEEP') {
      const norm = normalizePhoneE164(vol.phone);
      afterStateExpected.phoneNormalized = norm || vol.phone_normalized;
      readyCount++;
    } else if (item.decision === 'PHONE_OWNER') {
      const norm = normalizePhoneE164(vol.phone);
      afterStateExpected.phoneNormalized = norm || `+505${getLocal8Digits(vol.phone)}`;
      afterStateExpected.isSharedPhone = false;
      afterStateExpected.sharedPhoneOwnerId = null;
      readyCount++;
    } else if (item.decision === 'SHARED_PHONE') {
      if (!item.shared_phone_owner_id) {
        resultCategory = 'CONFLICT';
        reason = 'SHARED_PHONE sin shared_phone_owner_id asignado.';
        conflictCount++;
      } else if (item.shared_phone_owner_id === item.volunteer_id) {
        resultCategory = 'CONFLICT';
        reason = 'SHARED_PHONE auto-referenciado (no puede ser titular de sí mismo).';
        conflictCount++;
      } else {
        const owner = volsMap.get(item.shared_phone_owner_id);
        if (!owner) {
          resultCategory = 'CONFLICT';
          reason = 'El titular asignado ya no existe en public.volunteers.';
          conflictCount++;
        } else if (owner.status === 'archived') {
          resultCategory = 'CONFLICT';
          reason = 'El titular asignado está archivado.';
          conflictCount++;
        } else {
          const norm = normalizePhoneE164(vol.phone);
          afterStateExpected.phoneNormalized = norm || vol.phone_normalized;
          afterStateExpected.isSharedPhone = true;
          afterStateExpected.sharedPhoneOwnerId = item.shared_phone_owner_id;
          readyCount++;
        }
      }
    } else if (item.decision === 'PHONE_DOES_NOT_BELONG') {
      if (!item.corrected_phone || item.corrected_phone.trim().length < 8) {
        resultCategory = 'REQUIRES_INFORMATION';
        reason = 'PHONE_DOES_NOT_BELONG sin número de teléfono corregido válido.';
        reqInfoCount++;
      } else {
        const norm = normalizePhoneE164(item.corrected_phone.trim());
        if (!norm) {
          resultCategory = 'CONFLICT';
          reason = `El teléfono corregido "${item.corrected_phone}" no es válido.`;
          conflictCount++;
        } else {
          afterStateExpected.phone = item.corrected_phone.trim();
          afterStateExpected.phoneNormalized = norm;
          afterStateExpected.isSharedPhone = false;
          afterStateExpected.sharedPhoneOwnerId = null;
          readyCount++;
        }
      }
    } else if (item.decision === 'ARCHIVE_DUPLICATE') {
      if (!item.duplicate_primary_volunteer_id) {
        resultCategory = 'CONFLICT';
        reason = 'ARCHIVE_DUPLICATE sin duplicate_primary_volunteer_id asignado.';
        conflictCount++;
      } else if (item.duplicate_primary_volunteer_id === item.volunteer_id) {
        resultCategory = 'CONFLICT';
        reason = 'ARCHIVE_DUPLICATE auto-referenciado.';
        conflictCount++;
      } else {
        const primary = volsMap.get(item.duplicate_primary_volunteer_id);
        if (!primary) {
          resultCategory = 'CONFLICT';
          reason = 'El voluntario principal asignado ya no existe en public.volunteers.';
          conflictCount++;
        } else {
          afterStateExpected.status = 'archived';
          readyCount++;
        }
      }
    }

    const ownerName = item.shared_phone_owner_id && volsMap.get(item.shared_phone_owner_id)
      ? `${volsMap.get(item.shared_phone_owner_id).first_name} ${volsMap.get(item.shared_phone_owner_id).last_name}`
      : null;

    const primaryName = item.duplicate_primary_volunteer_id && volsMap.get(item.duplicate_primary_volunteer_id)
      ? `${volsMap.get(item.duplicate_primary_volunteer_id).first_name} ${volsMap.get(item.duplicate_primary_volunteer_id).last_name}`
      : null;

    preflightResults.push({
      index: idx + 1,
      itemId: item.id,
      reviewId: item.review_id,
      volunteerId: item.volunteer_id,
      fullName,
      currentPhone: beforeState.phone,
      originalPhone: item.original_phone || beforeState.phone,
      decision: item.decision,
      phoneStatus: item.phone_status || 'CURRENT',
      correctedPhone: item.corrected_phone || null,
      sharedPhoneOwnerId: item.shared_phone_owner_id || null,
      sharedPhoneOwnerName: ownerName,
      duplicatePrimaryVolunteerId: item.duplicate_primary_volunteer_id || null,
      duplicatePrimaryName: primaryName,
      status: item.status,
      processingStatus: item.processing_status,
      reviewerComment: item.reviewer_comment || null,
      resultCategory,
      reason,
      beforeState,
      afterStateExpected,
    });
  });

  // WRITE JSON REPORT
  const jsonReport = {
    auditTimestamp: new Date().toISOString(),
    mode: 'READ_ONLY_PREFLIGHT',
    summary: {
      totalFound: candidateItems.length,
      readyCount,
      conflictCount,
      notEligibleCount,
      requiresInfoCount: reqInfoCount,
    },
    zeroMutationsProof: {
      volunteersModified: 0,
      reviewItemsModified: 0,
      reviewsModified: 0,
    },
    items: preflightResults,
  };

  const jsonPath = path.join(process.cwd(), 'scratch', 'phase-e5-preflight-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  console.log(`✅ Archivo JSON creado en: ${jsonPath}`);

  // WRITE MARKDOWN REPORT
  const mdLines: string[] = [];
  mdLines.push('# 🔬 FASE E5 — MATRIZ DE PREFLIGHT DE REGISTROS READY_TO_PROCESS');
  mdLines.push(`**Fecha de Auditoría**: ${jsonReport.auditTimestamp}\n`);
  mdLines.push('> [!IMPORTANT]');
  mdLines.push('> **INTEGRIDAD DE DATOS (CERO MUTACIONES EN BD)**:');
  mdLines.push('> * **VOLUNTARIOS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEW ITEMS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEWS MODIFICADAS**: `0`');
  mdLines.push('> * **MODO DE AUDITORÍA**: 100% Solo Lectura (dryRun = true).\n');

  mdLines.push('## 1. Resumen Pre-Flight');
  mdLines.push(`- **Total Encontrados ('READY_TO_PROCESS' + 'PENDING')**: \`${candidateItems.length}\``);
  mdLines.push(`- **🟢 READY (Elegibles para Aplicación)**: \`${readyCount}\``);
  mdLines.push(`- **🔴 CONFLICT (Conflictos de Integridad)**: \`${conflictCount}\``);
  mdLines.push(`- **⚪ NOT_ELIGIBLE (No Elegibles)**: \`${notEligibleCount}\``);
  mdLines.push(`- **🟡 REQUIRES_INFORMATION (Incompletos sin Teléfono)**: \`${reqInfoCount}\`\n`);

  mdLines.push('---');
  mdLines.push('## 2. Matriz de Detalle de Pre-Flight');
  mdLines.push('| # | Volunteer ID | Nombre Voluntario | Teléfono Actual | Decisión | Teléfono Corregido | Titular / Primario Asignado | Resultado | Motivo de Clasificación |');
  mdLines.push('| :-: | :--- | :--- | :--- | :---: | :--- | :--- | :---: | :--- |');

  preflightResults.forEach(r => {
    const relInfo = r.sharedPhoneOwnerName ? `Titular: ${r.sharedPhoneOwnerName}` : (r.duplicatePrimaryName ? `Primario: ${r.duplicatePrimaryName}` : 'N/A');
    const badge = r.resultCategory === 'READY' ? '🟢 READY' : (r.resultCategory === 'CONFLICT' ? '🔴 CONFLICT' : (r.resultCategory === 'REQUIRES_INFORMATION' ? '🟡 REQ_INFO' : '⚪ NOT_ELIGIBLE'));
    mdLines.push(`| ${r.index} | \`${r.volunteerId.substring(0, 8)}...\` | ${r.fullName} | \`${r.currentPhone}\` | \`${r.decision}\` | \`${r.correctedPhone || 'N/A'}\` | ${relInfo} | ${badge} | ${r.reason} |`);
  });

  mdLines.push('\n---');
  mdLines.push('## 3. Matriz de Cambios Esperados (BEFORE vs AFTER) para Registros READY');
  mdLines.push('| # | Voluntario | Columna | Valor ANTES de Mutar | Valor ESPERADO Después |');
  mdLines.push('| :-: | :--- | :--- | :--- | :--- |');

  preflightResults.filter(r => r.resultCategory === 'READY').forEach(r => {
    if (r.beforeState.phone !== r.afterStateExpected.phone) {
      mdLines.push(`| ${r.index} | ${r.fullName} | \`phone\` | \`${r.beforeState.phone}\` | **\`${r.afterStateExpected.phone}\`** |`);
    }
    if (r.beforeState.phoneNormalized !== r.afterStateExpected.phoneNormalized) {
      mdLines.push(`| ${r.index} | ${r.fullName} | \`phone_normalized\` | \`${r.beforeState.phoneNormalized || 'NULL'}\` | **\`${r.afterStateExpected.phoneNormalized || 'NULL'}\`** |`);
    }
    if (r.beforeState.isSharedPhone !== r.afterStateExpected.isSharedPhone) {
      mdLines.push(`| ${r.index} | ${r.fullName} | \`is_shared_phone\` | \`${r.beforeState.isSharedPhone}\` | **\`${r.afterStateExpected.isSharedPhone}\`** |`);
    }
    if (r.beforeState.sharedPhoneOwnerId !== r.afterStateExpected.sharedPhoneOwnerId) {
      mdLines.push(`| ${r.index} | ${r.fullName} | \`shared_phone_owner_id\` | \`${r.beforeState.sharedPhoneOwnerId || 'NULL'}\` | **\`${r.afterStateExpected.sharedPhoneOwnerId || 'NULL'}\`** |`);
    }
    if (r.beforeState.status !== r.afterStateExpected.status) {
      mdLines.push(`| ${r.index} | ${r.fullName} | \`status\` | \`${r.beforeState.status}\` | **\`${r.afterStateExpected.status}\`** |`);
    }
  });

  mdLines.push('\n===========================================================');
  mdLines.push('FASE E5 PREFLIGHT COMPLETE');
  mdLines.push('VOLUNTEERS MODIFICADOS: 0');
  mdLines.push('REVIEW ITEMS MODIFICADOS: 0');
  mdLines.push('REVIEWS MODIFICADAS: 0');
  mdLines.push('PROCESAMIENTO REAL: NO EJECUTADO');
  mdLines.push('===========================================================');

  const mdPath = path.join(process.cwd(), 'scratch', 'phase-e5-preflight-report.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ Archivo Markdown creado en: ${mdPath}`);

  console.log('\n===========================================================');
  console.log('FASE E5 — PREFLIGHT DE REGISTROS');
  console.log('===========================================================');
  console.log(`REGISTROS ENCONTRADOS: ${candidateItems.length}`);
  console.log(`READY:                 ${readyCount}`);
  console.log(`CONFLICT:              ${conflictCount}`);
  console.log(`NOT_ELIGIBLE:          ${notEligibleCount}`);
  console.log(`REQUIRES_INFORMATION:  ${reqInfoCount}`);
  console.log(`TOTAL:                 ${candidateItems.length}`);
  console.log('VOLUNTEERS MODIFICADOS: 0');
  console.log('REVIEW ITEMS MODIFICADOS: 0');
  console.log('REVIEWS MODIFICADAS:    0');
  console.log('PROCESAMIENTO REAL:    NO EJECUTADO');
  console.log('===========================================================');
}

runPhaseE5Preflight().catch(console.error);
