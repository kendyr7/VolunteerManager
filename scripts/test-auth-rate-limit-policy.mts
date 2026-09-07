import assert from 'node:assert/strict';

const policyModule = '../lib/auth-rate-limit-policy' + '.ts';
const {
  AUTH_RATE_LIMITS,
  AUTH_RATE_LIMIT_WINDOW_SECONDS,
} = await import(policyModule) as typeof import('../lib/auth-rate-limit-policy');

assert.equal(AUTH_RATE_LIMIT_WINDOW_SECONDS, 15 * 60);
assert.ok(
  AUTH_RATE_LIMITS.sharedNetworkVolume >= 1_000,
  'A shared event network must allow the full active roster to authenticate.',
);
assert.ok(
  AUTH_RATE_LIMITS.pinFailuresPerPhone < AUTH_RATE_LIMITS.pinFailuresPerNetwork,
  'A single phone must remain more tightly protected than a shared network.',
);
assert.ok(
  AUTH_RATE_LIMITS.unknownPhoneLookupsPerNetwork < AUTH_RATE_LIMITS.sharedNetworkVolume,
  'Unknown-phone enumeration must remain stricter than legitimate shared-network traffic.',
);
assert.ok(AUTH_RATE_LIMITS.profileLookupsPerPhone <= 10);
assert.ok(AUTH_RATE_LIMITS.passkeyOptionsPerPhone <= 10);
assert.ok(
  AUTH_RATE_LIMITS.passkeyFailuresPerNetwork < AUTH_RATE_LIMITS.sharedNetworkVolume,
  'Invalid passkey verification must remain stricter than legitimate shared-network traffic.',
);

console.log('Auth rate-limit policy checks passed.');
