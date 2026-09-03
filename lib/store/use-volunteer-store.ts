import { create } from 'zustand';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';
import { assertShiftConsistency, type ShiftDomainState } from '@/lib/utils/shift-invariants';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';

export interface VolunteerStoreRecord {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  stake?: string | null;
  ward?: string | null;
  neighborhood?: string | null;
  barrio?: string | null;
  committee?: string | null;
  committeeName?: string | null;
  committee_id?: string | null;
  committees?: { name?: string | null } | null;
  volunteerName?: string | null;
  shifts?: number;
  reliability?: number | string | null;
  reliability_score?: number | null;
  computedReliability?: number | string;
  status?: string | null;
  age?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  normalizedSearchText?: string;
}

export interface ShiftStoreRecord extends ShiftDomainState {
  id?: string;
  volunteer_id?: string;
  volunteerId?: string;
  volunteer?: { id?: string } | null;
  dayKey?: string;
  shiftKey?: string;
  area_id?: string | null;
  area_name?: string | null;
  area_description?: string | null;
  committee_areas?: unknown;
  updated_at?: string | null;
  updatedAt?: string | null;
  created_at?: string | null;
}

interface VolunteerStoreState {
  // Single Source of Truth for Volunteers and Shifts
  volunteersMap: Map<string, VolunteerStoreRecord>;
  shiftsMap: Map<string, ShiftStoreRecord>;
  shiftsByVolunteerMap: Map<string, ShiftStoreRecord[]>;

  // Volunteers Actions
  setInitialVolunteers: (volunteers: VolunteerStoreRecord[]) => void;
  upsertVolunteer: (volunteer: VolunteerStoreRecord, traceId?: string) => boolean;
  deleteVolunteer: (id: string, traceId?: string) => boolean;

  // Shifts Actions
  setInitialShifts: (shifts: ShiftStoreRecord[]) => void;
  upsertShift: (shift: ShiftStoreRecord, traceId?: string) => boolean;
  deleteShift: (id: string, traceId?: string) => boolean;
  
  // Selectors
  getVolunteersList: () => VolunteerStoreRecord[];
  getVolunteerById: (id: string) => VolunteerStoreRecord | undefined;
  getShiftsList: () => ShiftStoreRecord[];
  getShiftsByVolunteerId: (volunteerId: string) => ShiftStoreRecord[];
}

