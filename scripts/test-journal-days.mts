import assert from 'node:assert/strict';
import { getJournalDays } from '../lib/journal-days';

assert.deepEqual(getJournalDays([]), [], 'No assignments means no editable dates');
assert.deepEqual(getJournalDays([
  { day_key: 'vie 11' }, { day_key: 'jue 10' }, { day_key: 'vie 11' },
  { day_key: 'sab 5' }, { day_key: '2026-09-14' },
]), ['2026-09-05', '2026-09-10', '2026-09-11', '2026-09-14'], 'Sort, normalize accented keys, and merge shifts on the same day');
assert.deepEqual(getJournalDays([
  { day_key: 'dom 13' }, { day_key: '2026-09-27' }, { day_key: 'not-a-date' },
]), [], 'Unknown and non-operational dates must not create journal days');
assert.deepEqual(getJournalDays([{ day_key: 'jue 10' }]), ['2026-09-10'], 'Do not offer unassigned event dates');
console.log('Journal day eligibility: 4 checks passed.');
