import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadLocalEnvironment() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const whatsappModule = '../lib/whatsapp' + '.ts';
const { formatE164 } = await import(whatsappModule);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
}

const requestedDate = process.argv[2] || '2026-09-10';
if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
  throw new Error('La fecha debe usar el formato YYYY-MM-DD.');
}
const date = new Date(`${requestedDate}T12:00:00.000Z`);
const shortDayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const shortKey = `${shortDayNames[date.getUTCDay()]} ${date.getUTCDate()}`;
const shortTitle = `${shortKey.charAt(0).toUpperCase()}${shortKey.slice(1)}`;
const targetKeys = Array.from(new Set([requestedDate, shortKey, shortTitle]));
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: migrationError } = await db
  .from('reminder_logs')
  .select('automation_key, send_source')
  .limit(1);
if (migrationError) {
  throw new Error(`La migración automática no está disponible: ${migrationError.message}`);
}

const { data: shiftRows, error: shiftError } = await db
  .from('shifts')
  .select('volunteer_id, day_key, shift_key')
  .in('day_key', targetKeys)
  .in('shift_key', ['T1', 'T2', 'T3', 'T4']);
if (shiftError) throw new Error(`No se pudieron consultar los turnos: ${shiftError.message}`);

const uniqueShifts = Array.from(new Map(
  (shiftRows || [])
    .filter(row => row.volunteer_id)
    .map(row => [`${row.volunteer_id}:${row.shift_key}`, row])
).values());
const volunteerIds = Array.from(new Set(uniqueShifts.map(row => row.volunteer_id)));

const [{ data: volunteerRows, error: volunteerError }, { data: reminderRows, error: reminderError }] = await Promise.all([
  volunteerIds.length > 0
    ? db
        .from('volunteers')
        .select('id, phone, status, committees(name)')
        .in('id', volunteerIds)
        .or('status.is.null,status.neq.archived')
    : Promise.resolve({ data: [], error: null }),
  volunteerIds.length > 0
    ? db
        .from('reminder_logs')
        .select('volunteer_id, shift_key, status, delivery_status')
        .in('volunteer_id', volunteerIds)
        .in('day_key', targetKeys)
        .in('shift_key', ['T1', 'T2', 'T3', 'T4'])
    : Promise.resolve({ data: [], error: null }),
]);
if (volunteerError) throw new Error(`No se pudieron consultar los voluntarios: ${volunteerError.message}`);
if (reminderError) throw new Error(`No se pudieron consultar los avisos existentes: ${reminderError.message}`);

const volunteers = new Map((volunteerRows || []).map(volunteer => [volunteer.id, volunteer]));
const alreadyContacted = new Set((reminderRows || [])
  .filter(row =>
    (row.status === 'contactado' || row.status === 'confirmado') &&
    row.delivery_status !== 'failed'
  )
  .map(row => `${row.volunteer_id}:${row.shift_key}`));

const shiftsPerVolunteer = new Map<string, number>();
const distribution: Record<string, number> = { T1: 0, T2: 0, T3: 0, T4: 0 };
let alreadyContactedCount = 0;
let excludedOrInvalid = 0;
let missingCommittee = 0;
let wouldSend = 0;
const wouldContactVolunteerIds = new Set<string>();

for (const shift of uniqueShifts) {
  distribution[shift.shift_key] = (distribution[shift.shift_key] || 0) + 1;
  shiftsPerVolunteer.set(shift.volunteer_id, (shiftsPerVolunteer.get(shift.volunteer_id) || 0) + 1);
  const key = `${shift.volunteer_id}:${shift.shift_key}`;
  if (alreadyContacted.has(key)) {
    alreadyContactedCount += 1;
    continue;
  }
  const volunteer = volunteers.get(shift.volunteer_id);
  if (!volunteer || !formatE164(volunteer.phone || '')) {
    excludedOrInvalid += 1;
    continue;
  }
  const relation = Array.isArray(volunteer.committees) ? volunteer.committees[0] : volunteer.committees;
  if (!relation?.name) missingCommittee += 1;
  wouldSend += 1;
  wouldContactVolunteerIds.add(shift.volunteer_id);
}

console.log(JSON.stringify({
  dryRun: true,
  targetDate: requestedDate,
  recognizedDayKeys: targetKeys,
  scheduledShifts: uniqueShifts.length,
  activeVolunteers: volunteers.size,
  volunteersWithMultipleShifts: Array.from(shiftsPerVolunteer.values()).filter(count => count > 1).length,
  shiftDistribution: distribution,
  alreadyContacted: alreadyContactedCount,
  excludedArchivedMissingOrInvalidPhone: excludedOrInvalid,
  missingCommitteeFallbackToServicio: missingCommittee,
  wouldContactVolunteers: wouldContactVolunteerIds.size,
  wouldSend,
}, null, 2));
