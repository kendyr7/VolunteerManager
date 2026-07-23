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

async function dryRun() {
  const res = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone,first_name,last_name&limit=1000`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  const vols: any[] = await res.json();
  console.log(`=== DRY RUN FIXING ${vols.length} VOLUNTEER PHONES ===`);

  const samples: any[] = [];
  vols.forEach(v => {
    const fixed = normalizeTo8Digits(v.phone || '');
    const localPart = fixed.slice(4);
    if (localPart.length !== 8) {
      console.error(`ERROR: ${fixed} does not have 8 local digits!`);
    }
    samples.push({
      name: `${v.first_name} ${v.last_name || ''}`.trim(),
      oldPhone: v.phone,
      newPhone: fixed,
      localLength: localPart.length
    });
  });

  console.log("Sample Transformations (First 20):");
  samples.slice(0, 20).forEach(s => {
    console.log(`  "${s.oldPhone}"  ==>  "${s.newPhone}" (Local digits: ${s.localLength})`);
  });

  const allValid = samples.every(s => s.newPhone.startsWith('+505') && s.newPhone.length === 12);
  console.log(`All ${samples.length} transformed numbers are valid 8-digit E.164 (+505XXXXXXXX)?`, allValid);
}

dryRun().catch(console.error);
