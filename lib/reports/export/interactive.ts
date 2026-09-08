import type { Cell, Workbook, Worksheet } from 'exceljs';
import { isSimulationEventDay } from '../../dates';
import { filterReportItems, filterReportRequirements } from '../filter';
import type { ReportFilters, ReportItem, ReportShiftStatus } from '@/lib/reports/types';
import {
  loadReportLogoBase64,
  type StaticReportWorkbookInput,
} from './workbook';
import { INTERACTIVE_REPORT_SHEETS, REPORT_THEME } from './theme';

const STATUS_OPTIONS: Array<{ key: ReportShiftStatus; label: string }> = [
  { key: 'confirmed', label: 'Asistió' },
  { key: 'registered', label: 'Pendiente' },
  { key: 'absent', label: 'Ausente' },
  { key: 'replaced', label: 'Reemplazado' },
];

const CATEGORY_MODES = ['Al exportar', 'Todos', 'Un valor'] as const;
const DATE_MODES = ['Al exportar', 'Todas', 'Intervalo'] as const;
const SIMULATION_MODES = ['Al exportar', 'Todos', 'Sin simulación', 'Solo simulación'] as const;

type SelectionKind = 'Comité' | 'Barrio / rama' | 'Estaca' | 'Estado' | 'Fecha';

interface SelectionRow {
  kind: SelectionKind;
  value: string | Date;
  original: 'Sí' | 'No';
}

interface CatalogRange {
  first: number;
  last: number;
  name: string;
}

function safeText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function displayValue(value: string): string {
  return safeText(value) || '(Sin dato)';
}

function toExcelDate(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function originalSelected(values: readonly string[] | undefined, value: string, alternate?: string): 'Sí' | 'No' {
  if (!values?.length) return 'Sí';
  return values.includes(value) || Boolean(alternate && values.includes(alternate)) ? 'Sí' : 'No';
}

function distinct(values: Iterable<string>): string[] {
  return [...new Set([...values].map(safeText))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function styleFont(cell: Cell, options: { bold?: boolean; size?: number; color?: string } = {}) {
  cell.font = {
    name: REPORT_THEME.font,
    size: options.size || 11,
    bold: options.bold,
    color: { argb: options.color || REPORT_THEME.colors.ink },
  };
}

function baseSheet(sheet: Worksheet, widths: number[], frozenRows = 6) {
  sheet.properties.defaultRowHeight = 19;
  sheet.views = [{ state: 'frozen', ySplit: frozenRows, showGridLines: false, zoomScale: 90 }];
  sheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    showGridLines: false,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = '&LReporte de voluntariado&C&P de &N&RGenerado &D';
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function addTitle(sheet: Worksheet, title: string, subtitle: string, lastColumn: number, logoImageId?: number) {
  const textLastColumn = logoImageId == null ? lastColumn : Math.max(1, lastColumn - 1);
  if (textLastColumn > 1) {
    sheet.mergeCells(1, 1, 1, textLastColumn);
    sheet.mergeCells(2, 1, 2, textLastColumn);
  }
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 22;
  sheet.getCell('A1').value = title;
  styleFont(sheet.getCell('A1'), { bold: true, size: 20 });
  sheet.getCell('A2').value = subtitle;
  styleFont(sheet.getCell('A2'), { size: 11, color: REPORT_THEME.colors.muted });
  sheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  if (logoImageId != null) {
    sheet.addImage(logoImageId, {
      tl: { col: Math.max(0, lastColumn - 1.45), row: 0.05 },
      ext: { width: 48, height: 48 },
      editAs: 'oneCell',
    });
  }
}

function writeHeader(sheet: Worksheet, rowNumber: number, headers: string[]) {
  const row = sheet.getRow(rowNumber);
  row.height = 27;
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    styleFont(cell, { bold: true, color: REPORT_THEME.colors.headerText });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.primary } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: REPORT_THEME.colors.accent } } };
  });
}

function styleDataRow(sheet: Worksheet, rowNumber: number, columns: number) {
  const row = sheet.getRow(rowNumber);
  row.height = 20;
  for (let column = 1; column <= columns; column += 1) {
    const cell = row.getCell(column);
    styleFont(cell);
    cell.alignment = { vertical: 'middle' };
    if ((rowNumber - 7) % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softRow } };
    }
  }
}

