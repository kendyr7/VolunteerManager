const assert = require('assert');
const jiti = require('jiti')(__filename);

const {
  isPrematureCheckout,
  needsShortCheckoutConfirmation,
  detectShiftAmbiguity,
  PREMATURE_CHECKOUT_THRESHOLD_MINUTES,
  SHORT_CHECKOUT_WARNING_MINUTES
} = jiti('../lib/session-utils.ts');

console.log('=== RUNNING SCAN PROTECTIONS VERIFICATION TESTS ===\n');

// 1. Verify PREMATURE_CHECKOUT_THRESHOLD_MINUTES is 15
assert.strictEqual(PREMATURE_CHECKOUT_THRESHOLD_MINUTES, 15, 'Premature threshold should be 15 min');
assert.strictEqual(SHORT_CHECKOUT_WARNING_MINUTES, 60, 'Short checkout warning should be 60 min');
console.log('✓ Threshold constants verified');

// 2. Test isPrematureCheckout
const baseTime = new Date('2026-09-10T08:00:00-06:00').getTime();

// 2 minutes later -> premature
assert.strictEqual(isPrematureCheckout(new Date(baseTime), new Date(baseTime + 2 * 60 * 1000)), true, '2 min should be premature');
// 14 minutes later -> premature
assert.strictEqual(isPrematureCheckout(new Date(baseTime), new Date(baseTime + 14 * 60 * 1000)), true, '14 min should be premature');
// 15 minutes later -> NOT premature
assert.strictEqual(isPrematureCheckout(new Date(baseTime), new Date(baseTime + 15 * 60 * 1000)), false, '15 min should not be premature');
// 45 minutes later -> NOT premature
assert.strictEqual(isPrematureCheckout(new Date(baseTime), new Date(baseTime + 45 * 60 * 1000)), false, '45 min should not be premature');
console.log('✓ isPrematureCheckout accurately protects against < 15 min accidental double-scans');

// 3. Test needsShortCheckoutConfirmation
assert.strictEqual(needsShortCheckoutConfirmation(new Date(baseTime), new Date(baseTime + 45 * 60 * 1000)), true, '45 min should trigger short checkout warning (< 60m)');
assert.strictEqual(needsShortCheckoutConfirmation(new Date(baseTime), new Date(baseTime + 65 * 60 * 1000)), false, '65 min should not trigger short checkout warning');
console.log('✓ needsShortCheckoutConfirmation verified');

// 4. Test detectShiftAmbiguity
// Single shift -> no ambiguity
const singleRes = detectShiftAmbiguity('jue 10', 8.0, ['T1']);
assert.strictEqual(singleRes.isAmbiguous, false, 'Single shift should not be ambiguous');
assert.strictEqual(singleRes.options.length, 0);
console.log('✓ Single shift assignment does not trigger ambiguity modal');

// Double shift T1 + T2 at 08:15 AM (start of block)
const doubleStartRes = detectShiftAmbiguity('jue 10', 8.25, ['T1', 'T2']);
assert.strictEqual(doubleStartRes.isAmbiguous, true, 'T1+T2 should be ambiguous');
assert.strictEqual(doubleStartRes.recommendedShiftKey, 'ALL', 'Early arrival for double shift should recommend Jornada Completa (ALL)');
assert.ok(doubleStartRes.options.some(o => o.shiftKey === 'ALL'), 'Options must include ALL');
assert.ok(doubleStartRes.options.some(o => o.shiftKey === 'T1'), 'Options must include T1');
assert.ok(doubleStartRes.options.some(o => o.shiftKey === 'T2'), 'Options must include T2');
console.log('✓ Double shift at start of day recommends Jornada Completa');

// Double shift T1 + T2 at 11:15 AM (transition handover window)
const doubleHandoverRes = detectShiftAmbiguity('jue 10', 11.25, ['T1', 'T2']);
assert.strictEqual(doubleHandoverRes.isAmbiguous, true, 'Handover window should be ambiguous');
assert.strictEqual(doubleHandoverRes.recommendedShiftKey, 'T2', 'Arrival during T2 should recommend T2');
console.log('✓ Handover window (11:15 AM) recommends Turno 2 with options to choose T1 (late) or full block');

console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
