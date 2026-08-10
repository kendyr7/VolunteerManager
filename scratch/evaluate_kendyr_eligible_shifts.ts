import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getOfficialShiftTime } from '../lib/dates';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceKey);

const KENDYR_ID = '731746a6-9a42-4ca9-9be8-30d6cc7489dc';

async function evaluateEligibility() {
  console.log('===========================================================');
  console.log('  EVALUATING SHIFT ELIGIBILITY FOR KENDYR GABRIEL QUINTANILLA ESTRADA  ');
  console.log('===========================================================\n');

  // 1. Current Nicaragua Time
  const nicaString = new Date().toLocaleString("en-US", { timeZone: "America/Managua" });
  const nicaNow = new Date(nicaString);
  const currentDayKey = format(nicaNow, "EEE d", { locale: es }).toLowerCase();
  const currentHourFloat = nicaNow.getHours() + nicaNow.getMinutes() / 60 + nicaNow.getSeconds() / 3600;

  console.log(`Fecha/Hora actual de Nicaragua: ${nicaNow.toLocaleString('es-NI')}`);
  console.log(`day_key actual de Nicaragua: "${currentDayKey}"`);
  console.log(`Hora decimal actual: ${currentHourFloat.toFixed(2)} (${nicaNow.toLocaleTimeString('es-NI')})`);

  // 2. Query Kendyr's assigned shifts
  const { data: shifts, error } = await adminClient
    .from('shifts')
    .select('id, day_key, shift_key, checked_in, checked_out')
    .eq('volunteer_id', KENDYR_ID);

  if (error) {
    console.error('❌ Error consultando shifts:', error.message);
    return;
  }

  console.log(`\nTotal shifts asignados a Kendyr: ${shifts?.length || 0}`);

  // 3. Evaluate eligibility for current day_key and assigned shifts
  const eligibleShifts: Array<{
    shift: any;
    official: any;
    windowStartStr: string;
    windowEndStr: string;
    reason: string;
  }> = [];

  (shifts || []).forEach(s => {
    const official = getOfficialShiftTime(s.day_key, s.shift_key);
    // QR window: startHour - 0.75h (45m) to endHour + 0.75h (45m)
    const windowStart = official.startHour - 0.75;
    const windowEnd = official.endHour + 0.75;

    const matchesDay = s.day_key.toLowerCase().trim() === currentDayKey;
    const isWithinWindow = currentHourFloat >= windowStart && currentHourFloat <= windowEnd;

    if (matchesDay && isWithinWindow && !s.checked_in && !s.checked_out) {
      const windowStartHours = Math.floor(windowStart);
      const windowStartMins = Math.round((windowStart - windowStartHours) * 60);
      const windowEndHours = Math.floor(windowEnd);
      const windowEndMins = Math.round((windowEnd - windowEndHours) * 60);

      eligibleShifts.push({
        shift: s,
        official,
        windowStartStr: `${windowStartHours}:${windowStartMins < 10 ? '0' : ''}${windowStartMins}`,
        windowEndStr: `${windowEndHours}:${windowEndMins < 10 ? '0' : ''}${windowEndMins}`,
        reason: `Día coincide (${s.day_key}) y hora actual (${currentHourFloat.toFixed(2)}) está dentro del rango de ventana QR [${windowStart.toFixed(2)} - ${windowEnd.toFixed(2)}]`
      });
    }
  });

  console.log('\n--- RESULTADOS DE ELEGIBILIDAD ---');
  console.log(`Shifts elegibles AHORA: ${eligibleShifts.length}`);
  console.log(JSON.stringify(eligibleShifts, null, 2));

  // 4. Query attendance_sessions count
  const { count: sessionCount } = await adminClient
    .from('attendance_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('volunteer_id', KENDYR_ID);

  console.log(`\nattendance_sessions para Kendyr en BD: ${sessionCount} (Esperado: 0)`);
}

evaluateEligibility().catch(console.error);
