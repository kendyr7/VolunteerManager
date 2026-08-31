import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createJiti } from 'jiti';

const reviewFile = process.argv.find(arg => arg.startsWith('--review='))?.slice(9);
const auditDirectory = process.argv.find(arg => arg.startsWith('--audit='))?.slice(8);
const shouldApply = process.argv.includes('--apply');
if (!reviewFile || !auditDirectory) throw new Error('Use --review=... --audit=... [--apply]');
const directory = resolve(auditDirectory);
const reviewBytes = readFileSync(resolve(reviewFile));
const review = JSON.parse(reviewBytes.toString('utf8'));
const rows = Array.isArray(review) ? review : review.corrections;
if (!Array.isArray(rows) || !rows.length) throw new Error('The review has no corrections');
const reviewedIds = new Set(rows.map(row => row?.id));
if (reviewedIds.size !== rows.length) throw new Error('Duplicate IDs in review');
if (rows.some(row => row.approved !== true || !String(row.firstName || '').trim() || !String(row.lastName || '').trim())) {
  throw new Error('Every correction must be approved and include names and surnames');
}
const auditRows = JSON.parse(readFileSync(join(directory, 'name-reviews.json'), 'utf8'));
const allowed = new Map(auditRows.map(row => [row.id, row]));
if (rows.some(row => !allowed.has(row.id))) throw new Error('Review contains an ID outside the audit');
const originalSnapshot = JSON.parse(readFileSync(join(directory, 'after.json'), 'utf8'));
const snapshotById = new Map(originalSnapshot.map(row => [row.id, row]));
const jiti = createJiti(process.cwd(), { alias: {
  '@': process.cwd(), 'server-only': resolve('node_modules/next/dist/compiled/server-only/empty.js'),
} });
const { normalizeVolunteerText } = await jiti.import('./lib/volunteer-identity.ts');
for (const row of rows) {
  const snapshot = snapshotById.get(row.id);
  if (!snapshot) throw new Error(`Missing audited ID: ${row.id}`);
  if (normalizeVolunteerText(row.originalNames) !== normalizeVolunteerText(snapshot.first_name) ||
      normalizeVolunteerText(row.originalSurnames) !== normalizeVolunteerText(snapshot.last_name)) {
    throw new Error(`Original values do not match audit: ${row.id}`);
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const live = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('volunteers').select('id,first_name,last_name,status').order('id').range(offset, offset + 999);
  if (error) throw new Error(error.message);
  live.push(...data);
  if (data.length < 1000) break;
}
const liveById = new Map(live.map(row => [row.id, row]));
const alreadyCurrent = [];
const conflicts = [];
for (const row of rows) {
  const snapshot = snapshotById.get(row.id), current = liveById.get(row.id);
  const matchesReviewed = current && current.first_name === normalizeVolunteerText(row.firstName) &&
    current.last_name === normalizeVolunteerText(row.lastName);
  if (matchesReviewed) alreadyCurrent.push(row.id);
  else if (!current || current.first_name !== snapshot.first_name || current.last_name !== snapshot.last_name) {
    conflicts.push(row.id);
  }
}
const conflictSet = new Set(conflicts);
const changes = rows.filter(row => {
  if (conflictSet.has(row.id)) return false;
  const current = liveById.get(row.id);
  return normalizeVolunteerText(row.firstName) !== normalizeVolunteerText(current.first_name) ||
    normalizeVolunteerText(row.lastName) !== normalizeVolunteerText(current.last_name);
});
console.log(JSON.stringify({ preflight: 'passed', reviewed: rows.length, changes: changes.length, unchanged: rows.length - changes.length - conflicts.length,
  alreadyCurrent: alreadyCurrent.length, conflictsExcluded: conflicts.length, apply: shouldApply }));
if (shouldApply) {
  const evidenceFile = join(directory, 'nombres-revisados.applied.json');
  const executionFile = join(directory, 'name-correction-execution.json');
  if (existsSync(evidenceFile) || existsSync(executionFile)) throw new Error('A reviewed-name execution already exists for this audit');
  copyFileSync(resolve(reviewFile), evidenceFile);
  const operationId = randomUUID();
  const journal = { operationId, source: basename(reviewFile), sourceSha256: createHash('sha256').update(reviewBytes).digest('hex'),
    reviewedAt: review.reviewedAt || null, startedAt: new Date().toISOString(), results: [], missingReviewIds: auditRows.filter(row => !reviewedIds.has(row.id)).map(row => row.id),
    conflictingReviewIds: conflicts, verification: null };
  const checkpoint = () => writeFileSync(executionFile, JSON.stringify(journal, null, 2));
  checkpoint();
  const { VolunteerMutationService } = await jiti.import('./lib/services/volunteer-mutation.service.ts');
  for (const row of changes) {
    const current = liveById.get(row.id);
    const result = await VolunteerMutationService.applyReviewedNameCorrection(row.id,
      { first_name: current.first_name, last_name: current.last_name },
      { first_name: row.firstName, last_name: row.lastName },
      { name: 'Codex — revisión nominal completada por el usuario', role: 'Mantenimiento' }, operationId);
    journal.results.push({ id: row.id, ...result });
    checkpoint();
    if (!result.success) throw new Error(result.error);
    if (journal.results.length % 100 === 0) console.log(`Applied ${journal.results.length}/${changes.length}`);
  }
  const finalRows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('volunteers').select('id,first_name,last_name,status').order('id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    finalRows.push(...data);
    if (data.length < 1000) break;
  }
  const finalById = new Map(finalRows.map(row => [row.id, row]));
  const mismatches = changes.filter(row => {
    const final = finalById.get(row.id);
    return final?.first_name !== normalizeVolunteerText(row.firstName) || final?.last_name !== normalizeVolunteerText(row.lastName);
  }).map(row => row.id);
  const { count, error } = await db.from('activity_logs').select('id', { count: 'exact', head: true }).like('details', `%${operationId}%`);
  if (error) throw new Error(error.message);
  journal.verification = { totalBefore: live.length, totalAfter: finalRows.length, reviewed: rows.length, changed: changes.length,
    unchanged: rows.length - changes.length - conflicts.length, alreadyCurrent: alreadyCurrent.length,
    missingReviewIds: journal.missingReviewIds.length, conflictingReviewIds: conflicts.length, mismatches, auditEntries: count,
    unchangedStatuses: live.every(row => finalById.get(row.id)?.status === row.status) };
  checkpoint();
  console.log(JSON.stringify(journal.verification));
  if (mismatches.length || count !== changes.length || !journal.verification.unchangedStatuses) throw new Error('Verification failed');
}
