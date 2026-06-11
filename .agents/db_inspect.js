const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = val;
      if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') supabaseAnonKey = val;
    }
  }
} catch (e) {
  console.error("Could not read .env.local", e);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSelectColumns() {
  const { data, error } = await supabase.from('volunteers').select('id, age, neighborhood, stake, reliability_score').limit(1);
  console.log("Select columns result:", { data, error: error ? error.message : null });
}

testSelectColumns();
