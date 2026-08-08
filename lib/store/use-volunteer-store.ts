import { create } from 'zustand';
import type { VolunteerType } from '@/components/VolunteerTableRow';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';
import { assertShiftConsistency } from '@/lib/utils/shift-invariants';

interface VolunteerStoreState {
  // Single Source of Truth for Volunteers and Shifts
  volunteersMap: Map<string, VolunteerType>;
  shiftsMap: Map<string, any>;
  shiftsByVolunteerMap: Map<string, any[]>;

  // Volunteers Actions
  setInitialVolunteers: (volunteers: VolunteerType[]) => void;
  upsertVolunteer: (volunteer: VolunteerType) => boolean;
  deleteVolunteer: (id: string) => boolean;

  // Shifts Actions
  setInitialShifts: (shifts: any[]) => void;
  upsertShift: (shift: any) => boolean;
  deleteShift: (id: string) => boolean;
  
  // Selectors
  getVolunteersList: () => VolunteerType[];
  getVolunteerById: (id: string) => VolunteerType | undefined;
  getShiftsList: () => any[];
  getShiftsByVolunteerId: (volunteerId: string) => any[];
}

function rebuildShiftsByVolunteerMap(shiftsMap: Map<string, any>): Map<string, any[]> {
  const index = new Map<string, any[]>();
  shiftsMap.forEach(shift => {
    const volId = shift.volunteer_id || shift.volunteerId || shift.volunteer?.id;
    if (volId) {
      const list = index.get(volId) || [];
      list.push(shift);
      index.set(volId, list);
    }
  });
  return index;
}

const EMPTY_SHIFTS_ARRAY: any[] = [];

export const useVolunteerStore = create<VolunteerStoreState>((set, get) => ({
  volunteersMap: new Map<string, VolunteerType>(),
  shiftsMap: new Map<string, any>(),
  shiftsByVolunteerMap: new Map<string, any[]>(),

  setInitialVolunteers: (volunteers: VolunteerType[]) => {
    const map = new Map<string, VolunteerType>();
    volunteers.forEach(v => {
      if (v.id) map.set(v.id, v);
    });
    set({ volunteersMap: map });
    useRealtimeStore.getState().setInitialSyncCompleted(true);
  },

  upsertVolunteer: (incoming: VolunteerType) => {
    if (!incoming.id) return false;
    const currentMap = get().volunteersMap;
    const existing = currentMap.get(incoming.id);

    const existingTsVal = (existing as any)?.updated_at || (existing as any)?.created_at;
    const incomingTsVal = (incoming as any)?.updated_at || (incoming as any)?.created_at;

    const existingNeigh = (existing as any)?.neighborhood || (existing as any)?.ward;
    const incomingNeigh = (incoming as any)?.neighborhood || (incoming as any)?.ward;

    let decision = 'APPLY_NEW';
    if (existingTsVal && incomingTsVal) {
      const existingTs = new Date(existingTsVal).getTime();
      const incomingTs = new Date(incomingTsVal).getTime();
      if (incomingTs < existingTs) {
        decision = 'REJECT_STALE';
        console.log(`[ZUSTAND REALTIME] id=${incoming.id}, existingNeigh=${existingNeigh}, incomingNeigh=${incomingNeigh}, existingTs=${existingTsVal}, incomingTs=${incomingTsVal}, decision=${decision}`);
        return false;
      }
      decision = incomingTs > existingTs ? 'APPLY_NEWER' : 'APPLY_EQUAL';
    }

    console.log(`[ZUSTAND REALTIME] id=${incoming.id}, existingNeigh=${existingNeigh}, incomingNeigh=${incomingNeigh}, existingTs=${existingTsVal}, incomingTs=${incomingTsVal}, decision=${decision}`);

    const merged = mergeRealtimeRecord(existing, incoming);
    const newMap = new Map(currentMap);
    newMap.set(incoming.id, merged);
    set({ volunteersMap: newMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  deleteVolunteer: (id: string) => {
    const currentMap = get().volunteersMap;
    if (!currentMap.has(id)) return false;

    const newMap = new Map(currentMap);
    newMap.delete(id);
    set({ volunteersMap: newMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  setInitialShifts: (shifts: any[]) => {
    const map = new Map<string, any>();
    shifts.forEach(s => {
      if (s.id) {
        map.set(s.id, assertShiftConsistency(s));
      }
    });
    const byVolMap = rebuildShiftsByVolunteerMap(map);
    set({ shiftsMap: map, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().setInitialSyncCompleted(true);
  },

  upsertShift: (incoming: any) => {
    if (!incoming.id) return false;
    const currentMap = get().shiftsMap;
    const existing = currentMap.get(incoming.id);

    const existingTsVal = existing?.updated_at || existing?.updatedAt || existing?.created_at;
    const incomingTsVal = incoming?.updated_at || incoming?.updatedAt || incoming?.created_at;

    if (existingTsVal && incomingTsVal) {
      const currentTs = new Date(existingTsVal).getTime();
      const incomingTs = new Date(incomingTsVal).getTime();
      if (incomingTs < currentTs) return false;
    }

    const merged = mergeRealtimeRecord(existing, incoming);
    const sanitized = assertShiftConsistency(merged);

    const newMap = new Map(currentMap);
    newMap.set(incoming.id, sanitized);

    const byVolMap = rebuildShiftsByVolunteerMap(newMap);
    set({ shiftsMap: newMap, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  deleteShift: (id: string) => {
    const currentMap = get().shiftsMap;
    if (!currentMap.has(id)) return false;

    const newMap = new Map(currentMap);
    newMap.delete(id);

    const byVolMap = rebuildShiftsByVolunteerMap(newMap);
    set({ shiftsMap: newMap, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  getVolunteersList: () => {
    return Array.from(get().volunteersMap.values());
  },

  getVolunteerById: (id: string) => {
    return get().volunteersMap.get(id);
  },

  getShiftsList: () => {
    return Array.from(get().shiftsMap.values());
  },

  getShiftsByVolunteerId: (volunteerId: string) => {
    return get().shiftsByVolunteerMap.get(volunteerId) || EMPTY_SHIFTS_ARRAY;
  },
}));
