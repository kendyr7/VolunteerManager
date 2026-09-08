import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildReportView } from '../lib/reports/aggregate';
import { buildInteractiveReportWorkbook } from '../lib/reports/export/interactive';
import { INTERACTIVE_REPORT_SHEET_ORDER, INTERACTIVE_REPORT_SHEETS, REPORT_THEME } from '../lib/reports/export/theme';
import type { ReportItem, ReportsData } from '../lib/reports/types';

const officialDate = '2026-09-10';
const secondDate = '2026-09-11';
const volunteers = [
  { id: 'v1', name: 'Ana Pérez', age: 25, phone: '5550001', neighborhood: 'Centro', stake: 'Estaca Central', committeeId: 'history', committeeName: 'Historia' },
  { id: 'v2', name: 'José López', age: 42, phone: '5550002', neighborhood: 'Norte', stake: 'Estaca Central', committeeId: 'history', committeeName: 'Historia' },
  { id: 'v3', name: 'María Ruiz', age: 31, phone: '5550003', neighborhood: 'Centro', stake: 'Estaca Norte', committeeId: 'security', committeeName: 'Seguridad' },
  { id: 'v4', name: 'Persona sin turno', age: null, phone: '5550004', neighborhood: 'Sur', stake: 'Estaca Norte', committeeId: 'security', committeeName: 'Seguridad' },
];

function item(
  registrationId: string,
  volunteerIndex: number,
  date: string,
  shiftNumber: number,
  status: ReportItem['status'],
): ReportItem {
  const volunteer = volunteers[volunteerIndex];
  return {
    registrationId,
    volunteerId: volunteer.id,
    volunteerName: volunteer.name,
    age: volunteer.age,
    phone: volunteer.phone,
    neighborhood: volunteer.neighborhood,
    stake: volunteer.stake,
    committeeId: volunteer.committeeId,
    committeeName: volunteer.committeeName,
    areaId: volunteerIndex === 0 ? 'area-reception' : null,
    areaName: volunteerIndex === 0 ? 'Recepción norte' : 'Sin área asignada',
    date,
    shiftNumber,
    startTime: shiftNumber === 1 ? '7:00 AM' : '11:00 AM',
    endTime: shiftNumber === 1 ? '12:00 PM' : '3:00 PM',
    isExtended: false,
    status,
    durationMinutes: status === 'confirmed' ? (shiftNumber === 1 ? 300 : 240) : 0,
  };
}

const source: ReportsData = {
  uniqueCommittees: [{ id: 'history', name: 'Historia' }, { id: 'security', name: 'Seguridad' }],
  uniqueNeighborhoods: ['Centro', 'Norte', 'Sur'],
  uniqueStakes: ['Estaca Central', 'Estaca Norte'],
  eventDays: [
    { date: officialDate, dayLabel: 'Jue 10 sep', shiftKeys: ['T1', 'T2'] },
    { date: secondDate, dayLabel: 'Vie 11 sep', shiftKeys: ['T1', 'T2'] },
  ],
  volunteers,
  requirements: [
    { committeeId: 'history', date: officialDate, shiftKey: 'T1', required: 3 },
    { committeeId: 'history', date: secondDate, shiftKey: 'T2', required: 2 },
    { committeeId: 'security', date: officialDate, shiftKey: 'T1', required: 2 },
    { committeeId: 'security', date: secondDate, shiftKey: 'T2', required: 2 },
  ],
  items: [
    item('r1', 0, officialDate, 1, 'confirmed'),
    item('r2', 1, officialDate, 1, 'registered'),
    item('r3', 0, secondDate, 2, 'absent'),
    item('r4', 2, officialDate, 1, 'confirmed'),
    item('r5', 2, secondDate, 2, 'registered'),
  ],
};

const filters = { committeeIds: ['history'], dates: [officialDate] };
const view = buildReportView(source, filters);
assert.equal(view.items.length, 2);

const logo = await fs.readFile(path.resolve('public/app-icon-512.png'));
const workbook = await buildInteractiveReportWorkbook({
  data: source,
  view,
  filters,
  includeSimulation: false,
  generatedAt: new Date('2026-09-07T18:00:00.000Z'),
  logoBase64: `data:image/png;base64,${logo.toString('base64')}`,
});

assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), [...INTERACTIVE_REPORT_SHEET_ORDER]);
assert.equal(workbook.views[0]?.activeTab, 0);
for (const sheet of workbook.worksheets) {
  assert.ok(sheet.views.length > 0 && sheet.views.every(viewValue => viewValue.showGridLines === false), `${sheet.name} must hide gridlines`);
  let foundFont = false;
  sheet.eachRow(row => row.eachCell(cell => { if (cell.font?.name === REPORT_THEME.font) foundFont = true; }));
  assert.ok(foundFont, `${sheet.name} must use Aptos Narrow`);
}

const panel = workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.panel)!;
assert.match(String(panel.getCell('A2').value), /Microsoft Excel 365/, 'The panel subtitle is preserved');
assert.equal(panel.getCell('C7').value, 'Al exportar');
assert.equal(panel.getCell('C12').value, 'No disponible en este archivo');
assert.equal((panel.getCell('C17').value as { result: number }).result, 2, 'Initial turn count reproduces the filtered report');
assert.equal((panel.getCell('C18').value as { result: number }).result, 2, 'Initial unique count reproduces the filtered report');
assert.equal((panel.getCell('C19').value as { result: number }).result, 3, 'Initial requirements reproduce the operational target');
assert.equal(panel.getCell('C7').dataValidation.type, 'list');
assert.equal(panel.getCell('D7').dataValidation.type, 'list');
assert.equal(workbook.getWorksheet('Selecciones'), undefined);

const shiftData = workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.shiftsData)!;
const volunteerData = workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.volunteersData)!;
assert.equal(workbook.getWorksheet('Historial'), undefined, 'The interactive workbook does not duplicate the six fixed report sheets');
assert.equal(shiftData.rowCount, source.items.length + 6, 'The panel base includes all authorized assignments');
assert.equal(volunteerData.rowCount, source.volunteers.length + 6, 'The panel base includes the volunteer without a shift');
assert.equal(shiftData.getCell('A10').value, 'María Ruiz', 'Authorized data outside the original filters remains available to panel controls');
assert.equal(shiftData.getCell('G7').value, 'Recepción norte', 'Assigned area is present in the interactive detail base');
const shiftHeaders = shiftData.getRow(6).values;
const volunteerHeaders = volunteerData.getRow(6).values;
const requirementHeaders = workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.requirements)!.getRow(6).values;
assert.ok(Array.isArray(shiftHeaders) && Array.isArray(volunteerHeaders) && Array.isArray(requirementHeaders));
assert.deepEqual(shiftHeaders.slice(1), [
  'Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité',
  'Área asignada', 'Fecha', 'Turno', 'Estado', 'Minutos servidos',
]);
assert.deepEqual(volunteerHeaders.slice(1), [
  'Voluntario', 'Edad', 'Teléfono', 'Barrio / rama', 'Estaca', 'Comité',
]);
assert.deepEqual(requirementHeaders.slice(1), [
  'Comité', 'Fecha', 'Turno', 'Requeridos',
]);

const calculations = workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.calculations)!;
assert.equal(calculations.state, 'hidden');
assert.match((calculations.getCell('I5').value as { formula: string }).formula, /PRODUCT\(B5:F5,H5\)/);
assert.equal((calculations.getCell('I5').value as { result: number }).result, 1);
assert.notEqual((calculations.getCell('I7').value as { result?: number }).result, 1);
const detail = workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.detail)!;
assert.match((detail.getCell('A7').value as { formula: string }).formula, /^FILTER\(/);
assert.equal(workbook.getWorksheet(INTERACTIVE_REPORT_SHEETS.catalogs)?.state, 'hidden');

const outputDirectory = path.resolve('outputs/excel-etapa-4');
await fs.mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'Muestra-panel-interactivo.xlsx');
const buffer = await workbook.xlsx.writeBuffer();
await fs.writeFile(outputPath, new Uint8Array(buffer as ArrayBuffer));

console.log(JSON.stringify({
  outputPath,
  sheets: workbook.worksheets.length,
  bytes: (await fs.stat(outputPath)).size,
  filteredRows: view.items.length,
  authorizedShiftRows: source.items.length,
  authorizedVolunteerRows: source.volunteers.length,
}));
