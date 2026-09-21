import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());

const manifest = JSON.parse(await fs.readFile(
  new URL('./fixtures/attendance-decision-backfill-2026-09.json', import.meta.url),
  'utf8',
));
const snapshotPath = 'scratch/attendance-decision-backfill-protection-snapshot.json';
const snapshotMode = process.argv.includes('--snapshot');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Faltan credenciales de Supabase.');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchByIds(table, column, ids, select = '*') {
  const rows = [];
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const { data, error } = await supabase.from(table).select(select).in(column, batch);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

const sourceIds = manifest.source_resolutions.map(row => row.session_id);
const finalSessionIds = manifest.decisions.map(row => row.session_id);
const volunteerIds = [...new Set(manifest.source_resolutions.map(row => row.volunteer_id))];

const [resolutions, sessions, shifts] = await Promise.all([
  fetchByIds('attendance_review_resolutions', 'session_id', sourceIds),
  fetchByIds('attendance_sessions', 'id', finalSessionIds),
  fetchByIds('shifts', 'volunteer_id', volunteerIds, 'id, volunteer_id, day_key, shift_key, created_at'),
]);

const sortById = rows => [...rows].sort((a, b) => String(a.id || a.session_id).localeCompare(String(b.id || b.session_id)));
const protectedData = {
  capturedAt: new Date().toISOString(),
  sessions: sortById(sessions),
  shifts: sortById(shifts),
};

assert.equal(resolutions.length, 44, 'Deben existir las 44 resoluciones fuente.');
assert.equal(sessions.length, 42, 'Deben existir las 42 sesiones finales.');
for (const expected of manifest.source_resolutions) {
  const actual = resolutions.find(row => row.session_id === expected.session_id);
  assert.ok(actual, `Falta la resolución ${expected.session_id}`);
  assert.equal(actual.volunteer_id, expected.volunteer_id);
  assert.equal(actual.day_key, expected.day_key);
  assert.equal(actual.resolved_session_id, expected.expected_resolved_session_id);
  assert.equal(actual.hide_alert, true);
}

if (snapshotMode) {
  await fs.writeFile(snapshotPath, `${JSON.stringify(protectedData, null, 2)}\n`);
  console.log(JSON.stringify({
    snapshot: snapshotPath,
    capturedAt: protectedData.capturedAt,
    protectedSessions: protectedData.sessions.length,
    protectedShifts: protectedData.shifts.length,
    sourceResolutions: resolutions.length,
  }, null, 2));
  process.exit(0);
}

const before = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
assert.deepEqual(protectedData.sessions, before.sessions, 'El backfill modificó datos de attendance_sessions.');
assert.deepEqual(protectedData.shifts, before.shifts, 'El backfill modificó datos de shifts.');

const decisions = await fetchByIds('attendance_session_decisions', 'session_id', finalSessionIds);
assert.equal(decisions.length, 42, 'Deben existir exactamente 42 decisiones por sesión.');
for (const expected of manifest.decisions) {
  const actual = decisions.find(row => row.session_id === expected.session_id);
  assert.ok(actual, `Falta la decisión ${expected.session_id}`);
  assert.equal(actual.volunteer_id, expected.volunteer_id);
  assert.equal(actual.day_key, expected.day_key);
  assert.deepEqual(actual.intended_shift_keys, expected.intended_shift_keys);
  assert.equal(actual.attendance_kind, 'historical_audit');
  assert.equal(actual.exit_decision, 'admin_corrected');
  assert.equal(actual.reason_code, 'reviewed_attendance_audit_2026_09');
  assert.equal(actual.explanation, expected.explanation);
  assert.equal(actual.hide_alert, true);
  assert.equal(actual.source, 'historical_audit');
  assert.equal(actual.idempotency_key, expected.idempotency_key);
  assert.deepEqual(actual.source_resolution_ids, expected.source_resolution_ids);
  assert.deepEqual(actual.source_case_ids, expected.source_case_ids);
}

const linked = manifest.source_resolutions.filter(row => row.expected_resolved_session_id);
assert.equal(linked.filter(source => {
  const decision = decisions.find(row => row.session_id === source.expected_resolved_session_id);
  return decision?.hide_alert === true && decision.source_resolution_ids.includes(source.session_id);
}).length, 43, 'Las 43 resoluciones enlazadas deben ser trazables desde su decisión.');

const deleted = manifest.source_resolutions.filter(row => !row.expected_resolved_session_id);
assert.equal(deleted.length, 1);
assert.equal(
  resolutions.find(row => row.session_id === deleted[0].session_id)?.hide_alert,
  true,
  'La resolución eliminada debe conservar su supresión histórica.',
);

console.log(JSON.stringify({
  sourceResolutions: resolutions.length,
  linkedResolutions: linked.length,
  deletedResolutions: deleted.length,
  sessionDecisions: decisions.length,
  snapshotCapturedAt: before.capturedAt || null,
  protectedSessionsUnchanged: protectedData.sessions.length,
  protectedShiftsUnchanged: protectedData.shifts.length,
}, null, 2));
