export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

// A venue can legitimately place the full volunteer roster behind one public
// IP. Keep that traffic separate from the much smaller abuse budgets below.
export const AUTH_RATE_LIMITS = {
  sharedNetworkVolume: 1_500,
  pinFailuresPerPhone: 6,
  pinFailuresPerNetwork: 40,
  profileLookupsPerPhone: 10,
  unknownPhoneLookupsPerNetwork: 30,
  passkeyChecksPerPhone: 20,
  passkeyOptionsPerPhone: 10,
  passkeyFailuresPerNetwork: 40,
} as const;
