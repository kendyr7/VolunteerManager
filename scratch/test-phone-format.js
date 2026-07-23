// Verification test for formatE164 and validatePhone8Digits
const { formatE164, validatePhone8Digits } = require('../lib/whatsapp');

console.log("=== RUNNING PHONE FORMATTING & SANITIZATION TESTS ===");

const testCases = [
  { input: "88889999", expectedE164: "+50588889999", isValid: true },
  { input: "8888-9999", expectedE164: "+50588889999", isValid: true },
  { input: " 8888 9999 ", expectedE164: "+50588889999", isValid: true },
  { input: "+505 8888 9999", expectedE164: "+50588889999", isValid: true },
  { input: "+50588889999", expectedE164: "+50588889999", isValid: true },
  { input: "50588889999", expectedE164: "+50588889999", isValid: true },
  { input: "0050588889999", expectedE164: "+50588889999", isValid: true },
  { input: "(505) 8888-9999", expectedE164: "+50588889999", isValid: true },
  { input: "8888999", expectedE164: "+5058888999", isValid: false }, // 7 digits
  { input: "888899999", expectedE164: "+505888899999", isValid: false }, // 9 digits
  { input: "", expectedE164: "", isValid: false },
];

let failed = false;

testCases.forEach(({ input, expectedE164, isValid }, index) => {
  const formatted = formatE164(input);
  const validation = validatePhone8Digits(input);

  const formatMatch = formatted === expectedE164;
  const validMatch = validation.isValid === isValid;

  if (formatMatch && validMatch) {
    console.log(`[PASS] Case ${index + 1}: "${input}" -> E.164: "${formatted}", Valid: ${validation.isValid}`);
  } else {
    failed = true;
    console.error(`[FAIL] Case ${index + 1}: "${input}"`);
    console.error(`       formatE164: got "${formatted}", expected "${expectedE164}"`);
    console.error(`       validatePhone8Digits: got ${validation.isValid}, expected ${isValid}`);
  }
});

if (failed) {
  console.error("❌ Some tests failed.");
  process.exit(1);
} else {
  console.log("✅ All phone formatting and validation tests passed successfully!");
}
