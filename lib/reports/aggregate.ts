import {
  filterReportItems,
  filterReportRequirements,
  filterReportVolunteers,
  hasScheduleRestriction,
} from './filter';
import type {
  AgeSegmentation,
  AttendanceSummary,
  CommitteeAttendance,
  CommitteeRecruitment,
  CommitteeReportSummary,
  DailyCoverage,
  ReportFilters,
  ReportRequirement,
  ReportsData,
  ReportView,
  VolunteerReportSummary,
} from './types';
import { calculateReliabilityScore } from '../services/volunteer-reliability.service';

const AGE_RANGES = ['< 18', '18 - 25', '26 - 35', '36 - 50', '51+', 'Sin edad'] as const;

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function requirementKey(committeeId: string, date: string, shiftKey: string): string {
  return `${committeeId}|${date}|${shiftKey}`;
}

function calculateRequirementCoverage(
  requirements: readonly ReportRequirement[],
  assignmentCountBySlot: ReadonlyMap<string, number>,
) {
  let required = 0;
  let covered = 0;
  let missing = 0;

  for (const requirement of requirements) {
    const target = Math.max(0, requirement.required);
    const assigned = assignmentCountBySlot.get(requirementKey(
      requirement.committeeId,
      requirement.date,
      requirement.shiftKey,
    )) || 0;
    required += target;
    covered += Math.min(assigned, target);
    missing += Math.max(target - assigned, 0);
  }

  return { required, covered, missing };
}

function ageRange(age: number | null): (typeof AGE_RANGES)[number] {
  if (!age || age <= 0) return 'Sin edad';
  if (age < 18) return '< 18';
  if (age <= 25) return '18 - 25';
  if (age <= 35) return '26 - 35';
  if (age <= 50) return '36 - 50';
  return '51+';
}

function selectedCommittees(data: ReportsData, filters: ReportFilters) {
  if (!filters.committeeIds?.length) return data.uniqueCommittees;
  return data.uniqueCommittees.filter((committee) => (
    filters.committeeIds!.includes(committee.id) || filters.committeeIds!.includes(committee.name)
  ));
}

function buildVolunteerRanking(items: ReportView['items']): VolunteerReportSummary[] {
  const byVolunteer = new Map<string, VolunteerReportSummary>();
  for (const item of items) {
    const value = byVolunteer.get(item.volunteerId) || {
      id: item.volunteerId,
      name: item.volunteerName,
      phone: item.phone,
      neighborhood: item.neighborhood,
      stake: item.stake,
      committee: item.committeeName,
      totalShifts: 0,
      confirmed: 0,
      absent: 0,
      reliability: 100,
      minutes: 0,
    };
    value.totalShifts += 1;
    if (item.status === 'confirmed') {
      value.confirmed += 1;
      value.minutes += item.durationMinutes;
    } else if (item.status === 'absent') {
      value.absent += 1;
    }
    byVolunteer.set(item.volunteerId, value);
  }
  return Array.from(byVolunteer.values())
    .map((volunteer) => {
      const total = volunteer.totalShifts;
      const absent = volunteer.absent;
      const reliability = calculateReliabilityScore(total, absent);
      return {
        ...volunteer,
        reliability,
      };
    })
    .sort((left, right) => right.minutes - left.minutes || left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));
}

