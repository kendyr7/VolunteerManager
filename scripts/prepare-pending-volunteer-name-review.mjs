import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sourceDirectory = resolve('outputs/volunteer-data-audit/2026-08-31T13-12-52-584Z');
const outputDirectory = join(sourceDirectory, 'pending-name-review');
const auditRows = JSON.parse(readFileSync(join(sourceDirectory, 'name-reviews.json'), 'utf8'));
const auditById = new Map(auditRows.map(row => [row.id, row]));
const submitted = JSON.parse(readFileSync(join(sourceDirectory, 'nombres-revisados.applied.json'), 'utf8')).corrections;
const submittedById = new Map(submitted.map(row => [row.id, row]));
const execution = JSON.parse(readFileSync(join(sourceDirectory, 'name-correction-execution.json'), 'utf8'));
const ids = [...new Set([...execution.missingReviewIds, ...execution.conflictingReviewIds])];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db.from('volunteers').select('id,first_name,last_name,status').in('id', ids);
if (error) throw new Error(error.message);
if (data.length !== ids.length) throw new Error('Not every pending volunteer exists');
const pending = data.map(current => {
  const prior = auditById.get(current.id), submittedRow = submittedById.get(current.id);
  const conflict = execution.conflictingReviewIds.includes(current.id);
  return {
    id: current.id,
    names: current.first_name,
    surnames: current.last_name,
    status: current.status,
    reasons: conflict
      ? 'El nombre cambió después del respaldo. Compara el valor actual antes de confirmar.'
      : 'Este registro no venía marcado como revisado en la descarga anterior.',
    suggestedNames: submittedRow?.firstName || prior?.suggestedNames || current.first_name,
    suggestedSurnames: submittedRow?.lastName || prior?.suggestedSurnames || current.last_name || '',
    approved: false,
  };
});
const summary = {
  total: pending.length, correctedRecords: 0, fieldChanges: {},
  probableNameSplits: pending.length, ambiguousThreeWordNames: 0,
  nameReviews: pending.length, unitReviews: 0, multipleParentNames: 0,
  distinctStakesBefore: 0, distinctStakesAfter: 0, distinctWardsBefore: 0, distinctWardsAfter: 0,
};
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'before.json'), JSON.stringify(data, null, 2));
writeFileSync(join(outputDirectory, 'after.json'), JSON.stringify(data, null, 2));
writeFileSync(join(outputDirectory, 'name-reviews.json'), JSON.stringify(pending, null, 2));
writeFileSync(join(outputDirectory, 'unit-reviews.json'), '[]');
writeFileSync(join(outputDirectory, 'hierarchy.json'), '[]');
writeFileSync(join(outputDirectory, 'plan.json'), JSON.stringify({ directory: outputDirectory, summary, corrections: [] }, null, 2));
writeFileSync(join(outputDirectory, 'execution.json'), JSON.stringify({ results: [], verification: null }, null, 2));
console.log(JSON.stringify({ directory: outputDirectory, pending: pending.length, conflicts: execution.conflictingReviewIds.length, missingFromDownload: execution.missingReviewIds.length }));
