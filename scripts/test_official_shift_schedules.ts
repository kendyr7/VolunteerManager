import {
  getActiveEventDays,
  getOfficialShiftTime,
  getOfficialShiftTimesList,
  getOperationalEventDays,
  isShiftAvailableForDay,
  isSimulationEventDay,
} from "../lib/dates";

console.log("=== VERIFYING GOAL 1: SINGLE AUTHORITATIVE SOURCE OF TRUTH FOR SHIFTS ===");

const testCases = [
  { dayKey: "sáb 5", shiftKey: "T1", expectedHours: 5, expectedEnd: "2:00 PM", expectedLabel: "9:00 AM - 2:00 PM" },
  { dayKey: "2026-09-05", shiftKey: "T1", expectedHours: 5, expectedEnd: "2:00 PM", expectedLabel: "9:00 AM - 2:00 PM" },
  { dayKey: "jue 10", shiftKey: "T1", expectedHours: 5, expectedEnd: "12:00 PM", expectedLabel: "7:00 AM - 12:00 PM" },
  { dayKey: "jue 10", shiftKey: "T2", expectedHours: 4, expectedEnd: "3:00 PM", expectedLabel: "11:00 AM - 3:00 PM" },
  { dayKey: "jue 10", shiftKey: "T3", expectedHours: 4, expectedEnd: "6:00 PM", expectedLabel: "2:00 PM - 6:00 PM" },
  { dayKey: "jue 10", shiftKey: "T4", expectedHours: 4, expectedEnd: "9:00 PM", expectedLabel: "5:00 PM - 9:00 PM" },

  { dayKey: "vie 11", shiftKey: "T4", expectedHours: 5, expectedEnd: "10:00 PM", expectedLabel: "5:00 PM - 10:00 PM" },
  { dayKey: "sáb 12", shiftKey: "T4", expectedHours: 5, expectedEnd: "10:00 PM", expectedLabel: "5:00 PM - 10:00 PM" },

  { dayKey: "lun 14", shiftKey: "T4", expectedHours: 5, expectedEnd: "10:00 PM", expectedLabel: "5:00 PM - 10:00 PM" },
  { dayKey: "mar 15", shiftKey: "T4", expectedHours: 5, expectedEnd: "10:00 PM", expectedLabel: "5:00 PM - 10:00 PM" },

  { dayKey: "mié 16", shiftKey: "T4", expectedHours: 4, expectedEnd: "9:00 PM", expectedLabel: "5:00 PM - 9:00 PM" },
  { dayKey: "jue 17", shiftKey: "T4", expectedHours: 4, expectedEnd: "9:00 PM", expectedLabel: "5:00 PM - 9:00 PM" },

  { dayKey: "2026-09-10", shiftKey: "T4", expectedHours: 4, expectedEnd: "9:00 PM", expectedLabel: "5:00 PM - 9:00 PM" },
  { dayKey: "2026-09-11", shiftKey: "T4", expectedHours: 5, expectedEnd: "10:00 PM", expectedLabel: "5:00 PM - 10:00 PM" },
  { dayKey: "2026-09-14", shiftKey: "T4", expectedHours: 5, expectedEnd: "10:00 PM", expectedLabel: "5:00 PM - 10:00 PM" },
];

if (!isSimulationEventDay('sáb 5') || !isSimulationEventDay('2026-09-05')) {
  throw new Error('La fecha de simulación debe reconocerse en formato corto e ISO.');
}

if (!isShiftAvailableForDay('sáb 5', 'T1') || isShiftAvailableForDay('sáb 5', 'T2')) {
  throw new Error('La simulación debe permitir únicamente T1.');
}

if (getOfficialShiftTimesList('sáb 5').map(shift => shift.shiftKey).join(',') !== 'T1') {
  throw new Error('La simulación debe exponer un único turno.');
}

if (getActiveEventDays().some(isSimulationEventDay)) {
  throw new Error('Las fechas analíticas oficiales deben excluir la simulación por defecto.');
}

if (!getOperationalEventDays().some(isSimulationEventDay)) {
  throw new Error('Las fechas operativas deben incluir la simulación.');
}

let failed = 0;

for (const tc of testCases) {
  const result = getOfficialShiftTime(tc.dayKey, tc.shiftKey);
  const pass =
    result.hours === tc.expectedHours &&
    result.endTime === tc.expectedEnd &&
    result.timeLabel === tc.expectedLabel;

  if (pass) {
    console.log(`✅ PASSED: ${tc.dayKey} ${tc.shiftKey} -> ${result.timeLabel} (${result.hours}h)`);
  } else {
    failed++;
    console.error(`❌ FAILED: ${tc.dayKey} ${tc.shiftKey}`);
    console.error(`   Expected: ${tc.expectedLabel} (${tc.expectedHours}h), Got: ${result.timeLabel} (${result.hours}h)`);
  }
}

if (failed === 0) {
  console.log("\nALL TEST CASES PASSED SUCCESSFULLY! 🎉");
} else {
  console.error(`\n${failed} TEST CASES FAILED!`);
  process.exit(1);
}