function inlineValidation(values: readonly string[]) {
  return {
    type: 'list' as const,
    allowBlank: false,
    showErrorMessage: true,
    errorStyle: 'stop' as const,
    errorTitle: 'Valor no válido',
    error: 'Elige una opción de la lista.',
    formulae: [`"${values.join(',')}"`],
  };
}

function selectedLabel(
  kind: SelectionKind,
  rows: SelectionRow[],
  fallback = '',
): string {
  const value = rows.find(row => row.kind === kind && row.original === 'Sí')?.value
    || rows.find(row => row.kind === kind)?.value
    || fallback;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function buildSelections(input: StaticReportWorkbookInput): SelectionRow[] {
  const committees = new Map(input.data.uniqueCommittees.map(value => [value.id, value.name]));
  input.data.volunteers.forEach(value => committees.set(value.committeeId, value.committeeName));
  input.data.items.forEach(value => committees.set(value.committeeId, value.committeeName));

  const neighborhoods = distinct([
    ...input.data.uniqueNeighborhoods,
    ...input.data.volunteers.map(value => value.neighborhood),
    ...input.data.items.map(value => value.neighborhood),
  ]);
  const stakes = distinct([
    ...input.data.uniqueStakes,
    ...input.data.volunteers.map(value => value.stake),
    ...input.data.items.map(value => value.stake),
  ]);
  const dates = distinct([
    ...input.data.eventDays.map(value => value.date),
    ...input.data.requirements.map(value => value.date),
    ...input.data.items.map(value => value.date),
  ]);

  const rows: SelectionRow[] = [];
  [...committees.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es', { sensitivity: 'base' }))
    .forEach(([id, name]) => {
      const original = originalSelected(input.filters.committeeIds, id, name);
      rows.push({ kind: 'Comité', value: name, original });
    });
  neighborhoods.forEach(value => {
    const original = originalSelected(input.filters.neighborhoods, value);
    rows.push({ kind: 'Barrio / rama', value: displayValue(value), original });
  });
  stakes.forEach(value => {
    const original = originalSelected(input.filters.stakes, value);
    rows.push({ kind: 'Estaca', value: displayValue(value), original });
  });
  STATUS_OPTIONS.forEach(({ key, label }) => {
    const original = originalSelected(input.filters.statuses, key);
    rows.push({ kind: 'Estado', value: label, original });
  });
  dates.forEach(value => {
    const original = originalSelected(input.filters.dates, value);
    rows.push({ kind: 'Fecha', value: toExcelDate(value) || value, original });
  });
  return rows;
}

function addVolunteersDataSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.volunteersData, { properties: { tabColor: { argb: REPORT_THEME.colors.divider } } });
  baseSheet(sheet, [29, 10, 18, 22, 23, 25], 6);
  addTitle(sheet, 'Datos de voluntarios', 'Base completa autorizada · Incluye personas que todavía no tienen turnos.', 6, logoImageId);
  sheet.getCell('A4').value = `${input.data.volunteers.length} voluntarios autorizados en esta instantánea`;
  styleFont(sheet.getCell('A4'), { color: REPORT_THEME.colors.muted });
  writeHeader(sheet, 6, ['Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité']);
  input.data.volunteers.forEach((volunteer, index) => {
    const rowNumber = index + 7;
    sheet.getRow(rowNumber).values = [
      safeText(volunteer.name), volunteer.age, safeText(volunteer.phone), displayValue(volunteer.neighborhood),
      displayValue(volunteer.stake), safeText(volunteer.committeeName),
    ];
    styleDataRow(sheet, rowNumber, 6);
  });
  const lastRow = Math.max(7, input.data.volunteers.length + 6);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: 6 } };
}

function addShiftsDataSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.shiftsData, { properties: { tabColor: { argb: REPORT_THEME.colors.divider } } });
  baseSheet(sheet, [29, 9, 18, 22, 22, 25, 25, 16, 10, 17, 16], 6);
  addTitle(sheet, 'Datos de turnos', 'Base completa autorizada · Los filtros del encabezado sirven solamente para inspeccionar estas filas.', 11, logoImageId);
  sheet.getCell('A4').value = `${input.data.items.length} asignaciones autorizadas en esta instantánea`;
  styleFont(sheet.getCell('A4'), { color: REPORT_THEME.colors.muted });
  writeHeader(sheet, 6, [
    'Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité',
    'Área asignada', 'Fecha', 'Turno', 'Estado', 'Minutos servidos',
  ]);
  const statusLabels = new Map(STATUS_OPTIONS.map(value => [value.key, value.label]));
  input.data.items.forEach((item, index) => {
    const rowNumber = index + 7;
    sheet.getRow(rowNumber).values = [
      safeText(item.volunteerName), item.age, safeText(item.phone), displayValue(item.neighborhood),
      displayValue(item.stake), safeText(item.committeeName), safeText(item.areaName || 'Sin área asignada'),
      toExcelDate(item.date), `T${item.shiftNumber}`, statusLabels.get(item.status) || item.status, item.durationMinutes,
    ];
    styleDataRow(sheet, rowNumber, 11);
    sheet.getCell(rowNumber, 8).numFmt = 'dd mmm yyyy';
    sheet.getCell(rowNumber, 11).numFmt = '#,##0';
  });
  const lastRow = Math.max(7, input.data.items.length + 6);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: 11 } };
}

function addRequirementsSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.requirements, { properties: { tabColor: { argb: REPORT_THEME.colors.divider } } });
  baseSheet(sheet, [27, 16, 11, 14], 6);
  addTitle(sheet, 'Requerimientos', 'Metas operativas completas autorizadas por comité, fecha y turno.', 4, logoImageId);
  sheet.getCell('A4').value = `${input.data.requirements.length} metas en esta instantánea`;
  styleFont(sheet.getCell('A4'), { color: REPORT_THEME.colors.muted });
  writeHeader(sheet, 6, ['Comité', 'Fecha', 'Turno', 'Requeridos']);
  const committeeNames = new Map(input.data.uniqueCommittees.map(value => [value.id, value.name]));
  input.data.requirements.forEach((requirement, index) => {
    const rowNumber = index + 7;
    sheet.getRow(rowNumber).values = [
      safeText(committeeNames.get(requirement.committeeId) || requirement.committeeId),
      toExcelDate(requirement.date), safeText(requirement.shiftKey), requirement.required,
    ];
    styleDataRow(sheet, rowNumber, 4);
    sheet.getCell(rowNumber, 2).numFmt = 'dd mmm yyyy';
  });
  const lastRow = Math.max(7, input.data.requirements.length + 6);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: 4 } };
}

function addCatalogsSheet(workbook: Workbook, rows: SelectionRow[]): Record<SelectionKind, CatalogRange> {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.catalogs);
  baseSheet(sheet, [24, 34, 16], 1);
  sheet.state = 'hidden';
  writeHeader(sheet, 1, ['Catálogo', 'Valor', 'Al exportar']);
  const ranges = {} as Record<SelectionKind, CatalogRange>;
  let rowNumber = 2;
  const kinds: SelectionKind[] = ['Comité', 'Barrio / rama', 'Estaca', 'Estado', 'Fecha'];
  kinds.forEach((kind, index) => {
    const options = rows.filter(row => row.kind === kind);
    const first = rowNumber;
    options.forEach(option => {
      sheet.getCell(rowNumber, 1).value = kind;
      sheet.getCell(rowNumber, 2).value = option.value;
      sheet.getCell(rowNumber, 3).value = option.original;
      if (option.kind === 'Fecha') sheet.getCell(rowNumber, 2).numFmt = 'dd mmm yyyy';
      styleFont(sheet.getCell(rowNumber, 1));
      styleFont(sheet.getCell(rowNumber, 2));
      styleFont(sheet.getCell(rowNumber, 3));
      rowNumber += 1;
    });
    if (options.length === 0) {
      sheet.getCell(rowNumber, 1).value = kind;
      sheet.getCell(rowNumber, 2).value = '(Sin opciones)';
      rowNumber += 1;
    }
    const last = rowNumber - 1;
    const name = `OpcionesPanel${index + 1}`;
    workbook.definedNames.add(`'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$B$${first}:$B$${last}`, name);
    ranges[kind] = { first, last, name };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  return ranges;
}

function controlCell(cell: Cell) {
  styleFont(cell, { bold: true, color: REPORT_THEME.colors.primary });
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softBlue } };
  cell.alignment = { vertical: 'middle' };
  cell.border = { bottom: { style: 'thin', color: { argb: REPORT_THEME.colors.accent } } };
}

