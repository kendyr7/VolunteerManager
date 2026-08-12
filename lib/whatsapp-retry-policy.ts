export const WHATSAPP_RETRY_COOLDOWN_MS = 30_000;
export const WHATSAPP_MAX_CONSECUTIVE_ATTEMPTS = 3;

export type WhatsAppRetryLog = {
  delivery_status: string | null;
  sent_at: string;
};

export type WhatsAppRetryDecision =
  | { allowed: true; attemptNumber: number }
  | { allowed: false; reason: 'no_failed_delivery' | 'cooldown' | 'attempt_limit'; retryAfterSeconds?: number };

export function evaluateWhatsAppRetry(
  logsNewestFirst: WhatsAppRetryLog[],
  nowMs = Date.now()
): WhatsAppRetryDecision {
  const latest = logsNewestFirst[0];
  if (!latest || latest.delivery_status !== 'failed') {
    return { allowed: false, reason: 'no_failed_delivery' };
  }

  const consecutiveFailures = logsNewestFirst.findIndex(log => log.delivery_status !== 'failed');
  const failedAttempts = consecutiveFailures === -1 ? logsNewestFirst.length : consecutiveFailures;
  if (failedAttempts >= WHATSAPP_MAX_CONSECUTIVE_ATTEMPTS) {
    return { allowed: false, reason: 'attempt_limit' };
  }

  const latestAttemptMs = Date.parse(latest.sent_at);
  if (Number.isFinite(latestAttemptMs)) {
    const remainingMs = WHATSAPP_RETRY_COOLDOWN_MS - (nowMs - latestAttemptMs);
    if (remainingMs > 0) {
      return {
        allowed: false,
        reason: 'cooldown',
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }
  }

  return { allowed: true, attemptNumber: failedAttempts + 1 };
}
