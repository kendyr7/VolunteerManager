export type NamedRelation =
  | { name?: string | null }
  | Array<{ name?: string | null }>
  | null
  | undefined;

/** Normalizes PostgREST relationships across many-to-one and legacy array shapes. */
export function getRelationName(relation: NamedRelation): string | undefined {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.name || undefined;
}