function rebuildShiftsByVolunteerMap(shiftsMap: Map<string, ShiftStoreRecord>): Map<string, ShiftStoreRecord[]> {
  const index = new Map<string, ShiftStoreRecord[]>();
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

const EMPTY_SHIFTS_ARRAY: ShiftStoreRecord[] = [];

export const useVolunteerStore = create<VolunteerStoreState>((set, get) => ({
  volunteersMap: new Map<string, VolunteerStoreRecord>(),
  shiftsMap: new Map<string, ShiftStoreRecord>(),
  shiftsByVolunteerMap: new Map<string, ShiftStoreRecord[]>(),

  setInitialVolunteers: (volunteers: VolunteerStoreRecord[]) => {
    const map = new Map<string, VolunteerStoreRecord>();
    volunteers.forEach(v => {
      if (v.id) map.set(v.id, v);
    });
    set({ volunteersMap: map });
    useRealtimeStore.getState().setInitialSyncCompleted(true);
  },

  upsertVolunteer: (incoming: VolunteerStoreRecord, traceId?: string) => {
    if (!incoming.id) return false;
    const currentMap = get().volunteersMap;
    const existing = currentMap.get(incoming.id);

    const existingTsVal = existing?.updated_at || existing?.created_at;
    const incomingTsVal = incoming.updated_at || incoming.created_at;

    const existingNeigh = existing?.neighborhood || existing?.ward;
    const incomingNeigh = incoming.neighborhood || incoming.ward;

    let decision = 'APPLY_NEW';
    if (existingTsVal && incomingTsVal) {
      const existingTs = new Date(existingTsVal).getTime();
      const incomingTs = new Date(incomingTsVal).getTime();
      if (incomingTs < existingTs) {
        decision = 'REJECT_STALE';
        realtimeDebugLogger.debug(`[ZUSTAND REALTIME] id=${incoming.id}, existingNeigh=${existingNeigh}, incomingNeigh=${incomingNeigh}, existingTs=${existingTsVal}, incomingTs=${incomingTsVal}, decision=${decision}`);
        return false;
      }
      decision = incomingTs > existingTs ? 'APPLY_NEWER' : 'APPLY_EQUAL';
    }

    realtimeDebugLogger.debug(`[ZUSTAND REALTIME] id=${incoming.id}, existingNeigh=${existingNeigh}, incomingNeigh=${incomingNeigh}, existingTs=${existingTsVal}, incomingTs=${incomingTsVal}, decision=${decision}`);

    const merged = mergeRealtimeRecord(existing, incoming);
    const newMap = new Map(currentMap);
    newMap.set(incoming.id, merged);
    set({ volunteersMap: newMap });
    useRealtimeStore.getState().recordSync();

    realtimeDebugLogger.debug('[RT-TRACE][ZUSTAND_STATE_CHANGE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      traceId: traceId || 'RT-UNKNOWN',
      recordId: incoming.id,
      previousUpdatedAt: existingTsVal,
      newUpdatedAt: incomingTsVal,
      previousNeighborhood: existing?.neighborhood || existing?.ward,
      newNeighborhood: merged.neighborhood || merged.ward,
      previousStake: existing?.stake,
      newStake: merged.stake,
      timestamp: new Date().toISOString()
    });

    const volName = `${merged.first_name || ''} ${merged.last_name || ''}`.trim() || merged.name || 'Voluntario';
    realtimeDebugLogger.addLog({
      stage: 'ZUSTAND_UPDATE',
      table: 'volunteers',
      eventType: 'UPDATE',
      volunteerId: merged.id,
      volunteerName: volName,
      details: `Zustand store updated volunteer: ${volName} (ward/neighborhood: ${merged.neighborhood || merged.ward || ''})`,
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

  setInitialShifts: (shifts: ShiftStoreRecord[]) => {
    const map = new Map<string, ShiftStoreRecord>();
    shifts.forEach(s => {
      if (s.id) {
        map.set(s.id, assertShiftConsistency(s) as ShiftStoreRecord);
      }
    });
    const byVolMap = rebuildShiftsByVolunteerMap(map);
    set({ shiftsMap: map, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().setInitialSyncCompleted(true);
  },

  upsertShift: (incoming: ShiftStoreRecord, traceId?: string) => {
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
    const sanitized = assertShiftConsistency(merged) as ShiftStoreRecord;

    const newMap = new Map(currentMap);
    newMap.set(incoming.id, sanitized);

    const byVolMap = rebuildShiftsByVolunteerMap(newMap);
    const volId = sanitized.volunteer_id || sanitized.volunteerId;
    const prevShifts = volId ? (get().shiftsByVolunteerMap.get(volId) || []) : [];

    set({ shiftsMap: newMap, shiftsByVolunteerMap: byVolMap });
    useRealtimeStore.getState().recordSync();

    realtimeDebugLogger.debug('[RT-TRACE][ZUSTAND_STATE_CHANGE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      traceId: traceId || 'RT-UNKNOWN',
      recordId: incoming.id,
      volunteer_id: volId,
      day_key: sanitized.day_key,
      shift_key: sanitized.shift_key,
      previousCount: prevShifts.length,
      newCount: volId ? (byVolMap.get(volId)?.length || 0) : 0,
      timestamp: new Date().toISOString()
    });

    realtimeDebugLogger.addLog({
      stage: 'ZUSTAND_UPDATE',
      table: 'shifts',
      eventType: 'INSERT',
      volunteerId: volId,
      details: `Zustand store inserted/updated shift: ${sanitized.day_key} / ${sanitized.shift_key}`,
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
      targetVolId = targetShift?.volunteer_id || targetShift?.volunteerId || null;
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

    realtimeDebugLogger.debug('[RT-TRACE][ZUSTAND_STATE_CHANGE]', {
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