function addPanelSheet(
  workbook: Workbook,
  input: StaticReportWorkbookInput,
  rows: SelectionRow[],
  catalogRanges: Record<SelectionKind, CatalogRange>,
  logoImageId?: number,
) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.panel, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  baseSheet(sheet, [4, 28, 24, 25, 18, 24, 18, 18, 18, 4], 6);
  sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false, zoomScale: 90 }];
  addTitle(sheet, 'Panel interactivo', 'Cambia las celdas azules. El panel se recalcula en Microsoft Excel 365 sin macros ni conexiones externas.', 10, logoImageId);
  sheet.mergeCells('B4:I4');
  sheet.getCell('B4').value = 'Base del panel: todos los datos que este usuario tenía autorización para consultar al generar el archivo.';
  styleFont(sheet.getCell('B4'), { color: REPORT_THEME.colors.muted });
  sheet.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softBlue } };

  sheet.mergeCells('B6:F6');
  sheet.getCell('B6').value = 'CONTROLES DEL PANEL';
  styleFont(sheet.getCell('B6'), { bold: true, color: REPORT_THEME.colors.primary });
  const labels = [
    ['Comité', 'Al exportar', selectedLabel('Comité', rows)],
    ['Barrio / rama', 'Al exportar', selectedLabel('Barrio / rama', rows)],
    ['Estaca', 'Al exportar', selectedLabel('Estaca', rows)],
    ['Estado', 'Al exportar', selectedLabel('Estado', rows)],
    ['Fechas', 'Al exportar', ''],
    ['Simulación', input.includeSimulation ? 'Al exportar' : 'No disponible en este archivo', ''],
  ];
  labels.forEach(([label, mode, value], index) => {
    const rowNumber = index + 7;
    sheet.getCell(rowNumber, 2).value = label;
    styleFont(sheet.getCell(rowNumber, 2), { bold: true });
    sheet.getCell(rowNumber, 3).value = mode;
    controlCell(sheet.getCell(rowNumber, 3));
    sheet.getCell(rowNumber, 4).value = value;
    if (index < 5) controlCell(sheet.getCell(rowNumber, 4));
  });

  for (const rowNumber of [7, 8, 9, 10]) sheet.getCell(rowNumber, 3).dataValidation = inlineValidation(CATEGORY_MODES);
  sheet.getCell('C11').dataValidation = inlineValidation(DATE_MODES);
  if (input.includeSimulation) sheet.getCell('C12').dataValidation = inlineValidation(SIMULATION_MODES);
  sheet.getCell('D7').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges['Comité'].name}`] };
  sheet.getCell('D8').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges['Barrio / rama'].name}`] };
  sheet.getCell('D9').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges.Estaca.name}`] };
  sheet.getCell('D10').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges.Estado.name}`] };

  const dates = rows.filter(row => row.kind === 'Fecha');
  sheet.getCell('D11').value = dates.find(row => row.original === 'Sí')?.value || dates[0]?.value || null;
  sheet.getCell('E11').value = [...dates].reverse().find(row => row.original === 'Sí')?.value || dates.at(-1)?.value || null;
  for (const address of ['D11', 'E11']) {
    controlCell(sheet.getCell(address));
    sheet.getCell(address).numFmt = 'dd mmm yyyy';
    sheet.getCell(address).dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges.Fecha.name}`] };
  }

  sheet.mergeCells('B14:F14');
  sheet.getCell('B14').value = 'RESULTADO DE LOS CONTROLES';
  styleFont(sheet.getCell('B14'), { bold: true, color: REPORT_THEME.colors.primary });
  const reqEnd = Math.max(7, input.data.requirements.length + 6);
  const calculationShiftEnd = Math.max(5, input.data.items.length + 4);
  const calculationRequirementEnd = Math.max(5, input.data.requirements.length + 4);
  const panelFilters: ReportFilters = { ...input.filters, search: '' };
  const filteredItems = filterReportItems(input.data.items, panelFilters);
  const committeeNames = new Map(input.data.uniqueCommittees.map(value => [value.id, value.name]));
  const filteredRequirements = filterReportRequirements(input.data.requirements, panelFilters, committeeNames);
  const metricRows = [
    ['Turnos coincidentes', `SUM('${INTERACTIVE_REPORT_SHEETS.calculations}'!$I$5:$I$${calculationShiftEnd})`, filteredItems.length, 'Asignaciones que cumplen los controles'],
    ['Voluntarios con turnos coincidentes', `IF(SUM('${INTERACTIVE_REPORT_SHEETS.calculations}'!$I$5:$I$${calculationShiftEnd})=0,0,IFERROR(ROWS(UNIQUE(FILTER('${INTERACTIVE_REPORT_SHEETS.calculations}'!$A$5:$A$${calculationShiftEnd},'${INTERACTIVE_REPORT_SHEETS.calculations}'!$I$5:$I$${calculationShiftEnd}=1))),0))`, new Set(filteredItems.map(item => item.volunteerId)).size, 'Personas únicas dentro de esos turnos'],
    ['Cupos requeridos', `SUMPRODUCT('${INTERACTIVE_REPORT_SHEETS.requirements}'!$D$7:$D$${reqEnd},'${INTERACTIVE_REPORT_SHEETS.calculations}'!$Q$5:$Q$${calculationRequirementEnd})`, filteredRequirements.reduce((sum, item) => sum + item.required, 0), 'La meta depende de comité y fecha'],
  ] as const;
  writeHeader(sheet, 16, ['', 'Indicador', 'Resultado', 'Definición']);
  metricRows.forEach(([label, formula, result, description], index) => {
    const rowNumber = index + 17;
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = { formula, result };
    sheet.getCell(rowNumber, 4).value = description;
    styleFont(sheet.getCell(rowNumber, 2), { bold: true });
    styleFont(sheet.getCell(rowNumber, 3), { bold: true, size: 16, color: REPORT_THEME.colors.primary });
    styleFont(sheet.getCell(rowNumber, 4), { color: REPORT_THEME.colors.muted });
  });
  sheet.mergeCells('B21:I21');
  sheet.getCell('B21').value = '“Detalle del panel” se actualiza automáticamente al cambiar cualquiera de los desplegables.';
  styleFont(sheet.getCell('B21'), { color: REPORT_THEME.colors.muted });
  sheet.mergeCells('B23:I23');
  sheet.getCell('B23').value = 'El reporte fijo de seis hojas se exporta como archivo separado.';
  styleFont(sheet.getCell('B23'), { color: REPORT_THEME.colors.muted });
  sheet.pageSetup.printArea = 'A1:J25';
}

function selectionFormula(
  kind: SelectionKind,
  dataKeyRef: string,
  panelModeCell: string,
  panelValueCell: string,
  catalogEnd: number,
): string {
  const catalogKinds = `'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$A$2:$A$${catalogEnd}`;
  const catalogValues = `'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$B$2:$B$${catalogEnd}`;
  const original = `'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$C$2:$C$${catalogEnd}`;
  const originalMatch = `--(COUNTIFS(${catalogKinds},"${kind}",${catalogValues},${dataKeyRef},${original},"Sí")>0)`;
  const singleMatch = `--(${dataKeyRef}=${panelValueCell})`;
  return `IF(${panelModeCell}="Todos",1,IF(${panelModeCell}="Un valor",${singleMatch},${originalMatch}))`;
}

