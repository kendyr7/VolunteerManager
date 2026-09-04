import 'server-only';

import { getAuthorizationSnapshot } from '@/lib/authorization';
import { formatDateShort, getAvailableShiftKeys, getOperationalEventDays, getOfficialShiftTime } from '@/lib/dates';
import { hasCapability } from '@/lib/role-permissions';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';

interface CommitteeAreaRow {
  id: string;
  committee_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  sort_order: number | null;
}

interface AreaRequirementRow {
  area_id: string;
  day_key: string;
  shift_key: 'T1' | 'T2' | 'T3' | 'T4';
  required_count: number | null;
}

interface ShiftAreaRow {
  id: string;
  volunteer_id: string;
  day_key: string;
  shift_key: 'T1' | 'T2' | 'T3' | 'T4';
  area_id: string | null;
}

interface AreaVolunteerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  neighborhood: string | null;
  stake: string | null;
  phone: string | null;
}

interface AreaCommitteeRow {
  id: string;
  name: string;
}

function committeeSlug(name: string, id: string, usedSlugs: Set<string>): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'comite';
  const slug = usedSlugs.has(base) ? `${base}-${id.slice(0, 8)}` : base;
  usedSlugs.add(slug);
  return slug;
}

export interface AreaCommitteeOption {
  id: string;
  name: string;
  slug: string;
}

export interface AreaManagementItem {
  id: string;
  committeeId: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  sortOrder: number;
  assignedCount: number;
  requiredTotal: number;
}

export interface AreaRequirementValue {
  areaId: string;
  dayKey: string;
  shiftKey: 'T1' | 'T2' | 'T3' | 'T4';
  requiredCount: number;
}

export interface AreaVolunteer {
  id: string;
  name: string;
  age: number | null;
  neighborhood: string | null;
  stake: string | null;
  phone: string | null;
}

export interface AreaShiftAssignment {
  id: string;
  volunteerId: string;
  dayKey: string;
  shiftKey: 'T1' | 'T2' | 'T3' | 'T4';
  areaId: string | null;
}

export interface AreaEventDay {
  key: string;
  label: string;
  dateLabel: string;
  dateNum: string;
  shiftKeys: Array<'T1' | 'T2' | 'T3' | 'T4'>;
  shiftLabels: Partial<Record<'T1' | 'T2' | 'T3' | 'T4', string>>;
}

export interface AreaManagementData {
  isAdmin: boolean;
  committees: AreaCommitteeOption[];
  selectedCommittee: AreaCommitteeOption;
  areas: AreaManagementItem[];
  requirements: AreaRequirementValue[];
  volunteers: AreaVolunteer[];
  assignments: AreaShiftAssignment[];
  eventDays: AreaEventDay[];
}

