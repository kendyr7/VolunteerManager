import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log('--- AUDITORIA DE VOLUNTARIOS SIN TURNOS ---');

  // 1. Fetch total count of volunteers and shifts
  const { count: volCount, error: volCountErr } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true });

  const { count: shiftCount, error: shiftCountErr } = await supabase
    .from('shifts')
    .select('*', { count: 'exact', head: true });

  console.log(`Total voluntarios en DB: ${volCount}`);
  console.log(`Total turnos en DB: ${shiftCount}`);

  // Fetch all committees for reference
  const { data: committees, error: commErr } = await supabase
    .from('committees')
    .select('id, name');

  const commMap = new Map<string, string>();
  committees?.forEach(c => commMap.set(c.id, c.name));

  // 2. Fetch all volunteers in batches of 1000
  let allVolunteers: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, committee_id, status, neighborhood, stake')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching volunteers:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allVolunteers = allVolunteers.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Voluntarios cargados: ${allVolunteers.length}`);

  // 3. Fetch all shifts (volunteer_id) in batches of 1000
  let allShiftVolunteerIds = new Set<string>();
  page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('shifts')
      .select('volunteer_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching shifts:', error);
      break;
    }
    if (!data || data.length === 0) break;
    data.forEach(s => {
      if (s.volunteer_id) allShiftVolunteerIds.add(s.volunteer_id);
    });
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Voluntarios distintos con al menos un turno: ${allShiftVolunteerIds.size}`);

  // 4. Filter volunteers who have NO shifts
  const volunteersWithoutShifts = allVolunteers.filter(v => !allShiftVolunteerIds.has(v.id));

  console.log(`Voluntarios SIN turnos: ${volunteersWithoutShifts.length}`);

  // 5. Group by committee / subcomite
  const summaryBySubcommittee: Record<string, number> = {};

  volunteersWithoutShifts.forEach(v => {
    const commName = v.committee_id ? (commMap.get(v.committee_id) || 'Subcomité desconocido') : 'Sin subcomité asignado';
    summaryBySubcommittee[commName] = (summaryBySubcommittee[commName] || 0) + 1;
  });

  console.log('\n--- RESUMEN POR SUBCOMITE ---');
  console.table(
    Object.entries(summaryBySubcommittee)
      .sort((a, b) => b[1] - a[1])
      .map(([subcomite, total]) => ({ 'Subcomité': subcomite, 'Voluntarios sin turno': total }))
  );

  console.log('\n--- MUESTRA PRIMEROS 10 SIN TURNO ---');
  console.log(volunteersWithoutShifts.slice(0, 10).map(v => ({
    id: v.id,
    nombre: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
    telefono: v.phone,
    subcomite: v.committee_id ? (commMap.get(v.committee_id) || v.committee_id) : 'Sin subcomité',
    estado: v.status
  })));
}

runAudit().catch(console.error);
