import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function checkPublication() {
  console.log('===========================================================');
  console.log('  CHECKING PG_PUBLICATION_TABLES FOR supabase_realtime     ');
  console.log('===========================================================\n');

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: "SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';"
  });

  if (error) {
    console.log('RPC exec_sql error:', error.message);
    console.log('\nExplanation: In Supabase, if tables are not added to the `supabase_realtime` publication using:');
    console.log('  ALTER PUBLICATION supabase_realtime ADD TABLE public.volunteers;');
    console.log('  ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;');
    console.log('then Realtime WebSocket will return status SUBSCRIBED, but Postgres will NEVER send postgres_changes messages!');
  } else {
    console.log('Publication tables:', data);
  }
}

checkPublication().catch(err => console.error(err));
