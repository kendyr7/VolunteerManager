'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase-helpers';
import {
  buildEventDayKeys,
  parseRequirementsData,
  processShiftsData,
  computeReliabilityMap,
  type CoordinatorRequirementData,
  type CoordinatorSessionData,
  type CoordinatorShiftData,
  type CoordinatorVolunteerData,
} from '@/lib/coordinator-data';
import { getAuthorizationSnapshotCache } from '@/lib/permissions';
import { hasCapability } from '@/lib/role-permissions';
import { useVolunteerStore } from '@/lib/store/use-volunteer-store';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import {
  RealtimeEventQueue,
  type RealtimeEventType,
} from '@/lib/services/realtime-event-queue';
import { SupabaseReconnectManager } from '@/lib/services/supabase-reconnect-manager';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';
import { withShiftAreaDetails } from '@/lib/shift-area';

const STALE_TIME_MS = 60_000;
const SAFE_VOLUNTEER_FIELDS = 'id, first_name, last_name, phone, stake, neighborhood, committee_id, age, status, created_at, committees(name)';
const OPERATIONAL_EVENT_DAY_KEYS = buildEventDayKeys();

interface CoordinatorCommitteeData {
  id: string;
  name: string;
  status?: string | null;
}

function withoutSensitiveVolunteerFields(record: unknown): CoordinatorVolunteerData | null {
  if (!record || typeof record !== 'object') return null;
  const safeRecord: Record<string, unknown> = { ...record };
  delete safeRecord.pin;
  delete safeRecord.pin_hash;
  if (typeof safeRecord.id !== 'string') return null;
  return { ...safeRecord, id: safeRecord.id } as CoordinatorVolunteerData;
}

interface CoordinatorDataContextValue {
  rawVolunteers: CoordinatorVolunteerData[];
  committeesList: { id: string; name: string }[];
  shiftsData: CoordinatorShiftData[];
  sessionsData: CoordinatorSessionData[];
  requirementsByCommittee: Record<string, Record<string, number>>;
  globalShifts: Record<string, Record<string, string[]>>;
  indexedAssignments: Record<string, Record<string, Record<string, string[]>>>;
  checkedInMap: Record<string, boolean>;
  checkedOutMap: Record<string, boolean>;
  activeSessionsByVolunteer: Record<string, CoordinatorSessionData>;
  sessionOpenShiftKeys: Record<string, boolean>;
  sessionCompletedShiftKeys: Record<string, boolean>;
  shiftCounts: Record<string, number>;
  reliabilityMap: Record<string, number | '-'>;
  loading: boolean;
  isRefreshing: boolean;
  refresh: (force?: boolean) => Promise<void>;
}

const CoordinatorDataContext = createContext<CoordinatorDataContextValue | null>(
  null
);

function getAuthScope() {
  if (typeof window === 'undefined') {
    return { authenticated: false, canViewAll: false, committeeId: null as string | null, cacheKey: 'ssr' };
  }
  const snapshot = getAuthorizationSnapshotCache();
  if (!snapshot.authenticated) {
    return { authenticated: false, canViewAll: false, committeeId: null as string | null, cacheKey: 'unauth' };
  }
  const canViewAll = hasCapability(snapshot, 'view_all_volunteers');
  const committeeId = snapshot.committeeId;
  const cacheKey = `${snapshot.role}:${snapshot.coordinatorType || ''}:${snapshot.committeeId || ''}:${canViewAll}:${snapshot.authenticated}`;
  return { authenticated: true, canViewAll, committeeId, cacheKey };
}

