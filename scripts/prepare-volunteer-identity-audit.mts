import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { normalizeChurchUnit, normalizeVolunteerText, draftVolunteerName } = await jiti.import<typeof import('../lib/volunteer-identity')>('../lib/volunteer-identity.ts');

type Row = { id: string; first_name: string; last_name: string | null; stake: string | null; neighborhood: string | null; status: string; created_at: string };
const { directory } = JSON.parse(readFileSync('outputs/volunteer-data-audit/latest.json', 'utf8'));
const rows: Row[] = JSON.parse(readFileSync(join(directory, 'before.json'), 'utf8'));
const fields = ['first_name', 'last_name', 'stake', 'neighborhood'] as const;
const wordCount = (text: string | null) => normalizeVolunteerText(text).split(' ').filter(Boolean).length;
const corrections = rows.flatMap(row => {
  const before = Object.fromEntries(fields.map(field => [field, row[field]]));
  const after = {
    first_name: normalizeVolunteerText(row.first_name),
    last_name: row.last_name === null ? null : normalizeVolunteerText(row.last_name),
    stake: row.stake === null ? null : normalizeChurchUnit(row.stake, 'stake'),
    neighborhood: row.neighborhood === null ? null : normalizeChurchUnit(row.neighborhood, 'neighborhood'),
  };
  const changes = fields.filter(field => before[field] !== after[field]);
  return changes.length ? [{ id: row.id, before, after, changes, evidence: 'Solo espacios, Unicode, mayúsculas, tildes representadas en la base y prefijos del nivel correcto. Sin redistribuir nombres ni reasignar unidades.' }] : [];
});
const nameReviews = rows.flatMap(row => {
  const firstWords = wordCount(row.first_name), lastWords = wordCount(row.last_name);
  const fullName = normalizeVolunteerText(`${row.first_name} ${row.last_name || ''}`);
  const reasons: string[] = [];
  if (!lastWords || !firstWords) reasons.push('Falta nombre o apellido');
  if (firstWords === 1 && lastWords >= 3) reasons.push('Compatible con la división defectuosa: revisar segundo nombre y apellidos');
  if (firstWords === 1 && lastWords === 2) reasons.push('Ambiguo: un nombre y dos apellidos, o dos nombres y un apellido');
  if (/[()\d]/.test(fullName)) reasons.push('Contiene anotaciones o números');
  if (!reasons.length) return [];
  const draft = draftVolunteerName(fullName);
  return [{ id: row.id, names: row.first_name, surnames: row.last_name, status: row.status,
    reasons: reasons.join('; '), suggestedNames: draft.firstName, suggestedSurnames: draft.lastName,
    approved: false }];
});
const pairs = new Map<string, Set<string>>();
for (const row of rows) {
  const ward = normalizeChurchUnit(row.neighborhood, 'neighborhood');
  const stake = normalizeChurchUnit(row.stake, 'stake');
  if (!pairs.has(ward)) pairs.set(ward, new Set());
  pairs.get(ward)!.add(stake);
}
const unusualStakes = new Set(['Monseñor Lezcano', 'Lezcano', 'Bello Amanecer', 'La Estación', 'Rama Pancasan', 'Pancasan', 'Americas', 'Bello Horizente', 'Universitara', 'Universataria', 'Masstepe', 'Univeritaria']);
const unusualWards = new Set(['Monserat', 'Monserath', 'Matiares', 'Bello Amenecer', '4Esquinas', '4 Esquinas', '4 Esquina', '4 esquinas', 'Cuatro Esquina', 'Los Laures', 'La Villa Univesitaria', 'La Sabogales', 'Las savogales', 'Montefresco', 'El coyar', 'Zabaneta', 'Barrios Las Flores', 'Prizapolka', 'Catorce de Septiembre']);
const unitReviews = rows.flatMap(row => {
  const ward = normalizeChurchUnit(row.neighborhood, 'neighborhood');
  const stake = normalizeChurchUnit(row.stake, 'stake');
  const reasons: string[] = [];
  if (/^(estaca|distrito)\b/i.test(ward) || /^(barrio|rama)\b/i.test(stake)) reasons.push('Posibles columnas intercambiadas');
  if (unusualStakes.has(stake)) reasons.push('Estaca/distrito: posible errata o unidad del nivel incorrecto');
  if (unusualWards.has(ward)) reasons.push('Barrio/rama: posible variante o errata');
  if (!ward || !stake || /por definir/i.test(ward + stake)) reasons.push('Asignación incompleta');
  if (!reasons.length) return [];
  return [{ id: row.id, name: normalizeVolunteerText(`${row.first_name} ${row.last_name || ''}`), status: row.status, stake: row.stake, ward: row.neighborhood, reasons: reasons.join('; ') }];
});
const hierarchy = [...pairs].map(([ward, stakes]) => ({ ward, stakes: [...stakes], multipleParents: stakes.size > 1 }));
const summary = {
  total: rows.length, correctedRecords: corrections.length,
  fieldChanges: Object.fromEntries(fields.map(field => [field, corrections.filter(c => c.changes.includes(field)).length])),
  probableNameSplits: nameReviews.filter(r => r.reasons.includes('división defectuosa')).length,
  ambiguousThreeWordNames: nameReviews.filter(r => r.reasons.startsWith('Ambiguo')).length,
  nameReviews: nameReviews.length, unitReviews: unitReviews.length,
  multipleParentNames: hierarchy.filter(r => r.multipleParents).length,
  distinctStakesBefore: new Set(rows.map(r => r.stake)).size,
  distinctStakesAfter: new Set(rows.map(r => r.stake === null ? null : normalizeChurchUnit(r.stake, 'stake'))).size,
  distinctWardsBefore: new Set(rows.map(r => r.neighborhood)).size,
  distinctWardsAfter: new Set(rows.map(r => r.neighborhood === null ? null : normalizeChurchUnit(r.neighborhood, 'neighborhood'))).size,
};
writeFileSync(join(directory, 'plan.json'), JSON.stringify({ directory, summary, corrections }, null, 2));
writeFileSync(join(directory, 'name-reviews.json'), JSON.stringify(nameReviews, null, 2));
writeFileSync(join(directory, 'unit-reviews.json'), JSON.stringify(unitReviews, null, 2));
writeFileSync(join(directory, 'hierarchy.json'), JSON.stringify(hierarchy, null, 2));
console.log(JSON.stringify({ directory, ...summary }, null, 2));
