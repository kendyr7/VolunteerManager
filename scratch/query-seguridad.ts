import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  // 1. Get all committees
  const { data: committees, error: commErr } = await supabase
    .from('committees')
    .select('*');
  
  console.log('--- ALL COMMITTEES ---');
  console.log(committees);

  // 2. Find Seguridad committee(s)
  const segCommittees = (committees || []).filter(c => 
    c.name?.toLowerCase().includes('segur') || c.id?.toLowerCase().includes('segur')
  );
  console.log('\n--- SEGURIDAD COMMITTEES ---');
  console.log(segCommittees);

  // 3. Query all volunteers with their committee
  const { data: volunteers, error: volErr } = await supabase
    .from('volunteers')
    .select('*, committees(id, name)')
    .order('last_name', { ascending: true });

  if (volErr) {
    console.error('Error fetching volunteers:', volErr);
    return;
  }

  console.log(`\nTotal volunteers in DB: ${volunteers?.length}`);

  // Filter those in Seguridad
  const segVols = (volunteers || []).filter(v => {
    const commName = v.committees?.name || '';
    const commId = v.committee_id || '';
    return commName.toLowerCase().includes('segur') || 
           commId.toLowerCase().includes('segur') ||
           segCommittees.some(sc => sc.id === v.committee_id);
  });

  console.log(`\nVolunteers in Seguridad: ${segVols.length}`);
  console.log(JSON.stringify(segVols, null, 2));
}

main().catch(console.error);