export function CoordinatorDataProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [rawVolunteers, setRawVolunteers] = useState<CoordinatorVolunteerData[]>([]);
  const [committeesList, setCommitteesList] = useState<
    { id: string; name: string }[]
  >([]);
  const [shiftsData, setShiftsData] = useState<CoordinatorShiftData[]>([]);
  const [sessionsData, setSessionsData] = useState<CoordinatorSessionData[]>([]);
  const [requirementsByCommittee, setRequirementsByCommittee] = useState<
    Record<string, Record<string, number>>
  >({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const lastFetchedAtRef = useRef(0);
  const lastCacheKeyRef = useRef('');
  const fetchPromiseRef = useRef<Promise<void> | null>(null);
  const [eventQueue] = useState(() => new RealtimeEventQueue((processed) => {
      processed.forEach((evt) => {
        if (evt.table === 'shifts') {
          setShiftsData((prev) => {
            let nextShifts: CoordinatorShiftData[];
            if (evt.eventType === 'DELETE') {
              nextShifts = prev.filter((s) => s.id !== evt.payload.id);
            } else {
              const idx = prev.findIndex((s) => s.id === evt.payload.id);
              if (idx !== -1) {
                const copy = [...prev];
                copy[idx] = mergeRealtimeRecord(copy[idx], evt.payload as Partial<CoordinatorShiftData>);
                nextShifts = copy;
              } else {
                nextShifts = [evt.payload as CoordinatorShiftData, ...prev];
              }
            }
            return nextShifts;
          });
        } else {
          setRawVolunteers((prev) => {
            if (evt.eventType === 'DELETE') {
              return prev.filter((v) => v.id !== evt.payload.id);
            }
            const idx = prev.findIndex((v) => v.id === evt.payload.id);
            let nextState: CoordinatorVolunteerData[];
            if (idx !== -1) {
              const copy = [...prev];
              copy[idx] = mergeRealtimeRecord(copy[idx], evt.payload as Partial<CoordinatorVolunteerData>);
              nextState = copy;
            } else {
              nextState = [evt.payload as CoordinatorVolunteerData, ...prev];
            }
            return nextState;
          });
        }
      });
    }));

  const derived = useMemo(
    () => processShiftsData(shiftsData, rawVolunteers, sessionsData),
    [shiftsData, rawVolunteers, sessionsData]
  );
  
  const reliabilityMap = useMemo(
    () => computeReliabilityMap(rawVolunteers),
    [rawVolunteers]
  );

  const fetchData = useCallback(
    async (force = false) => {
      const { authenticated, canViewAll, committeeId, cacheKey } = getAuthScope();
      const isFresh =
        !force &&
        lastCacheKeyRef.current === cacheKey &&
        Date.now() - lastFetchedAtRef.current < STALE_TIME_MS &&
        lastFetchedAtRef.current > 0;

      if (isFresh) return;

      if (fetchPromiseRef.current) {
        await fetchPromiseRef.current;
        if (!force) return;
      }

      const isInitialLoad = lastFetchedAtRef.current === 0;
      if (isInitialLoad) setLoading(true);
      else setIsRefreshing(true);

      const promise = (async () => {
        try {
          if (!authenticated) {
            setRawVolunteers([]);
            setCommitteesList([]);
            setShiftsData([]);
            setSessionsData([]);
            useVolunteerStore.getState().setInitialVolunteers([]);
            useVolunteerStore.getState().setInitialShifts([]);
            return;
          }

          if (!canViewAll && !committeeId) {
            // Fail closed: User has no permission to view all volunteers and has no assigned committee
            const { data: commsResData } = await supabase
              .from('committees')
              .select('*')
              .or('status.is.null,status.neq.archived');
            const activeComms = (commsResData ?? [])
              .filter((committee) => committee.status !== 'archived') as CoordinatorCommitteeData[];
            setRawVolunteers([]);
            setCommitteesList(activeComms);
            setShiftsData([]);
            setSessionsData([]);
            useVolunteerStore.getState().setInitialVolunteers([]);
            useVolunteerStore.getState().setInitialShifts([]);
            return;
          }

          const { getAttendanceSessionsAction } = await import('@/app/actions/attendance');

          const volsQuery = canViewAll
            ? fetchAllRows(
                supabase,
                'volunteers',
                SAFE_VOLUNTEER_FIELDS
              )
            : fetchAllRows(
                supabase,
                'volunteers',
                SAFE_VOLUNTEER_FIELDS,
                (q) => q.eq('committee_id', committeeId!)
              );

          const [volsData, commsRes, shiftsResult, reqsData, loadedSessions] =
            await Promise.all([
              volsQuery as Promise<CoordinatorVolunteerData[]>,
              supabase
                .from('committees')
                .select('id, name, status')
                .or('status.is.null,status.neq.archived'),
              fetchAllRows<CoordinatorShiftData>(
                supabase,
                'shifts',
                canViewAll
                  ? '*, committee_areas(name, description)'
                  : '*, committee_areas(name, description), volunteers!inner(committee_id)',
                query => {
                  let scopedQuery = query.in('day_key', OPERATIONAL_EVENT_DAY_KEYS);
                  if (!canViewAll && committeeId) {
                    scopedQuery = scopedQuery.eq('volunteers.committee_id', committeeId);
                  }
                  return scopedQuery;
                }
              ),
              fetchAllRows<CoordinatorRequirementData>(
                supabase,
                'committee_shift_requirements',
                'committee_id, shift_key, required, committees(name)',
                (query) => !canViewAll && committeeId
                  ? query.eq('committee_id', committeeId)
                  : query
              ),
              getAttendanceSessionsAction(OPERATIONAL_EVENT_DAY_KEYS)
            ]);

          const commsData = commsRes.data ?? [];
          const activeComms = commsData.filter((committee) => committee.status !== 'archived') as CoordinatorCommitteeData[];
          const cleanVols = volsData ?? [];
          const allowedVolunteerIds = new Set(cleanVols.map((volunteer) => volunteer.id));
          const scopedShifts = canViewAll
            ? (shiftsResult ?? [])
            : (shiftsResult ?? []).filter((shift) => allowedVolunteerIds.has(shift.volunteer_id));
          const cleanShifts = scopedShifts.map(withShiftAreaDetails);

          setRawVolunteers(cleanVols);
          useVolunteerStore.getState().setInitialVolunteers(cleanVols);
          setCommitteesList(activeComms);
          setShiftsData(cleanShifts);
          setSessionsData(loadedSessions ?? []);
          useVolunteerStore.getState().setInitialShifts(cleanShifts);

          const parsedReqs = parseRequirementsData(reqsData ?? [], activeComms);
          const stored = localStorage.getItem('committee_requirements');
          const storedReqs: Record<string, Record<string, number>> = stored
            ? JSON.parse(stored)
            : {};
          const activeNames = new Set(activeComms.map((committee) => committee.name));
          const activeStoredReqs = Object.fromEntries(
            Object.entries(storedReqs).filter(([committeeName]) => activeNames.has(committeeName))
          );
          const allReqs = { ...activeStoredReqs, ...parsedReqs };
          localStorage.setItem('committee_requirements', JSON.stringify(allReqs));
          setRequirementsByCommittee(allReqs);

          lastFetchedAtRef.current = Date.now();
          lastCacheKeyRef.current = cacheKey;
        } catch (err) {
          console.error('Error loading coordinator data:', err);
        } finally {
          setLoading(false);
          setIsRefreshing(false);
          fetchPromiseRef.current = null;
        }
      })();

      fetchPromiseRef.current = promise;
      await promise;
    },
    [supabase]
  );

  useEffect(() => {
    fetchData();
    const handleAuthorizationChange = () => void fetchData(true);
    window.addEventListener('permissions-changed', handleAuthorizationChange);
    return () => window.removeEventListener('permissions-changed', handleAuthorizationChange);
  }, [fetchData]);

  // Set up Supabase Realtime for instant synchronization across all active coordinators
  useEffect(() => {
    const clientId = realtimeDebugLogger.getClientSessionId();
    realtimeDebugLogger.debug('[REALTIME CHANNEL DIAGNOSTIC]', {
      channelName: 'global_coordinator_realtime',
      clientId,
      timestamp: new Date().toISOString()
    });

    const channel = supabase
      .channel('global_coordinator_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload) => {
          const traceId = realtimeDebugLogger.generateTraceId();
          const newRec = payload.new as CoordinatorShiftData | null;
          const oldRec = payload.old as Partial<CoordinatorShiftData> | null;
          const recordId = newRec?.id || oldRec?.id;

          realtimeDebugLogger.debug('[RT-TRACE][CALLBACK]', {
            clientId,
            traceId,
            table: 'shifts',
            eventType: payload.eventType,
            recordId,
            timestamp: new Date().toISOString()
          });

          const storedShift = newRec?.id
            ? useVolunteerStore.getState().shiftsMap.get(newRec.id)
            : null;
          const areaChanged = payload.eventType === 'UPDATE'
            && newRec
            && newRec.area_id !== storedShift?.area_id;

          realtimeDebugLogger.addLog({
            traceId,
            stage: 'REALTIME_RECEIVED',
            table: 'shifts',
            eventType: payload.eventType as RealtimeEventType,
            volunteerId: newRec?.volunteer_id,
            details: `Shift event ${payload.eventType} for shift ${newRec?.day_key || ''} ${newRec?.shift_key || ''}`,
            payload: payload.eventType === 'DELETE' ? payload.old : payload.new,
          });

          if (payload.eventType === 'DELETE' && payload.old) {
            eventQueue.enqueue('DELETE', payload.old, 'shifts', traceId);
          } else if (payload.eventType && payload.new) {
            eventQueue.enqueue(payload.eventType as RealtimeEventType, payload.new, 'shifts', traceId);
          }
          if (areaChanged) void fetchData(true);
        }
      )
      .on(
        'broadcast',
        { event: 'shift_sync' },
        (eventPayload) => {
          const payload = eventPayload?.payload;
          if (!payload || payload.table !== 'shifts' || !payload.record) return;

          const traceId = realtimeDebugLogger.generateTraceId();
          const eventType = payload.eventType as RealtimeEventType;
          const record = payload.record as CoordinatorShiftData;

          realtimeDebugLogger.debug('[RT-TRACE][BROADCAST_CALLBACK]', {
            clientId,
            traceId,
            table: 'shifts',
            eventType,
            recordId: record.id,
            volunteerId: record.volunteer_id,
            dayKey: record.day_key,
            shiftKey: record.shift_key,
            timestamp: new Date().toISOString()
          });

          realtimeDebugLogger.addLog({
            traceId,
            stage: 'REALTIME_RECEIVED',
            table: 'shifts',
            eventType,
            volunteerId: record.volunteer_id,
            details: `Broadcast shift ${eventType}: ${record.day_key || ''} / ${record.shift_key || ''}`,
            payload: record,
          });

          if (eventType === 'DELETE') {
            eventQueue.enqueue('DELETE', record, 'shifts', traceId);
          } else if (eventType) {
            eventQueue.enqueue(eventType, record, 'shifts', traceId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'volunteers' },
        (payload) => {
          const traceId = realtimeDebugLogger.generateTraceId();
          const incomingRecord = payload.new as Partial<CoordinatorVolunteerData> | null;
          const previousRecord = payload.old as Partial<CoordinatorVolunteerData> | null;
          const recordId = incomingRecord?.id || previousRecord?.id;

          realtimeDebugLogger.debug('[RT-TRACE][CALLBACK]', {
            clientId,
            traceId,
            table: 'volunteers',
            eventType: payload.eventType,
            recordId,
            timestamp: new Date().toISOString()
          });

          const newRec = withoutSensitiveVolunteerFields(payload.new);
          const oldRec = withoutSensitiveVolunteerFields(payload.old);
          const volName = newRec ? `${newRec.first_name || ''} ${newRec.last_name || ''}`.trim() : undefined;

          realtimeDebugLogger.addLog({
            traceId,
            stage: 'REALTIME_RECEIVED',
            table: 'volunteers',
            eventType: payload.eventType as RealtimeEventType,
            volunteerId: newRec?.id || oldRec?.id,
            volunteerName: volName,
            details: `Volunteer ${payload.eventType}: ${volName || ''} (${newRec?.neighborhood || ''})`,
            payload: payload.eventType === 'DELETE' ? oldRec : newRec,
          });

          if (payload.eventType === 'DELETE' && oldRec) {
            eventQueue.enqueue('DELETE', oldRec, 'volunteers', traceId);
          } else if (payload.eventType && newRec) {
            eventQueue.enqueue(payload.eventType as RealtimeEventType, newRec, 'volunteers', traceId);
          }
        }
      )
      .subscribe((status) => {
        realtimeDebugLogger.debug('[REALTIME CHANNEL STATUS]', {
          channel: 'global_coordinator_realtime',
          status,
          clientId,
          timestamp: new Date().toISOString()
        });

        realtimeDebugLogger.setConnectionStatus(status);
        if (status === 'SUBSCRIBED') {
          realtimeDebugLogger.debug(`
================================================
REALTIME SUBSCRIPTION ACTIVE
================================================
client: ${clientId}
channel: global_coordinator_realtime
status: SUBSCRIBED

postgres_changes:
volunteers: UPDATE
volunteers: INSERT
volunteers: DELETE
shifts: UPDATE
shifts: INSERT
shifts: DELETE
================================================
          `);
          useRealtimeStore.getState().recordHeartbeat();
          void SupabaseReconnectManager.getInstance().recoverMissedEvents();
          fetchData(false);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          useRealtimeStore.getState().setStatus('reconnecting');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchData, eventQueue]);

  const value = useMemo<CoordinatorDataContextValue>(
    () => ({
      rawVolunteers,
      committeesList,
      shiftsData,
      sessionsData,
      requirementsByCommittee,
      globalShifts: derived.globalShifts,
      indexedAssignments: derived.indexedAssignments,
      checkedInMap: derived.checkedInMap,
      checkedOutMap: derived.checkedOutMap,
      activeSessionsByVolunteer: derived.activeSessionsByVolunteer,
      sessionOpenShiftKeys: derived.sessionOpenShiftKeys,
      sessionCompletedShiftKeys: derived.sessionCompletedShiftKeys,
      shiftCounts: derived.shiftCounts,
      reliabilityMap,
      loading,
      isRefreshing,
      refresh: fetchData,
    }),
    [
      rawVolunteers,
      committeesList,
      shiftsData,
      sessionsData,
      requirementsByCommittee,
      derived,
      reliabilityMap,
      loading,
      isRefreshing,
      fetchData,
    ]
  );

  return (
    <CoordinatorDataContext.Provider value={value}>
      {children}
    </CoordinatorDataContext.Provider>
  );
}

export function useCoordinatorData() {
  const ctx = useContext(CoordinatorDataContext);
  if (!ctx) {
    throw new Error(
      'useCoordinatorData must be used within CoordinatorDataProvider'
    );
  }
  return ctx;
}

export function useOptionalCoordinatorData() {
  return useContext(CoordinatorDataContext);
}
