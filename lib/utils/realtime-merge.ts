export const NULLABLE_FIELDS = new Set([
  'checked_in_at',
  'checked_out_at',
  'checked_in_by',
  'checked_out_by',
  'notes',
  'reason',
  'area_id',
  'updated_by',
  'deleted_at'
]);

/**
 * Single Unified Realtime Merge Utility for all stores and event queues.
 * Prevents partial updates or nulls from overwriting valid domain state flags.
 */
export function mergeRealtimeRecord<T extends object>(
  existing: T | undefined | null,
  incoming: Partial<T> | undefined | null
): T {
  if (!incoming) return (existing || {}) as T;
  if (!existing) return { ...incoming } as T;

  const existingRecord = existing as Record<string, unknown>;
  const incomingRecord = incoming as Record<string, unknown>;
  const merged = { ...existingRecord };

  Object.keys(incomingRecord).forEach(key => {
    const val = incomingRecord[key];
    if (val !== undefined) {
      if (val === null && existingRecord[key] !== undefined && existingRecord[key] !== null) {
        if (NULLABLE_FIELDS.has(key)) {
          merged[key] = null;
        }
      } else {
        merged[key] = val;
      }
    }
  });

  return merged as T;
}
