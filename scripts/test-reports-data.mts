import assert from 'node:assert/strict';
import { buildReportView } from '../lib/reports/aggregate';
import type { ReportsData } from '../lib/reports/types';

const source: ReportsData = {
  uniqueCommittees: [
    { id: 'guides', name: 'Guías' },
    { id: 'security', name: 'Seguridad' },
  ],
  uniqueNeighborhoods: ['Centro', 'Norte'],
  uniqueStakes: ['Norte'],
  eventDays: [
    { date: '2026-09-10', dayLabel: 'Jue 10 sep', shiftKeys: ['T1'] },
    { date: '2026-09-11', dayLabel: 'Vie 11 sep', shiftKeys: ['T1'] },
  ],
  volunteers: [
    { id: 'ana', name: 'Ana Pérez', age: 20, phone: '111', neighborhood: 'Norte', stake: 'Norte', committeeId: 'guides', committeeName: 'Guías' },
    { id: 'luis', name: 'Luis Díaz', age: 40, phone: '222', neighborhood: 'Norte', stake: 'Norte', committeeId: 'guides', committeeName: 'Guías' },
    { id: 'maria', name: 'María López', age: 55, phone: '333', neighborhood: 'Centro', stake: 'Norte', committeeId: 'security', committeeName: 'Seguridad' },
  ],
  requirements: [
    { committeeId: 'guides', date: '2026-09-10', shiftKey: 'T1', required: 3 },
    { committeeId: 'guides', date: '2026-09-11', shiftKey: 'T1', required: 4 },
    { committeeId: 'security', date: '2026-09-10', shiftKey: 'T1', required: 1 },
    { committeeId: 'security', date: '2026-09-11', shiftKey: 'T1', required: 2 },
  ],
  items: [
    { registrationId: 'one', volunteerId: 'ana', volunteerName: 'Ana Pérez', age: 20, phone: '111', neighborhood: 'Norte', stake: 'Norte', committeeId: 'guides', committeeName: 'Guías', date: '2026-09-10', shiftNumber: 1, startTime: '7:00 AM', endTime: '12:00 PM', isExtended: false, status: 'confirmed', durationMinutes: 120 },
    { registrationId: 'two', volunteerId: 'ana', volunteerName: 'Ana Pérez', age: 20, phone: '111', neighborhood: 'Norte', stake: 'Norte', committeeId: 'guides', committeeName: 'Guías', date: '2026-09-11', shiftNumber: 1, startTime: '7:00 AM', endTime: '12:00 PM', isExtended: false, status: 'absent', durationMinutes: 0 },
    { registrationId: 'three', volunteerId: 'maria', volunteerName: 'María López', age: 55, phone: '333', neighborhood: 'Centro', stake: 'Norte', committeeId: 'security', committeeName: 'Seguridad', date: '2026-09-10', shiftNumber: 1, startTime: '7:00 AM', endTime: '12:00 PM', isExtended: false, status: 'registered', durationMinutes: 0 },
  ],
};

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
}

const unfiltered = buildReportView(source);
assert.equal(unfiltered.items.length, 3, 'All matching shifts are retained');
assert.equal(unfiltered.attendanceSummary.totalRequired, 10, 'Requirements sum exact committee/date/shift rows');
assert.equal(unfiltered.recruitmentSummary.find(row => row.committeeId === 'guides')?.totalVolunteers, 2, 'Recruitment includes volunteers without shifts');
assert.deepEqual(unfiltered.ageSegmentation.map(row => [row.range, row.count]), [
  ['< 18', 0], ['18 - 25', 1], ['26 - 35', 0], ['36 - 50', 1], ['51+', 1], ['Sin edad', 0],
], 'Age segments use the complete eligible volunteer population');
assert.equal(unfiltered.volunteerRanking.find(row => row.id === 'maria')?.reliability, 100, 'Pending-only volunteers keep neutral reliability');

