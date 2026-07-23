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

async function verify() {
  const res = await fetch(`${supabaseUrl}/rest/v1/volunteers?select=id,phone&limit=1000`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  const vols: any[] = await res.json();
  const nonNormalized = vols.filter(v => v.phone && formatE164(v.phone) !== v.phone);
  console.log(`Total volunteers: ${vols.length}`);
  console.log(`Non-normalized remaining: ${nonNormalized.length}`);
}

verify().catch(console.error);