function dateFormula(dataDateRef: string, catalogEnd: number): string {
  const catalogKinds = `'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$A$2:$A$${catalogEnd}`;
  const catalogValues = `'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$B$2:$B$${catalogEnd}`;
  const original = `'${INTERACTIVE_REPORT_SHEETS.catalogs}'!$C$2:$C$${catalogEnd}`;
  const originalMatch = `--(COUNTIFS(${catalogKinds},"Fecha",${catalogValues},${dataDateRef},${original},"Sí")>0)`;
  return `IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$11="Todas",1,IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$11="Intervalo",--(AND(${dataDateRef}>='${INTERACTIVE_REPORT_SHEETS.panel}'!$D$11,${dataDateRef}<='${INTERACTIVE_REPORT_SHEETS.panel}'!$E$11)),${originalMatch}))`;
}

function simulationFormula(dataSimulationRef: string, includeSimulation: boolean): string {
  if (!includeSimulation) return '1';
  return `IF(OR('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$12="Al exportar",'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$12="Todos"),1,IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$12="Solo simulación",--(${dataSimulationRef}="Sí"),--(${dataSimulationRef}="No")))`;
}

function originalDimensionMatch(filters: ReportFilters, item: ReportItem) {
  return {
    committee: originalSelected(filters.committeeIds, item.committeeId, item.committeeName) === 'Sí' ? 1 : 0,
    neighborhood: originalSelected(filters.neighborhoods, item.neighborhood) === 'Sí' ? 1 : 0,
    stake: originalSelected(filters.stakes, item.stake) === 'Sí' ? 1 : 0,
    status: originalSelected(filters.statuses, item.status) === 'Sí' ? 1 : 0,
    date: originalSelected(filters.dates, item.date) === 'Sí' ? 1 : 0,
  };
}

