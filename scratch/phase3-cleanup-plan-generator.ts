import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getLocal8Digits, normalizePhoneE164 } from '../lib/whatsapp';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface VolunteerPlanItem {
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

export interface ProposedAction {
  volunteerId: string;
  volunteerName: string;
  action: 'SET_SHARED_PHONE' | 'ARCHIVE_DUPLICATE' | 'NORMALIZE_PHONE' | 'KEEP_UNCHANGED' | 'MANUAL_REVIEW';
  reason: string;
  ownerId?: string;
  ownerName?: string;
}

export interface CleanupGroupPlan {
  groupId: number;
  normalizedPhone: string;
  local8Digits: string;
  totalProfiles: number;
  activeProfiles: number;
  archivedProfiles: number;
  decision: 'SHARED_PHONE_CONFIRMED' | 'SHARED_PHONE_REVIEW' | 'POSSIBLE_DUPLICATE' | 'ARCHIVE_DUPLICATE' | 'NORMALIZE_ONLY' | 'MANUAL_REVIEW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  isHighRisk: boolean;
  highRiskReason?: string;
  volunteers: VolunteerPlanItem[];
  proposedActions: ProposedAction[];
}

function cleanStr(str?: string | null): string {
  if (!str) return '';
  return str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractSurnames(lastName?: string | null): string[] {
  if (!lastName) return [];
  return cleanStr(lastName).split(/\s+/).filter(w => w.length > 2);
}

async function runPhase3PlanGenerator() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 3 PASO 2A: CLEANUP PLAN GENERATOR (READ-ONLY)');
  console.log('===========================================================\n');

  // 1. Fetch raw volunteers (READ-ONLY)
  const { data: rawVolunteers, error: fetchErr } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, email, phone, status, age, stake, neighborhood, committee_id, created_at, committees(name)')
    .order('created_at', { ascending: true });

  if (fetchErr || !rawVolunteers) {
    console.error('❌ Error reading volunteers from Supabase:', fetchErr);
    return;
  }

  const volunteers: VolunteerPlanItem[] = rawVolunteers.map(v => ({
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

  // Group by canonical 8-digit phone
  const phoneMap = new Map<string, VolunteerPlanItem[]>();
  volunteers.forEach(v => {
    if (!v.phone) return;
    const local8 = getLocal8Digits(v.phone);
    if (!local8 || local8.length !== 8) return;
    const list = phoneMap.get(local8) || [];
    list.push(v);
    phoneMap.set(local8, list);
  });

  const cleanupPlans: CleanupGroupPlan[] = [];
  let groupCounter = 1;

  phoneMap.forEach((vols, local8) => {
    if (vols.length > 1) {
      const normPhone = normalizePhoneE164(vols[0].phone) || `+505${local8}`;
      const activeVols = vols.filter(v => v.status === 'active');
      const archivedVols = vols.filter(v => v.status === 'archived');

      // Metric indicators
      const hasMinors = vols.some(v => typeof v.age === 'number' && v.age < 18);
      const hasAdults = vols.some(v => typeof v.age === 'number' && v.age >= 18);

      const validEmails = vols.map(v => cleanStr(v.email)).filter(Boolean);
      const uniqueEmails = new Set(validEmails);
      const hasMatchingEmail = validEmails.length > 1 && uniqueEmails.size < validEmails.length;

      const fullNames = vols.map(v => cleanStr(v.fullName));
      const uniqueFullNames = new Set(fullNames);
      const hasIdenticalNames = uniqueFullNames.size < fullNames.length;

      let sharesSurname = false;
      const surnameSets = vols.map(v => extractSurnames(v.lastName));
      for (let i = 0; i < surnameSets.length; i++) {
        for (let j = i + 1; j < surnameSets.length; j++) {
          const common = surnameSets[i].filter(s => surnameSets[j].includes(s));
          if (common.length > 0) {
            sharesSurname = true;
            break;
          }
        }
      }

      let decision: CleanupGroupPlan['decision'] = 'MANUAL_REVIEW';
      let confidence: CleanupGroupPlan['confidence'] = 'MEDIUM';
      let reason = '';
      let isHighRisk = false;
      let highRiskReason = '';
      const proposedActions: ProposedAction[] = [];

      // Flag High Risk conditions
      if (activeVols.length >= 3) {
        isHighRisk = true;
        highRiskReason = `Grupo masivo con ${activeVols.length} voluntarios activos.`;
      } else if (hasMinors && hasAdults) {
        isHighRisk = true;
        highRiskReason = 'Presencia de menores de edad compartiendo teléfono con adultos.';
      } else if (hasIdenticalNames || hasMatchingEmail) {
        isHighRisk = true;
        highRiskReason = 'Nombres idénticos o email coincidente (posible duplicado de persona).';
      }

      // DECISION LOGIC
      // 1. ACTIVE + ARCHIVED (NORMALIZE_ONLY)
      if (activeVols.length <= 1 && archivedVols.length > 0) {
        decision = 'NORMALIZE_ONLY';
        confidence = 'HIGH';
        reason = 'Existe 1 voluntario activo y perfiles archivados. Se propone normalizar formato.';

        vols.forEach(v => {
          proposedActions.push({
            volunteerId: v.id,
            volunteerName: v.fullName,
            action: 'NORMALIZE_PHONE',
            reason: `Normalizar teléfono a ${normPhone} (${v.status}).`,
          });
        });
      }
      // 2. IDENTICAL NAMES / EMAIL (ARCHIVE_DUPLICATE)
      else if (hasIdenticalNames || hasMatchingEmail) {
        decision = 'ARCHIVE_DUPLICATE';
        confidence = 'HIGH';
        reason = 'Se detectaron perfiles duplicados de la misma persona (mismo nombre completo o correo).';

        // Keep active or most recent record
        const sorted = [...vols].sort((a, b) => {
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (a.status !== 'active' && b.status === 'active') return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        const keepVol = sorted[0];
        proposedActions.push({
          volunteerId: keepVol.id,
          volunteerName: keepVol.fullName,
          action: 'KEEP_UNCHANGED',
          reason: 'Perfil principal a conservar como activo.',
        });

        sorted.slice(1).forEach(dupe => {
          proposedActions.push({
            volunteerId: dupe.id,
            volunteerName: dupe.fullName,
            action: 'ARCHIVE_DUPLICATE',
            reason: `Archivar registro duplicado en favor de perfil principal (${keepVol.id.slice(0, 8)}).`,
          });
        });
      }
      // 3. CONFIRMED SHARED PHONE (ADULT + MINOR OR FAMILY MEMBERS WITH DISTINCT NAMES)
      else if ((hasMinors && hasAdults) || (sharesSurname && !hasIdenticalNames)) {
        decision = 'SHARED_PHONE_CONFIRMED';
        confidence = 'HIGH';
        reason = hasMinors
          ? 'Padre/Tutor adulto y menor de edad que comparten legítimamente el teléfono familiar.'
          : 'Integrantes de la misma familia con apellidos coincidentes y nombres distintos.';

        // Select owner (Adult or first registered)
        const adultOwner = vols.find(v => typeof v.age === 'number' && v.age >= 18) || vols[0];

        proposedActions.push({
          volunteerId: adultOwner.id,
          volunteerName: adultOwner.fullName,
          action: 'KEEP_UNCHANGED',
          reason: 'Propietario principal del teléfono familiar.',
        });

        vols.filter(v => v.id !== adultOwner.id).forEach(subVol => {
          proposedActions.push({
            volunteerId: subVol.id,
            volunteerName: subVol.fullName,
            action: 'SET_SHARED_PHONE',
            reason: `Teléfono compartido autorizado vinculado al propietario ${adultOwner.fullName}.`,
            ownerId: adultOwner.id,
            ownerName: adultOwner.fullName,
          });
        });
      }
      // 4. SHARED PHONE REVIEW (DISTINCT NAMES, NO CLEAR SURNAME/AGE LINK)
      else if (vols.length === 2 && !hasIdenticalNames) {
        decision = 'SHARED_PHONE_REVIEW';
        confidence = 'MEDIUM';
        reason = 'Voluntarios activos con nombres diferentes. Requiere confirmación administrativa para autorizar teléfono compartido.';

        vols.forEach(v => {
          proposedActions.push({
            volunteerId: v.id,
            volunteerName: v.fullName,
            action: 'MANUAL_REVIEW',
            reason: 'Revisar con coordinador antes de marcar como shared_phone.',
          });
        });
      }
      // 5. MANUAL REVIEW / AMBIGUOUS
      else {
        decision = 'MANUAL_REVIEW';
        confidence = 'LOW';
        reason = 'Información ambigua o conflicto múltiple. Requiere decisión humana explícita.';

        vols.forEach(v => {
          proposedActions.push({
            volunteerId: v.id,
            volunteerName: v.fullName,
            action: 'MANUAL_REVIEW',
            reason: 'Requiere decisión manual del administrador.',
          });
        });
      }

      cleanupPlans.push({
        groupId: groupCounter++,
        normalizedPhone: normPhone,
        local8Digits: local8,
        totalProfiles: vols.length,
        activeProfiles: activeVols.length,
        archivedProfiles: archivedVols.length,
        decision,
        confidence,
        reason,
        isHighRisk,
        highRiskReason: isHighRisk ? highRiskReason : undefined,
        volunteers: vols,
        proposedActions,
      });
    }
  });

  // Calculate Metrics
  const countSharedConfirmed = cleanupPlans.filter(p => p.decision === 'SHARED_PHONE_CONFIRMED').length;
  const countSharedReview = cleanupPlans.filter(p => p.decision === 'SHARED_PHONE_REVIEW').length;
  const countPossibleDupe = cleanupPlans.filter(p => p.decision === 'POSSIBLE_DUPLICATE').length;
  const countArchiveDupe = cleanupPlans.filter(p => p.decision === 'ARCHIVE_DUPLICATE').length;
  const countNormalizeOnly = cleanupPlans.filter(p => p.decision === 'NORMALIZE_ONLY').length;
  const countManualReview = cleanupPlans.filter(p => p.decision === 'MANUAL_REVIEW').length;
  const highRiskGroups = cleanupPlans.filter(p => p.isHighRisk);

  console.log('--- CLEANUP PLAN SUMMARY ---');
  console.log(`Total Groups Analyzed: ${cleanupPlans.length}`);
  console.log(`SHARED_PHONE_CONFIRMED: ${countSharedConfirmed}`);
  console.log(`SHARED_PHONE_REVIEW: ${countSharedReview}`);
  console.log(`POSSIBLE_DUPLICATE: ${countPossibleDupe}`);
  console.log(`ARCHIVE_DUPLICATE: ${countArchiveDupe}`);
  console.log(`NORMALIZE_ONLY: ${countNormalizeOnly}`);
  console.log(`MANUAL_REVIEW: ${countManualReview}`);
  console.log(`HIGH_RISK_GROUPS: ${highRiskGroups.length}`);

  // Write JSON Plan
  const jsonPath = path.join(process.cwd(), 'scratch/phase3-cleanup-plan.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_PLAN',
      totalGroups: cleanupPlans.length,
      highRiskGroupsCount: highRiskGroups.length,
      decisionCounts: {
        SHARED_PHONE_CONFIRMED: countSharedConfirmed,
        SHARED_PHONE_REVIEW: countSharedReview,
        POSSIBLE_DUPLICATE: countPossibleDupe,
        ARCHIVE_DUPLICATE: countArchiveDupe,
        NORMALIZE_ONLY: countNormalizeOnly,
        MANUAL_REVIEW: countManualReview,
      }
    },
    cleanupPlans
  }, null, 2));

  // Write Markdown Plan
  let md = '# FASE 3 — PASO 2A: PLAN DE SANEAMIENTO DE TELÉFONOS (READ-ONLY)\n\n' +
    '> **CONFIRMACIÓN DE PLAN READ-ONLY**:\n' +
    '> Este documento representa un **plan de decisión previo**. NO se ha ejecutado ninguna modificación en la base de datos Supabase.\n\n' +
    '---\n\n' +
    '# 1. RESUMEN DE DECISIONES PROPUESTAS\n\n' +
    `* **SHARED_PHONE_CONFIRMED**: ${countSharedConfirmed} Grupos\n` +
    `* **SHARED_PHONE_REVIEW**: ${countSharedReview} Grupos\n` +
    `* **POSSIBLE_DUPLICATE**: ${countPossibleDupe} Grupos\n` +
    `* **ARCHIVE_DUPLICATE**: ${countArchiveDupe} Grupos\n` +
    `* **NORMALIZE_ONLY**: ${countNormalizeOnly} Grupos\n` +
    `* **MANUAL_REVIEW**: ${countManualReview} Grupos\n` +
    `* **GRUPOS DE ALTO RIESGO**: ${highRiskGroups.length} Grupos\n\n` +
    '---\n\n' +
    '# 2. GRUPOS DE ALTO RIESGO (HIGH_RISK_GROUPS)\n\n';

  if (highRiskGroups.length === 0) {
    md += '*No se detectaron grupos de alto riesgo.*\n\n';
  } else {
    highRiskGroups.forEach(g => {
      md += `### GRUPO #${g.groupId} — Teléfono Normalizado: '${g.normalizedPhone}'\n`;
      md += `- **Riesgo**: ${g.highRiskReason}\n`;
      md += `- **Decisión Propuesta**: '${g.decision}' (Confianza: **${g.confidence}**)\n`;
      md += `- **Integrantes**:\n`;
      g.volunteers.forEach(v => {
        md += `  - **${v.fullName}** (ID: '${v.id.slice(0, 8)}...', Status: '${v.status}', Edad: ${v.age ?? 'N/D'}, Comité: ${v.committee})\n`;
      });
      md += `\n---\n\n`;
    });
  }

  md += '# 3. GRUPOS QUE REQUIEREN DECISIÓN HUMANA O REVISIÓN ADMINISTRATIVA\n\n';
  const humanReviewGroups = cleanupPlans.filter(p => p.decision === 'SHARED_PHONE_REVIEW' || p.decision === 'MANUAL_REVIEW' || p.decision === 'POSSIBLE_DUPLICATE');

  if (humanReviewGroups.length === 0) {
    md += '*Todos los grupos tienen clasificación automática con alta confianza.*\n\n';
  } else {
    humanReviewGroups.forEach(g => {
      md += `### GRUPO #${g.groupId} — Teléfono Normalizado: '${g.normalizedPhone}'\n`;
      md += `- **Decisión**: '${g.decision}' | **Razón**: ${g.reason}\n`;
      md += `- **Acción Propuesta**: '${g.proposedActions.map(a => a.action).join(', ')}'\n`;
      md += `- **Integrantes**:\n`;
      g.volunteers.forEach(v => {
        md += `  - **${v.fullName}** (ID: '${v.id.slice(0, 8)}...', Status: '${v.status}', Tel: '${v.phone}')\n`;
      });
      md += `\n---\n\n`;
    });
  }

  md += '# 4. PLAN DE ACCIONES RECOMENDADAS POR GRUPO\n\n';
  md += '| Grupo | Teléfono | Activos | Archivados | Decisión Propuesta | Confianza | Acción Recomendada |\n';
  md += '| :---: | :---: | :---: | :---: | :--- | :---: | :--- |\n';

  cleanupPlans.forEach(g => {
    md += `| **#${g.groupId}** | '${g.normalizedPhone}' | ${g.activeProfiles} | ${g.archivedProfiles} | **${g.decision}** | ${g.confidence} | '${g.proposedActions.map(a => a.action).join(', ')}' |\n`;
  });

  md += '\n\n---\n*Plan de saneamiento generado en modo 100% READ-ONLY por VolunteerManager Phase 3 Cleanup Plan Generator.*\n';

  const mdPath = path.join(process.cwd(), 'scratch/phase3-cleanup-plan.md');
  fs.writeFileSync(mdPath, md);

  console.log(`\n✅ Plan files written successfully:`);
  console.log(`  - JSON Plan: ${jsonPath}`);
  console.log(`  - Markdown Plan: ${mdPath}`);
}

runPhase3PlanGenerator().catch(console.error);
