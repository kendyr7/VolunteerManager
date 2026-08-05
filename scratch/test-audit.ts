import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, serviceKey);

async function main() {
  const { data: vols } = await supabase.from('volunteers').select('id, first_name, last_name, phone, created_at').limit(10);
  const { data: logs } = await supabase.from('activity_logs').select('*');

  console.log("Total logs in DB:", logs?.length);

  if (vols && logs) {
    for (const v of vols) {
      const fullName = `${v.first_name || ''} ${v.last_name || ''}`.trim();
      const fn = (v.first_name || '').trim().toLowerCase();
      const ln = (v.last_name || '').trim().toLowerCase();
      const phoneClean = (v.phone || '').replace(/\D/g, '');

      const matched = logs.filter(log => {
        if (log.target_id === v.id) return true;
        const desc = (log.description || '').toLowerCase();
        const det = (log.details || '').toLowerCase();

        // 1. Phone match
        if (phoneClean && phoneClean.length >= 8 && (desc.includes(phoneClean) || det.includes(phoneClean))) return true;

        // 2. Full name match or First+Last name match in description/details
        if (fn && fn.length > 2 && (desc.includes(fn) || det.includes(fn))) {
          // If first name matches AND last name matches OR description says Creó/Reasignó
          if (ln && ln.length > 2 && (desc.includes(ln) || det.includes(ln))) return true;
          if (desc.includes('creó al voluntario') || desc.includes('creó el usuario')) {
            // Check if log created_at is close to volunteer created_at
            const timeDiff = Math.abs(new Date(log.created_at).getTime() - new Date(v.created_at).getTime());
            if (timeDiff < 24 * 3600 * 1000) return true;
          }
        }

        return false;
      });

      console.log(`Volunteer: ${fullName} (${v.id}) -> ${matched.length} matched logs`);
      if (matched.length > 0) {
        console.log("   First matched log:", matched[0].action_type, "|", matched[0].description, "| By:", matched[0].user_name);
      }
    }
  }
}

main().catch(console.error);
