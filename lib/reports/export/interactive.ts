import type { Cell, Workbook, Worksheet } from 'exceljs';
import { isSimulationEventDay } from '../../dates';
import { filterReportItems, filterReportRequirements } from '../filter';
import type { ReportFilters, ReportItem, ReportShiftStatus } from '@/lib/reports/types';
import {
  buildStaticReportWorkbook,
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

const CATEGORY_MODES = ['Al exportar', 'Todos', 'Un valor', 'Selección múltiple'] as const;
const DATE_MODES = ['Al exportar', 'Todas', 'Intervalo', 'Fechas seleccionadas'] as const;
const SEARCH_MODES = ['Al exportar', 'Sin búsqueda', 'Personalizada'] as const;
const SIMULATION_MODES = ['Al exportar', 'Todos', 'Sin simulación', 'Solo simulación'] as const;

type SelectionKind = 'Comité' | 'Barrio / rama' | 'Estaca' | 'Estado' | 'Fecha';

interface SelectionRow {
  kind: SelectionKind;
  key: string | Date;
  label: string;
  original: 'Sí' | 'No';
  custom: 'Sí' | 'No';
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

function normalize(value: string): string {
  return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
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
  return rows.find(row => row.kind === kind && row.original === 'Sí')?.label || rows.find(row => row.kind === kind)?.label || fallback;
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
      rows.push({ kind: 'Comité', key: id, label: name, original, custom: original });
    });
  neighborhoods.forEach(value => {
    const original = originalSelected(input.filters.neighborhoods, value);
    rows.push({ kind: 'Barrio / rama', key: displayValue(value), label: displayValue(value), original, custom: original });
  });
  stakes.forEach(value => {
    const original = originalSelected(input.filters.stakes, value);
    rows.push({ kind: 'Estaca', key: displayValue(value), label: displayValue(value), original, custom: original });
  });
  STATUS_OPTIONS.forEach(({ key, label }) => {
    const original = originalSelected(input.filters.statuses, key);
    rows.push({ kind: 'Estado', key, label, original, custom: original });
  });
  dates.forEach(value => {
    const original = originalSelected(input.filters.dates, value);
    rows.push({ kind: 'Fecha', key: toExcelDate(value) || value, label: value, original, custom: original });
  });
  return rows;
}

function addSelectionsSheet(workbook: Workbook, input: StaticReportWorkbookInput, rows: SelectionRow[], logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.selections, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  baseSheet(sheet, [18, 22, 30, 16, 18, 46], 5);
  addTitle(
    sheet,
    'Selecciones múltiples',
    'Edita solamente la columna azul “Incluir personalizado”. Después elige “Personalizados” en el Panel.',
    6,
    logoImageId,
  );
  writeHeader(sheet, 5, ['Dimensión', 'Clave', 'Valor', 'Al exportar', 'Incluir personalizado', 'Uso']);
  rows.forEach((selection, index) => {
    const rowNumber = index + 6;
    const row = sheet.getRow(rowNumber);
    row.values = [selection.kind, selection.key, selection.label, selection.original, selection.custom, 'Se usa con el modo “Selección múltiple” o “Fechas seleccionadas”.'];
    styleDataRow(sheet, rowNumber, 6);
    if (selection.kind === 'Fecha') sheet.getCell(rowNumber, 2).numFmt = 'dd mmm yyyy';
    const editable = sheet.getCell(rowNumber, 5);
    editable.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softBlue } };
    editable.font = { name: REPORT_THEME.font, size: 11, bold: true, color: { argb: REPORT_THEME.colors.primary } };
    editable.dataValidation = inlineValidation(['Sí', 'No']);
  });
  const lastRow = Math.max(6, rows.length + 5);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastRow, column: 6 } };
  sheet.pageSetup.printArea = `A1:F${lastRow}`;
}

function addVolunteersDataSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.volunteersData, { properties: { tabColor: { argb: REPORT_THEME.colors.divider } } });
  baseSheet(sheet, [20, 29, 10, 18, 22, 23, 22, 25], 6);
  addTitle(sheet, 'Datos de voluntarios', 'Base completa autorizada · Incluye personas que todavía no tienen turnos.', 8, logoImageId);
  sheet.getCell('A4').value = `${input.data.volunteers.length} voluntarios autorizados en esta instantánea`;
  styleFont(sheet.getCell('A4'), { color: REPORT_THEME.colors.muted });
  writeHeader(sheet, 6, ['Voluntario ID', 'Nombre', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité ID', 'Comité']);
  input.data.volunteers.forEach((volunteer, index) => {
    const rowNumber = index + 7;
    sheet.getRow(rowNumber).values = [
      safeText(volunteer.id), safeText(volunteer.name), volunteer.age, safeText(volunteer.phone),
      displayValue(volunteer.neighborhood), displayValue(volunteer.stake), safeText(volunteer.committeeId), safeText(volunteer.committeeName),
    ];
    styleDataRow(sheet, rowNumber, 8);
  });
  const lastRow = Math.max(7, input.data.volunteers.length + 6);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: 8 } };
}

function addShiftsDataSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.shiftsData, { properties: { tabColor: { argb: REPORT_THEME.colors.divider } } });
  baseSheet(sheet, [22, 20, 29, 9, 18, 22, 22, 22, 25, 16, 10, 16, 17, 16, 13, 50], 6);
  addTitle(sheet, 'Datos de turnos', 'Base completa autorizada · Los filtros del encabezado sirven solamente para inspeccionar estas filas.', 16, logoImageId);
  sheet.getCell('A4').value = `${input.data.items.length} asignaciones autorizadas en esta instantánea`;
  styleFont(sheet.getCell('A4'), { color: REPORT_THEME.colors.muted });
  writeHeader(sheet, 6, [
    'Registro ID', 'Voluntario ID', 'Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité ID', 'Comité',
    'Fecha', 'Turno', 'Estado clave', 'Estado', 'Minutos servidos', 'Simulación', 'Búsqueda normalizada',
  ]);
  const statusLabels = new Map(STATUS_OPTIONS.map(value => [value.key, value.label]));
  input.data.items.forEach((item, index) => {
    const rowNumber = index + 7;
    const haystack = normalize([
      item.volunteerName, item.phone, item.neighborhood, item.stake, item.committeeName, item.committeeId,
    ].join(' '));
    sheet.getRow(rowNumber).values = [
      safeText(item.registrationId), safeText(item.volunteerId), safeText(item.volunteerName), item.age, safeText(item.phone),
      displayValue(item.neighborhood), displayValue(item.stake), safeText(item.committeeId), safeText(item.committeeName),
      toExcelDate(item.date), `T${item.shiftNumber}`, item.status, statusLabels.get(item.status) || item.status,
      item.durationMinutes, isSimulationEventDay(item.date) ? 'Sí' : 'No', haystack,
    ];
    styleDataRow(sheet, rowNumber, 16);
    sheet.getCell(rowNumber, 10).numFmt = 'dd mmm yyyy';
    sheet.getCell(rowNumber, 14).numFmt = '#,##0';
  });
  const lastRow = Math.max(7, input.data.items.length + 6);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: 16 } };
}

function addRequirementsSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.requirements, { properties: { tabColor: { argb: REPORT_THEME.colors.divider } } });
  baseSheet(sheet, [22, 27, 16, 11, 14, 13], 6);
  addTitle(sheet, 'Requerimientos', 'Metas operativas completas autorizadas por comité, fecha y turno.', 6, logoImageId);
  sheet.getCell('A4').value = `${input.data.requirements.length} metas en esta instantánea`;
  styleFont(sheet.getCell('A4'), { color: REPORT_THEME.colors.muted });
  writeHeader(sheet, 6, ['Comité ID', 'Comité', 'Fecha', 'Turno', 'Requeridos', 'Simulación']);
  const committeeNames = new Map(input.data.uniqueCommittees.map(value => [value.id, value.name]));
  input.data.requirements.forEach((requirement, index) => {
    const rowNumber = index + 7;
    sheet.getRow(rowNumber).values = [
      safeText(requirement.committeeId), safeText(committeeNames.get(requirement.committeeId) || requirement.committeeId),
      toExcelDate(requirement.date), safeText(requirement.shiftKey), requirement.required,
      isSimulationEventDay(requirement.date) ? 'Sí' : 'No',
    ];
    styleDataRow(sheet, rowNumber, 6);
    sheet.getCell(rowNumber, 3).numFmt = 'dd mmm yyyy';
  });
  const lastRow = Math.max(7, input.data.requirements.length + 6);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: 6 } };
}

