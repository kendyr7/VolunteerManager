import { getActiveEventDays, formatDateShort, getOfficialShiftTime } from '../lib/dates';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

async function verifyDates() {
  console.log('===========================================================');
  console.log('  VERIFYING REAL EVENT CALENDAR DATES AND DAY_KEYS        ');
  console.log('===========================================================\n');

  const days = getActiveEventDays();

  console.log('Active Event Days Mapping:');
  days.forEach(d => {
    const dayKey = formatDateShort(d).toLowerCase();
    const isoDate = format(d, 'yyyy-MM-dd');
    const dayOfWeek = format(d, 'EEEE', { locale: es });
    console.log(`  - ISO: ${isoDate} (${dayOfWeek}) -> day_key: "${dayKey}"`);
  });

  // Target: "vie 11"
  const targetDate = days.find(d => formatDateShort(d).toLowerCase() === 'vie 11');

  if (targetDate) {
    const targetIso = format(targetDate, 'yyyy-MM-dd');
    const t2 = getOfficialShiftTime('vie 11', 'T2');

    console.log('\n--- TARGET DAY_KEY "vie 11" DETAILS ---');
    console.log(`Fecha ISO Real: ${targetIso} (11 de Septiembre de 2026)`);
    console.log(`Zona Horaria Oficial: America/Managua (UTC-6)`);
    console.log(`Turno T2 Horario Oficial: ${t2.startTime} - ${t2.endTime} (${t2.timeLabel})`);
    console.log(`Ventana QR Inicio (11:00 AM - 45m): 10:15 AM (10:15:00 America/Managua)`);
    console.log(`Ventana QR Fin (3:00 PM + 45m): 3:45 PM (15:45:00 America/Managua)`);
  }
}

verifyDates().catch(console.error);
