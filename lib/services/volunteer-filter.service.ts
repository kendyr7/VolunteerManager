import type { VolunteerType } from '@/components/VolunteerTableRow';

export interface FilterCriteria {
  currentRole: 'Admin' | 'Editor' | 'Lector';
  currentCommittee?: string;
  canViewAllVolunteers?: boolean;
  showArchived: boolean;
  selectedCommittees?: string[];
  selectedStakes?: string[];
  selectedWards?: string[];
}

export function filterVolunteerIds(
  volunteers: VolunteerType[],
  matchedSearchIds: Set<string>,
  criteria: FilterCriteria
): VolunteerType[] {
  const {
    currentRole,
    currentCommittee,
    canViewAllVolunteers = false,
    showArchived,
    selectedCommittees = [],
    selectedStakes = [],
    selectedWards = [],
  } = criteria;

  if (currentRole === 'Lector') return [];

  return volunteers.filter(v => {
    // 1. Search query match
    if (matchedSearchIds.size > 0 && !matchedSearchIds.has(v.id)) return false;

    // 2. Role-based isolation
    if (currentRole === 'Editor' && !canViewAllVolunteers && v.committee !== currentCommittee) return false;

    // 3. Status match
    const matchesStatus = showArchived ? v.status === 'archived' : v.status !== 'archived';
    if (!matchesStatus) return false;

    // 4. Secondary filters
    if (selectedCommittees.length > 0 && !selectedCommittees.includes(v.committee)) return false;
    if (selectedStakes.length > 0 && !selectedStakes.includes(v.stake)) return false;
    if (selectedWards.length > 0 && !selectedWards.includes(v.ward)) return false;

    return true;
  });
}
