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

async function inspectPhones() {
  const res = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone,first_name,last_name&limit=1000`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  const vols: any[] = await res.json();
  console.log(`=== INSPECTING ${vols.length} VOLUNTEER PHONE NUMBERS ===`);

  const invalidLengths: any[] = [];

  vols.forEach(v => {
    const raw = v.phone || '';
    const digits = raw.replace(/\D/g, '');
    let localDigits = digits;
    if (digits.startsWith('505')) {
      localDigits = digits.slice(3);
    }
    if (localDigits.length !== 8) {
      invalidLengths.push({
        id: v.id,
        name: `${v.first_name} ${v.last_name || ''}`.trim(),
        rawPhone: raw,
        digits,
        localDigits,
        localLength: localDigits.length
      });
    }
  });

  console.log(`Found ${invalidLengths.length} volunteers with local digits length !== 8:`);
  invalidLengths.slice(0, 30).forEach(item => {
    console.log(` - ${item.name} | Raw: "${item.rawPhone}" | LocalDigits: "${item.localDigits}" (${item.localLength} digits)`);
  });

  if (invalidLengths.length > 30) {
    console.log(`... and ${invalidLengths.length - 30} more.`);
  }
}

inspectPhones().catch(console.error);
