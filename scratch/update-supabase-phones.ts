import { createClient } from '@supabase/supabase-js';
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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("=== STARTING FAST PARALLEL PHONE NORMALIZATION ===");

  // 1. Volunteers
  const { data: volunteers, error: volErr } = await supabase
    .from('volunteers')
    .select('id, phone');

  if (volErr) {
    console.error("❌ Error fetching volunteers:", volErr);
  } else if (volunteers) {
    const toUpdate = volunteers.filter(v => v.phone && formatE164(v.phone) !== v.phone);
    console.log(`Volunteers needing update: ${toUpdate.length} / ${volunteers.length}`);

    let count = 0;
    const chunkSize = 20;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const chunk = toUpdate.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (vol) => {
          const formatted = formatE164(vol.phone);
          const { error } = await supabase
            .from('volunteers')
            .update({ phone: formatted })
            .eq('id', vol.id);
          if (!error) count++;
        })
      );
    }
    console.log(`✅ Total volunteers updated: ${count}`);
  }

  // 2. Profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, phone');

  if (profErr) {
    console.error("❌ Error fetching profiles:", profErr);
  } else if (profiles) {
    const toUpdateProf = profiles.filter(p => p.phone && formatE164(p.phone) !== p.phone);
    console.log(`Profiles needing update: ${toUpdateProf.length} / ${profiles.length}`);

    let countProf = 0;
    await Promise.all(
      toUpdateProf.map(async (prof) => {
        const formatted = formatE164(prof.phone);
        const { error } = await supabase
          .from('profiles')
          .update({ phone: formatted })
          .eq('id', prof.id);
        if (!error) countProf++;
      })
    );
    console.log(`✅ Total profiles updated: ${countProf}`);
  }

  console.log("🎉 Database normalization complete!");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
