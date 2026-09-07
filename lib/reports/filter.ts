import type { ReportFilters, ReportItem, ReportRequirement, ReportVolunteer } from './types';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function hasSelectedValue(values: readonly string[] | undefined, value: string): boolean {
  return !values?.length || values.includes(value);
}

function matchesCommittee(
  filters: ReportFilters,
  committeeId: string,
  committeeName?: string,
): boolean {
  const selected = filters.committeeIds;
  return !selected?.length || selected.includes(committeeId) || Boolean(committeeName && selected.includes(committeeName));
}

function matchesSearch(search: string | undefined, values: string[]): boolean {
  const terms = (search || '')
    .split(',')
    .map(normalize)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(values.join(' '));
  return terms.every(term => haystack.includes(term));
}

export function filterReportItems(items: readonly ReportItem[], filters: ReportFilters): ReportItem[] {
  return items.filter((item) => (
    matchesSearch(filters.search, [
      item.volunteerName,
      item.phone,
      item.neighborhood,
      item.stake,
      item.committeeName,
      item.committeeId,
    ])
    && matchesCommittee(filters, item.committeeId, item.committeeName)
    && hasSelectedValue(filters.neighborhoods, item.neighborhood)
    && hasSelectedValue(filters.stakes, item.stake)
    && hasSelectedValue(filters.statuses, item.status)
    && hasSelectedValue(filters.dates, item.date)
  ));
}

/** Filters the enrolled population without schedule-only restrictions. */
export function filterReportVolunteers(volunteers: readonly ReportVolunteer[], filters: ReportFilters): ReportVolunteer[] {
  return volunteers.filter((volunteer) => (
    matchesSearch(filters.search, [
      volunteer.name,
      volunteer.phone,
      volunteer.neighborhood,
      volunteer.stake,
      volunteer.committeeName,
      volunteer.committeeId,
    ])
    && matchesCommittee(filters, volunteer.committeeId, volunteer.committeeName)
    && hasSelectedValue(filters.neighborhoods, volunteer.neighborhood)
    && hasSelectedValue(filters.stakes, volunteer.stake)
  ));
}

/** Requirements are operational goals; person, search and status filters do not reduce them. */
export function filterReportRequirements(
  requirements: readonly ReportRequirement[],
  filters: ReportFilters,
  committeeNameById: ReadonlyMap<string, string>,
): ReportRequirement[] {
  return requirements.filter((requirement) => (
    matchesCommittee(filters, requirement.committeeId, committeeNameById.get(requirement.committeeId))
    && hasSelectedValue(filters.dates, requirement.date)
  ));
}

export function hasScheduleRestriction(filters: ReportFilters): boolean {
  return Boolean(filters.statuses?.length || filters.dates?.length);
}
