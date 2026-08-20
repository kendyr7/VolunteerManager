import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Parse .env.local manually to be 100% sure
const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Connecting to Supabase...');

  // 1. Committees
  const { data: committees, error: commErr } = await supabase
    .from('committees')
    .select('*');

  if (commErr) {
    console.error('Error fetching committees:', commErr);
    return;
  }

  console.log('--- COMMITTEES ---');
  console.log(committees);

  // 2. Fetch volunteers with committee relation
  const { data: volunteers, error: volErr } = await supabase
    .from('volunteers')
    .select(`
      id,
      first_name,
      last_name,
      age,
      neighborhood,
      stake,
      phone,
      pin,
      committee_id,
      status,
      created_at,
      committees (
        id,
        name
      )
    `)
    .order('last_name', { ascending: true });

  if (volErr) {
    console.error('Error fetching volunteers:', volErr);
    return;
  }

  console.log(`\nTotal volunteers in DB: ${volunteers.length}`);

  // Find Seguridad committee ID
  const seguridadCommittees = committees.filter(c => 
    c.name?.toLowerCase().includes('segur') || c.id?.toLowerCase().includes('segur')
  );
  console.log('\nMatching Seguridad Committees:', seguridadCommittees);

  const segCommitteeIds = new Set(seguridadCommittees.map(c => c.id));

  // Filter volunteers belonging to Seguridad
  const seguridadVolunteers = volunteers.filter(v => {
    if (v.committee_id && segCommitteeIds.has(v.committee_id)) return true;
    const commName = v.committees?.name || '';
    if (commName.toLowerCase().includes('segur')) return true;
    return false;
  });

  console.log(`\nTotal Volunteers in Seguridad: ${seguridadVolunteers.length}`);
  
  // Format for audit
  const formatted = seguridadVolunteers.map((v, i) => ({
    index: i + 1,
    id: v.id,
    fullName: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
    firstName: v.first_name || '',
    lastName: v.last_name || '',
    age: v.age !== null && v.age !== undefined ? String(v.age) : '',
    ward: v.neighborhood || '',
    stake: v.stake || '',
    phone: v.phone || '',
    committee: v.committees?.name || 'Seguridad',
    status: v.status || 'active',
    pin: v.pin || '',
    createdAt: v.created_at
  }));

  fs.writeFileSync('scratch/seguridad_audit_results.json', JSON.stringify(formatted, null, 2), 'utf-8');
  console.log('\nResults saved to scratch/seguridad_audit_results.json');
  console.log(JSON.stringify(formatted, null, 2));
}

main().catch(console.error);
