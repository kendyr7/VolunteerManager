// Synthetic data only: no credentials, network, or writes to the database.
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '..') } });
const { processShiftsData, computeReliabilityMap, buildEventDayKeys } = jiti('../lib/coordinator-data.ts');
const { getShiftDisplayState } = jiti('../lib/shift-calculations.ts');
const { parseDayKeyToDateStr } = jiti('../lib/dates.ts');
const RealDate = Date;
const now = new RealDate('2026-09-14T13:30:00-06:00');
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now.getTime(); }
};
const days = buildEventDayKeys();
const volunteers = Array.from({ length: 1253 }, (_, i) => ({ id: `v${i}`, committees: { name: `C${i % 6}` } }));
const shifts = Array.from({ length: 6905 }, (_, i) => ({
  id: `s${i}`, volunteer_id: volunteers[i % volunteers.length].id,
  day_key: days[Math.floor(i / volunteers.length)], shift_key: `T${i % 4 + 1}`,
  checked_in: false, checked_out: false,
}));
const sessions = shifts.slice(0, 1353).map((shift, i) => ({
  id: `a${i}`, volunteer_id: shift.volunteer_id, day_key: shift.day_key,
  started_at: `${parseDayKeyToDateStr(shift.day_key)}T${['07', '11', '14', '17'][i % 4]}:15:00-06:00`,
  ended_at: i % 3 === 0 ? null : `${parseDayKeyToDateStr(shift.day_key)}T${['12', '15', '18', '21'][i % 4]}:00:00-06:00`,
  status: i % 3 === 0 ? 'open' : 'completed', auto_closed: false,
}));
const key = record => `${record.volunteer_id}|${record.day_key}`;
const index = records => {
  const result = new Map();
  for (const record of records) {
    const bucket = result.get(key(record)) || [];
    bucket.push(record);
    result.set(key(record), bucket);
  }
  return result;
};
const shiftIndex = index(shifts);
const sessionIndex = index(sessions);
const result = { volunteers: volunteers.length, shifts: shifts.length, sessions: sessions.length };
for (const [name, calculate] of Object.entries({
  shared: () => processShiftsData(shifts, volunteers, sessions, now),
  reliability: () => computeReliabilityMap(volunteers, shifts, sessions),
  roster: () => shifts.map(shift => getShiftDisplayState(shift.day_key, shift.shift_key, shift,
    sessionIndex.get(key(shift)) || [], shiftIndex.get(key(shift)) || [], shift.volunteer_id, now)),
})) {
  const start = performance.now();
  const output = calculate();
  result[name] = { ms: Math.round(performance.now() - start), sha256: createHash('sha256').update(JSON.stringify(output)).digest('hex') };
}
global.Date = RealDate;
console.log(JSON.stringify(result, null, 2));
