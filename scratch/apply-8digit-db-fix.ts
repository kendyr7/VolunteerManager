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

function normalizeTo8Digits(rawPhone: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('505')) {
    digits = digits.slice(3);
  }

  if (digits.length === 8) {
    return `+505${digits}`;
  }

  // Extract last 8 digits if longer
  if (digits.length > 8) {
    let last8 = digits.slice(-8);
    if (last8.startsWith('0')) {
      last8 = '8' + last8.slice(1);
    }
    return `+505${last8}`;
  }

  // Pad to 8 digits if shorter
  let padded = digits.padEnd(8, '0');
  if (padded.startsWith('0')) {
    padded = '8' + padded.slice(1);
  }
  return `+505${padded}`;
}

async function applyDBFix() {
  console.log("=== APPLYING 8-DIGIT E.164 NORMALIZATION TO SUPABASE DATABASE ===");

  // 1. Update Volunteers
  const volRes = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone,first_name,last_name&limit=1000`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (!volRes.ok) {
    console.error("Error fetching volunteers:", volRes.status);
    return;
  }

  const vols: any[] = await volRes.json();
  const toUpdateVols = vols.filter(v => v.phone && normalizeTo8Digits(v.phone) !== v.phone);
  console.log(`Total volunteers: ${vols.length}. Needing 8-digit fix: ${toUpdateVols.length}`);

  let volFixedCount = 0;
  for (const vol of toUpdateVols) {
    const fixed = normalizeTo8Digits(vol.phone);
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/volunteers?id=eq.${vol.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ phone: fixed })
    });

    if (patchRes.ok) {
      volFixedCount++;
      console.log(`  Updated volunteer ${vol.first_name} (${vol.id}): "${vol.phone}" -> "${fixed}"`);
    } else {
      console.error(`  Error updating volunteer ${vol.id}:`, patchRes.status, await patchRes.text());
    }
  }
  console.log(`✅ Fixed ${volFixedCount} volunteer phone numbers.`);

  // 2. Update Profiles
  const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,phone,full_name&limit=1000`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (profRes.ok) {
    const profiles: any[] = await profRes.json();
    const toUpdateProfs = profiles.filter(p => p.phone && normalizeTo8Digits(p.phone) !== p.phone);
    console.log(`Total profiles: ${profiles.length}. Needing 8-digit fix: ${toUpdateProfs.length}`);

    let profFixedCount = 0;
    for (const prof of toUpdateProfs) {
      const fixed = normalizeTo8Digits(prof.phone);
      const patchRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${prof.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ phone: fixed })
      });

      if (patchRes.ok) {
        profFixedCount++;
        console.log(`  Updated profile ${prof.full_name}: "${prof.phone}" -> "${fixed}"`);
      }
    }
    console.log(`✅ Fixed ${profFixedCount} profile phone numbers.`);
  }

  console.log("🎉 All database phone numbers are now strictly 8 local digits with +505 prefix!");
}

applyDBFix().catch(console.error);
