import 'server-only';

type AuthPhase = 'rateLimit' | 'lookup' | 'finalize';
export type AuthOutcome = 'invalid_input' | 'rate_limited' | 'security_unavailable' |
  'lookup_unavailable' | 'invalid_pin' | 'ambiguous_pin' | 'choose_volunteer' |
  'change_pin' | 'success' | 'error';

// Deliberately accepts no phone, PIN, names, IDs, credentials or query URLs.
export function createAuthTiming(mode: 'selected' | 'phone') {
  const start = performance.now();
  const phases: Partial<Record<AuthPhase, number>> = {};
  return {
    async measure<T>(phase: AuthPhase, work: () => PromiseLike<T>): Promise<T> {
      const phaseStart = performance.now();
      try { return await work(); }
      finally { phases[phase] = Math.round(performance.now() - phaseStart); }
    },
    finish(outcome: AuthOutcome) {
      const totalMs = Math.round(performance.now() - start);
      if (process.env.NODE_ENV === 'development' || totalMs >= 1500) {
        console.info('[AUTH_TIMING]', JSON.stringify({ mode, outcome, totalMs, phases }));
      }
    },
  };
}