const singleCommitteeDate = buildReportView(source, { committeeIds: ['guides'], dates: ['2026-09-10'] });
assert.equal(singleCommitteeDate.items.length, 1, 'Committee and date filters combine with AND');
assert.equal(singleCommitteeDate.attendanceSummary.totalRequired, 3, 'Requirement uses the selected slot instead of a ratio');
assert.equal(singleCommitteeDate.recruitmentVolunteers.length, 1, 'A date restriction excludes volunteers without a matching shift');
assert.equal(singleCommitteeDate.dailyCoverage[0].required, 3, 'Daily coverage uses the same exact requirement');
assert.equal(singleCommitteeDate.dailyCoverage[0].missing, 2, 'Daily missing slots use assignments, not attendance');

const multipleCommittees = buildReportView(source, { committeeIds: ['guides', 'security'], dates: ['2026-09-10'] });
assert.equal(multipleCommittees.attendanceSummary.totalRequired, 4, 'Multiple committees sum their selected requirements');
assert.equal(multipleCommittees.dailyCoverage[0].assigned, 2, 'Multiple committee assignments remain complete');

const attendanceOnly = buildReportView(source, { statuses: ['confirmed'] });
assert.equal(attendanceOnly.items.length, 1, 'Status filters apply to the shift numerator');
assert.equal(attendanceOnly.attendanceSummary.totalRequired, 10, 'Status filters never reduce operational requirements');
assert.equal(attendanceOnly.dailyCoverage.reduce((total, day) => total + day.missing, 0), 9, 'Missing slots remain visible after an attendance filter');

const normalizedSearch = buildReportView(source, { search: 'maria', committeeIds: ['security'] });
assert.equal(normalizedSearch.items.length, 1, 'Search ignores accents and combines with committee selection');
check(normalizedSearch.recruitmentVolunteers[0]?.id === 'maria', 'Search applies to the complete volunteer population');

const assignedByShift = { 1: 4, 2: 7, 3: 7, 4: 7 };
const slotBalanceSource: ReportsData = {
  uniqueCommittees: [{ id: 'history', name: 'Historia' }],
  uniqueNeighborhoods: [],
  uniqueStakes: [],
  eventDays: [{ date: '2026-09-12', dayLabel: 'Sáb 12 sep', shiftKeys: ['T1', 'T2', 'T3', 'T4'] }],
  volunteers: [],
  requirements: [1, 2, 3, 4].map(shiftNumber => ({
    committeeId: 'history',
    date: '2026-09-12',
    shiftKey: `T${shiftNumber}`,
    required: 6,
  })),
  items: Object.entries(assignedByShift).flatMap(([shiftNumberValue, count]) => {
    const shiftNumber = Number(shiftNumberValue);
    return Array.from({ length: count }, (_, index) => ({
      registrationId: `${shiftNumber}-${index}`,
      volunteerId: `${shiftNumber}-${index}`,
      volunteerName: `Voluntario ${shiftNumber}-${index}`,
      age: null,
      phone: '',
      neighborhood: 'Sin barrio',
      stake: 'Sin estaca',
      committeeId: 'history',
      committeeName: 'Historia',
      date: '2026-09-12',
      shiftNumber,
      startTime: '',
      endTime: '',
      isExtended: false,
      status: 'registered' as const,
      durationMinutes: 0,
    }));
  }),
};

const slotBalance = buildReportView(slotBalanceSource);
const historyRecruitment = slotBalance.recruitmentSummary[0];
assert.equal(historyRecruitment.assignedShifts, 25, 'Raw assignments retain overstaffed shifts');
assert.equal(historyRecruitment.totalRequiredShifts, 24, 'Requirements retain all four shift targets');
assert.equal(historyRecruitment.coveredRequiredShifts, 22, 'Overstaffing cannot cover a shortage in another shift');
assert.equal(historyRecruitment.missingShifts, 2, 'Shortages are calculated per committee/date/shift before summing');
assert.equal(historyRecruitment.coverageRate, 92, 'Aggregate coverage measures fulfilled target slots');
assert.equal(slotBalance.dailyCoverage[0].missing, 2, 'Daily totals preserve per-shift shortages');
assert.equal(slotBalance.attendanceSummary.coverageRate, 92, 'All report summaries share the same slot-level coverage rule');

console.log('Report filter and aggregation tests passed.');
