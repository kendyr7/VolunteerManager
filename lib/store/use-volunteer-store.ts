import { create } from 'zustand';
import type { VolunteerType } from '@/components/VolunteerTableRow';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';

interface VolunteerStoreState {
  // Single Source of Truth for Volunteers and Shifts
  volunteersMap: Map<string, VolunteerType>;
  shiftsMap: Map<string, any>;

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
}

export const useVolunteerStore = create<VolunteerStoreState>((set, get) => ({
  volunteersMap: new Map<string, VolunteerType>(),
  shiftsMap: new Map<string, any>(),

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

    const isInitialCompleted = useRealtimeStore.getState().initialSyncCompleted;
    if (!existing && !isInitialCompleted) {
      return false;
    }

    const currentTsVal = (existing as any)?.updated_at || (existing as any)?.created_at;
    const incomingTsVal = (incoming as any)?.updated_at || (incoming as any)?.created_at;

    if (existing && currentTsVal && incomingTsVal) {
      const currentTs = new Date(currentTsVal).getTime();
      const incomingTs = new Date(incomingTsVal).getTime();
      if (incomingTs < currentTs) return false;
      if (incomingTs === currentTs && JSON.stringify(existing) === JSON.stringify(incoming)) {
        return false;
      }
    }

    const newMap = new Map(currentMap);
    const merged = mergeRealtimeRecord(existing, incoming);
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
      if (s.id) map.set(s.id, s);
    });
    set({ shiftsMap: map });
  },

  upsertShift: (incoming: any) => {
    if (!incoming.id) return false;
    const currentMap = get().shiftsMap;
    const existing = currentMap.get(incoming.id);

    const currentTsVal = existing?.updated_at || existing?.created_at;
    const incomingTsVal = incoming?.updated_at || incoming?.created_at;

    if (existing && currentTsVal && incomingTsVal) {
      const currentTs = new Date(currentTsVal).getTime();
      const incomingTs = new Date(incomingTsVal).getTime();
      if (incomingTs < currentTs) return false;
    }

    const newMap = new Map(currentMap);
    const merged = mergeRealtimeRecord(existing, incoming);
    newMap.set(incoming.id, merged);
    set({ shiftsMap: newMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  deleteShift: (id: string) => {
    const currentMap = get().shiftsMap;
    if (!currentMap.has(id)) return false;

    const newMap = new Map(currentMap);
    newMap.delete(id);
    set({ shiftsMap: newMap });
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
}));
