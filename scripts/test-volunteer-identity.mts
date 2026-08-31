import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { draftVolunteerName, normalizeChurchUnit, normalizeVolunteerIdentity, normalizeVolunteerText, volunteerIdentityError } = await jiti.import<typeof import('../lib/volunteer-identity')>('../lib/volunteer-identity.ts');

const identity = normalizeVolunteerIdentity({ firstName: '  María  del Carmen ', lastName: 'de la Cruz López', stake: ' Estaca   Leon ', neighborhood: 'Rama Rene Polanco' });
assert.deepEqual(identity, { firstName: 'María del Carmen', lastName: 'de la Cruz López', stake: 'León', neighborhood: 'René Polanco' });
assert.deepEqual(normalizeVolunteerIdentity(identity), identity, 'Formatting must be idempotent');
assert.equal(normalizeVolunteerText('Jose\u0301  Peña'), 'José Peña');
assert.equal(normalizeChurchUnit('Barrio Pena', 'neighborhood'), 'Pena', 'Never equate n with ñ');
assert.equal(normalizeChurchUnit('Estaca Nueva Unidad', 'stake'), 'Nueva Unidad', 'Unknown units remain available');
assert.equal(normalizeChurchUnit('Distrito Granada', 'neighborhood'), 'Distrito Granada', 'Wrong-level prefixes must remain visible');
assert.equal(normalizeChurchUnit('Barrio Nuevo', 'stake'), 'Barrio Nuevo');
assert.equal(normalizeChurchUnit('El Coyolar II', 'neighborhood'), 'El Coyolar II', 'Do not merge distinct units');
assert.equal(normalizeChurchUnit('La Trinidad', 'neighborhood'), 'La Trinidad');
assert.equal(normalizeChurchUnit('Trinidad', 'neighborhood'), 'Trinidad', 'Do not infer aliases by removing articles');
assert.ok(volunteerIdentityError({ firstName: '   ', lastName: 'Pérez' }));
assert.ok(volunteerIdentityError({ firstName: 'Juan Carlos', lastName: '' }));
assert.ok(volunteerIdentityError({ firstName: 'Juan', lastName: 'Pérez', stake: 'Rama Pancasan' }));
assert.equal(volunteerIdentityError({ firstName: 'Juan Carlos', lastName: 'Pérez López' }), null);
for (const fullName of ['Juan Carlos Pérez López', 'María del Carmen de la Cruz', 'Ana López', 'Luis Carlos Pérez', 'Juan', '', 'Ana de la Cruz López']) {
  const draft = draftVolunteerName(fullName);
  assert.equal(draft.nameNeedsReview, true, 'Legacy full names must never be silently approved');
  assert.equal(normalizeVolunteerText(`${draft.firstName} ${draft.lastName}`), normalizeVolunteerText(fullName), 'A suggestion must preserve every word in order');
}
assert.equal(draftVolunteerName('María del Carmen López Pérez').lastName, '', 'Compound names need an explicit boundary');
console.log('Volunteer identity: formatting, validation, compound names and legacy import checks passed.');
