import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCreatedDates() {
  // 1. Fetch committees
  const { data: committees } = await supabase.from('committees').select('id, name');
  const commMap = new Map<string, string>();
  committees?.forEach(c => commMap.set(c.id, c.name));

  // 2. Fetch all volunteers
  let allVolunteers: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, committee_id, status, created_at, neighborhood, stake')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allVolunteers = allVolunteers.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  // 3. Fetch all shifts
  let allShiftVolunteerIds = new Set<string>();
  page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('shifts')
      .select('volunteer_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    data.forEach(s => {
      if (s.volunteer_id) allShiftVolunteerIds.add(s.volunteer_id);
    });
    if (data.length < pageSize) break;
    page++;
  }

  const noShifts = allVolunteers.filter(v => !allShiftVolunteerIds.has(v.id));

  // Let's analyze the 44 active ones
  const activeNoShifts = noShifts.filter(v => v.status === 'active');

  console.log('Total activos sin turno:', activeNoShifts.length);

  // Group by date (YYYY-MM-DD)
  const dateCounts: Record<string, number> = {};
  activeNoShifts.forEach(v => {
    const d = v.created_at ? v.created_at.split('T')[0] : 'Sin fecha';
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });

  console.log('\n--- DISTRIBUCION POR FECHA (ACTIVOS SIN TURNO) ---');
  console.table(dateCounts);

  // Sort activeNoShifts by created_at desc
  activeNoShifts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  fs.writeFileSync('scratch/active-no-shifts-dates.json', JSON.stringify(activeNoShifts.map(v => ({
    nombre: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
    telefono: v.phone,
    subcomite: v.committee_id ? (commMap.get(v.committee_id) || 'Desconocido') : 'Sin subcomité',
    creado: v.created_at,
    estaca: v.stake,
    barrio: v.neighborhood
  })), null, 2));

  console.log('\n--- DETALLE DE LOS ACTIVOS ---');
  activeNoShifts.forEach(v => {
    console.log(`${v.created_at} | ${v.first_name} ${v.last_name} | ${v.committee_id ? commMap.get(v.committee_id) : 'Sin subcomité'} | Tel: ${v.phone}`);
  });

  // Also check archived dates just in case
  const archivedNoShifts = noShifts.filter(v => v.status === 'archived');
  const archivedDateCounts: Record<string, number> = {};
  archivedNoShifts.forEach(v => {
    const d = v.created_at ? v.created_at.split('T')[0] : 'Sin fecha';
    archivedDateCounts[d] = (archivedDateCounts[d] || 0) + 1;
  });
  console.log('\n--- DISTRIBUCION POR FECHA (ARCHIVADOS SIN TURNO) ---');
  console.table(archivedDateCounts);
}

checkCreatedDates().catch(console.error);
