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
export function mergeRealtimeRecord<T extends Record<string, any>>(
  existing: T | undefined | null,
  incoming: Partial<T> | undefined | null
): T {
  if (!incoming) return (existing || {}) as T;
  if (!existing) return { ...incoming } as T;

  const merged = { ...existing } as Record<string, any>;

  Object.keys(incoming).forEach(key => {
    const val = incoming[key];
    if (val !== undefined) {
      if (val === null && existing[key] !== undefined && existing[key] !== null) {
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
