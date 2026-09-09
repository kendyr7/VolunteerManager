import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  calculateReliabilityScore,
  computeBulkReliabilityMap,
  getVolunteerReliabilityMetrics,
} from '../lib/services/volunteer-reliability.service';
import { parseGuatemalaShiftEnd } from '../lib/dates';

const afterSimulation = new Date('2026-09-09T18:00:00.000Z');
const afterFirstOfficialShift = new Date('2026-09-10T19:00:00.000Z');

assert.equal(calculateReliabilityScore(4, 1), 75, 'One absence across four commitments scores 75');
assert.equal(calculateReliabilityScore(200, 1), 99, 'Rounding never hides an existing absence with a perfect score');
assert.equal(calculateReliabilityScore(0, 0), 100, 'No assigned shifts keeps neutral reliability');

assert.equal(
  parseGuatemalaShiftEnd('2026-09-05', 'T1').toISOString(),
  '2026-09-05T20:00:00.000Z',
  'ISO day keys resolve to the real Guatemala shift end',
);

const simulationMiss = getVolunteerReliabilityMetrics(
  'volunteer-1',
  [{ volunteer_id: 'volunteer-1', day_key: 'sáb 5', shift_key: 'T1' }],
  [],
  afterSimulation,
);
assert.equal(simulationMiss.totalAssignedShifts, 1, 'An assigned simulation shift counts');
assert.equal(simulationMiss.missedShiftsCount, 1, 'A missed simulation shift counts as an absence');
assert.equal(simulationMiss.reliabilityScore, 0, 'A sole missed simulation shift scores zero');

const dilutedAbsence = getVolunteerReliabilityMetrics(
  'volunteer-2',
  [
    { volunteer_id: 'volunteer-2', day_key: '2026-09-10', shift_key: 'T1' },
    { volunteer_id: 'volunteer-2', day_key: 'vie 11', shift_key: 'T1' },
    { volunteer_id: 'volunteer-2', day_key: 'sáb 12', shift_key: 'T1' },
    { volunteer_id: 'volunteer-2', day_key: 'lun 14', shift_key: 'T1' },
  ],
  [],
  afterFirstOfficialShift,
);
assert.equal(dilutedAbsence.missedShiftsCount, 1, 'The elapsed ISO shift is marked absent');
assert.equal(dilutedAbsence.upcomingShiftsCount, 3, 'Future commitments remain pending');
assert.equal(dilutedAbsence.reliabilityScore, 75, 'Future commitments dilute but do not erase the absence');

const attendedSimulation = getVolunteerReliabilityMetrics(
  'volunteer-3',
  [{ volunteer_id: 'volunteer-3', day_key: '2026-09-05', shift_key: 'T1' }],
  [{
    volunteer_id: 'volunteer-3',
    day_key: 'sáb 5',
    started_at: '2026-09-05T15:00:00.000Z',
    ended_at: '2026-09-05T20:00:00.000Z',
    status: 'completed',
  }],
  afterSimulation,
);
assert.equal(attendedSimulation.completedShiftsCount, 1, 'Equivalent ISO and short day keys match the same shift');
assert.equal(attendedSimulation.reliabilityScore, 100, 'An attended simulation shift keeps full reliability');

assert.deepEqual(
  computeBulkReliabilityMap([{ id: 'volunteer-without-shifts' }], [], [], afterSimulation),
  { 'volunteer-without-shifts': 100 },
  'Bulk and individual calculations agree for volunteers without shifts',
);

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20261028000000_add_reliability_score_to_volunteers.sql', import.meta.url),
  'utf8',
);
const migrationDb = new PGlite();
await migrationDb.exec(`
  create table public.volunteers (
    id uuid primary key,
    reliability_score integer default 0
  );
  insert into public.volunteers (id, reliability_score)
  values ('00000000-0000-0000-0000-000000000001', null);
`);
await migrationDb.exec(migrationSql);

const migratedColumn = await migrationDb.query<{
  column_default: string;
  is_nullable: string;
}>(`
  select column_default, is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'volunteers'
    and column_name = 'reliability_score'
`);
assert.match(migratedColumn.rows[0]?.column_default || '', /100/, 'Migration changes the existing default to 100');
assert.equal(migratedColumn.rows[0]?.is_nullable, 'NO', 'Migration makes reliability non-nullable');

const migratedVolunteer = await migrationDb.query<{ reliability_score: number }>(`
  select reliability_score
  from public.volunteers
  where id = '00000000-0000-0000-0000-000000000001'
`);
assert.equal(migratedVolunteer.rows[0]?.reliability_score, 100, 'Migration backfills null scores');

await assert.rejects(
  migrationDb.exec(`
    insert into public.volunteers (id, reliability_score)
    values ('00000000-0000-0000-0000-000000000002', 101)
  `),
  'Migration rejects scores outside the supported range',
);
await migrationDb.close();

console.log('Volunteer reliability tests passed.');
