type ShiftAssignmentRecord = {
  id: string;
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  [key: string]: unknown;
};

/** Keep a volunteer's supplied schedule available while the shift-record cache loads. */
export function reconcileVolunteerAssignedShifts(
  volunteerId: string,
  shiftRecords: ShiftAssignmentRecord[],
  shiftsByDay: Record<string, string[]>,
): ShiftAssignmentRecord[] {
  const records = [...shiftRecords];
  const known = new Set(records.map(record => `${String(record.day_key || '').toLowerCase().trim()}|${String(record.shift_key || '').toUpperCase().trim()}`));
  for (const [dayKey, shiftKeys] of Object.entries(shiftsByDay)) {
    for (const shiftKey of shiftKeys) {
      const key = `${dayKey.toLowerCase().trim()}|${shiftKey.toUpperCase().trim()}`;
      if (known.has(key)) continue;
      records.push({ id: `schedule-${volunteerId}-${dayKey}-${shiftKey}`, volunteer_id: volunteerId, day_key: dayKey, shift_key: shiftKey });
      known.add(key);
    }
  }
  return records;
}