function addCatalogsSheet(workbook: Workbook, rows: SelectionRow[]): Record<SelectionKind, CatalogRange> {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.catalogs);
  baseSheet(sheet, [24, 34], 1);
  sheet.state = 'hidden';
  writeHeader(sheet, 1, ['Catálogo', 'Valor']);
  const ranges = {} as Record<SelectionKind, CatalogRange>;
  let rowNumber = 2;
  const kinds: SelectionKind[] = ['Comité', 'Barrio / rama', 'Estaca', 'Estado', 'Fecha'];
  kinds.forEach((kind, index) => {
    const options = rows.filter(row => row.kind === kind);
    const first = rowNumber;
    options.forEach(option => {
      sheet.getCell(rowNumber, 1).value = kind;
      sheet.getCell(rowNumber, 2).value = option.kind === 'Fecha' ? option.key : option.label;
      if (option.kind === 'Fecha') sheet.getCell(rowNumber, 2).numFmt = 'dd mmm yyyy';
      styleFont(sheet.getCell(rowNumber, 1));
      styleFont(sheet.getCell(rowNumber, 2));
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
    ['Usar filtros', 'Al exportar', ''],
    ['Comité', 'Al exportar', selectedLabel('Comité', rows)],
    ['Barrio / rama', 'Al exportar', selectedLabel('Barrio / rama', rows)],
    ['Estaca', 'Al exportar', selectedLabel('Estaca', rows)],
    ['Estado', 'Al exportar', selectedLabel('Estado', rows)],
    ['Fechas', 'Al exportar', ''],
    ['Búsqueda', 'Al exportar', input.filters.search?.trim() || ''],
    ['Simulación', input.includeSimulation ? 'Al exportar' : 'No disponible en este archivo', ''],
  ];
  labels.forEach(([label, mode, value], index) => {
    const rowNumber = index + 7;
    sheet.getCell(rowNumber, 2).value = label;
    styleFont(sheet.getCell(rowNumber, 2), { bold: true });
    sheet.getCell(rowNumber, 3).value = mode;
    controlCell(sheet.getCell(rowNumber, 3));
    sheet.getCell(rowNumber, 4).value = value;
    if (index > 0 && index < 7) controlCell(sheet.getCell(rowNumber, 4));
  });

  sheet.getCell('C7').dataValidation = inlineValidation(['Al exportar', 'Personalizados']);
  for (const rowNumber of [8, 9, 10, 11]) sheet.getCell(rowNumber, 3).dataValidation = inlineValidation(CATEGORY_MODES);
  sheet.getCell('C12').dataValidation = inlineValidation(DATE_MODES);
  sheet.getCell('C13').dataValidation = inlineValidation(SEARCH_MODES);
  if (input.includeSimulation) sheet.getCell('C14').dataValidation = inlineValidation(SIMULATION_MODES);
  sheet.getCell('D8').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges['Comité'].name}`] };
  sheet.getCell('D9').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges['Barrio / rama'].name}`] };
  sheet.getCell('D10').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges.Estaca.name}`] };
  sheet.getCell('D11').dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges.Estado.name}`] };

  const dates = rows.filter(row => row.kind === 'Fecha');
  sheet.getCell('D12').value = dates.find(row => row.original === 'Sí')?.key || dates[0]?.key || null;
  sheet.getCell('E12').value = [...dates].reverse().find(row => row.original === 'Sí')?.key || dates.at(-1)?.key || null;
  for (const address of ['D12', 'E12']) {
    controlCell(sheet.getCell(address));
    sheet.getCell(address).numFmt = 'dd mmm yyyy';
    sheet.getCell(address).dataValidation = { type: 'list', allowBlank: false, formulae: [`=${catalogRanges.Fecha.name}`] };
  }
  sheet.getCell('H2').value = input.filters.search?.trim() || '';
  sheet.getColumn(8).hidden = true;

  sheet.mergeCells('B16:F16');
  sheet.getCell('B16').value = 'RESULTADO DE LOS CONTROLES';
  styleFont(sheet.getCell('B16'), { bold: true, color: REPORT_THEME.colors.primary });
  const shiftEnd = Math.max(7, input.data.items.length + 6);
  const reqEnd = Math.max(7, input.data.requirements.length + 6);
  const calculationShiftEnd = Math.max(5, input.data.items.length + 4);
  const calculationRequirementEnd = Math.max(5, input.data.requirements.length + 4);
  const metricRows = [
    ['Turnos coincidentes', `SUM('${INTERACTIVE_REPORT_SHEETS.calculations}'!$I$5:$I$${calculationShiftEnd})`, input.view.items.length, 'Asignaciones que cumplen los controles'],
    ['Voluntarios con turnos coincidentes', `IFERROR(ROWS(UNIQUE(FILTER('${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$B$7:$B$${shiftEnd},'${INTERACTIVE_REPORT_SHEETS.calculations}'!$I$5:$I$${input.data.items.length + 4}=1))),0)`, new Set(input.view.items.map(item => item.volunteerId)).size, 'Personas únicas dentro de esos turnos'],
    ['Cupos requeridos', `SUMPRODUCT('${INTERACTIVE_REPORT_SHEETS.requirements}'!$E$7:$E$${reqEnd},'${INTERACTIVE_REPORT_SHEETS.calculations}'!$Q$5:$Q$${calculationRequirementEnd})`, input.view.attendanceSummary.totalRequired, 'La meta depende de comité y fecha'],
  ] as const;
  writeHeader(sheet, 18, ['', 'Indicador', 'Resultado', 'Definición']);
  metricRows.forEach(([label, formula, result, description], index) => {
    const rowNumber = index + 19;
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = { formula, result };
    sheet.getCell(rowNumber, 4).value = description;
    styleFont(sheet.getCell(rowNumber, 2), { bold: true });
    styleFont(sheet.getCell(rowNumber, 3), { bold: true, size: 16, color: REPORT_THEME.colors.primary });
    styleFont(sheet.getCell(rowNumber, 4), { color: REPORT_THEME.colors.muted });
  });
  sheet.mergeCells('B23:I23');
  sheet.getCell('B23').value = 'Para selección múltiple y fechas separadas, edita la hoja Selecciones. Una selección personalizada con todo en “No” produce cero coincidencias.';
  styleFont(sheet.getCell('B23'), { color: REPORT_THEME.colors.muted });
  sheet.mergeCells('B25:I25');
  sheet.getCell('B25').value = 'El detalle que responde a estos controles está en “Detalle del panel”. Las seis hojas iniciales conservan el corte original.';
  styleFont(sheet.getCell('B25'), { color: REPORT_THEME.colors.muted });
  sheet.pageSetup.printArea = 'A1:J27';
}

