import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

// 1. Load env variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Generate active days exactly as the app does
function getActiveEventDays() {
  const days = [];
  const endDate = new Date(2026, 8, 26);
  let currentDate = new Date(2026, 8, 10);

  while (currentDate <= endDate) {
    if (currentDate.getDay() !== 0) { // No domingos
      days.push(new Date(currentDate));
    }
    currentDate = addDays(currentDate, 1);
  }
  return days;
}

const EVENT_DAYS = getActiveEventDays();
const SHIFTS = ['T1', 'T2', 'T3', 'T4'];

function formatDateShort(date: Date) {
  return format(date, "EEE d", { locale: es });
}

async function simulateShifts() {
  console.log("Fetching volunteers...");
  
  // Fetch volunteers
  const { data: volunteers, error: volError } = await supabase
    .from('volunteers')
    .select('id');

  if (volError) {
    console.error("Error fetching volunteers:", volError);
    return;
  }

  if (!volunteers || volunteers.length === 0) {
    console.log("No volunteers found to assign shifts.");
    return;
  }

  console.log(`Found ${volunteers.length} volunteers. Generating shifts...`);

  const insertRows = [];

  // 3. Assign random shifts
  for (const vol of volunteers) {
    // Determine how many shifts to assign this volunteer (e.g., 2 to 6)
    const numShifts = Math.floor(Math.random() * 5) + 2; 

    // Keep track of assigned combinations to avoid duplicates
    const assigned = new Set();

    for (let i = 0; i < numShifts; i++) {
      const randomDay = EVENT_DAYS[Math.floor(Math.random() * EVENT_DAYS.length)];
      const randomShift = SHIFTS[Math.floor(Math.random() * SHIFTS.length)];
      
      const dayKey = formatDateShort(randomDay);
      const combo = `${dayKey}-${randomShift}`;

      if (!assigned.has(combo)) {
        assigned.add(combo);
        insertRows.push({
          volunteer_id: vol.id,
          day_key: dayKey,
          shift_key: randomShift
        });
      }
    }
  }

  console.log(`Prepared ${insertRows.length} shifts to insert.`);

  // Clear existing shifts first? (Optional: Commented out to prevent accidental deletion, but useful for clean slate)
  console.log("Deleting old shifts (if you prefer appending, you can comment this out)...");
  await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Chunk inserts since Supabase has limits per request (e.g. 1000 rows)
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += chunkSize) {
    const chunk = insertRows.slice(i, i + chunkSize);
    const { error: insError } = await supabase.from('shifts').insert(chunk);
    
    if (insError) {
      console.error("Error inserting chunk:", insError);
      break;
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted} / ${insertRows.length}`);
  }

  console.log("Done! 🎉");
}

simulateShifts();
