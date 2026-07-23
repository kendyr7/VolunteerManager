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

async function testFetch() {
  console.log("Fetching volunteers via REST...");
  const res = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone&limit=200`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    console.error("Fetch error:", res.status, await res.text());
    return;
  }

  const vols: any[] = await res.json();
  console.log(`Fetched ${vols.length} volunteers.`);

  const toUpdate = vols.filter(v => v.phone && formatE164(v.phone) !== v.phone);
  console.log(`To update: ${toUpdate.length}`);

  let successCount = 0;
  for (const vol of toUpdate) {
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
      successCount++;
      console.log(`Updated [${successCount}/${toUpdate.length}]: ${vol.phone} -> ${formatted}`);
    } else {
      console.error(`Error updating ${vol.id}:`, patchRes.status, await patchRes.text());
    }
  }

  console.log(`DONE! Total updated: ${successCount}`);
}

testFetch().catch(console.error);
