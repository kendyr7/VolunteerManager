import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

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

async function fullAudit() {
  const { data: committees } = await supabase.from('committees').select('id, name');
  const commMap = new Map<string, string>();
  (committees || []).forEach(c => commMap.set(c.id, c.name));

  const { data: volunteers, error } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, status, age, stake, neighborhood, committee_id, created_at')
    .order('created_at', { ascending: true });

  if (error || !volunteers) {
    console.error('Error fetching volunteers:', error);
    return;
  }

  const groups = new Map<string, typeof volunteers>();

  for (const vol of volunteers) {
    const norm = formatE164(vol.phone);
    if (norm) {
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm)!.push(vol);
    }
  }

  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, vols]) => vols.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const resultList = duplicateGroups.map(([normPhone, vols], index) => {
    return {
      groupIndex: index + 1,
      phone_normalized: normPhone,
      count: vols.length,
      volunteers: vols.map(v => ({
        id: v.id,
        first_name: v.first_name,
        last_name: v.last_name || '',
        raw_phone: v.phone,
        status: v.status,
        age: v.age,
        stake: v.stake || '',
        neighborhood: v.neighborhood || '',
        committee: commMap.get(v.committee_id || '') || 'Sin Comité',
        committee_id: v.committee_id,
        created_at: v.created_at,
      }))
    };
  });

  fs.writeFileSync('scratch/duplicate_groups.json', JSON.stringify(resultList, null, 2));
  console.log(`Auditoría finalizada. Se escribieron ${resultList.length} grupos en scratch/duplicate_groups.json`);
}

fullAudit().catch(console.error);
