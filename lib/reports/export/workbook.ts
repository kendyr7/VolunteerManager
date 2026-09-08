import type { Cell, Workbook, Worksheet } from 'exceljs';
import type {
  AgeSegmentation,
  CommitteeRecruitment,
  CommitteeReportSummary,
  DailyCoverage,
  ReportFilters,
  ReportItem,
  ReportsData,
  ReportView,
  VolunteerReportSummary,
} from '@/lib/reports/types';
import { REPORT_SHEETS, REPORT_SHEET_ORDER, REPORT_THEME } from './theme';

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Asistió',
  registered: 'Pendiente',
  absent: 'Ausente',
  replaced: 'Reemplazado',
};

type ExcelValue = string | number | Date | null;

interface TableColumn {
  header: string;
  width: number;
  numberFormat?: string;
  alignment?: 'left' | 'center' | 'right';
}

interface TableResult {
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  lastContentRow: number;
}

export interface StaticReportWorkbookInput {
  data: ReportsData;
  view: ReportView;
  filters: ReportFilters;
  includeSimulation: boolean;
  generatedAt?: Date;
  historyItems?: ReportItem[];
  volunteerRanking?: VolunteerReportSummary[];
  committeeSummary?: CommitteeReportSummary[];
  recruitmentSummary?: CommitteeRecruitment[];
  ageSegmentation?: AgeSegmentation[];
  dailyCoverage?: DailyCoverage[];
  logoBase64?: string | null;
}

function safeText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function toExcelDate(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function columnLetter(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function formatFilterDate(isoDate: string): string {
  const date = toExcelDate(isoDate);
  if (!date) return isoDate;
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function listOrAll(values: readonly string[] | undefined, label = 'Todos'): string {
  return values?.length ? values.join(', ') : label;
}

function buildFilterRows(data: ReportsData, filters: ReportFilters, includeSimulation: boolean) {
  const committeeById = new Map(data.uniqueCommittees.map(committee => [committee.id, committee.name]));
  return [
    ['Búsqueda', filters.search?.trim() || 'Sin búsqueda'],
    ['Comités', listOrAll(filters.committeeIds?.map(value => committeeById.get(value) || value))],
    ['Barrios / ramas', listOrAll(filters.neighborhoods)],
    ['Estacas', listOrAll(filters.stakes)],
    ['Estados', listOrAll(filters.statuses?.map(status => STATUS_LABELS[status] || status))],
    ['Fechas', listOrAll(filters.dates?.map(formatFilterDate))],
    ['Simulación', includeSimulation ? 'Incluida' : 'Excluida'],
  ];
}

function compactSelection(values: readonly string[] | undefined, resolve?: (value: string) => string): string {
  if (!values?.length) return 'Todos';
  if (values.length === 1) return resolve ? resolve(values[0]) : values[0];
  return `${values.length} seleccionados`;
}

function buildCompactFilterContext(data: ReportsData, filters: ReportFilters, includeSimulation: boolean): string {
  const committeeById = new Map(data.uniqueCommittees.map(committee => [committee.id, committee.name]));
  const parts = [
    `Comités: ${compactSelection(filters.committeeIds, value => committeeById.get(value) || value)}`,
    `Barrios / ramas: ${compactSelection(filters.neighborhoods)}`,
    `Estacas: ${compactSelection(filters.stakes)}`,
    `Estados: ${compactSelection(filters.statuses, value => STATUS_LABELS[value] || value)}`,
    `Fechas: ${compactSelection(filters.dates, formatFilterDate)}`,
    `Simulación: ${includeSimulation ? 'Incluida' : 'Excluida'}`,
  ];
  if (filters.search?.trim()) parts.unshift(`Búsqueda: ${filters.search.trim()}`);
  return `Filtros al exportar: ${parts.join(' · ')}`;
}

function styleCellFont(cell: Cell) {
  cell.font = { ...cell.font, name: REPORT_THEME.font, size: cell.font?.size || 11 };
}

function applyBaseSheet(
  sheet: Worksheet,
  title: string,
  subtitle: string,
  columnWidths: number[],
  logoImageId?: number,
  orientation: 'portrait' | 'landscape' = 'landscape',
) {
  const lastColumn = columnWidths.length;
  sheet.properties.defaultRowHeight = 19;
  sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false, zoomScale: 90 }];
  sheet.pageSetup = {
    orientation,
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: '1:6',
  };
  sheet.headerFooter.oddFooter = '&LReporte de voluntariado&C&P de &N&RGenerado &D';
  sheet.headerFooter.evenFooter = sheet.headerFooter.oddFooter;
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 20;
  sheet.getRow(4).height = 28;

  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const titleLastColumn = logoImageId == null ? lastColumn : Math.max(1, lastColumn - 2);
  if (titleLastColumn > 1) sheet.mergeCells(1, 1, 1, titleLastColumn);
  if (titleLastColumn > 1) sheet.mergeCells(2, 1, 2, titleLastColumn);
  if (lastColumn > 1) sheet.mergeCells(4, 1, 4, lastColumn);

  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: REPORT_THEME.font, size: 20, bold: true, color: { argb: REPORT_THEME.colors.ink } };
  titleCell.alignment = { vertical: 'middle' };

  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: REPORT_THEME.font, size: 11, color: { argb: REPORT_THEME.colors.muted } };

  if (logoImageId != null) {
    sheet.addImage(logoImageId, {
      tl: { col: Math.max(0, lastColumn - 1.75), row: 0.1 },
      ext: { width: 52, height: 52 },
      editAs: 'oneCell',
    });
  }

  sheet.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: true }, styleCellFont));
}

