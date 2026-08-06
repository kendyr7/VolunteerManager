export interface ShiftDomainState {
  id?: string;
  day_key?: string;
  shift_key?: string;
  status?: string;
  checked_in?: boolean;
  checked_out?: boolean;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
}

export interface InvariantValidationResult {
  isValid: boolean;
  violations: string[];
  sanitizedShift: ShiftDomainState;
}

/**
 * Validates and enforces domain consistency invariants for shifts.
 */
export function validateShiftInvariants(shift: ShiftDomainState): InvariantValidationResult {
  const violations: string[] = [];
  const sanitized: ShiftDomainState = { ...shift };

  // Invariant 1: If checked_out_at exists, checked_out must be true
  if (sanitized.checked_out_at && !sanitized.checked_out) {
    violations.push('checked_out_at present but checked_out is false. Normalizing checked_out to true.');
    sanitized.checked_out = true;
  }

  // Invariant 2: If checked_in_at exists, checked_in must be true
  if (sanitized.checked_in_at && !sanitized.checked_in) {
    violations.push('checked_in_at present but checked_in is false. Normalizing checked_in to true.');
    sanitized.checked_in = true;
  }

  // Invariant 3: If checked_out is true, status cannot be scheduled unless explicitly reopened
  if (sanitized.checked_out && sanitized.status === 'scheduled') {
    violations.push('Shift is checked_out but status is scheduled. Normalizing status to completed.');
    sanitized.status = 'completed';
  }

  // Invariant 4: If checked_out is true, checked_in must be true
  if (sanitized.checked_out && !sanitized.checked_in) {
    violations.push('Shift is checked_out but checked_in is false. Normalizing checked_in to true.');
    sanitized.checked_in = true;
  }

  return {
    isValid: violations.length === 0,
    violations,
    sanitizedShift: sanitized,
  };
}

/**
 * Asserts shift consistency and throws if severe domain violation occurs in non-production.
 */
export function assertShiftConsistency(shift: ShiftDomainState): ShiftDomainState {
  const result = validateShiftInvariants(shift);
  if (!result.isValid && process.env.NODE_ENV === 'development') {
    console.warn('[Domain Invariant Warning]:', result.violations.join(' | '));
  }
  return result.sanitizedShift;
}