function selectionFormula(
  kind: SelectionKind,
  dataKeyRef: string,
  panelModeCell: string,
  panelValueCell: string,
  selectionEnd: number,
): string {
  const selectionKind = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$A$6:$A$${selectionEnd}`;
  const selectionKeys = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$B$6:$B$${selectionEnd}`;
  const selectionLabels = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$C$6:$C$${selectionEnd}`;
  const original = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$D$6:$D$${selectionEnd}`;
  const custom = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$E$6:$E$${selectionEnd}`;
  const originalMatch = `--(COUNTIFS(${selectionKind},"${kind}",${selectionKeys},${dataKeyRef},${original},"Sí")>0)`;
  const customMatch = `--(COUNTIFS(${selectionKind},"${kind}",${selectionKeys},${dataKeyRef},${custom},"Sí")>0)`;
  const singleMatch = `--(COUNTIFS(${selectionKind},"${kind}",${selectionKeys},${dataKeyRef},${selectionLabels},${panelValueCell})>0)`;
  return `IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$7="Al exportar",${originalMatch},IF(${panelModeCell}="Al exportar",${originalMatch},IF(${panelModeCell}="Todos",1,IF(${panelModeCell}="Un valor",${singleMatch},${customMatch}))))`;
}

function dateFormula(dataDateRef: string, selectionEnd: number): string {
  const selectionKind = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$A$6:$A$${selectionEnd}`;
  const selectionKeys = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$B$6:$B$${selectionEnd}`;
  const original = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$D$6:$D$${selectionEnd}`;
  const custom = `'${INTERACTIVE_REPORT_SHEETS.selections}'!$E$6:$E$${selectionEnd}`;
  const originalMatch = `--(COUNTIFS(${selectionKind},"Fecha",${selectionKeys},${dataDateRef},${original},"Sí")>0)`;
  const customMatch = `--(COUNTIFS(${selectionKind},"Fecha",${selectionKeys},${dataDateRef},${custom},"Sí")>0)`;
  return `IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$7="Al exportar",${originalMatch},IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$12="Al exportar",${originalMatch},IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$12="Todas",1,IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$12="Intervalo",--(AND(${dataDateRef}>='${INTERACTIVE_REPORT_SHEETS.panel}'!$D$12,${dataDateRef}<='${INTERACTIVE_REPORT_SHEETS.panel}'!$E$12)),${customMatch}))))`;
}