function writeContext(sheet: Worksheet, text: string) {
  const cell = sheet.getCell('A4');
  cell.value = text;
  cell.font = { name: REPORT_THEME.font, size: 10, color: { argb: REPORT_THEME.colors.muted } };
  cell.alignment = { vertical: 'middle', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softBlue } };
}

function writeTable(
  sheet: Worksheet,
  columns: TableColumn[],
  rows: ExcelValue[][],
  options: {
    startRow?: number;
    autoFilter?: boolean;
    totalRow?: ExcelValue[];
    emptyMessage?: string;
  } = {},
): TableResult {
  const headerRow = options.startRow || 6;
  const firstDataRow = headerRow + 1;
  const lastColumn = columns.length;
  const header = sheet.getRow(headerRow);
  header.height = 27;

  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: REPORT_THEME.font, size: 11, bold: true, color: { argb: REPORT_THEME.colors.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.primary } };
    cell.alignment = { vertical: 'middle', horizontal: column.alignment || 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: REPORT_THEME.colors.accent } } };
    sheet.getColumn(index + 1).width = column.width;
  });

  rows.forEach((values, rowIndex) => {
    const rowNumber = firstDataRow + rowIndex;
    const row = sheet.getRow(rowNumber);
    row.height = 21;
    values.forEach((value, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = value;
      cell.font = { name: REPORT_THEME.font, size: 11, color: { argb: REPORT_THEME.colors.ink } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: columns[columnIndex]?.alignment || 'left',
        wrapText: false,
      };
      if (columns[columnIndex]?.numberFormat) cell.numFmt = columns[columnIndex].numberFormat!;
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softRow } };
      }
    });
  });

  const lastDataRow = rows.length > 0 ? firstDataRow + rows.length - 1 : headerRow;
  let lastContentRow = lastDataRow;

  if (rows.length === 0) {
    const emptyRow = firstDataRow;
    if (lastColumn > 1) sheet.mergeCells(emptyRow, 1, emptyRow, lastColumn);
    const emptyCell = sheet.getCell(emptyRow, 1);
    emptyCell.value = options.emptyMessage || 'Sin registros para los filtros seleccionados';
    emptyCell.font = { name: REPORT_THEME.font, size: 11, italic: true, color: { argb: REPORT_THEME.colors.muted } };
    emptyCell.alignment = { vertical: 'middle' };
    sheet.getRow(emptyRow).height = 24;
    lastContentRow = emptyRow;
  }

  if (options.totalRow) {
    const totalRowNumber = Math.max(firstDataRow, lastDataRow + 1);
    const totalRow = sheet.getRow(totalRowNumber);
    totalRow.height = 24;
    options.totalRow.forEach((value, index) => {
      const cell = totalRow.getCell(index + 1);
      cell.value = value;
      cell.font = { name: REPORT_THEME.font, size: 11, bold: true, color: { argb: REPORT_THEME.colors.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.total } };
      cell.border = { top: { style: 'medium', color: { argb: REPORT_THEME.colors.primary } } };
      cell.alignment = { vertical: 'middle', horizontal: columns[index]?.alignment || 'left' };
      if (columns[index]?.numberFormat) cell.numFmt = columns[index].numberFormat!;
    });
    lastContentRow = totalRowNumber;
  }

  if (options.autoFilter !== false) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: Math.max(headerRow, lastDataRow), column: lastColumn },
    };
  }

  sheet.pageSetup.printArea = `A1:${columnLetter(lastColumn)}${Math.max(lastContentRow, firstDataRow)}`;
  return { headerRow, firstDataRow, lastDataRow, lastContentRow };
}

