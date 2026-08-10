import { getOfficialShiftTime, isExtendedShiftDay, getOfficialShiftTimesList } from "../lib/dates";

console.log("=== VERIFYING GOAL 1: SINGLE AUTHORITATIVE SOURCE OF TRUTH FOR SHIFTS ===");

const testCases = [
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
