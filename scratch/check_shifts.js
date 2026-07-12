const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('day_key, shift_key, volunteer_id');
    
  if (error) {
    console.error("Error fetching shifts:", error);
    return;
  }
  
  const counts = {};
  shifts.forEach(s => {
    counts[s.day_key] = (counts[s.day_key] || 0) + 1;
  });
  
  console.log("SHIFTS COUNT PER DAY IN DB:", counts);
}

check();
