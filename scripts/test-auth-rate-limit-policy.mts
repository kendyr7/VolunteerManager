import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const policyModule = '../lib/auth-rate-limit-policy' + '.ts';
const {
  AUTH_RATE_LIMITS,
  AUTH_RATE_LIMIT_WINDOW_SECONDS,
} = await import(policyModule) as typeof import('../lib/auth-rate-limit-policy');

assert.equal(AUTH_RATE_LIMIT_WINDOW_SECONDS, 15 * 60);
assert.equal(AUTH_RATE_LIMITS.pinFailuresPerPhone, 6, 'Allow six PIN attempts before blocking.');
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

// Exercise the actual database limiter with the configured budget, locally.
const db = new PGlite();
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const migration = readFileSync(new URL('../supabase/migrations/20261023000000_auth_rate_limits.sql', import.meta.url), 'utf8');
  await db.exec(migration.slice(0, migration.indexOf('-- The legacy table')));
  const consume = () => db.query<{ allowed: boolean; retry_after_seconds: number }>(
    'SELECT * FROM public.consume_auth_rate_limit($1, $2, $3)',
    ['test-login-phone-bucket', AUTH_RATE_LIMITS.pinFailuresPerPhone, AUTH_RATE_LIMIT_WINDOW_SECONDS],
  );
  for (let attempt = 1; attempt <= 6; attempt++) {
    assert.equal((await consume()).rows[0].allowed, true, `PIN attempt ${attempt} must be allowed.`);
  }
  const blocked = (await consume()).rows[0];
  assert.equal(blocked.allowed, false, 'Further PIN attempts must be blocked.');
  assert.ok(blocked.retry_after_seconds > 890 && blocked.retry_after_seconds <= 900);
  await db.exec("UPDATE public.auth_rate_limits SET window_started_at = clock_timestamp() - interval '10 minutes'");
  const remaining = (await consume()).rows[0];
  assert.equal(remaining.allowed, false);
  assert.ok(remaining.retry_after_seconds > 290 && remaining.retry_after_seconds <= 300, 'Retrying must not restart the wait.');
  await db.exec("UPDATE public.auth_rate_limits SET window_started_at = clock_timestamp() - interval '15 minutes'");
  assert.equal((await consume()).rows[0].allowed, true, 'Allow PIN attempts after the window expires.');
} finally {
  await db.close();
}
console.log('Auth rate-limit policy and database checks passed.');
