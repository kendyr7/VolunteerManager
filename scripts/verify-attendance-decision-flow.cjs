const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const migration = read('supabase/migrations/20261102000000_attendance_session_decisions.sql');
const actions = read('app/actions/attendance.ts');
const scanner = read('components/CheckInScanner.tsx');
const sessionStore = read('lib/services/session-store.ts');
const shiftCalculation = read('lib/shift-calculations.ts');
const scheduleCapture = read('components/ScheduleCaptureCard.tsx');
const shiftsPage = read('app/(coordinator)/shifts/page.tsx');
const profile = read('components/VolunteerProfileView.tsx');

assert.match(migration, /create table if not exists public\.attendance_session_decisions/i);
assert.match(migration, /create table if not exists public\.attendance_scan_events/i);
assert.match(migration, /create or replace function public\.open_attendance_session_with_decision/i);
assert.match(migration, /create or replace function public\.close_attendance_session_with_decision/i);
assert.match(migration, /create or replace function public\.resolve_stale_and_open_attendance/i);
assert.match(migration, /security invoker/gi);
assert.match(migration, /revoke all on function public\.resolve_stale_and_open_attendance[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.resolve_stale_and_open_attendance[\s\S]*to service_role/i);

assert.match(actions, /requireVolunteerCapability\('scan_qr_attendance', volunteerId\)/);
assert.match(actions, /openAttendanceSessionWithDecisionInDb/);
assert.match(actions, /closeAttendanceSessionWithDecisionInDb/);
assert.match(actions, /resolveStaleAndOpenAttendanceInDb/);
assert.doesNotMatch(actions, /await adjustSessionTimesAdminAction\([\s\S]{0,500}await openAttendanceSessionAction/);
assert.doesNotMatch(actions, /infrastructureMissing\s*\?\s*await completeOpenAttendanceSessionInDb/);
assert.doesNotMatch(actions, /else if \(decisionResult\.infrastructureMissing\)/);
assert.match(actions, /No se registró ninguna entrada parcial/);
assert.match(actions, /No se registró ninguna salida parcial/);

assert.match(sessionStore, /attendance_session_decisions/);
assert.match(sessionStore, /intended_shift_keys/);
assert.match(sessionStore, /const decisionBatchSize = 100/);
assert.match(sessionStore, /sessionIds\.slice\(start, start \+ decisionBatchSize\)/);
assert.match(sessionStore, /isMissingDecisionInfrastructure\(error\)/);
assert.match(shiftCalculation, /matching\.intended_shift_keys/);
assert.match(shiftCalculation, /decision_hides_alert/);
assert.doesNotMatch(shiftCalculation, /export type ShiftDisplayStatus[^\n]*needs_review/);
assert.doesNotMatch(shiftCalculation, /export interface ShiftDisplayState\s*\{[^}]*flag/s);
assert.match(shiftCalculation, /interface ShiftDiagnosticState extends ShiftDisplayState/);

assert.match(scanner, /const DUPLICATE_SCAN_WINDOW_MS = 5000/);
assert.doesNotMatch(scanner, /Confirmando opción recomendada/);
assert.doesNotMatch(scanner, /Auto-countdown effect for disambiguation/);
assert.match(scanner, /min-h-12/);
assert.match(scanner, /aria-modal="true"/);

assert.doesNotMatch(scheduleCapture, /Revisar/);
assert.doesNotMatch(scheduleCapture, /bg-amber/);
assert.doesNotMatch(shiftsPage, /displayState\.flag\s*\?/);
assert.doesNotMatch(shiftsPage, /Revisar asistencia/);
assert.doesNotMatch(profile, /needs_review/);
assert.doesNotMatch(profile, /flag:\s*display\.flag/);

console.log('Attendance decision flow: persistence, atomicity, permissions and three-state UI verified.');
