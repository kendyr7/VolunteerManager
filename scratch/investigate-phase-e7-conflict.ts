import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseE7Audit() {
  console.log('===========================================================');
  console.log('  FASE E7: DIAGNÓSTICO FORENSE DEL CONFLICTO AISLADO       ');
  console.log('  REGLA ABSOLUTA: 100% READ-ONLY (0 MUTACIONES EN BD)       ');
  console.log('===========================================================\n');

  const targetPhone = '+50587823513';

  // 1. Fetch volunteers sharing this phone
  const { data: volunteers } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, phone_normalized, status, is_shared_phone, shared_phone_owner_id, committee_id')
    .or('phone_normalized.ilike.%87823513%,phone.ilike.%87823513%');

  // 2. Fetch review items for this phone
  const { data: items } = await supabase
    .from('phone_cleanup_review_items')
    .select('*, volunteers!volunteer_id(first_name, last_name, phone)')
    .or('original_phone.ilike.%87823513%,corrected_phone.ilike.%87823513%');

  const affectedVol = volunteers?.find(v => v.id === '64aa3181-8b3b-4eea-899d-ab8b01ba23b8') || volunteers?.[0];

  console.log('1. VOLUNTARIO QUE INTENTÓ REGISTRARSE COMO TITULAR:');
  console.log(`  - Nombre: ${affectedVol?.first_name} ${affectedVol?.last_name}`);
  console.log(`  - Volunteer ID: ${affectedVol?.id}`);
  console.log(`  - phone: ${affectedVol?.phone}`);
  console.log(`  - phone_normalized: ${affectedVol?.phone_normalized}`);
  console.log(`  - status: ${affectedVol?.status}\n`);

  const currentNormalizedHolder = volunteers?.find(v => v.phone_normalized === targetPhone && !v.is_shared_phone);

  console.log('2. TITULAR QUE YA OCUPA EL TELÉFONO NORMALIZADO EN DB:');
  console.log(`  - Nombre: ${currentNormalizedHolder?.first_name} ${currentNormalizedHolder?.last_name}`);
  console.log(`  - Volunteer ID: ${currentNormalizedHolder?.id}`);
  console.log(`  - phone_normalized: ${currentNormalizedHolder?.phone_normalized}`);
  console.log(`  - status: ${currentNormalizedHolder?.status}\n`);

  console.log('3. TODAS LAS PERSONAS ASOCIADAS AL TELÉFONO +50587823513:');
  (volunteers || []).forEach(v => {
    console.log(`  - ${v.first_name} ${v.last_name} (${v.id.substring(0, 8)}...): phone_normalized = "${v.phone_normalized || 'NULL'}", is_shared = ${v.is_shared_phone}, status = ${v.status}`);
  });

  const causeDescription = `CAUSA DEL CONFLICTO: Para el teléfono +50587823513 existen dos personas guardadas con decisión PHONE_OWNER en la revisión humana: Nahomi Paola Ampie Somarriba y Sheyla Patricia Blandón Somarriba. Durante E6, Nahomi fue procesada primero y registró phone_normalized = "+50587823513". Cuando el sistema intentó procesar a Sheyla Patricia Blandón Somarriba como PHONE_OWNER, PostgreSQL rechazó la operación por violar la restricción de clave única (unique index "idx_volunteers_unique_active_phone").`;

  // WRITE JSON REPORT
  const jsonReport = {
    auditTimestamp: new Date().toISOString(),
    mode: 'READ_ONLY_FORENSIC',
    targetPhone,
    affectedVolunteer: affectedVol,
    currentNormalizedHolder,
    allVolunteersForPhone: volunteers || [],
    reviewItemsForPhone: items || [],
    causeDescription,
    resolutionOptions: [
      'OPCIÓN 1 (RECOMENDADA EN REVISIÓN HUMANA): Cambiar la decisión de Sheyla Patricia Blandón Somarriba a SHARED_PHONE especificando como titular a Nahomi Paola Ampie Somarriba (o viceversa).',
      'OPCIÓN 2: Si Sheyla Patricia tiene un número personal diferente, registrar su teléfono correcto de 8 dígitos (PHONE_DOES_NOT_BELONG).',
      'OPCIÓN 3: Si una de las fichas es un duplicado, archivar el registro correspondiente (ARCHIVE_DUPLICATE).',
    ],
  };

  const jsonPath = path.join(process.cwd(), 'scratch', 'phase-e7-conflict-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  console.log(`\n✅ Reporte JSON creado en: ${jsonPath}`);

  // WRITE MARKDOWN REPORT
  const mdLines: string[] = [];
  mdLines.push('# 🔬 FASE E7 — DIAGNÓSTICO FORENSE DEL CONFLICTO AISLADO POST-E6');
  mdLines.push(`**Fecha de Diagnóstico**: ${jsonReport.auditTimestamp}\n`);
  mdLines.push('> [!IMPORTANT]');
  mdLines.push('> **INTEGRIDAD TOTAL (100% READ-ONLY)**:');
  mdLines.push('> * **VOLUNTARIOS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEW ITEMS MODIFICADOS**: `0`');
  mdLines.push('> * **REVIEWS MODIFICADAS**: `0`');
  mdLines.push('> * **PROCESAMIENTO REAL**: `NO EJECUTADO`.\n');

  mdLines.push('## 1. Persona Afectada por el Conflicto');
  mdLines.push(`- **Nombre**: **${affectedVol?.first_name} ${affectedVol?.last_name}**`);
  mdLines.push(`- **Volunteer ID**: \`${affectedVol?.id}\``);
  mdLines.push(`- **Teléfono Solicitado**: \`${targetPhone}\``);
  mdLines.push(`- **Decisión Intentada**: \`PHONE_OWNER\`\n`);

  mdLines.push('## 2. Voluntario que Ya Posee el Teléfono en DB');
  mdLines.push(`- **Nombre**: **${currentNormalizedHolder?.first_name} ${currentNormalizedHolder?.last_name}**`);
  mdLines.push(`- **Volunteer ID**: \`${currentNormalizedHolder?.id}\``);
  mdLines.push(`- **phone_normalized**: \`${currentNormalizedHolder?.phone_normalized}\``);
  mdLines.push(`- **Estado**: \`${currentNormalizedHolder?.status}\`\n`);

  mdLines.push('## 3. Matriz de Personas Relacionadas al Teléfono (+50587823513)');
  mdLines.push('| Nombre Voluntario | ID | Teléfono (phone) | phone_normalized | status | is_shared_phone | shared_phone_owner_id |');
  mdLines.push('| :--- | :--- | :---: | :---: | :---: | :---: | :--- |');
  (volunteers || []).forEach(v => {
    mdLines.push(`| ${v.first_name} ${v.last_name} | \`${v.id.substring(0, 8)}...\` | \`${v.phone}\` | \`${v.phone_normalized || 'NULL'}\` | \`${v.status}\` | \`${v.is_shared_phone}\` | \`${v.shared_phone_owner_id || 'NULL'}\` |`);
  });

  mdLines.push('\n---');
  mdLines.push('## 4. Causa Exacta del Conflicto');
  mdLines.push(causeDescription + '\n');

  mdLines.push('## 5. Opciones de Resolución Humana');
  jsonReport.resolutionOptions.forEach(opt => mdLines.push(`- ${opt}`));

  mdLines.push('\n===========================================================');
  mdLines.push('FASE E7 — CONFLICTO AISLADO');
  mdLines.push('===========================================================');
  mdLines.push('READ-ONLY:               PASS');
  mdLines.push('VOLUNTEERS MODIFICADOS:  0');
  mdLines.push('REVIEW ITEMS MODIFICADOS: 0');
  mdLines.push(`CAUSA:                   Duplicidad en clave única idx_volunteers_unique_active_phone (${targetPhone})`);
  mdLines.push('RESOLUCIÓN AUTOMÁTICA:   NO AUTORIZADA');
  mdLines.push('ACCIÓN REQUERIDA:        REVISIÓN HUMANA EN LA UI');
  mdLines.push('===========================================================');

  const mdPath = path.join(process.cwd(), 'scratch', 'phase-e7-conflict-report.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ Reporte Markdown creado en: ${mdPath}`);

  console.log('\n===========================================================');
  console.log('FASE E7 — CONFLICTO AISLADO');
  console.log('===========================================================');
  console.log('READ-ONLY:               PASS');
  console.log('VOLUNTEERS MODIFICADOS:  0');
  console.log('REVIEW ITEMS MODIFICADOS: 0');
  console.log(`CAUSA:                   Duplicidad en clave única idx_volunteers_unique_active_phone (${targetPhone})`);
  console.log('RESOLUCIÓN AUTOMÁTICA:   NO AUTORIZADA');
  console.log('ACCIÓN REQUERIDA:        REVISIÓN HUMANA EN LA UI');
  console.log('===========================================================');
}

runPhaseE7Audit().catch(console.error);
