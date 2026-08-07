/**
 * VolunteerDiffBuilder
 *
 * Pure helper responsible for computing field-level diffs between the previous
 * and updated volunteer record. Returns structured data that is stored in
 * `activity_logs.details` as JSON.
 *
 * RULES:
 * - Only compares fields declared in AUDITABLE_FIELDS.
 * - Timestamps, internal flags, and technical columns are invisible to this builder.
 * - Resolves committee_id → committeeName before returning so the audit log is
 *   readable even after data migrations.
 * - Returns an empty array when nothing changed (enables early-exit guard).
 */

export interface VolunteerFieldDiff {
  field: string;
  label: string;
  oldValue: string | number | null;
  newValue: string | number | null;
}

/**
 * Fields included in audit diffs.
 * Any column NOT listed here (updated_at, created_at, last_seen, etc.)
 * is silently ignored by the builder.
 */
export const AUDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'stake',
  'neighborhood',
  'committee_id', // Resolved to committeeName before storing
  'age',
  'status',
  'pin',
] as const;

type AuditableField = (typeof AUDITABLE_FIELDS)[number];

const FIELD_LABELS: Record<AuditableField, string> = {
  first_name:   'Nombre',
  last_name:    'Apellido',
  phone:        'Teléfono',
  stake:        'Estaca',
  neighborhood: 'Barrio',
  committee_id: 'Comité',
  age:          'Edad',
  status:       'Estado',
  pin:          'PIN',
};

export type VolunteerRow = Record<string, any>;

export class VolunteerDiffBuilder {
  /**
   * Computes the list of fields that changed between `previous` and `incoming`.
   *
   * @param previous               - Volunteer record fetched from DB before the update.
   * @param incoming               - New values supplied by the mutation payload.
   * @param committeeNameResolver  - Optional async fn resolving a committee UUID to
   *                                 its display name; enriches committee_id diffs with
   *                                 human-readable names instead of raw UUIDs.
   */
  static async compute(
    previous: VolunteerRow,
    incoming: VolunteerRow,
    committeeNameResolver?: (id: string | null) => Promise<string | null>
  ): Promise<VolunteerFieldDiff[]> {
    const changes: VolunteerFieldDiff[] = [];

    for (const field of AUDITABLE_FIELDS) {
      const oldRaw = previous[field] ?? null;
      const newRaw = incoming[field] ?? null;

      // Skip unchanged values (compare as strings to handle null/undefined uniformly)
      if (String(oldRaw) === String(newRaw)) continue;

      let oldValue: string | number | null = oldRaw;
      let newValue: string | number | null = newRaw;

      // Resolve committee UUID → human-readable name
      if (field === 'committee_id' && committeeNameResolver) {
        oldValue = (await committeeNameResolver(oldRaw)) ?? oldRaw ?? 'Sin comité';
        newValue = (await committeeNameResolver(newRaw)) ?? newRaw ?? 'Sin comité';
      }

      changes.push({
        field,
        label: FIELD_LABELS[field],
        oldValue,
        newValue,
      });
    }

    return changes;
  }
}
