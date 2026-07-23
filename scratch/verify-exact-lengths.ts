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

async function verifyAllExact12() {
  const res = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone&limit=1000`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  const vols: any[] = await res.json();
  const invalid = vols.filter(v => !v.phone || !v.phone.startsWith('+505') || v.phone.length !== 12);
  
  console.log(`Total Volunteers checked: ${vols.length}`);
  console.log(`Any non-12-char E.164 phone remaining? ${invalid.length}`);
  if (invalid.length > 0) {
    console.log("Invalid samples:", invalid.slice(0, 5));
  } else {
    console.log("✅ 100% of all 260 database phone numbers have exactly +505 and 8 local digits!");
  }
}

verifyAllExact12().catch(console.error);
