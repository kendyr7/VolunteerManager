export interface ShiftAreaCarrier {
  area_name?: unknown;
  committee_areas?: unknown;
}

export function getShiftAreaName(shift: ShiftAreaCarrier): string | null {
  if (typeof shift.area_name === 'string' && shift.area_name.trim()) {
    return shift.area_name.trim();
  }

  const relation = shift.committee_areas;
  const relatedArea = Array.isArray(relation) ? relation[0] : relation;
  if (!relatedArea || typeof relatedArea !== 'object' || !('name' in relatedArea)) {
    return null;
  }

  const name = relatedArea.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export function withShiftAreaName<T extends ShiftAreaCarrier>(shift: T): T & { area_name: string | null } {
  return { ...shift, area_name: getShiftAreaName(shift) };
}
