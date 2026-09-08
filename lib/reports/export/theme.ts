export const REPORT_THEME = {
  font: 'Aptos Narrow',
  colors: {
    primary: '2853B8',
    accent: '4D7CFE',
    ink: '252631',
    muted: '667085',
    headerText: 'FFFFFF',
    softBlue: 'EDF3FF',
    softRow: 'F7F9FC',
    total: 'E8EEFC',
    success: 'DDF3E8',
    warning: 'FFF0CE',
    danger: 'FDE5E9',
    white: 'FFFFFF',
    divider: 'CBD5E1',
  },
} as const;

export const REPORT_SHEETS = {
  summary: 'Resumen',
  history: 'Historial',
  volunteers: 'Horas por voluntario',
  committees: 'Totales por comité',
  recruitment: 'Reclutamiento y edades',
  daily: 'Cobertura por día',
} as const;

export const REPORT_SHEET_ORDER = [
  REPORT_SHEETS.summary,
  REPORT_SHEETS.history,
  REPORT_SHEETS.volunteers,
  REPORT_SHEETS.committees,
  REPORT_SHEETS.recruitment,
  REPORT_SHEETS.daily,
] as const;

export const INTERACTIVE_REPORT_SHEETS = {
  panel: 'Panel interactivo',
  detail: 'Detalle del panel',
  volunteersData: 'Datos voluntarios',
  shiftsData: 'Datos turnos',
  requirements: 'Requerimientos',
  catalogs: 'Catálogos',
  calculations: 'Cálculos',
} as const;

export const INTERACTIVE_REPORT_SHEET_ORDER = [
  INTERACTIVE_REPORT_SHEETS.panel,
  INTERACTIVE_REPORT_SHEETS.detail,
  INTERACTIVE_REPORT_SHEETS.volunteersData,
  INTERACTIVE_REPORT_SHEETS.shiftsData,
  INTERACTIVE_REPORT_SHEETS.requirements,
  INTERACTIVE_REPORT_SHEETS.catalogs,
  INTERACTIVE_REPORT_SHEETS.calculations,
] as const;