function addSummarySheet(
  workbook: Workbook,
  input: Required<Pick<StaticReportWorkbookInput, 'data' | 'view' | 'filters' | 'includeSimulation'>> & { generatedAt: Date },
  logoImageId?: number,
) {
  const sheet = workbook.addWorksheet(REPORT_SHEETS.summary, {
    views: [{ showGridLines: false, zoomScale: 95 }],
    properties: { tabColor: { argb: REPORT_THEME.colors.accent } },
  });
  const widths = [23, 15, 23, 15, 23, 15, 23, 15];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ showGridLines: false, zoomScale: 95 }];
  sheet.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printArea: 'A1:H30',
  };
  sheet.headerFooter.oddFooter = '&LReporte de voluntariado&C&P de &N&RGenerado &D';
  sheet.mergeCells('A1:F1');
  sheet.mergeCells('A2:F2');
  sheet.getRow(1).height = 32;
  sheet.getCell('A1').value = 'Reporte de voluntariado';
  sheet.getCell('A1').font = { name: REPORT_THEME.font, size: 22, bold: true, color: { argb: REPORT_THEME.colors.ink } };
  sheet.getCell('A2').value = `Corte generado el ${formatGeneratedAt(input.generatedAt)} · Microsoft Excel 365`;
  sheet.getCell('A2').font = { name: REPORT_THEME.font, size: 11, color: { argb: REPORT_THEME.colors.muted } };
  if (logoImageId != null) {
    sheet.addImage(logoImageId, {
      tl: { col: 6.7, row: 0.15 },
      ext: { width: 56, height: 56 },
      editAs: 'oneCell',
    });
  }

  const missing = input.view.recruitmentSummary.reduce((total, row) => total + row.missingShifts, 0);
  const metrics: Array<[string, ExcelValue, string]> = [
    ['Voluntarios', input.view.recruitmentVolunteers.length, '#,##0'],
    ['Turnos asignados', input.view.items.length, '#,##0'],
    ['Asistencias', input.view.kpiStats.confirmedShifts, '#,##0'],
    ['Ausencias', input.view.kpiStats.absentShifts, '#,##0'],
    ['Tiempo servido', input.view.kpiStats.totalMinutes / 1440, '[h]:mm'],
    ['Cupos requeridos', input.view.attendanceSummary.totalRequired, '#,##0'],
    ['Cupos faltantes', missing, '#,##0'],
    ['Cobertura', input.view.attendanceSummary.coverageRate / 100, '0%'],
  ];

  for (let index = 0; index < metrics.length; index += 1) {
    const block = index % 4;
    const row = index < 4 ? 5 : 8;
    const column = block * 2 + 1;
    const [label, value, numberFormat] = metrics[index];
    const labelCell = sheet.getCell(row, column);
    const valueCell = sheet.getCell(row + 1, column);
    sheet.mergeCells(row, column, row, column + 1);
    sheet.mergeCells(row + 1, column, row + 1, column + 1);
    labelCell.value = label;
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.primary } };
    labelCell.font = { name: REPORT_THEME.font, size: 10, bold: true, color: { argb: REPORT_THEME.colors.headerText } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valueCell.value = value;
    valueCell.numFmt = numberFormat;
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softBlue } };
    valueCell.font = { name: REPORT_THEME.font, size: 17, bold: true, color: { argb: REPORT_THEME.colors.primary } };
    valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(row).height = 23;
    sheet.getRow(row + 1).height = 29;
  }

  sheet.mergeCells('A12:H12');
  sheet.getCell('A12').value = 'Filtros al exportar';
  sheet.getCell('A12').font = { name: REPORT_THEME.font, size: 12, bold: true, color: { argb: REPORT_THEME.colors.primary } };
  sheet.getCell('A12').border = { bottom: { style: 'medium', color: { argb: REPORT_THEME.colors.accent } } };
  buildFilterRows(input.data, input.filters, input.includeSimulation).forEach(([label, value], index) => {
    const row = 13 + index;
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { name: REPORT_THEME.font, size: 11, bold: true, color: { argb: REPORT_THEME.colors.ink } };
    sheet.mergeCells(row, 2, row, 8);
    sheet.getCell(row, 2).value = value;
    sheet.getCell(row, 2).font = { name: REPORT_THEME.font, size: 11, color: { argb: REPORT_THEME.colors.muted } };
    sheet.getCell(row, 2).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(row).height = value.length > 110 ? 34 : 20;
    if (index % 2 === 1) sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_THEME.colors.softRow } };
  });

  sheet.mergeCells('A22:H22');
  sheet.getCell('A22').value = 'Contenido del libro';
  sheet.getCell('A22').font = { name: REPORT_THEME.font, size: 12, bold: true, color: { argb: REPORT_THEME.colors.primary } };
  sheet.getCell('A22').border = { bottom: { style: 'medium', color: { argb: REPORT_THEME.colors.accent } } };
  REPORT_SHEET_ORDER.slice(1).forEach((sheetName, index) => {
    const row = 23 + index;
    const cell = sheet.getCell(row, 1);
    sheet.mergeCells(row, 1, row, 4);
    cell.value = { text: sheetName, hyperlink: `#'${sheetName}'!A1` };
    cell.font = { name: REPORT_THEME.font, size: 11, bold: true, color: { argb: REPORT_THEME.colors.accent }, underline: true };
  });
  sheet.getCell('A29').value = 'Los valores corresponden a una instantánea y no se actualizan desde el sistema.';
  sheet.mergeCells('A29:H29');
  sheet.getCell('A29').font = { name: REPORT_THEME.font, size: 10, italic: true, color: { argb: REPORT_THEME.colors.muted } };
}

function addHistorySheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(REPORT_SHEETS.history, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  const columns: TableColumn[] = [
    { header: 'Voluntario', width: 28 }, { header: 'Teléfono', width: 16 }, { header: 'Comité', width: 23 },
    { header: 'Área asignada', width: 24 }, { header: 'Barrio / Rama', width: 22 }, { header: 'Estaca', width: 19 }, { header: 'Fecha', width: 15, numberFormat: 'dd mmm yyyy', alignment: 'center' },
    { header: 'Turno', width: 10, alignment: 'center' }, { header: 'Horario', width: 20, alignment: 'center' },
    { header: 'Estado', width: 15, alignment: 'center' }, { header: 'Duración', width: 13, numberFormat: '[h]:mm', alignment: 'right' },
  ];
  applyBaseSheet(sheet, REPORT_SHEETS.history, 'Detalle completo de turnos y asistencia', columns.map(column => column.width), logoImageId);
  writeContext(sheet, buildCompactFilterContext(input.data, input.filters, input.includeSimulation));
  const items = input.historyItems || input.view.items;
  writeTable(sheet, columns, items.map(item => [
    safeText(item.volunteerName), safeText(item.phone), safeText(item.committeeName), safeText(item.areaName || 'Sin área asignada'), safeText(item.neighborhood), safeText(item.stake),
    toExcelDate(item.date), `T${item.shiftNumber}`, `${safeText(item.startTime)} – ${safeText(item.endTime)}`,
    STATUS_LABELS[item.status] || item.status, item.durationMinutes / 1440,
  ]), {
    totalRow: ['TOTAL', `${items.length} turnos`, null, null, null, null, null, null, null, null, input.view.kpiStats.totalMinutes / 1440],
  });
}

function addVolunteerSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(REPORT_SHEETS.volunteers, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  const columns: TableColumn[] = [
    { header: 'Voluntario', width: 28 }, { header: 'Teléfono', width: 16 }, { header: 'Comité', width: 23 },
    { header: 'Barrio / Rama', width: 22 }, { header: 'Estaca', width: 19 }, { header: 'Turnos', width: 11, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Asistencias', width: 13, numberFormat: '#,##0', alignment: 'right' }, { header: 'Ausencias', width: 12, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Fiabilidad', width: 12, numberFormat: '0%', alignment: 'right' }, { header: 'Tiempo servido', width: 15, numberFormat: '[h]:mm', alignment: 'right' },
  ];
  applyBaseSheet(sheet, REPORT_SHEETS.volunteers, 'Una fila por voluntario con turnos dentro de los filtros', columns.map(column => column.width), logoImageId);
  writeContext(sheet, buildCompactFilterContext(input.data, input.filters, input.includeSimulation));
  const volunteers = input.volunteerRanking || input.view.volunteerRanking;
  writeTable(sheet, columns, volunteers.map(volunteer => [
    safeText(volunteer.name), safeText(volunteer.phone), safeText(volunteer.committee), safeText(volunteer.neighborhood), safeText(volunteer.stake),
    volunteer.totalShifts, volunteer.confirmed, volunteer.absent, volunteer.reliability / 100, volunteer.minutes / 1440,
  ]), {
    totalRow: [
      'TOTAL', `${volunteers.length} voluntarios`, null, null, null, input.view.items.length,
      input.view.kpiStats.confirmedShifts, input.view.kpiStats.absentShifts, input.view.kpiStats.attendanceRate / 100,
      input.view.kpiStats.totalMinutes / 1440,
    ],
  });
}

function addCommitteeSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(REPORT_SHEETS.committees, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  const columns: TableColumn[] = [
    { header: 'Comité', width: 27 }, { header: 'Voluntarios', width: 13, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Turnos', width: 12, numberFormat: '#,##0', alignment: 'right' }, { header: 'Asistencias', width: 13, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Ausencias', width: 12, numberFormat: '#,##0', alignment: 'right' }, { header: 'Pendientes', width: 12, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Tasa de asistencia', width: 17, numberFormat: '0%', alignment: 'right' },
    { header: 'Tiempo servido', width: 15, numberFormat: '[h]:mm', alignment: 'right' }, { header: 'Promedio por asistente', width: 20, numberFormat: '[h]:mm', alignment: 'right' },
  ];
  applyBaseSheet(sheet, REPORT_SHEETS.committees, 'Resultados consolidados por comité', columns.map(column => column.width), logoImageId);
  writeContext(sheet, buildCompactFilterContext(input.data, input.filters, input.includeSimulation));
  const committees = input.committeeSummary || input.view.committeeSummary;
  const totals = input.view.committeeTotals;
  writeTable(sheet, columns, committees.map(committee => [
    safeText(committee.name), committee.volunteersCount, committee.totalShifts, committee.confirmed, committee.absent, committee.pending,
    committee.attendanceRate / 100, committee.totalMinutes / 1440, committee.avgMinutes / 1440,
  ]), {
    totalRow: [
      'TOTAL GENERAL', totals.volunteersCount, totals.totalShifts, totals.confirmed, totals.absent, totals.pending,
      totals.attendanceRate / 100, totals.totalMinutes / 1440, totals.avgMinutes / 1440,
    ],
  });
}

function addRecruitmentSheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(REPORT_SHEETS.recruitment, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  const hasScheduleRestriction = Boolean(input.filters.statuses?.length || input.filters.dates?.length);
  const population = hasScheduleRestriction
    ? 'Voluntarios con al menos un turno que cumple los filtros de fecha o estado aplicados'
    : 'Todos los voluntarios registrados, incluso quienes todavía no tienen turnos';
  const columns: TableColumn[] = [
    { header: 'Comité', width: 27 }, { header: 'Voluntarios', width: 14, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Cupos requeridos', width: 17, numberFormat: '#,##0', alignment: 'right' }, { header: 'Asignaciones totales', width: 19, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Meta cubierta', width: 15, numberFormat: '#,##0', alignment: 'right' }, { header: 'Cupos faltantes', width: 16, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Cobertura', width: 13, numberFormat: '0%', alignment: 'right' },
  ];
  applyBaseSheet(sheet, REPORT_SHEETS.recruitment, population, columns.map(column => column.width), logoImageId, 'portrait');
  writeContext(sheet, buildCompactFilterContext(input.data, input.filters, input.includeSimulation));
  const recruitment = input.recruitmentSummary || input.view.recruitmentSummary;
  const totalRequired = recruitment.reduce((total, row) => total + row.totalRequiredShifts, 0);
  const totalAssigned = recruitment.reduce((total, row) => total + row.assignedShifts, 0);
  const totalCovered = recruitment.reduce((total, row) => total + row.coveredRequiredShifts, 0);
  const totalMissing = recruitment.reduce((total, row) => total + row.missingShifts, 0);
  const result = writeTable(sheet, columns, recruitment.map(row => [
    safeText(row.committeeName), row.totalVolunteers, row.totalRequiredShifts, row.assignedShifts,
    row.coveredRequiredShifts, row.missingShifts, row.coverageRate / 100,
  ]), {
    totalRow: [
      'TOTAL', input.view.recruitmentVolunteers.length, totalRequired, totalAssigned, totalCovered, totalMissing,
      totalRequired > 0 ? totalCovered / totalRequired : null,
    ],
  });

  const ageStart = result.lastContentRow + 3;
  sheet.mergeCells(ageStart, 1, ageStart, columns.length);
  sheet.getCell(ageStart, 1).value = 'Distribución por edad';
  sheet.getCell(ageStart, 1).font = { name: REPORT_THEME.font, size: 13, bold: true, color: { argb: REPORT_THEME.colors.primary } };
  const ageColumns: TableColumn[] = [
    { header: 'Rango', width: 27 }, { header: 'Voluntarios', width: 14, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Porcentaje', width: 17, numberFormat: '0%', alignment: 'right' },
  ];
  const ages = input.ageSegmentation || input.view.ageSegmentation;
  const ageResult = writeTable(sheet, ageColumns, ages.map(row => [safeText(row.range), row.count, row.percentage / 100]), {
    startRow: ageStart + 1,
    autoFilter: false,
    totalRow: ['TOTAL', input.view.recruitmentVolunteers.length, input.view.recruitmentVolunteers.length > 0 ? 1 : null],
  });
  sheet.pageSetup.printArea = `A1:G${ageResult.lastContentRow}`;
}

function addDailySheet(workbook: Workbook, input: StaticReportWorkbookInput, logoImageId?: number) {
  const sheet = workbook.addWorksheet(REPORT_SHEETS.daily, { properties: { tabColor: { argb: REPORT_THEME.colors.accent } } });
  const columns: TableColumn[] = [
    { header: 'Fecha', width: 17, numberFormat: 'dd mmm yyyy' }, { header: 'Cupos requeridos', width: 17, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Asignaciones', width: 15, numberFormat: '#,##0', alignment: 'right' }, { header: 'Meta cubierta', width: 15, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Asistencias', width: 13, numberFormat: '#,##0', alignment: 'right' }, { header: 'Cupos faltantes', width: 16, numberFormat: '#,##0', alignment: 'right' },
    { header: 'Cobertura', width: 13, numberFormat: '0%', alignment: 'right' },
    { header: 'T1 asignados/meta', width: 18, alignment: 'center' }, { header: 'T2 asignados/meta', width: 18, alignment: 'center' },
    { header: 'T3 asignados/meta', width: 18, alignment: 'center' }, { header: 'T4 asignados/meta', width: 18, alignment: 'center' },
  ];
  applyBaseSheet(sheet, REPORT_SHEETS.daily, 'Cobertura por fecha y turno; la sobrecobertura no oculta faltantes', columns.map(column => column.width), logoImageId);
  writeContext(sheet, buildCompactFilterContext(input.data, input.filters, input.includeSimulation));
  const days = input.dailyCoverage || input.view.dailyCoverage;
  const totalRequired = days.reduce((total, day) => total + day.required, 0);
  const totalAssigned = days.reduce((total, day) => total + day.assigned, 0);
  const totalCovered = days.reduce((total, day) => total + day.covered, 0);
  const totalCheckedIn = days.reduce((total, day) => total + day.checkedIn, 0);
  const totalMissing = days.reduce((total, day) => total + day.missing, 0);
  writeTable(sheet, columns, days.map(day => [
    toExcelDate(day.date), day.required, day.assigned, day.covered, day.checkedIn, day.missing, day.coverageRate / 100,
    ...['T1', 'T2', 'T3', 'T4'].map(shift => day.byShift[shift] ? `${day.byShift[shift].assigned}/${day.byShift[shift].required}` : '—'),
  ]), {
    totalRow: [
      'TOTAL', totalRequired, totalAssigned, totalCovered, totalCheckedIn, totalMissing,
      totalRequired > 0 ? totalCovered / totalRequired : null, null, null, null, null,
    ],
  });
}

export async function loadReportLogoBase64(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch('/app-icon-512.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildStaticReportWorkbook(input: StaticReportWorkbookInput): Promise<Workbook> {
  const { Workbook: ExcelWorkbook } = await import('exceljs');
  const workbook = new ExcelWorkbook();
  workbook.creator = 'VolunteerManager';
  workbook.lastModifiedBy = 'VolunteerManager';
  workbook.created = input.generatedAt || new Date();
  workbook.modified = input.generatedAt || new Date();
  workbook.calcProperties.fullCalcOnLoad = false;

  const logoBase64 = input.logoBase64 === undefined ? await loadReportLogoBase64() : input.logoBase64;
  const logoImageId = logoBase64
    ? workbook.addImage({ base64: logoBase64, extension: 'png' })
    : undefined;
  const generatedAt = input.generatedAt || new Date();

  addSummarySheet(workbook, {
    data: input.data,
    view: input.view,
    filters: input.filters,
    includeSimulation: input.includeSimulation,
    generatedAt,
  }, logoImageId);
  addHistorySheet(workbook, input, logoImageId);
  addVolunteerSheet(workbook, input, logoImageId);
  addCommitteeSheet(workbook, input, logoImageId);
  addRecruitmentSheet(workbook, input, logoImageId);
  addDailySheet(workbook, input, logoImageId);

  return workbook;
}

export async function downloadStaticReportWorkbook(input: StaticReportWorkbookInput): Promise<string> {
  const workbook = await buildStaticReportWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const generatedAt = input.generatedAt || new Date();
  const date = generatedAt.toISOString().slice(0, 10);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(generatedAt).replace(':', '-');
  const filename = `reporte_voluntariado_${date}_${time}.xlsx`;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