export class CommitteeAreaQueryService {
  static async getManagementData(requestedCommitteeId?: string): Promise<AreaManagementData | null> {
    const authorization = await getAuthorizationSnapshot();
    if (!authorization.authenticated || authorization.userType !== 'profile') return null;

    const supabase = await getAdminSupabase();
    const { data: committeeRows, error: committeeError } = await supabase
      .from('committees')
      .select('id, name')
      .or('status.is.null,status.neq.archived')
      .order('name');
    if (committeeError) throw new Error(`No se pudieron cargar los comités: ${committeeError.message}`);

    const usedSlugs = new Set<string>();
    const allCommittees = ((committeeRows || []) as AreaCommitteeRow[]).map((committee) => ({
      ...committee,
      slug: committeeSlug(committee.name, committee.id, usedSlugs),
    }));
    const isAdmin = authorization.role === 'Admin';
    const committees = isAdmin
      ? allCommittees
      : allCommittees.filter((committee) => committee.id === authorization.committeeId);
    if (committees.length === 0) return null;

    const selectedCommittee = isAdmin
      ? committees.find((committee) => committee.id === requestedCommitteeId || committee.slug === requestedCommitteeId
        || (requestedCommitteeId && committee.name.localeCompare(requestedCommitteeId, 'es', { sensitivity: 'base' }) === 0)) || committees[0]
      : committees[0];
    if (!hasCapability(authorization, 'view_area_coverage', selectedCommittee.id)) return null;

    const areaRows = await fetchAllRowsStrict<CommitteeAreaRow>(
      supabase,
      'committee_areas',
      'id, committee_id, name, description, status, sort_order',
      (query) => query.eq('committee_id', selectedCommittee.id).order('sort_order').order('name').order('id')
    );
    const areaIds = areaRows.map((area) => area.id);
    const validAreaIds = new Set(areaIds);

    const volunteerRows = await fetchAllRowsStrict<AreaVolunteerRow>(
      supabase,
      'volunteers',
      'id, first_name, last_name, age, neighborhood, stake, phone',
      (query) => query.eq('committee_id', selectedCommittee.id).or('status.is.null,status.neq.archived').order('first_name').order('last_name').order('id')
    );
    const volunteerIds = volunteerRows.map((volunteer) => volunteer.id);
    const operationalEventDates = getOperationalEventDays();
    const eventDayKeys = operationalEventDates.map((date) => formatDateShort(date));

    const [requirementRows, shiftRows] = areaIds.length > 0
      ? await Promise.all([
          fetchAllRowsStrict<AreaRequirementRow>(
            supabase,
            'area_shift_requirements',
            'area_id, day_key, shift_key, required_count',
            (query) => query.in('area_id', areaIds).in('day_key', eventDayKeys).order('id')
          ),
          volunteerIds.length > 0
            ? fetchAllRowsStrict<ShiftAreaRow>(
                supabase,
                'shifts',
                'id, volunteer_id, day_key, shift_key, area_id',
                (query) => query.in('volunteer_id', volunteerIds).in('day_key', eventDayKeys).order('id')
              )
            : Promise.resolve([]),
        ])
      : [
          [],
          volunteerIds.length > 0
            ? await fetchAllRowsStrict<ShiftAreaRow>(
                supabase,
                'shifts',
                'id, volunteer_id, day_key, shift_key, area_id',
                (query) => query.in('volunteer_id', volunteerIds).in('day_key', eventDayKeys).order('id')
              )
            : [],
        ];

    const assignedByArea = new Map<string, number>();
    for (const shift of shiftRows) {
      if (shift.area_id && validAreaIds.has(shift.area_id)) {
        assignedByArea.set(shift.area_id, (assignedByArea.get(shift.area_id) || 0) + 1);
      }
    }
    const requiredByArea = new Map<string, number>();
    for (const requirement of requirementRows) {
      requiredByArea.set(
        requirement.area_id,
        (requiredByArea.get(requirement.area_id) || 0) + Number(requirement.required_count || 0)
      );
    }

    const eventDays = operationalEventDates.map((date) => {
      const key = formatDateShort(date);
      const shiftKeys = getAvailableShiftKeys(key);
      return {
        key,
        label: new Intl.DateTimeFormat('es-GT', { weekday: 'short' }).format(date).replace('.', ''),
        dateLabel: new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' }).format(date).replace('.', ''),
        dateNum: new Intl.DateTimeFormat('es-GT', { day: 'numeric' }).format(date),
        shiftKeys,
        shiftLabels: Object.fromEntries(
          shiftKeys.map((shiftKey) => [shiftKey, getOfficialShiftTime(key, shiftKey).shortTimeLabel])
        ),
      } as AreaEventDay;
    });

    return {
      isAdmin,
      committees,
      selectedCommittee,
      areas: areaRows.map((area) => ({
        id: area.id,
        committeeId: area.committee_id,
        name: area.name,
        description: area.description,
        status: area.status,
        sortOrder: Number(area.sort_order || 0),
        assignedCount: assignedByArea.get(area.id) || 0,
        requiredTotal: requiredByArea.get(area.id) || 0,
      })),
      requirements: requirementRows.map((requirement) => ({
        areaId: requirement.area_id,
        dayKey: requirement.day_key,
        shiftKey: requirement.shift_key,
        requiredCount: Number(requirement.required_count || 0),
      })),
      volunteers: volunteerRows.map((volunteer) => ({
        id: volunteer.id,
        name: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim() || 'Voluntario',
        age: volunteer.age === null ? null : Number(volunteer.age),
        neighborhood: volunteer.neighborhood,
        stake: volunteer.stake,
        phone: volunteer.phone,
      })),
      assignments: shiftRows.map((shift) => ({
        id: shift.id,
        volunteerId: shift.volunteer_id,
        dayKey: shift.day_key,
        shiftKey: shift.shift_key,
        // Never expose a stale or corrupted cross-committee area in this module.
        areaId: shift.area_id && validAreaIds.has(shift.area_id) ? shift.area_id : null,
      })),
      eventDays,
    };
  }
}
