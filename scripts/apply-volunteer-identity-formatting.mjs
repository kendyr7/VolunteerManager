import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

// Requires an explicit prepared plan. Default is preflight only; --apply writes.
const planFile = process.argv.find(arg => arg.startsWith('--plan='))?.slice(7);
if (!planFile) throw new Error('Use --plan=outputs/.../plan.json [--apply]');
const plan = JSON.parse(readFileSync(resolve(planFile), 'utf8'));
const directory = resolve(plan.directory);
const journalFile = join(directory, 'execution.json');
const shouldApply = process.argv.includes('--apply');
const previousJournal = existsSync(journalFile) ? JSON.parse(readFileSync(journalFile, 'utf8')) : null;
if (shouldApply && previousJournal?.results.length) throw new Error('This plan already wrote records. Audit again before retrying.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fields = ['first_name', 'last_name', 'stake', 'neighborhood'];
const live = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('volunteers').select(`id,${fields.join(',')},status`).order('id').range(offset, offset + 999);
  if (error) throw new Error(error.message);
  live.push(...data);
  if (data.length < 1000) break;
}
const liveById = new Map(live.map(row => [row.id, row]));
// This is a trusted Node server process. Use Next's server-side marker export,
// which the Next bundler normally selects for server-only imports.
const jiti = createJiti(process.cwd(), { alias: {
  '@': process.cwd(),
  'server-only': resolve('node_modules/next/dist/compiled/server-only/empty.js'),
} });
const { normalizeVolunteerIdentity } = await jiti.import('./lib/volunteer-identity.ts');
if (new Set(plan.corrections.map(c => c.id)).size !== plan.corrections.length) throw new Error('Duplicate IDs');
for (const correction of plan.corrections) {
  const current = liveById.get(correction.id);
  if (!current || fields.some(field => current[field] !== correction.before[field])) throw new Error(`Stale snapshot: ${correction.id}`);
  const normalized = normalizeVolunteerIdentity({ firstName: current.first_name, lastName: current.last_name || '', stake: current.stake, neighborhood: current.neighborhood });
  const expectedAfter = { first_name: normalized.firstName, last_name: current.last_name === null ? null : normalized.lastName,
    stake: current.stake === null ? null : normalized.stake ?? '', neighborhood: current.neighborhood === null ? null : normalized.neighborhood ?? '' };
  if (fields.some(field => expectedAfter[field] !== correction.after[field])) throw new Error('Plan contains a non-formatting change');
}
console.log(JSON.stringify({ preflight: 'passed', records: plan.corrections.length, apply: shouldApply }));
if (shouldApply) {
  const { VolunteerMutationService } = await jiti.import('./lib/services/volunteer-mutation.service.ts');
  // Saved before the first remote write, including every original value.
  const rollbackFile = join(directory, 'rollback.json');
  const rollback = JSON.stringify(plan.corrections.map(c => ({ id: c.id, expected: c.after, restore: c.before })), null, 2);
  if (existsSync(rollbackFile)) {
    if (readFileSync(rollbackFile, 'utf8') !== rollback) throw new Error('Existing backup differs');
  } else writeFileSync(rollbackFile, rollback, { flag: 'wx' });
  const operationId = previousJournal?.operationId || randomUUID();
  const journal = { operationId, startedAt: new Date().toISOString(), results: [], verification: null };
  const checkpoint = () => writeFileSync(journalFile, JSON.stringify(journal, null, 2));
  checkpoint();
  for (const correction of plan.corrections) {
    const result = await VolunteerMutationService.normalizeAuditedIdentity(correction.id, correction.before,
      { name: 'Codex — auditoría solicitada por el usuario', role: 'Mantenimiento' }, operationId);
    journal.results.push({ id: correction.id, ...result });
    checkpoint();
    if (!result.success) throw new Error(result.error);
    if (journal.results.length % 50 === 0) console.log(`Applied ${journal.results.length}/${plan.corrections.length}`);
  }
  const afterRows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('volunteers').select(`id,${fields.join(',')},status`).order('id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    afterRows.push(...data);
    if (data.length < 1000) break;
  }
  writeFileSync(join(directory, 'after.json'), JSON.stringify(afterRows, null, 2));
  const afterById = new Map(afterRows.map(row => [row.id, row]));
  const mismatches = plan.corrections.filter(c => fields.some(f => afterById.get(c.id)?.[f] !== c.after[f])).map(c => c.id);
  const { count, error } = await db.from('activity_logs').select('id', { count: 'exact', head: true }).like('details', `%${operationId}%`);
  if (error) throw new Error(error.message);
  journal.verification = { totalBefore: live.length, totalAfter: afterRows.length, mismatches, auditEntries: count,
    unchangedStatuses: live.every(row => afterById.get(row.id)?.status === row.status) };
  checkpoint();
  console.log(JSON.stringify(journal.verification));
  if (mismatches.length || count !== plan.corrections.length) throw new Error('Verification incomplete; inspect execution.json');
}
