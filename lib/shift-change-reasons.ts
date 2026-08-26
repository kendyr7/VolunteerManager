export const SHIFT_CHANGE_REASON_OPTIONS = [
  { code: 'work', label: 'Compromiso laboral o académico', icon: 'work' },
  { code: 'health', label: 'Motivo de salud', icon: 'health_and_safety' },
  { code: 'family', label: 'Compromiso o emergencia familiar', icon: 'family_restroom' },
  { code: 'church', label: 'Asignación o responsabilidad de la Iglesia', icon: 'church' },
  { code: 'transport', label: 'Dificultad de transporte', icon: 'directions_car' },
  { code: 'schedule', label: 'Conflicto con otro horario', icon: 'schedule' },
] as const;

export const SHIFT_CHANGE_REASONS: Readonly<Record<string, string>> = Object.fromEntries(
  SHIFT_CHANGE_REASON_OPTIONS.map(({ code, label }) => [code, label])
);

export function isShiftChangeReason(value: string): boolean {
  return SHIFT_CHANGE_REASON_OPTIONS.some(({ label }) => label === value);
}
