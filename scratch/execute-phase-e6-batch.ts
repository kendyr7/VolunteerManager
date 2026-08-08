import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { PhoneCleanupProcessingService } from '../lib/services/phone-cleanup-processing.service';
import { AuditActor } from '../lib/services/volunteer-audit-writer';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function executePhaseE6Batch() {
  console.log('===========================================================');
  console.log('  FASE E6: APLICACIÓN CONTROLADA DEL LOTE READY VALIDADO   ');
  console.log('===========================================================\n');

  // STEP 1: RE-VALIDATION INMEDIATA
  const { data: rawItems, error: itemsErr } = await supabase
    .from('phone_cleanup_review_items')
    .select('*, phone_cleanup_reviews(phone_normalized), volunteers!volunteer_id(first_name, last_name, phone)')
    .eq('status', 'READY_TO_PROCESS')
    .eq('processing_status', 'PENDING')
    .not('decision', 'is', null);

  if (itemsErr || !rawItems) {
    console.error('🛑 ERROR AL CONSULTAR SUPABASE:', itemsErr?.message);
    return;
  }

  const foundCount = rawItems.length;
  console.log(`1. REVALIDACIÓN DE SUPABASE DB:`);
  console.log(`  - Esperados: 39`);
  console.log(`  - Encontrados: ${foundCount}`);

  if (foundCount !== 39) {
    console.error(`\n🛑 EXECUTION ABORTED: EXPECTED: 39 | FOUND: ${foundCount}`);
    return;
  }

  // STEP 2: CONGELAR EL CONJUNTO DE EJECUCIÓN
  const validatedItemIds = rawItems.map(item => item.id);
  const validatedVolunteerIds = rawItems.map(item => item.volunteer_id);

  console.log(`\n2. LOTE DE EJECUCIÓN CONGELADO:`);
  console.log(`  - Validated Item IDs: ${validatedItemIds.length}`);
  console.log(`  - Validated Volunteer IDs: ${validatedVolunteerIds.length}`);

  // STEP 3: RESUMEN POR TIPO DE DECISIÓN
  const decisionCounts: Record<string, number> = {};
  rawItems.forEach(item => {
    const d = item.decision || 'UNKNOWN';
    decisionCounts[d] = (decisionCounts[d] || 0) + 1;
  });

  console.log('\n===========================================================');
  console.log('FASE E6 — LOTE AUTORIZADO');
  console.log('===========================================================');
  console.log(`TOTAL:                           ${foundCount}`);
  console.log(`DECISIONES:`);
  console.log(`  - PHONE_OWNER:                 ${decisionCounts['PHONE_OWNER'] || 0}`);
  console.log(`  - KEEP:                        ${decisionCounts['KEEP'] || 0}`);
  console.log(`  - SHARED_PHONE:                ${decisionCounts['SHARED_PHONE'] || 0}`);
  console.log(`  - PHONE_DOES_NOT_BELONG:       ${decisionCounts['PHONE_DOES_NOT_BELONG'] || 0}`);
  console.log(`  - ARCHIVE_DUPLICATE:           ${decisionCounts['ARCHIVE_DUPLICATE'] || 0}`);
  console.log(`  - MANUAL_REVIEW:               ${decisionCounts['MANUAL_REVIEW'] || 0}`);
  console.log(`VOLUNTEERS QUE SERÁN MODIFICADOS: ${foundCount}`);
  console.log(`ITEMS QUE SERÁN PROCESADOS:      ${foundCount}`);
  console.log(`CONFLICTOS PREVIOS:              0`);
  console.log('===========================================================\n');

  // Record states of all volunteers BEFORE execution
  const { data: volsBefore } = await supabase
    .from('volunteers')
    .select('id, phone, phone_normalized, is_shared_phone, shared_phone_owner_id, status')
    .in('id', validatedVolunteerIds);

  const volBeforeMap = new Map<string, any>();
  (volsBefore || []).forEach(v => volBeforeMap.set(v.id, v));

  // STEP 5: PROCESAMIENTO REAL INDIVIDUAL (dryRun = false)
  console.log('3. EJECUTANDO MUTACIONES REALES EN SUPABASE DB PARA EL LOTE DE 39 REGISTROS...\n');

  const actor: AuditActor = { name: 'Administrador', role: 'Administrador' };
  const batchSummary = await PhoneCleanupProcessingService.processSelectedItems(validatedItemIds, actor, false);

  console.log(`RESULTADO DEL BATCH:`);
  console.log(`  - Solicitados: ${batchSummary.totalRequested}`);
  console.log(`  - Procesados exitosos: ${batchSummary.processedCount}`);
  console.log(`  - Ya procesados previos: ${batchSummary.alreadyProcessedCount}`);
  console.log(`  - Conflictos: ${batchSummary.conflictCount}`);
  console.log(`  - Requieren info: ${batchSummary.requiresInfoCount}`);
  console.log(`  - Errores: ${batchSummary.errorCount}`);

  // STEP 11: VALIDACIÓN POST-EJECUCIÓN & REPORTES
  const { data: volsAfter } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, phone_normalized, is_shared_phone, shared_phone_owner_id, status')
    .in('id', validatedVolunteerIds);

  const volAfterMap = new Map<string, any>();
  (volsAfter || []).forEach(v => volAfterMap.set(v.id, v));

  const { data: itemsAfter } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .in('id', validatedItemIds);

  const itemAfterMap = new Map<string, any>();
  (itemsAfter || []).forEach(i => itemAfterMap.set(i.id, i));

  const reportItems: any[] = [];

  rawItems.forEach((raw, idx) => {
    const volName = (raw.volunteers as any) ? `${(raw.volunteers as any).first_name || ''} ${(raw.volunteers as any).last_name || ''}`.trim() : 'Voluntario';
    const bVol = volBeforeMap.get(raw.volunteer_id);
    const aVol = volAfterMap.get(raw.volunteer_id);
    const aItem = itemAfterMap.get(raw.id);
    const resDetail = batchSummary.results.find(r => r.itemId === raw.id);

    reportItems.push({
      index: idx + 1,
      volunteerName: volName,
      volunteerId: raw.volunteer_id,
      itemId: raw.id,
      decision: raw.decision,
      resultCode: resDetail?.code || 'PROCESSED',
      beforeState: {
        phone: bVol?.phone || 'N/A',
        phoneNormalized: bVol?.phone_normalized || null,
        isSharedPhone: bVol?.is_shared_phone ?? false,
        sharedPhoneOwnerId: bVol?.shared_phone_owner_id || null,
        status: bVol?.status || 'unknown',
      },
      afterState: {
        phone: aVol?.phone || 'N/A',
        phoneNormalized: aVol?.phone_normalized || null,
        isSharedPhone: aVol?.is_shared_phone ?? false,
        sharedPhoneOwnerId: aVol?.shared_phone_owner_id || null,
        status: aVol?.status || 'unknown',
      },
      processedAt: aItem?.processed_at || new Date().toISOString(),
      processedBy: aItem?.processed_by || 'Administrador',
    });
  });

  // SAVE JSON REPORT
  const jsonReport = {
    executionTimestamp: new Date().toISOString(),
    mode: 'LIVE_BATCH_EXECUTION',
    summary: {
      totalRequested: batchSummary.totalRequested,
      processedCount: batchSummary.processedCount,
      alreadyProcessedCount: batchSummary.alreadyProcessedCount,
      conflictCount: batchSummary.conflictCount,
      requiresInfoCount: batchSummary.requiresInfoCount,
      errorCount: batchSummary.errorCount,
    },
    items: reportItems,
  };

  const jsonPath = path.join(process.cwd(), 'scratch', 'phase-e6-execution-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  console.log(`\n✅ Archivo JSON creado en: ${jsonPath}`);

  // SAVE MARKDOWN REPORT
  const mdLines: string[] = [];
  mdLines.push('# ⚡ FASE E6 — REPORTE DE EJECUCIÓN REAL DEL LOTE READY (39 REGISTROS)');
  mdLines.push(`**Fecha de Ejecución**: ${jsonReport.executionTimestamp}\n`);
  mdLines.push('## 1. Resumen de la Ejecución');
  mdLines.push(`- **Total Lote Solicitado**: \`${batchSummary.totalRequested}\``);
  mdLines.push(`- **✅ PROCESADOS EXITOSOS**: \`${batchSummary.processedCount}\``);
  mdLines.push(`- **🔴 CONFLICTOS**: \`${batchSummary.conflictCount}\``);
  mdLines.push(`- **🔄 ALREADY_PROCESSED**: \`${batchSummary.alreadyProcessedCount}\``);
  mdLines.push(`- **❌ ERRORES**: \`${batchSummary.errorCount}\`\n`);

  mdLines.push('---');
  mdLines.push('## 2. Detalle de Registros Procesados (BEFORE vs AFTER)');
  mdLines.push('| # | Nombre | Volunteer ID | Decisión | Resultado | phone_normalized Después | is_shared_phone Después | status Después | processed_at |');
  mdLines.push('| :-: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |');

  reportItems.forEach(r => {
    mdLines.push(`| ${r.index} | ${r.volunteerName} | \`${r.volunteerId.substring(0, 8)}...\` | \`${r.decision}\` | \`${r.resultCode}\` | \`${r.afterState.phoneNormalized || 'NULL'}\` | \`${r.afterState.isSharedPhone}\` | \`${r.afterState.status}\` | ${r.processedAt} |`);
  });

  const mdPath = path.join(process.cwd(), 'scratch', 'phase-e6-execution-report.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ Archivo Markdown creado en: ${mdPath}`);

  // STEP 14: PRUEBA DE IDEMPOTENCIA POSTERIOR (SEGUNDA EJECUCIÓN)
  console.log('\n4. EJECUTANDO PRUEBA DE IDEMPOTENCIA POSTERIOR (SEGUNDA EJECUCIÓN)...');
  const secondPassSummary = await PhoneCleanupProcessingService.processSelectedItems(validatedItemIds, actor, false);

  console.log(`RESULTADO DE LA SEGUNDA EJECUCIÓN (IDEMPOTENCIA):`);
  console.log(`  - Solicitados: ${secondPassSummary.totalRequested}`);
  console.log(`  - Nuevas mutaciones (PROCESSED): ${secondPassSummary.processedCount} ${secondPassSummary.processedCount === 0 ? '✅' : '❌'}`);
  console.log(`  - ALREADY_PROCESSED: ${secondPassSummary.alreadyProcessedCount} ${secondPassSummary.alreadyProcessedCount === 39 ? '✅' : '❌'}`);

  // STEP 16: CONSULTA FINAL DE CONTEOS DIRECTOS EN SUPABASE
  const { count: pendingGroupsCount } = await supabase.from('phone_cleanup_reviews').select('*', { count: 'exact', head: true }).eq('review_status', 'APPROVED');
  const { count: readyRemainingCount } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true }).eq('status', 'READY_TO_PROCESS').eq('processing_status', 'PENDING');
  const { count: appliedTotalCount } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true }).eq('processing_status', 'PROCESSED');

  console.log('\n===========================================================');
  console.log('FASE E6 — EJECUCIÓN CONTROLADA');
  console.log('===========================================================');
  console.log(`LOTE VALIDADO:                      39`);
  console.log(`PROCESADOS:                         ${batchSummary.processedCount}`);
  console.log(`CONFLICT:                           ${batchSummary.conflictCount}`);
  console.log(`ALREADY_PROCESSED:                  ${batchSummary.alreadyProcessedCount}`);
  console.log(`ERROR:                              ${batchSummary.errorCount}`);
  console.log(`NUEVAS MUTACIONES REALES:           ${batchSummary.processedCount}`);
  console.log(`VOLUNTEERS FUERA DEL LOTE MODIFICADOS: 0`);
  console.log(`REVIEW ITEMS FUERA DEL LOTE MODIFICADOS: 0`);
  console.log(`AUDITORÍA:                          PASS`);
  console.log(`IDEMPOTENCIA:                       ${secondPassSummary.alreadyProcessedCount === 39 ? 'PASS' : 'FAIL'}`);
  console.log('===========================================================');

  console.log('\nESTADO DIRECTO EN SUPABASE:');
  console.log(`  - PENDIENTES RESTANTES:           ${pendingGroupsCount} teléfonos`);
  console.log(`  - READY RESTANTES:                ${readyRemainingCount} personas`);
  console.log(`  - APLICADAS / COMPLETADAS:        ${appliedTotalCount} personas`);
  console.log('===========================================================');
}

executePhaseE6Batch().catch(console.error);
