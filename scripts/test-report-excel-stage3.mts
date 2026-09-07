import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildReportView } from '../lib/reports/aggregate';
import { buildStaticReportWorkbook } from '../lib/reports/export/workbook';
import { REPORT_SHEET_ORDER, REPORT_THEME } from '../lib/reports/export/theme';
import type { ReportItem, ReportsData } from '../lib/reports/types';

const date = '2026-09-10';
const secondDate = '2026-09-11';
const historyVolunteers = Array.from({ length: 7 }, (_, index) => ({
  id: `history-${index + 1}`,
  name: `Voluntario Historia ${index + 1}`,
  age: 18 + index * 6,
  phone: `555000${index + 1}`,
  neighborhood: index % 2 === 0 ? 'Centro' : 'Norte',
  stake: 'Estaca Central',
  committeeId: 'history',
  committeeName: 'Historia',
}));

const assignmentsByShift = { 1: 4, 2: 7, 3: 7, 4: 7 };
function createItemsForDay(day: string, assignments: Record<number, number>): ReportItem[] {
  return Object.entries(assignments).flatMap(([shiftNumberValue, count]) => {
    const shiftNumber = Number(shiftNumberValue);
    return historyVolunteers.slice(0, count).map((volunteer, index) => ({
      registrationId: `${day}-${shiftNumber}-${volunteer.id}`,
      volunteerId: volunteer.id,
      volunteerName: volunteer.name,
      age: volunteer.age,
      phone: volunteer.phone,
      neighborhood: volunteer.neighborhood,
      stake: volunteer.stake,
      committeeId: volunteer.committeeId,
      committeeName: volunteer.committeeName,
      date: day,
      shiftNumber,
      startTime: shiftNumber === 1 ? '7:00 AM' : `${8 + shiftNumber}:00 AM`,
      endTime: shiftNumber === 4 ? '9:00 PM' : `${12 + shiftNumber}:00 PM`,
      isExtended: false,
      status: index % 5 === 0 ? 'absent' : index % 4 === 0 ? 'registered' : 'confirmed',
      durationMinutes: index % 5 === 0 || index % 4 === 0 ? 0 : 240,
    }));
  });
}

const items: ReportItem[] = [
  ...createItemsForDay(date, assignmentsByShift),
  ...createItemsForDay(secondDate, { 1: 6, 2: 6, 3: 6, 4: 6 }),
];

const source: ReportsData = {
  uniqueCommittees: [
    { id: 'history', name: 'Historia' },
    { id: 'security', name: 'Seguridad' },
  ],
  uniqueNeighborhoods: ['Centro', 'Norte'],
  uniqueStakes: ['Estaca Central'],
  eventDays: [
    { date, dayLabel: 'Jue 10 sep', shiftKeys: ['T1', 'T2', 'T3', 'T4'] },
    { date: secondDate, dayLabel: 'Vie 11 sep', shiftKeys: ['T1', 'T2', 'T3', 'T4'] },
  ],
  volunteers: [
    ...historyVolunteers,
    { id: 'security-1', name: 'Voluntaria sin turno', age: null, phone: '5550099', neighborhood: 'Centro', stake: 'Estaca Central', committeeId: 'security', committeeName: 'Seguridad' },
  ],
  requirements: [date, secondDate].flatMap(day => [1, 2, 3, 4].flatMap(shiftNumber => [
    { committeeId: 'history', date: day, shiftKey: `T${shiftNumber}`, required: 6 },
    { committeeId: 'security', date: day, shiftKey: `T${shiftNumber}`, required: 3 },
  ])),
  items,
};

const filters = { committeeIds: ['history'], dates: [date, secondDate] };
const view = buildReportView(source, filters);
assert.equal(view.recruitmentSummary[0].missingShifts, 2);
assert.equal(view.recruitmentSummary[0].coverageRate, 96);
assert.ok(view.items.length > 30, 'The workbook fixture exceeds the screen page size');

const logo = await fs.readFile(path.resolve('public/app-icon-512.png'));
const workbook = await buildStaticReportWorkbook({
  data: source,
  view,
  filters,
  includeSimulation: false,
  generatedAt: new Date('2026-09-07T18:00:00.000Z'),
  logoBase64: `data:image/png;base64,${logo.toString('base64')}`,
});

assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), [...REPORT_SHEET_ORDER]);
for (const sheet of workbook.worksheets) {
  assert.ok(sheet.views.length > 0 && sheet.views.every(viewValue => viewValue.showGridLines === false), `${sheet.name} must hide gridlines`);
  let foundAptosNarrow = false;
  sheet.eachRow(row => row.eachCell(cell => {
    if (cell.font?.name === REPORT_THEME.font) foundAptosNarrow = true;
  }));
  assert.ok(foundAptosNarrow, `${sheet.name} must use Aptos Narrow`);
}
for (const sheet of workbook.worksheets.slice(1)) {
  assert.ok(sheet.autoFilter, `${sheet.name} must expose an autofilter`);
}

const summary = workbook.getWorksheet('Resumen');
assert.equal(summary?.getCell('B6').value, 7, 'Summary uses the filtered volunteer population');
assert.equal(summary?.getCell('H9').value, 0.96, 'Summary coverage matches the rounded screen value');
const recruitment = workbook.getWorksheet('Reclutamiento y edades');
assert.equal(recruitment?.getCell('F7').value, 2, 'Recruitment preserves the T1 shortage');
const history = workbook.getWorksheet('Historial');
assert.ok((history?.rowCount || 0) > 30, 'History exports rows beyond the screen page size');
assert.ok(history?.getCell('F7').value instanceof Date, 'History dates remain typed');
assert.equal(history?.getCell('J7').numFmt, '[h]:mm', 'Durations use an Excel duration format');

const outputDirectory = path.resolve('outputs/excel-etapa-3');
await fs.mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'Muestra-reporte-profesional.xlsx');
const buffer = await workbook.xlsx.writeBuffer();
await fs.writeFile(outputPath, new Uint8Array(buffer as ArrayBuffer));

console.log(JSON.stringify({ outputPath, sheets: workbook.worksheets.length, bytes: (await fs.stat(outputPath)).size }));
