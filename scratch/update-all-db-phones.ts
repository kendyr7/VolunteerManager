import { formatE164 } from '../lib/whatsapp';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1].trim();
        let value = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
  }
}
loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function runFullDBNormalization() {
  console.log("=== EXECUTING COMPLETE SUPABASE PHONE NORMALIZATION ===");

  // 1. Fetch ALL Volunteers
  let allVolunteers: any[] = [];
  let page = 0;
  const limit = 500;

  while (true) {
    const rangeStart = page * limit;
    const rangeEnd = (page + 1) * limit - 1;
    const res = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone,first_name,last_name`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Range': `${rangeStart}-${rangeEnd}`
      }
    });

    if (!res.ok) {
      console.error("Error fetching volunteers page:", res.status);
      break;
    }
    const data: any[] = await res.json();
    allVolunteers = allVolunteers.concat(data);
    if (data.length < limit) break;
    page++;
  }

  console.log(`Fetched ${allVolunteers.length} total volunteers from Supabase.`);

  const volsToUpdate = allVolunteers.filter(v => v.phone && formatE164(v.phone) !== v.phone);
  console.log(`Volunteers needing E.164 normalization: ${volsToUpdate.length}`);

  let volSuccess = 0;
  for (const vol of volsToUpdate) {
    const formatted = formatE164(vol.phone);
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/volunteers?id=eq.${vol.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ phone: formatted })
    });

    if (patchRes.ok) {
      volSuccess++;
      if (volSuccess % 50 === 0 || volSuccess === volsToUpdate.length) {
        console.log(`  Updated ${volSuccess}/${volsToUpdate.length} volunteers...`);
      }
    } else {
      console.error(`  [ERROR] Volunteer ${vol.id}:`, patchRes.status, await patchRes.text());
    }
  }

  // 2. Fetch ALL Profiles
  let profSuccess = 0;
  const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,phone,full_name`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (profRes.ok) {
    const profiles: any[] = await profRes.json();
    console.log(`Fetched ${profiles.length} total profiles from Supabase.`);

    const profsToUpdate = profiles.filter(p => p.phone && formatE164(p.phone) !== p.phone);
    console.log(`Profiles needing E.164 normalization: ${profsToUpdate.length}`);

    for (const prof of profsToUpdate) {
      const formatted = formatE164(prof.phone);
      const patchRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${prof.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ phone: formatted })
      });

      if (patchRes.ok) {
        profSuccess++;
        console.log(`  Updated profile ${prof.full_name}: "${prof.phone}" -> "${formatted}"`);
      }
    }
    console.log(`✅ Profiles updated: ${profSuccess}`);
  }

  console.log(`🎉 Complete DB normalization done! Total updated: ${volSuccess} volunteers, ${profSuccess} profiles.`);
}

runFullDBNormalization().catch(console.error);
