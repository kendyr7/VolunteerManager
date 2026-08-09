import { create } from 'zustand';
import type { VolunteerType } from '@/components/VolunteerTableRow';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';
import { assertShiftConsistency } from '@/lib/utils/shift-invariants';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';

interface VolunteerStoreState {
  // Single Source of Truth for Volunteers and Shifts
  volunteersMap: Map<string, VolunteerType>;
  shiftsMap: Map<string, any>;
  shiftsByVolunteerMap: Map<string, any[]>;

  // Volunteers Actions
  setInitialVolunteers: (volunteers: VolunteerType[]) => void;
  upsertVolunteer: (volunteer: VolunteerType, traceId?: string) => boolean;
  deleteVolunteer: (id: string, traceId?: string) => boolean;

  // Shifts Actions
  setInitialShifts: (shifts: any[]) => void;
  upsertShift: (shift: any, traceId?: string) => boolean;
  deleteShift: (id: string, traceId?: string) => boolean;
  
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

  upsertVolunteer: (incoming: VolunteerType, traceId?: string) => {
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

    console.log('[RT-TRACE][ZUSTAND_STATE_CHANGE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      traceId: traceId || 'RT-UNKNOWN',
      recordId: incoming.id,
      previousUpdatedAt: existingTsVal,
      newUpdatedAt: incomingTsVal,
      previousNeighborhood: (existing as any)?.neighborhood || (existing as any)?.ward,
      newNeighborhood: (merged as any).neighborhood || (merged as any).ward,
      previousStake: (existing as any)?.stake,
      newStake: (merged as any).stake,
      timestamp: new Date().toISOString()
    });

    const volName = `${(merged as any).first_name || ''} ${(merged as any).last_name || ''}`.trim() || merged.name;
    realtimeDebugLogger.addLog({
      stage: 'ZUSTAND_UPDATE',
      table: 'volunteers',
      eventType: 'UPDATE',
      volunteerId: merged.id,
      volunteerName: volName,
      details: `Zustand store updated volunteer: ${volName} (ward/neighborhood: ${(merged as any).neighborhood || (merged as any).ward || ''})`,
      payload: merged,
    });
    realtimeDebugLogger.triggerHighlight(merged.id, 'volunteers');

    return true;
  },

  deleteVolunteer: (id: string, traceId?: string) => {
    const currentMap = get().volunteersMap;
    if (!currentMap.has(id)) return false;

    const newMap = new Map(currentMap);
    newMap.delete(id);
    set({ volunteersMap: newMap });
    useRealtimeStore.getState().recordSync();

    realtimeDebugLogger.addLog({
      stage: 'ZUSTAND_UPDATE',
      table: 'volunteers',
      eventType: 'DELETE',
      volunteerId: id,
      details: `Zustand store deleted volunteer id: ${id}`,
    });

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

  upsertShift: (incoming: any, traceId?: string) => {
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
    const volId = (sanitized as any).volunteer_id || (sanitized as any).volunteerId;
    const prevShifts = volId ? (get().shiftsByVolunteerMap.get(volId) || []) : [];

    set({ shiftsMap: newMap, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().recordSync();

    console.log('[RT-TRACE][ZUSTAND_STATE_CHANGE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      traceId: traceId || 'RT-UNKNOWN',
      recordId: incoming.id,
      volunteer_id: volId,
      day_key: (sanitized as any).day_key,
      shift_key: (sanitized as any).shift_key,
      previousCount: prevShifts.length,
      newCount: byVolMap.get(volId)?.length || 0,
      timestamp: new Date().toISOString()
    });

    realtimeDebugLogger.addLog({
      stage: 'ZUSTAND_UPDATE',
      table: 'shifts',
      eventType: 'INSERT',
      volunteerId: volId,
      details: `Zustand store inserted/updated shift: ${(sanitized as any).day_key} / ${(sanitized as any).shift_key}`,
      payload: sanitized,
    });
    if (volId) realtimeDebugLogger.triggerHighlight(volId, 'shifts');

    return true;
  },

  deleteShift: (id: string, traceId?: string) => {
    const currentMap = get().shiftsMap;
    const currentByVolMap = get().shiftsByVolunteerMap;

    let targetVolId: string | null = null;
    if (currentMap.has(id)) {
      const targetShift = currentMap.get(id);
      targetVolId = (targetShift as any)?.volunteer_id || (targetShift as any)?.volunteerId || null;
    }

    const prevShifts = targetVolId ? (currentByVolMap.get(targetVolId) || []) : [];
    const newMap = new Map(currentMap);
    newMap.delete(id);

    const byVolMap = rebuildShiftsByVolunteerMap(newMap);

    currentByVolMap.forEach((shiftsList, volId) => {
      const filtered = shiftsList.filter(s => s.id !== id);
      if (filtered.length !== shiftsList.length || volId === targetVolId) {
        byVolMap.set(volId, filtered);
      }
    });

    set({ shiftsMap: newMap, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().recordSync();

    console.log('[RT-TRACE][ZUSTAND_STATE_CHANGE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      traceId: traceId || 'RT-UNKNOWN',
      recordId: id,
      volunteer_id: targetVolId,
      previousCount: prevShifts.length,
      newCount: targetVolId ? (byVolMap.get(targetVolId)?.length || 0) : 0,
      timestamp: new Date().toISOString()
    });

    realtimeDebugLogger.addLog({
      stage: 'ZUSTAND_UPDATE',
      table: 'shifts',
      eventType: 'DELETE',
      volunteerId: targetVolId || undefined,
      details: `Zustand store deleted shift id: ${id}`,
    });
    if (targetVolId) realtimeDebugLogger.triggerHighlight(targetVolId, 'shifts');

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
