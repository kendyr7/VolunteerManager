import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Read-only snapshot. Do not include phones, credentials or unrelated profile data.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const directory = resolve('outputs/volunteer-data-audit', new Date().toISOString().replace(/[:.]/g, '-'));
const volunteers = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('volunteers')
    .select('id,first_name,last_name,stake,neighborhood,status,created_at')
    .order('id').range(offset, offset + 999);
  if (error) throw new Error(error.message);
  volunteers.push(...data);
  if (data.length < 1000) break;
}
const frequencies = (field) => Object.entries(volunteers.reduce((counts, row) => {
  const value = row[field] ?? '<null>';
  counts[value] = (counts[value] || 0) + 1;
  return counts;
}, {})).sort((a, b) => b[1] - a[1]);
const wordCount = (value) => (value || '').trim().split(/\s+/).filter(Boolean).length;
const summary = {
  total: volunteers.length,
  stakes: frequencies('stake'),
  neighborhoods: frequencies('neighborhood'),
  nameShapes: Object.entries(volunteers.reduce((counts, row) => {
    const key = `${wordCount(row.first_name)}+${wordCount(row.last_name)}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]),
};
mkdirSync(directory, { recursive: true });
if (existsSync(resolve(directory, 'before.json'))) throw new Error('Snapshot already exists');
writeFileSync(resolve(directory, 'before.json'), JSON.stringify(volunteers, null, 2));
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(resolve('outputs/volunteer-data-audit/latest.json'), JSON.stringify({ directory }));
console.log(JSON.stringify({ directory, ...summary }, null, 2));
