import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

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

async function inspectAlma() {
  const volunteerId = "0ca862e2-c950-42e0-b48d-efc54402a514";

  const { data: vol } = await supabase.from('volunteers').select('*').eq('id', volunteerId).single();
  console.log('=== VOLUNTEER ===');
  console.log(vol);

  const { data: shifts } = await supabase.from('shifts').select('*').eq('volunteer_id', volunteerId);
  console.log('\n=== SHIFTS ===');
  console.log(shifts);

  const { data: sessions } = await supabase.from('attendance_sessions').select('*').eq('volunteer_id', volunteerId);
  console.log('\n=== ATTENDANCE SESSIONS ===');
  console.log(sessions);

  // Check audit logs
  const { data: logs } = await supabase.from('audit_logs').select('*')
    .or(`volunteer_id.eq.${volunteerId},details.ilike.%${vol.first_name}%,description.ilike.%${vol.first_name}%,details.ilike.%50585823940%,description.ilike.%50585823940%`)
    .order('created_at', { ascending: false });
  console.log('\n=== AUDIT LOGS ===');
  console.log(logs);
}

inspectAlma().catch(console.error);
