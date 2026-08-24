export interface ShiftAreaCarrier {
  area_name?: unknown;
  area_description?: unknown;
  committee_areas?: unknown;
}

export interface ShiftAreaDetails {
  name: string;
  description: string | null;
}

function getRelatedArea(shift: ShiftAreaCarrier): Record<string, unknown> | null {
  const relation = shift.committee_areas;
  const relatedArea = Array.isArray(relation) ? relation[0] : relation;
  return relatedArea && typeof relatedArea === 'object'
    ? relatedArea as Record<string, unknown>
    : null;
}

export function getShiftAreaName(shift: ShiftAreaCarrier): string | null {
  if (typeof shift.area_name === 'string' && shift.area_name.trim()) {
    return shift.area_name.trim();
  }

  const relatedArea = getRelatedArea(shift);
  if (!relatedArea) return null;

  const name = relatedArea.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export function getShiftAreaDescription(shift: ShiftAreaCarrier): string | null {
  if (typeof shift.area_description === 'string' && shift.area_description.trim()) {
    return shift.area_description.trim();
  }

  const description = getRelatedArea(shift)?.description;
  return typeof description === 'string' && description.trim()
    ? description.trim()
    : null;
}

export function getShiftAreaDetails(shift: ShiftAreaCarrier): ShiftAreaDetails | null {
  const name = getShiftAreaName(shift);
  return name
    ? { name, description: getShiftAreaDescription(shift) }
    : null;
}

export function withShiftAreaDetails<T extends ShiftAreaCarrier>(
  shift: T
): T & { area_name: string | null; area_description: string | null } {
  return {
    ...shift,
    area_name: getShiftAreaName(shift),
    area_description: getShiftAreaDescription(shift),
  };
}

export function withShiftAreaName<T extends ShiftAreaCarrier>(
  shift: T
): T & { area_name: string | null; area_description: string | null } {
  return withShiftAreaDetails(shift);
}
