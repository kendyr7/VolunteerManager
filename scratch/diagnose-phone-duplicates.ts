import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

function getLocal8Digits(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.trim().replace(/\D/g, '');
  if (cleaned.startsWith('505') && cleaned.length > 8) {
    cleaned = cleaned.slice(3);
  }
  return cleaned;
}

function formatE164(phone: string | null | undefined): string {
  const digits = getLocal8Digits(phone);
  if (digits.length === 8) {
    return `+505${digits}`;
  }
  return phone ? phone.trim() : '';
}

async function runDiagnosis() {
  const { data: volunteers, error } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, status, created_at, committee_id');

  if (error || !volunteers) {
    console.error('Error fetching volunteers:', error);
    return;
  }

  const totalVolunteers = volunteers.length;

  const normalizedGroups = new Map<string, typeof volunteers>();

  for (const vol of volunteers) {
    const normPhone = formatE164(vol.phone);
    if (normPhone) {
      if (!normalizedGroups.has(normPhone)) normalizedGroups.set(normPhone, []);
      normalizedGroups.get(normPhone)!.push(vol);
    }
  }

  const normalizedDuplicates = Array.from(normalizedGroups.entries()).filter(([_, vols]) => vols.length > 1);

  const involvedVolunteerIds = new Set<string>();
  normalizedDuplicates.forEach(([_, vols]) => vols.forEach(v => involvedVolunteerIds.add(v.id)));

  let activeActiveCount = 0;
  let activeArchivedCount = 0;
  let archivedArchivedCount = 0;

  let formatDiffCount = 0;

  const rows: Array<{
    phone_normalized: string;
    volunteersCount: number;
    statuses: string;
    rawFormats: string;
    severity: string;
    names: string;
  }> = [];

  for (const [normPhone, vols] of normalizedDuplicates) {
    const statuses = vols.map(v => v.status || 'unknown');
    const rawFormatsArr = Array.from(new Set(vols.map(v => v.phone || '')));
    if (rawFormatsArr.length > 1) formatDiffCount++;

    const activeCount = statuses.filter(s => s === 'active').length;
    const archivedCount = statuses.filter(s => s === 'archived').length;

    let pairType = '';
    let severity = '';

    if (activeCount >= 2) {
      activeActiveCount++;
      pairType = `active (${activeCount})`;
      severity = 'CRÍTICO (2+ Activos)';
    } else if (activeCount === 1 && archivedCount >= 1) {
      activeArchivedCount++;
      pairType = `1 active, ${archivedCount} archived`;
      severity = 'MEDIO (1 Activo, 1 Arch.)';
    } else if (archivedCount >= 2) {
      archivedArchivedCount++;
      pairType = `archived (${archivedCount})`;
      severity = 'BAJO (Todos Archivados)';
    }

    const volNames = vols.map(v => `${v.first_name} ${v.last_name || ''}`.trim()).join(' / ');

    rows.push({
      phone_normalized: normPhone,
      volunteersCount: vols.length,
      statuses: pairType,
      rawFormats: rawFormatsArr.join(' | '),
      severity,
      names: volNames,
    });
  }

  console.log(`TOTAL VOLUNTARIOS EN DB: ${totalVolunteers}`);
  console.log(`TOTAL GRUPOS CON TELÉFONOS DUPLICADOS: ${normalizedDuplicates.length}`);
  console.log(`TOTAL VOLUNTARIOS INVOLUCRADOS EN DUPLICADOS: ${involvedVolunteerIds.size}`);
  console.log(`DUPLICADOS CON DIFERENCIAS DE FORMATO (ej +505 vs 8-digits): ${formatDiffCount}`);
  console.log(`BREAKDOWN POR ESTADOS DE GRUPO:`);
  console.log(`  - Active + Active: ${activeActiveCount}`);
  console.log(`  - Active + Archived: ${activeArchivedCount}`);
  console.log(`  - Archived + Archived: ${archivedArchivedCount}`);

  console.log('\n--- TABLA RESUMEN DE MUESTRA DE DUPLICADOS (Primeros 15) ---');
  console.table(rows.slice(0, 15));
}

runDiagnosis().catch(console.error);
