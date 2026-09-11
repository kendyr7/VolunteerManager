import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/audit-results.json', 'utf8'));
const multi = data.multipleShiftsMarked;

console.log(`Total multi-shift completed cases: ${multi.length}`);

// Group by pattern
const veryShort = []; // < 15 min
const short = []; // 15 min to 180 min (< 3 hours)
const singleShiftLength = []; // 3h to 5h (enough for 1 shift, but not 2 full shifts)
const fullMultiShift = []; // > 5h (truly worked multiple shifts)

multi.forEach(item => {
  const m = item.durMins;
  if (m < 15) veryShort.push(item);
  else if (m < 180) short.push(item);
  else if (m <= 330) singleShiftLength.push(item);
  else fullMultiShift.push(item);
});

console.log(`\n1. Extremadamente cortas (< 15 min): ${veryShort.length}`);
veryShort.forEach(s => {
  console.log(`  - ${s.name} (${s.phone}) | ${s.dayKey} | ${s.startGt} -> ${s.endGt} (${s.durMins} min) | Asignados: [${s.assignedShifts.join(',')}] | Completados en UI: [${s.inferredCompletedShifts.join(',')}]`);
});

console.log(`\n2. Cortas (< 3 horas, pero les marca 2 turnos de 4-5h): ${short.length}`);
short.forEach(s => {
  console.log(`  - ${s.name} (${s.phone}) | ${s.dayKey} | ${s.startGt} -> ${s.endGt} (${s.durMins} min) | Asignados: [${s.assignedShifts.join(',')}] | Completados en UI: [${s.inferredCompletedShifts.join(',')}]`);
});

console.log(`\n3. Duración de 1 turno (~3.5h - 5.5h) pero marca 2 o más turnos por solapamiento: ${singleShiftLength.length}`);
singleShiftLength.forEach(s => {
  console.log(`  - ${s.name} (${s.phone}) | ${s.dayKey} | ${s.startGt} -> ${s.endGt} (${s.durMins} min) | Asignados: [${s.assignedShifts.join(',')}] | Completados en UI: [${s.inferredCompletedShifts.join(',')}]`);
});

console.log(`\n4. Turnos largos legítimos (> 5.5h): ${fullMultiShift.length}`);
