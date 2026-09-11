import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { inferShiftsForSession } = jiti('../lib/session-utils.ts');

const newStart = '2026-09-10T12:30:00.000Z'; // 6:30 AM Guatemala
const end = '2026-09-10T17:51:37.924Z'; // 11:51 AM Guatemala

console.log('Testing inference for Alma with start = 6:30 AM, end = 11:51 AM:');
const shiftsIfAssignedT1T2 = inferShiftsForSession('jue 10', newStart, end, ['T1', 'T2']);
console.log('If assigned [T1, T2]:', shiftsIfAssignedT1T2.map(s => s.shiftKey));

const shiftsIfAssignedT1Only = inferShiftsForSession('jue 10', newStart, end, ['T1']);
console.log('If assigned [T1] only:', shiftsIfAssignedT1Only.map(s => s.shiftKey));