function addCalculationsSheet(workbook: Workbook, input: StaticReportWorkbookInput, selections: SelectionRow[]) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.calculations);
  baseSheet(sheet, [23, 15, 15, 15, 15, 15, 13, 15, 13, 4, 23, 16, 13, 15, 15, 15, 13], 4);
  sheet.state = 'hidden';
  writeHeader(sheet, 4, [
    'Voluntario ID', 'Comité', 'Barrio', 'Estaca', 'Estado', 'Fecha', 'Es simulación', 'Simulación coincide', 'Coincide', '',
    'Comité', 'Fecha', 'Es simulación', 'Comité coincide', 'Fecha coincide', 'Simulación coincide', 'Meta coincide',
  ]);
  const catalogEnd = Math.max(2, selections.length + 1);
  const panelFilters: ReportFilters = { ...input.filters, search: '' };
  const filteredRegistrationIds = new Set(filterReportItems(input.data.items, panelFilters).map(item => item.registrationId));
  input.data.items.forEach((item, index) => {
    const rowNumber = index + 5;
    const dataRow = index + 7;
    const initial = originalDimensionMatch(input.filters, item);
    const values = [
      safeText(item.volunteerId),
      { formula: selectionFormula('Comité', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$F$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$7`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$7`, catalogEnd), result: initial.committee },
      { formula: selectionFormula('Barrio / rama', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$D$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$8`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$8`, catalogEnd), result: initial.neighborhood },
      { formula: selectionFormula('Estaca', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$E$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$9`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$9`, catalogEnd), result: initial.stake },
      { formula: selectionFormula('Estado', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$J$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$10`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$10`, catalogEnd), result: initial.status },
      { formula: dateFormula(`'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$H$${dataRow}`, catalogEnd), result: initial.date },
      isSimulationEventDay(item.date) ? 'Sí' : 'No',
      { formula: simulationFormula(`$G${rowNumber}`, input.includeSimulation), result: 1 },
      { formula: `PRODUCT(B${rowNumber}:F${rowNumber},H${rowNumber})`, result: filteredRegistrationIds.has(item.registrationId) ? 1 : 0 },
    ];
    sheet.getRow(rowNumber).values = values;
    styleDataRow(sheet, rowNumber, 9);
  });

  const committeeNames = new Map(input.data.uniqueCommittees.map(value => [value.id, value.name]));
  const filteredRequirements = new Set(
    filterReportRequirements(input.data.requirements, panelFilters, committeeNames)
      .map(value => `${value.committeeId}|${value.date}|${value.shiftKey}`),
  );
  input.data.requirements.forEach((requirement, index) => {
    const rowNumber = index + 5;
    const dataRow = index + 7;
    const committee = originalSelected(input.filters.committeeIds, requirement.committeeId, committeeNames.get(requirement.committeeId)) === 'Sí' ? 1 : 0;
    const date = originalSelected(input.filters.dates, requirement.date) === 'Sí' ? 1 : 0;
    sheet.getCell(rowNumber, 11).value = safeText(committeeNames.get(requirement.committeeId) || requirement.committeeId);
    sheet.getCell(rowNumber, 12).value = toExcelDate(requirement.date);
    sheet.getCell(rowNumber, 12).numFmt = 'dd mmm yyyy';
    sheet.getCell(rowNumber, 13).value = isSimulationEventDay(requirement.date) ? 'Sí' : 'No';
    sheet.getCell(rowNumber, 14).value = {
      formula: selectionFormula('Comité', `'${INTERACTIVE_REPORT_SHEETS.requirements}'!$A$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$7`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$7`, catalogEnd),
      result: committee,
    };
    sheet.getCell(rowNumber, 15).value = { formula: dateFormula(`'${INTERACTIVE_REPORT_SHEETS.requirements}'!$B$${dataRow}`, catalogEnd), result: date };
    sheet.getCell(rowNumber, 16).value = { formula: simulationFormula(`$M${rowNumber}`, input.includeSimulation), result: 1 };
    sheet.getCell(rowNumber, 17).value = {
      formula: `PRODUCT(N${rowNumber}:P${rowNumber})`,
      result: filteredRequirements.has(`${requirement.committeeId}|${requirement.date}|${requirement.shiftKey}`) ? 1 : 0,
    };
    for (let column = 11; column <= 17; column += 1) styleFont(sheet.getCell(rowNumber, column));
  });
}

function addDetailSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.detail, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  baseSheet(sheet, [29, 9, 18, 22, 22, 25, 25, 16, 10, 17, 16], 6);
  addTitle(sheet, 'Detalle del panel', 'Se actualiza automáticamente con los desplegables del Panel interactivo.', 11, logoImageId);
  writeHeader(sheet, 6, [
    'Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité',
    'Área asignada', 'Fecha', 'Turno', 'Estado', 'Minutos servidos',
  ]);
  const shiftEnd = Math.max(7, input.data.items.length + 6);
  const calcEnd = Math.max(5, input.data.items.length + 4);
  sheet.getCell('A7').value = {
    formula: `FILTER('${INTERACTIVE_REPORT_SHEETS.shiftsData}'!A7:K${shiftEnd},'${INTERACTIVE_REPORT_SHEETS.calculations}'!I5:I${calcEnd}=1,"Sin registros")`,
    result: input.data.items.length ? 'Excel 365 recalculará este detalle al abrir el archivo' : 'Sin registros',
  };
  styleFont(sheet.getCell('A7'), { color: REPORT_THEME.colors.muted });
  sheet.getCell('H7').numFmt = 'dd mmm yyyy';
}

function makeDownload(workbook: Workbook, generatedAt: Date, prefix: string): Promise<string> {
  return workbook.xlsx.writeBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const date = generatedAt.toISOString().slice(0, 10);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(generatedAt).replace(':', '-');
    const filename = `${prefix}_${date}_${time}.xlsx`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  });
}

export async function buildInteractiveReportWorkbook(input: StaticReportWorkbookInput): Promise<Workbook> {
  const logoBase64 = input.logoBase64 === undefined ? await loadReportLogoBase64() : input.logoBase64;
  const { Workbook: ExcelWorkbook } = await import('exceljs');
  const workbook = new ExcelWorkbook();
  workbook.creator = 'VolunteerManager';
  workbook.lastModifiedBy = 'VolunteerManager';
  workbook.created = input.generatedAt || new Date();
  workbook.modified = input.generatedAt || new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.views = [{ x: 0, y: 0, width: 12000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  const logoImageId = logoBase64 ? workbook.addImage({ base64: logoBase64, extension: 'png' }) : undefined;
  const selections = buildSelections(input);

  addVolunteersDataSheet(workbook, input, logoImageId);
  addShiftsDataSheet(workbook, input, logoImageId);
  addRequirementsSheet(workbook, input, logoImageId);
  const catalogRanges = addCatalogsSheet(workbook, selections);
  addPanelSheet(workbook, input, selections, catalogRanges, logoImageId);
  addCalculationsSheet(workbook, input, selections);
  addDetailSheet(workbook, input, logoImageId);

  const order = [
    INTERACTIVE_REPORT_SHEETS.panel, INTERACTIVE_REPORT_SHEETS.detail,
    INTERACTIVE_REPORT_SHEETS.volunteersData, INTERACTIVE_REPORT_SHEETS.shiftsData, INTERACTIVE_REPORT_SHEETS.requirements,
    INTERACTIVE_REPORT_SHEETS.catalogs, INTERACTIVE_REPORT_SHEETS.calculations,
  ];
  order.forEach((name, index) => {
    const sheet = workbook.getWorksheet(name);
    if (sheet) (sheet as Worksheet & { orderNo: number }).orderNo = index;
  });
  return workbook;
}

export async function downloadInteractiveReportWorkbook(input: StaticReportWorkbookInput): Promise<string> {
  const workbook = await buildInteractiveReportWorkbook(input);
  return makeDownload(workbook, input.generatedAt || new Date(), 'reporte_interactivo_voluntariado');
}
