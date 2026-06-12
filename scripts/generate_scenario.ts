import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

const reqs = {
  'Seguridad': 10,
  'Historia': 12,
  'Transporte': 20,
  'Guía': 50,
  'Traducción': 11
};

const firstNames = ["Juan", "Maria", "Carlos", "Ana", "Luis", "Elena", "Jorge", "Lucia", "Miguel", "Sofia", "Pedro", "Laura", "Jose", "Carmen", "David", "Marta", "Fernando", "Isabel", "Diego", "Patricia", "Javier", "Daniela", "Ricardo", "Camila", "Alejandro", "Valentina"];
const lastNames = ["Garcia", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez", "Sanchez", "Ramirez", "Torres", "Flores", "Rivera", "Gomez", "Diaz", "Cruz", "Reyes", "Morales", "Ortiz", "Gutierrez", "Chavez", "Ramos", "Ruiz", "Mendoza", "Alvarez", "Castillo"];

function getRandomName() {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last1 = lastNames[Math.floor(Math.random() * lastNames.length)];
  const last2 = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${last1} ${last2}`;
}

function getRandomPhone() {
  return `+52 55 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`;
}

function getActiveEventDays() {
  const days = [];
  const endDate = new Date(2026, 8, 26);
  let currentDate = new Date(2026, 8, 10);
  while (currentDate <= endDate) {
    if (currentDate.getDay() !== 0) days.push(new Date(currentDate));
    currentDate = addDays(currentDate, 1);
  }
  return days;
}

const EVENT_DAYS = getActiveEventDays();
const SHIFTS = ['T1', 'T2', 'T3', 'T4'];

function formatDateShort(date: Date) {
  return format(date, "EEE d", { locale: es });
}

async function run() {
  console.log("0. Fetching committees...");
  const { data: comms } = await supabase.from('committees').select('id, name');
  const commMap: Record<string, string> = {};
  if (comms) comms.forEach(c => commMap[c.name] = c.id);

  console.log("1. Checking current volunteers...");
  const { data: currentVols } = await supabase.from('volunteers').select('*, committees(name)');
  
  const volsByCommittee: Record<string, any[]> = {
    'Seguridad': [], 'Historia': [], 'Transporte': [], 'Guía': [], 'Traducción': [], 'Primeros Auxilios': []
  };

  if (currentVols) {
    currentVols.forEach(v => {
      const cName = v.committees?.name;
      if (cName && volsByCommittee[cName]) volsByCommittee[cName].push(v);
    });
  }

  // Ensure we have enough volunteers per committee to at least reach the max requirement for a shift
  const insertVols = [];
  for (const [committee, needed] of Object.entries(reqs)) {
    const targetPool = Math.floor(needed * 2.5); 
    const currentCount = volsByCommittee[committee]?.length || 0;
    
    if (currentCount < targetPool && commMap[committee]) {
      console.log(`Generating ${targetPool - currentCount} mock volunteers for ${committee}...`);
      for (let i = 0; i < (targetPool - currentCount); i++) {
        const fakeVol = {
          first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
          last_name: lastNames[Math.floor(Math.random() * lastNames.length)],
          phone: getRandomPhone(),
          committee_id: commMap[committee],
          stake: "Estaca Centro",
          neighborhood: "Barrio " + Math.floor(1 + Math.random() * 5),
          pin: "1234",
          status: "Activo"
        };
        insertVols.push(fakeVol);
      }
    }
  }

  if (insertVols.length > 0) {
    console.log(`Inserting ${insertVols.length} new mock volunteers to have enough pool...`);
    const { data: newVols, error } = await supabase.from('volunteers').insert(insertVols).select('*, committees(name)');
    if (error) console.error("Error inserting vols:", error);
    if (newVols) {
      newVols.forEach(v => {
        const cName = v.committees?.name;
        if (cName && volsByCommittee[cName]) volsByCommittee[cName].push(v);
      });
    }
  }

  console.log("2. Cleaning old shifts...");
  await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("3. Generating realistic shift patterns...");
  const insertShifts = [];

  for (const day of EVENT_DAYS) {
    const dayKey = formatDateShort(day);
    // Let's decide if this day is a "success" (meets or exceeds) or "struggle" (understaffed)
    // Weekends (Thu, Fri, Sat) are usually better.
    // 4 = Jue, 5 = Vie, 6 = Sab
    const isWeekend = day.getDay() === 5 || day.getDay() === 6;
    
    for (const shift of SHIFTS) {
      // Sometimes a specific shift (like T4 late) is understaffed even on good days
      const isGoodDay = isWeekend && shift !== 'T4';
      
      for (const [committee, needed] of Object.entries(reqs)) {
        let assignedCount;
        if (isGoodDay) {
          // Exceeds or meets: needed + random(0 to 3)
          assignedCount = needed + Math.floor(Math.random() * 4);
        } else {
          // Understaffed: needed - random(1 to 4) (ensure at least 0)
          assignedCount = Math.max(0, needed - Math.floor(Math.random() * 5 + 1));
        }

        // Pick 'assignedCount' random volunteers from this committee
        const pool = [...(volsByCommittee[committee] || [])];
        // Shuffle pool
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const selected = pool.slice(0, assignedCount);
        for (const vol of selected) {
          insertShifts.push({
            volunteer_id: vol.id,
            day_key: dayKey,
            shift_key: shift
          });
        }
      }
    }
  }

  console.log(`4. Inserting ${insertShifts.length} generated shifts...`);
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < insertShifts.length; i += chunkSize) {
    const chunk = insertShifts.slice(i, i + chunkSize);
    const { error: insError } = await supabase.from('shifts').insert(chunk);
    if (insError) {
      console.error("Error inserting shifts chunk:", insError);
      break;
    }
    inserted += chunk.length;
    console.log(`   ...inserted ${inserted} / ${insertShifts.length}`);
  }

  console.log("Done! 🎉");
}

run();
