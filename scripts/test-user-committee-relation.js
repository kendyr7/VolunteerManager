/* eslint-disable @typescript-eslint/no-require-imports -- Zero-config Node regression test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });
const { getRelationName } = jiti('./lib/supabase-relation');

assert.equal(getRelationName({ name: 'Guía' }), 'Guía');
assert.equal(getRelationName([{ name: 'Transporte' }]), 'Transporte');
assert.equal(getRelationName(null), undefined);
assert.equal(getRelationName([]), undefined);

const actionSource = fs.readFileSync('app/actions/user-actions.ts', 'utf8');
const usersSource = fs.readFileSync('app/(coordinator)/users/page.tsx', 'utf8');
assert(actionSource.includes('committee: getRelationName(profile.committees)'), 'profiles action must normalize the committee relation');
assert(usersSource.includes('committee: p.committee'), 'users UI must consume the normalized committee');
assert(!usersSource.includes("user.committee || COMMITTEES[0]"), 'editor must not fall back to Historia');

console.log('PASS: user committees support the current object shape and never fall back to Historia');
