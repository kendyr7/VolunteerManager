import assert from 'node:assert/strict';

const retryPolicyModule = '../lib/whatsapp-retry-policy' + '.ts';
const {
  evaluateWhatsAppRetry,
  WHATSAPP_RETRY_COOLDOWN_MS,
} = await import(retryPolicyModule);

const now = Date.parse('2026-08-12T18:00:00.000Z');
const failedAt = (millisecondsAgo: number) => ({
  delivery_status: 'failed',
  sent_at: new Date(now - millisecondsAgo).toISOString(),
});

assert.deepEqual(evaluateWhatsAppRetry([], now), {
  allowed: false,
  reason: 'no_failed_delivery',
});

assert.deepEqual(evaluateWhatsAppRetry([failedAt(WHATSAPP_RETRY_COOLDOWN_MS + 1)], now), {
  allowed: true,
  attemptNumber: 2,
});

const cooldownDecision = evaluateWhatsAppRetry([failedAt(5_000)], now);
assert.equal(cooldownDecision.allowed, false);
assert.equal(cooldownDecision.reason, 'cooldown');
assert.equal(cooldownDecision.retryAfterSeconds, 25);

assert.deepEqual(evaluateWhatsAppRetry([
  failedAt(40_000),
  failedAt(80_000),
  failedAt(120_000),
], now), {
  allowed: false,
  reason: 'attempt_limit',
});

assert.deepEqual(evaluateWhatsAppRetry([
  { delivery_status: 'delivered', sent_at: new Date(now - 60_000).toISOString() },
  failedAt(120_000),
], now), {
  allowed: false,
  reason: 'no_failed_delivery',
});

console.log('Política de reintentos de WhatsApp verificada: fallo requerido, espera y límite correctos.');
