import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getLocal8Digits, normalizePhoneE164 } from '../lib/whatsapp';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface VolunteerDiagnosisRecord {
  id: string;
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
}

export interface DuplicateGroupDiagnosis {
  groupIndex: number;
  normalizedPhone: string;
  local8Digits: string;
  totalCount: number;
  activeCount: number;
  archivedCount: number;
  category: 'CATEGORY_A' | 'CATEGORY_B' | 'CATEGORY_C' | 'CATEGORY_D' | 'CATEGORY_E';
  categoryLabel: string;
  confidence: 'ALTA' | 'MEDIA' | 'BAJA';
  suggestedAction: 'ARCHIVAR DUPLICADO' | 'MARCAR COMO SHARED_PHONE' | 'NORMALIZAR FORMATO' | 'REVISAR' | 'REVISIÓN ADMINISTRATIVA';
  tags: string[];
  hasMinors: boolean;
  hasMatchingEmail: boolean;
  hasIdenticalNames: boolean;
  hasFormatDifference: boolean;
  volunteers: VolunteerDiagnosisRecord[];
  notes: string;
}

function cleanString(str?: string | null): string {
  if (!str) return '';
  return str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractSurnames(lastName?: string | null): string[] {
  if (!lastName) return [];
  return cleanString(lastName).split(/\s+/).filter(w => w.length > 2);
}

function classifyDuplicateGroup(vols: VolunteerDiagnosisRecord[], local8: string): {
  category: DuplicateGroupDiagnosis['category'];
  categoryLabel: string;
  confidence: DuplicateGroupDiagnosis['confidence'];
  suggestedAction: DuplicateGroupDiagnosis['suggestedAction'];
  tags: string[];
  hasMinors: boolean;
  hasMatchingEmail: boolean;
  hasIdenticalNames: boolean;
  hasFormatDifference: boolean;
  notes: string;
} {
  const activeVols = vols.filter(v => v.status === 'active');
  const archivedVols = vols.filter(v => v.status === 'archived');
  const tags: string[] = [];

  const hasMinors = vols.some(v => typeof v.age === 'number' && v.age < 18);
  const hasAdults = vols.some(v => typeof v.age === 'number' && v.age >= 18);

  if (hasMinors && hasAdults) tags.push('ADULTO + MENOR');
  else if (hasMinors) tags.push('CON MENORES');

  // Format difference check
  const phoneFormats = new Set(vols.map(v => v.phone.trim()));
  const hasFormatDifference = phoneFormats.size > 1;
  if (hasFormatDifference) tags.push('FORMATO DISTINTO');

  // Matching emails
  const validEmails = vols.map(v => cleanString(v.email)).filter(Boolean);
  const uniqueEmails = new Set(validEmails);
  const hasMatchingEmail = validEmails.length > 1 && uniqueEmails.size < validEmails.length;
  if (hasMatchingEmail) tags.push('MISMO EMAIL');

  // Identical/similar names check
  const fullNames = vols.map(v => cleanString(v.fullName));
  const uniqueFullNames = new Set(fullNames);
  const hasIdenticalNames = uniqueFullNames.size < fullNames.length;
  if (hasIdenticalNames) tags.push('NOMBRES IDÉNTICOS');

  // Surname similarity check
  const surnameSets = vols.map(v => extractSurnames(v.lastName));
  let sharesSurname = false;
  for (let i = 0; i < surnameSets.length; i++) {
    for (let j = i + 1; j < surnameSets.length; j++) {
      const common = surnameSets[i].filter(s => surnameSets[j].includes(s));
      if (common.length > 0) {
        sharesSurname = true;
        break;
      }
    }
  }
  if (sharesSurname) tags.push('MISMO APELLIDO');

  // Classification Logic
  let category: DuplicateGroupDiagnosis['category'] = 'CATEGORY_E';
  let categoryLabel = 'Revisión Manual / Ambiguo';
  let confidence: DuplicateGroupDiagnosis['confidence'] = 'MEDIA';
  let suggestedAction: DuplicateGroupDiagnosis['suggestedAction'] = 'REVISIÓN ADMINISTRATIVA';
  let notes = '';

  // CASO D: Si hay 1 activo + 1 o más archivados (o todos archivados)
  if (activeVols.length <= 1 && archivedVols.length > 0) {
    category = 'CATEGORY_D';
    categoryLabel = 'Duplicado Archivado';
    confidence = 'ALTA';
    suggestedAction = 'NORMALIZAR FORMATO';
    notes = 'Existe al menos un perfil archivado. El teléfono activo conserva preferencia.';
    tags.push('TIENE ARCHIVADOS');
    return { category, categoryLabel, confidence, suggestedAction, tags, hasMinors, hasMatchingEmail, hasIdenticalNames, hasFormatDifference, notes };
  }

  // CASO C: Diferencia principal es únicamente el formato del teléfono (y nombres muy similares)
  if (hasFormatDifference && (hasIdenticalNames || hasMatchingEmail)) {
    category = 'CATEGORY_C';
    categoryLabel = 'Diferencia de Formato';
    confidence = 'ALTA';
    suggestedAction = 'ARCHIVAR DUPLICADO';
    notes = 'La diferencia principal es la sintaxis del teléfono (+505 vs 8888) en la misma persona.';
    return { category, categoryLabel, confidence, suggestedAction, tags, hasMinors, hasMatchingEmail, hasIdenticalNames, hasFormatDifference, notes };
  }

  // CASO A: Posible Duplicado de la Misma Persona
  if (hasIdenticalNames || hasMatchingEmail) {
    category = 'CATEGORY_A';
    categoryLabel = 'Posible Duplicado de Misma Persona';
    confidence = 'ALTA';
    suggestedAction = 'ARCHIVAR DUPLICADO';
    notes = 'Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.';
    return { category, categoryLabel, confidence, suggestedAction, tags, hasMinors, hasMatchingEmail, hasIdenticalNames, hasFormatDifference, notes };
  }

  // CASO B: Teléfono Compartido / Familia
  if (hasMinors || sharesSurname || (vols.length >= 2 && !hasIdenticalNames)) {
    category = 'CATEGORY_B';
    categoryLabel = 'Posible Teléfono Compartido / Familia';
    confidence = (hasMinors || sharesSurname) ? 'ALTA' : 'MEDIA';
    suggestedAction = 'MARCAR COMO SHARED_PHONE';
    if (hasMinors && hasAdults) {
      notes = 'Adulto y menor de edad comparten número de contacto familiar.';
      tags.push('POSIBLE FAMILIA');
    } else if (sharesSurname) {
      notes = 'Integrantes con apellidos coincidentes comparten teléfono.';
      tags.push('POSIBLE FAMILIA');
    } else {
      notes = 'Perfiles activos con nombres distintos que comparten número de teléfono.';
      tags.push('RELACIÓN NO DETERMINABLE');
    }
    return { category, categoryLabel, confidence, suggestedAction, tags, hasMinors, hasMatchingEmail, hasIdenticalNames, hasFormatDifference, notes };
  }

  // CASO E: Ambiguo
  category = 'CATEGORY_E';
  categoryLabel = 'Ambiguo / Revisión Manual';
  confidence = 'BAJA';
  suggestedAction = 'REVISAR';
  notes = 'Requiere validación directa por un coordinador para determinar el origen del teléfono.';
  tags.push('RELACIÓN NO DETERMINABLE');

  return { category, categoryLabel, confidence, suggestedAction, tags, hasMinors, hasMatchingEmail, hasIdenticalNames, hasFormatDifference, notes };
}

async function runPhase3Diagnosis() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 3: READ-ONLY PHONE DIAGNOSIS & CLASSIFIER  ');
  console.log('===========================================================\n');

  // 1. READ-ONLY query of all volunteers
  const { data: rawVolunteers, error: fetchErr } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, email, phone, status, age, stake, neighborhood, committee_id, created_at, committees(name)')
    .order('created_at', { ascending: true });

  if (fetchErr || !rawVolunteers) {
    console.error('❌ Error reading volunteers from Supabase:', fetchErr);
    return;
  }

  console.log(`Total Volunteers fetched from DB: ${rawVolunteers.length}`);

  // Map to structured record format
  const volunteers: VolunteerDiagnosisRecord[] = rawVolunteers.map(v => ({
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

  // Group by canonical 8-digit normalized phone
  const phoneMap = new Map<string, VolunteerDiagnosisRecord[]>();

  volunteers.forEach(vol => {
    if (!vol.phone) return;
    const local8 = getLocal8Digits(vol.phone);
    if (!local8 || local8.length !== 8) return;

    const list = phoneMap.get(local8) || [];
    list.push(vol);
    phoneMap.set(local8, list);
  });

  const duplicateGroups: DuplicateGroupDiagnosis[] = [];
  let groupCounter = 1;

  phoneMap.forEach((groupVols, local8) => {
    if (groupVols.length > 1) {
      const normPhone = normalizePhoneE164(groupVols[0].phone) || `+505${local8}`;
      const activeCount = groupVols.filter(v => v.status === 'active').length;
      const archivedCount = groupVols.filter(v => v.status === 'archived').length;

      const classification = classifyDuplicateGroup(groupVols, local8);

      duplicateGroups.push({
        groupIndex: groupCounter++,
        normalizedPhone: normPhone,
        local8Digits: local8,
        totalCount: groupVols.length,
        activeCount,
        archivedCount,
        category: classification.category,
        categoryLabel: classification.categoryLabel,
        confidence: classification.confidence,
        suggestedAction: classification.suggestedAction,
        tags: classification.tags,
        hasMinors: classification.hasMinors,
        hasMatchingEmail: classification.hasMatchingEmail,
        hasIdenticalNames: classification.hasIdenticalNames,
        hasFormatDifference: classification.hasFormatDifference,
        volunteers: groupVols,
        notes: classification.notes,
      });
    }
  });

  // Calculate Summary Metrics
  const activeActiveGroups = duplicateGroups.filter(g => g.activeCount > 1);
  const activeArchivedGroups = duplicateGroups.filter(g => g.activeCount >= 1 && g.archivedCount >= 1);
  const allArchivedGroups = duplicateGroups.filter(g => g.activeCount === 0);
  const tripleActiveGroups = duplicateGroups.filter(g => g.activeCount >= 3);
  const minorGroups = duplicateGroups.filter(g => g.hasMinors);
  const formatDiffGroups = duplicateGroups.filter(g => g.hasFormatDifference);

  const categoryA = duplicateGroups.filter(g => g.category === 'CATEGORY_A');
  const categoryB = duplicateGroups.filter(g => g.category === 'CATEGORY_B');
  const categoryC = duplicateGroups.filter(g => g.category === 'CATEGORY_C');
  const categoryD = duplicateGroups.filter(g => g.category === 'CATEGORY_D');
  const categoryE = duplicateGroups.filter(g => g.category === 'CATEGORY_E');

  console.log('--- SUMMARY STATS ---');
  console.log(`Total Duplicate Groups: ${duplicateGroups.length}`);
  console.log(`Colisiones Active + Active: ${activeActiveGroups.length}`);
  console.log(`Grupos Active + Archived: ${activeArchivedGroups.length}`);
  console.log(`Category A (Misma Persona): ${categoryA.length}`);
  console.log(`Category B (Teléfono Compartido / Familia): ${categoryB.length}`);
  console.log(`Category C (Diferencia de Formato): ${categoryC.length}`);
  console.log(`Category D (Archivados): ${categoryD.length}`);
  console.log(`Category E (Revisión Manual): ${categoryE.length}`);

  // Write JSON artifact
  const jsonPath = path.join(process.cwd(), 'scratch/phase3-phone-diagnosis.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    metadata: {
      generatedAt: new Date().toISOString(),
      totalVolunteers: volunteers.length,
      totalDuplicateGroups: duplicateGroups.length,
      activeActiveConflicts: activeActiveGroups.length,
      activeArchivedConflicts: activeArchivedGroups.length,
      tripleActiveGroups: tripleActiveGroups.length,
      groupsWithMinors: minorGroups.length,
      categoriesCount: {
        categoryA: categoryA.length,
        categoryB: categoryB.length,
        categoryC: categoryC.length,
        categoryD: categoryD.length,
        categoryE: categoryE.length,
      }
    },
    duplicateGroups
  }, null, 2));

  // Write Markdown Report
  let md = '# FASE 3 — DIAGNÓSTICO DE TELÉFONOS DUPLICADOS (READ-ONLY)\n\n' +
    '> Este reporte fue generado de manera **100% READ-ONLY**. No se ejecutó ningún UPDATE, INSERT, DELETE, TRUNCATE ni ALTER sobre la base de datos Supabase.\n\n' +
    '---\n\n' +
    '## 1. RESUMEN EJECUTIVO DE DATOS\n\n' +
    `* **Total Voluntarios en BD**: ${volunteers.length}\n` +
    `* **Grupos con Teléfono Duplicado**: ${duplicateGroups.length}\n` +
    `* **Colisiones de Voluntarios Activos (Active + Active)**: ${activeActiveGroups.length}\n` +
    `* **Grupos con Voluntarios Archivados (Active + Archived)**: ${activeArchivedGroups.length}\n` +
    `* **Grupos con 3 o más Voluntarios Activos**: ${tripleActiveGroups.length}\n` +
    `* **Grupos con Menores de Edad**: ${minorGroups.length}\n` +
    `* **Grupos con Diferencias de Formato de Teléfono**: ${formatDiffGroups.length}\n\n` +
    '---\n\n' +
    '## 2. CLASIFICACIÓN POR CATEGORÍAS SUGERIDAS\n\n' +
    '| Categoría | Cantidad | Descripción | Acción Sugerida |\n' +
    '| :--- | :---: | :--- | :--- |\n' +
    `| **CATEGORY_A** | **${categoryA.length}** | Posible Duplicado de la Misma Persona (Nombres idénticos / mismo email) | ARCHIVAR DUPLICADO |\n` +
    `| **CATEGORY_B** | **${categoryB.length}** | Posible Teléfono Compartido / Familia (Padre+Hijo / Cónyuges) | MARCAR COMO SHARED_PHONE |\n` +
    `| **CATEGORY_C** | **${categoryC.length}** | Diferencia de Formato de Teléfono (+505 vs 8888) | NORMALIZAR FORMATO |\n` +
    `| **CATEGORY_D** | **${categoryD.length}** | Voluntarios Archivados que conservan el teléfono | NORMALIZAR FORMATO |\n` +
    `| **CATEGORY_E** | **${categoryE.length}** | Casos Ambiguos / Requieren Revisión Administrativa | REVISAR |\n\n` +
    '---\n\n' +
    '## 3. DETALLE DE GRUPOS POR CATEGORÍA\n\n';

  // Append Categories to MD
  const appendCategorySection = (title: string, catKey: DuplicateGroupDiagnosis['category'], items: DuplicateGroupDiagnosis[]) => {
    md += `### ${title} (${items.length} Grupos)\n\n`;
    if (items.length === 0) {
      md += `*No se registraron grupos en esta categoría.*\n\n`;
      return;
    }

    items.forEach(g => {
      md += `#### GRUPO #${g.groupIndex} — Teléfono Normalizado: '${g.normalizedPhone}'\n`;
      md += `- **Totales**: ${g.totalCount} Perfiles (${g.activeCount} Activos, ${g.archivedCount} Archivados)\n`;
      md += `- **Etiquetas**: ${g.tags.map(t => `'${t}'`).join(', ')}\n`;
      md += `- **Acción Recomendada**: '${g.suggestedAction}' (Confianza: **${g.confidence}**)\n`;
      md += `- **Notas**: ${g.notes}\n\n`;
      md += `| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |\n`;
      md += `| :--- | :--- | :---: | :---: | :--- | :---: | :---: |\n`;
      g.volunteers.forEach(v => {
        md += `| '${v.id.slice(0, 8)}...' | **${v.fullName}** | '${v.status}' | ${v.age ?? 'N/D'} | ${v.committee} | '${v.phone}' | ${v.createdAt.slice(0, 10)} |\n`;
      });
      md += `\n---\n\n`;
    });
  };

  appendCategorySection('CATEGORY A — Posibles Duplicados de la Misma Persona', 'CATEGORY_A', categoryA);
  appendCategorySection('CATEGORY B — Posibles Teléfonos Compartidos / Familia', 'CATEGORY_B', categoryB);
  appendCategorySection('CATEGORY C — Diferencias de Formato de Teléfono', 'CATEGORY_C', categoryC);
  appendCategorySection('CATEGORY D — Voluntarios Archivados', 'CATEGORY_D', categoryD);
  appendCategorySection('CATEGORY E — Casos Ambiguos / Revisión Manual', 'CATEGORY_E', categoryE);

  // Append Master Decision Table
  md += `## 4. TABLA DE DECISIÓN Y MATRIZ DE REVISIÓN ADMINISTRATIVA\n\n`;
  md += `| Grupo | Teléfono | Activos | Archivados | Categoría Sugerida | Confianza | Acción Requerida |\n`;
  md += `| :---: | :---: | :---: | :---: | :--- | :---: | :--- |\n`;

  duplicateGroups.forEach(g => {
    md += `| **#${g.groupIndex}** | '${g.normalizedPhone}' | ${g.activeCount} | ${g.archivedCount} | **${g.category}** | ${g.confidence} | '${g.suggestedAction}' |\n`;
  });

  md += `\n\n---\n*Reporte generado de forma 100% READ-ONLY por VolunteerManager Phase 3 Diagnostic Script.*\n`;

  const mdPath = path.join(process.cwd(), 'scratch/phase3-phone-diagnosis.md');
  fs.writeFileSync(mdPath, md);

  console.log(`\n✅ Diagnostic files successfully written:`);
  console.log(`  - JSON: ${jsonPath}`);
  console.log(`  - Markdown: ${mdPath}`);
}

runPhase3Diagnosis().catch(console.error);