function simulationFormula(dataSimulationRef: string, includeSimulation: boolean): string {
  if (!includeSimulation) return '1';
  return `IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$7="Al exportar",1,IF(OR('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$14="Al exportar",'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$14="Todos"),1,IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$14="Solo simulación",--(${dataSimulationRef}="Sí"),--(${dataSimulationRef}="No"))))`;
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

function searchMatch(search: string | undefined, item: ReportItem): number {
  const terms = (search || '').split(',').map(normalize).filter(Boolean);
  const haystack = normalize([item.volunteerName, item.phone, item.neighborhood, item.stake, item.committeeName, item.committeeId].join(' '));
  return terms.every(term => haystack.includes(term)) ? 1 : 0;
}

function normalizedSearchFormula(): string {
  const source = `IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$7="Al exportar",'${INTERACTIVE_REPORT_SHEETS.panel}'!$H$2,IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$13="Al exportar",'${INTERACTIVE_REPORT_SHEETS.panel}'!$H$2,IF('${INTERACTIVE_REPORT_SHEETS.panel}'!$C$13="Sin búsqueda","",'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$13)))`;
  const accents: Array<[string, string]> = [['á', 'a'], ['é', 'e'], ['í', 'i'], ['ó', 'o'], ['ú', 'u'], ['ü', 'u'], ['ñ', 'n']];
  const normalized = accents.reduce((formula, [from, to]) => `SUBSTITUTE(${formula},"${from}","${to}")`, `LOWER(TRIM(${source}))`);
  return `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${normalized},"~","~~"),"*","~*"),"?","~?")`;
}

function addCalculationsSheet(workbook: Workbook, input: StaticReportWorkbookInput, selections: SelectionRow[]) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.calculations);
  baseSheet(sheet, [23, 15, 15, 15, 15, 15, 15, 15, 13, 4, 23, 16, 13, 15, 15, 15, 13], 4);
  sheet.state = 'hidden';
  sheet.getCell('A1').value = 'Búsqueda efectiva normalizada';
  styleFont(sheet.getCell('A1'), { bold: true });
  sheet.getCell('B1').value = { formula: normalizedSearchFormula(), result: normalize(input.filters.search || '') };
  styleFont(sheet.getCell('B1'));
  writeHeader(sheet, 4, ['Registro ID', 'Comité', 'Barrio', 'Estaca', 'Estado', 'Fecha', 'Búsqueda', 'Simulación', 'Coincide']);
  const selectionEnd = Math.max(6, selections.length + 5);
  const filteredRegistrationIds = new Set(filterReportItems(input.data.items, input.filters).map(item => item.registrationId));
  input.data.items.forEach((item, index) => {
    const rowNumber = index + 5;
    const dataRow = index + 7;
    const initial = originalDimensionMatch(input.filters, item);
    const search = searchMatch(input.filters.search, item);
    const values = [
      safeText(item.registrationId),
      { formula: selectionFormula('Comité', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$H$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$8`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$8`, selectionEnd), result: initial.committee },
      { formula: selectionFormula('Barrio / rama', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$F$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$9`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$9`, selectionEnd), result: initial.neighborhood },
      { formula: selectionFormula('Estaca', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$G$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$10`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$10`, selectionEnd), result: initial.stake },
      { formula: selectionFormula('Estado', `'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$L$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$11`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$11`, selectionEnd), result: initial.status },
      { formula: dateFormula(`'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$J$${dataRow}`, selectionEnd), result: initial.date },
      { formula: `IF($B$1="",1,--AND(ISNUMBER(SEARCH(TRIM(TEXTSPLIT($B$1,",")),'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$P$${dataRow}))))`, result: search },
      { formula: simulationFormula(`'${INTERACTIVE_REPORT_SHEETS.shiftsData}'!$O$${dataRow}`, input.includeSimulation), result: 1 },
      { formula: `PRODUCT(B${rowNumber}:H${rowNumber})`, result: filteredRegistrationIds.has(item.registrationId) ? 1 : 0 },
    ];
    sheet.getRow(rowNumber).values = values;
    styleDataRow(sheet, rowNumber, 9);
  });

  writeHeader(sheet, 4, ['Registro ID', 'Comité', 'Barrio', 'Estaca', 'Estado', 'Fecha', 'Búsqueda', 'Simulación', 'Coincide', '', 'Comité ID', 'Fecha', 'Simulación', 'Comité coincide', 'Fecha coincide', 'Simulación coincide', 'Meta coincide']);
  const committeeNames = new Map(input.data.uniqueCommittees.map(value => [value.id, value.name]));
  const filteredRequirements = new Set(
    filterReportRequirements(input.data.requirements, input.filters, committeeNames)
      .map(value => `${value.committeeId}|${value.date}|${value.shiftKey}`),
  );
  input.data.requirements.forEach((requirement, index) => {
    const rowNumber = index + 5;
    const dataRow = index + 7;
    const committee = originalSelected(input.filters.committeeIds, requirement.committeeId, committeeNames.get(requirement.committeeId)) === 'Sí' ? 1 : 0;
    const date = originalSelected(input.filters.dates, requirement.date) === 'Sí' ? 1 : 0;
    sheet.getCell(rowNumber, 11).value = safeText(requirement.committeeId);
    sheet.getCell(rowNumber, 12).value = toExcelDate(requirement.date);
    sheet.getCell(rowNumber, 12).numFmt = 'dd mmm yyyy';
    sheet.getCell(rowNumber, 13).value = isSimulationEventDay(requirement.date) ? 'Sí' : 'No';
    sheet.getCell(rowNumber, 14).value = {
      formula: selectionFormula('Comité', `'${INTERACTIVE_REPORT_SHEETS.requirements}'!$A$${dataRow}`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$C$8`, `'${INTERACTIVE_REPORT_SHEETS.panel}'!$D$8`, selectionEnd),
      result: committee,
    };
    sheet.getCell(rowNumber, 15).value = { formula: dateFormula(`'${INTERACTIVE_REPORT_SHEETS.requirements}'!$C$${dataRow}`, selectionEnd), result: date };
    sheet.getCell(rowNumber, 16).value = { formula: simulationFormula(`'${INTERACTIVE_REPORT_SHEETS.requirements}'!$F$${dataRow}`, input.includeSimulation), result: 1 };
    sheet.getCell(rowNumber, 17).value = {
      formula: `PRODUCT(N${rowNumber}:P${rowNumber})`,
      result: filteredRequirements.has(`${requirement.committeeId}|${requirement.date}|${requirement.shiftKey}`) ? 1 : 0,
    };
    for (let column = 11; column <= 17; column += 1) styleFont(sheet.getCell(rowNumber, column));
  });
}

function addDetailSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(INTERACTIVE_REPORT_SHEETS.detail, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  baseSheet(sheet, [22, 20, 29, 9, 18, 22, 22, 22, 25, 16, 10, 16, 17, 16, 13], 6);
  addTitle(sheet, 'Detalle del panel', 'Filas que cumplen los controles actuales del Panel interactivo.', 15, logoImageId);
  writeHeader(sheet, 6, [
    'Registro ID', 'Voluntario ID', 'Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité ID', 'Comité',
    'Fecha', 'Turno', 'Estado clave', 'Estado', 'Minutos servidos', 'Simulación',
  ]);
  const shiftEnd = Math.max(7, input.data.items.length + 6);
  const calcEnd = Math.max(5, input.data.items.length + 4);
  sheet.getCell('A7').value = {
    formula: `FILTER('${INTERACTIVE_REPORT_SHEETS.shiftsData}'!A7:O${shiftEnd},'${INTERACTIVE_REPORT_SHEETS.calculations}'!I5:I${calcEnd}=1,"Sin registros")`,
    result: input.view.items.length ? 'Excel 365 recalculará este detalle al abrir el archivo' : 'Sin registros',
  };
  styleFont(sheet.getCell('A7'), { color: REPORT_THEME.colors.muted });
  sheet.getCell('J7').numFmt = 'dd mmm yyyy';
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
  const workbook = await buildStaticReportWorkbook({ ...input, logoBase64 });
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.views = [{ x: 0, y: 0, width: 12000, height: 20000, firstSheet: 0, activeTab: 6, visibility: 'visible' }];
  const logoImageId = logoBase64 ? workbook.addImage({ base64: logoBase64, extension: 'png' }) : undefined;
  const selections = buildSelections(input);

  addSelectionsSheet(workbook, input, selections, logoImageId);
  addVolunteersDataSheet(workbook, input, logoImageId);
  addShiftsDataSheet(workbook, input, logoImageId);
  addRequirementsSheet(workbook, input, logoImageId);
  const catalogRanges = addCatalogsSheet(workbook, selections);
  addPanelSheet(workbook, input, selections, catalogRanges, logoImageId);
  addCalculationsSheet(workbook, input, selections);
  addDetailSheet(workbook, input, logoImageId);

  const order = [
    'Resumen', 'Historial', 'Horas por voluntario', 'Totales por comité', 'Reclutamiento y edades', 'Cobertura por día',
    INTERACTIVE_REPORT_SHEETS.panel, INTERACTIVE_REPORT_SHEETS.selections, INTERACTIVE_REPORT_SHEETS.detail,
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