export function buildReportView(data: ReportsData, filters: ReportFilters = {}): ReportView {
  const items = filterReportItems(data.items, filters);
  const committeeNameById = new Map(data.uniqueCommittees.map((committee) => [committee.id, committee.name]));
  const requirements = filterReportRequirements(data.requirements, filters, committeeNameById);
  const activeCommittees = selectedCommittees(data, filters);
  const baseRecruitmentVolunteers = filterReportVolunteers(data.volunteers, filters);
  const matchingVolunteerIds = new Set(items.map((item) => item.volunteerId));
  const recruitmentVolunteers = hasScheduleRestriction(filters)
    ? baseRecruitmentVolunteers.filter((volunteer) => matchingVolunteerIds.has(volunteer.id))
    : baseRecruitmentVolunteers;

  const assignmentCountBySlot = new Map<string, number>();
  for (const item of items) {
    const key = requirementKey(item.committeeId, item.date, `T${item.shiftNumber}`);
    assignmentCountBySlot.set(key, (assignmentCountBySlot.get(key) || 0) + 1);
  }

  const committeeSummary: CommitteeReportSummary[] = activeCommittees.map((committee) => {
    const committeeItems = items.filter((item) => item.committeeId === committee.id);
    const uniqueVolunteerIds = new Set(committeeItems.map((item) => item.volunteerId));
    const attendeeIds = new Set(committeeItems.filter((item) => item.status === 'confirmed').map((item) => item.volunteerId));
    const confirmed = committeeItems.filter((item) => item.status === 'confirmed');
    const absent = committeeItems.filter((item) => item.status === 'absent');
    const totalMinutes = sum(confirmed.map((item) => item.durationMinutes));
    return {
      id: committee.id,
      name: committee.name,
      volunteersCount: uniqueVolunteerIds.size,
      attendeesCount: attendeeIds.size,
      totalShifts: committeeItems.length,
      confirmed: confirmed.length,
      absent: absent.length,
      pending: committeeItems.filter((item) => item.status === 'registered').length,
      attendanceRate: percentage(confirmed.length, confirmed.length + absent.length) || (committeeItems.length > 0 ? percentage(confirmed.length, committeeItems.length) : 0),
      totalMinutes,
      avgMinutes: attendeeIds.size > 0 ? Math.round(totalMinutes / attendeeIds.size) : 0,
    };
  });

  const allAttendeeIds = new Set(items.filter((item) => item.status === 'confirmed').map((item) => item.volunteerId));
  const allVolunteerIds = new Set(items.map((item) => item.volunteerId));
  const confirmedItems = items.filter((item) => item.status === 'confirmed');
  const absentItems = items.filter((item) => item.status === 'absent');
  const totalMinutes = sum(confirmedItems.map((item) => item.durationMinutes));
  const committeeTotals = {
    volunteersCount: allVolunteerIds.size,
    attendeesCount: allAttendeeIds.size,
    totalShifts: items.length,
    confirmed: confirmedItems.length,
    absent: absentItems.length,
    pending: items.filter((item) => item.status === 'registered').length,
    attendanceRate: percentage(confirmedItems.length, confirmedItems.length + absentItems.length) || (items.length > 0 ? percentage(confirmedItems.length, items.length) : 0),
    totalMinutes,
    avgMinutes: allAttendeeIds.size > 0 ? Math.round(totalMinutes / allAttendeeIds.size) : 0,
  };

  const byCommittee: CommitteeAttendance[] = activeCommittees.map((committee) => {
    const summary = committeeSummary.find((value) => value.id === committee.id)!;
    const coverage = calculateRequirementCoverage(
      requirements.filter((value) => value.committeeId === committee.id),
      assignmentCountBySlot,
    );
    return {
      committeeId: committee.id,
      committeeName: committee.name,
      assigned: summary.totalShifts,
      checkedIn: summary.confirmed,
      absent: summary.absent,
      required: coverage.required,
      attendanceRate: summary.attendanceRate,
      coverageRate: percentage(coverage.covered, coverage.required),
    };
  });

  const shiftKeys = Array.from(new Set([
    ...data.eventDays.flatMap((day) => day.shiftKeys),
    ...items.map((item) => `T${item.shiftNumber}`),
  ])).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const byShift = shiftKeys.map((shiftKey) => {
    const matchingItems = items.filter((item) => `T${item.shiftNumber}` === shiftKey);
    const assigned = matchingItems.length;
    const checkedIn = matchingItems.filter((item) => item.status === 'confirmed').length;
    const required = sum(requirements.filter((value) => value.shiftKey === shiftKey).map((value) => value.required));
    return { shiftKey, assigned, checkedIn, required, rate: percentage(checkedIn, assigned) };
  });
  const totalCoverage = calculateRequirementCoverage(requirements, assignmentCountBySlot);
  const attendanceSummary: AttendanceSummary = {
    totalAssigned: items.length,
    totalCheckedIn: confirmedItems.length,
    totalAbsent: absentItems.length,
    totalRequired: totalCoverage.required,
    totalCoveredRequired: totalCoverage.covered,
    attendanceRate: percentage(confirmedItems.length, items.length),
    coverageRate: percentage(totalCoverage.covered, totalCoverage.required),
    byCommittee,
    byShift,
  };

  const volunteersByCommittee = new Map<string, number>();
  for (const volunteer of recruitmentVolunteers) {
    volunteersByCommittee.set(volunteer.committeeId, (volunteersByCommittee.get(volunteer.committeeId) || 0) + 1);
  }
  const recruitmentSummary: CommitteeRecruitment[] = activeCommittees.map((committee) => {
    const assignedShifts = items.filter((item) => item.committeeId === committee.id).length;
    const coverage = calculateRequirementCoverage(
      requirements.filter((requirement) => requirement.committeeId === committee.id),
      assignmentCountBySlot,
    );
    return {
      committeeId: committee.id,
      committeeName: committee.name,
      totalVolunteers: volunteersByCommittee.get(committee.id) || 0,
      totalRequiredShifts: coverage.required,
      assignedShifts,
      coveredRequiredShifts: coverage.covered,
      missingShifts: coverage.missing,
      coverageRate: percentage(coverage.covered, coverage.required),
    };
  });

  const ageCounts = new Map<(typeof AGE_RANGES)[number], number>(AGE_RANGES.map((range) => [range, 0]));
  for (const volunteer of recruitmentVolunteers) {
    const range = ageRange(volunteer.age);
    ageCounts.set(range, (ageCounts.get(range) || 0) + 1);
  }
  const ageSegmentation: AgeSegmentation[] = AGE_RANGES.map((range) => ({
    range,
    count: ageCounts.get(range) || 0,
    percentage: percentage(ageCounts.get(range) || 0, recruitmentVolunteers.length),
  }));

  const dailyCoverage: DailyCoverage[] = data.eventDays
    .filter((day) => !filters.dates?.length || filters.dates.includes(day.date))
    .map((day) => {
      const dayItems = items.filter((item) => item.date === day.date);
      const byShift = Object.fromEntries(day.shiftKeys.map((shiftKey) => {
        const shiftItems = dayItems.filter((item) => `T${item.shiftNumber}` === shiftKey);
        const coverage = calculateRequirementCoverage(
          requirements.filter((requirement) => requirement.date === day.date && requirement.shiftKey === shiftKey),
          assignmentCountBySlot,
        );
        const assigned = shiftItems.length;
        const checkedIn = shiftItems.filter((item) => item.status === 'confirmed').length;
        return [shiftKey, {
          required: coverage.required,
          assigned,
          covered: coverage.covered,
          checkedIn,
          missing: coverage.missing,
        }];
      }));
      const required = sum(Object.values(byShift).map((value) => value.required));
      const assigned = dayItems.length;
      const covered = sum(Object.values(byShift).map((value) => value.covered));
      const checkedIn = dayItems.filter((item) => item.status === 'confirmed').length;
      return {
        date: day.date,
        dayLabel: day.dayLabel,
        required,
        assigned,
        covered,
        checkedIn,
        missing: sum(Object.values(byShift).map((value) => value.missing)),
        coverageRate: percentage(covered, required),
        byShift,
      };
    });

  return {
    items,
    recruitmentVolunteers,
    kpiStats: {
      totalShifts: items.length,
      confirmedShifts: confirmedItems.length,
      absentShifts: absentItems.length,
      pendingShifts: items.filter((item) => item.status === 'registered').length,
      replacedShifts: items.filter((item) => item.status === 'replaced').length,
      totalMinutes,
      attendanceRate: percentage(confirmedItems.length, confirmedItems.length + absentItems.length) || (items.length > 0 ? percentage(confirmedItems.length, items.length) : 0),
    },
    volunteerRanking: buildVolunteerRanking(items),
    committeeSummary,
    committeeTotals,
    attendanceSummary,
    recruitmentSummary,
    ageSegmentation,
    dailyCoverage,
  };
}
