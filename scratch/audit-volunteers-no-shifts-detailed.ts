import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runDetailedAudit() {
  const { data: committees } = await supabase.from('committees').select('id, name');
  const commMap = new Map<string, string>();
  committees?.forEach(c => commMap.set(c.id, c.name));

  let allVolunteers: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, committee_id, status, neighborhood, stake')
      .order('last_name', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allVolunteers = allVolunteers.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

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

  // Sort by subcommittee, then name
  noShifts.sort((a, b) => {
    const commA = a.committee_id ? (commMap.get(a.committee_id) || 'Desconocido') : 'Sin subcomité';
    const commB = b.committee_id ? (commMap.get(b.committee_id) || 'Desconocido') : 'Sin subcomité';
    if (commA !== commB) return commA.localeCompare(commB);
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim();
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim();
    return nameA.localeCompare(nameB);
  });

  const statusCount: Record<string, number> = {};
  const commBreakdown: Record<string, { total: number; active: number; archived: number; other: number }> = {};

  noShifts.forEach(v => {
    const status = v.status || 'sin_estado';
    statusCount[status] = (statusCount[status] || 0) + 1;

    const commName = v.committee_id ? (commMap.get(v.committee_id) || 'Subcomité desconocido') : 'Sin subcomité asignado';
    if (!commBreakdown[commName]) {
      commBreakdown[commName] = { total: 0, active: 0, archived: 0, other: 0 };
    }
    commBreakdown[commName].total++;
    if (v.status === 'active') commBreakdown[commName].active++;
    else if (v.status === 'archived') commBreakdown[commName].archived++;
    else commBreakdown[commName].other++;
  });

  console.log('STATUS DISTRIBUTION:', statusCount);
  console.log('COMM BREAKDOWN:', commBreakdown);

  fs.writeFileSync('scratch/no-shifts-audit-results.json', JSON.stringify({
    total: noShifts.length,
    statusCount,
    commBreakdown,
    volunteers: noShifts.map(v => ({
      id: v.id,
      nombre: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
      telefono: v.phone || 'N/A',
      subcomite: v.committee_id ? (commMap.get(v.committee_id) || 'Desconocido') : 'Sin subcomité asignado',
      estado: v.status || 'N/A',
      estaca: v.stake || 'N/A',
      barrio: v.neighborhood || 'N/A'
    }))
  }, null, 2));

  console.log('Results saved to scratch/no-shifts-audit-results.json');
}

runDetailedAudit().catch(console.error);
