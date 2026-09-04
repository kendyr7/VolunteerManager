import { normalizeSearch } from '@/lib/utils';

export function getShiftCapacityStatus(assigned: number, required: number) {
  if (required <= 0) return 'unconfigured';
  if (assigned >= required) return 'covered';
  return assigned / required >= 0.7 ? 'risk' : 'critical';
}

/** Keep the assignment count and required capacity scoped to the same committees. */
export function getShiftCommitteeScope(
  committeeNames: string[],
  selectedCommittees: string[],
  search: string,
): string[] {
  const selected = new Set(selectedCommittees.map(normalizeSearch));
  const terms = new Set(search.split(',').map(term => normalizeSearch(term.trim())).filter(Boolean));
  const committeeTerms = [...terms].filter(term =>
    committeeNames.some(name => normalizeSearch(name).includes(term))
  );
  return committeeNames.filter(name =>
    (selected.size === 0 || selected.has(normalizeSearch(name)))
    && committeeTerms.every(term => normalizeSearch(name).includes(term))
  );
}
