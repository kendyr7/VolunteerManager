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
  parseRequirementsData,
  processShiftsData,
  computeReliabilityMap,
} from '@/lib/coordinator-data';
import { getAuthorizationSnapshotCache } from '@/lib/permissions';
import { hasCapability } from '@/lib/role-permissions';
import { useVolunteerStore } from '@/lib/store/use-volunteer-store';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { RealtimeEventQueue } from '@/lib/services/realtime-event-queue';
import { SupabaseReconnectManager } from '@/lib/services/supabase-reconnect-manager';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';

const STALE_TIME_MS = 60_000;

interface CoordinatorDataContextValue {
  rawVolunteers: any[];
  committeesList: { id: string; name: string }[];
  shiftsData: any[];
  sessionsData: any[];
  requirementsByCommittee: Record<string, Record<string, number>>;
  globalShifts: Record<string, Record<string, string[]>>;
  indexedAssignments: Record<string, Record<string, Record<string, string[]>>>;
  checkedInMap: Record<string, boolean>;
  checkedOutMap: Record<string, boolean>;
  activeSessionsByVolunteer: Record<string, any>;
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
  const canViewAll = snapshot.role === 'Admin' || hasCapability(snapshot, 'view_all_volunteers');
  const committeeId = snapshot.committeeId;
  const cacheKey = `${snapshot.role}:${snapshot.coordinatorType || ''}:${snapshot.committeeId || ''}:${canViewAll}:${snapshot.authenticated}`;
  return { authenticated: true, canViewAll, committeeId, cacheKey };
}

export function CoordinatorDataProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [rawVolunteers, setRawVolunteers] = useState<any[]>([]);
  const [committeesList, setCommitteesList] = useState<
    { id: string; name: string }[]
  >([]);
  const [shiftsData, setShiftsData] = useState<any[]>([]);
  const [sessionsData, setSessionsData] = useState<any[]>([]);
  const [confirmedReminders, setConfirmedReminders] = useState<Record<string, boolean>>({});
  const [requirementsByCommittee, setRequirementsByCommittee] = useState<
    Record<string, Record<string, number>>
  >({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load confirmed reminders from localStorage
  useEffect(() => {
    const loadConfirmations = () => {
      const stored = localStorage.getItem("confirmed_reminders");
      if (stored) {
        try {
          setConfirmedReminders(JSON.parse(stored));
        } catch (e) {
          console.error("Error loading confirmations", e);
        }
      }
    };
    loadConfirmations();
  }, []);

  const lastFetchedAtRef = useRef(0);
  const lastCacheKeyRef = useRef('');
  const fetchPromiseRef = useRef<Promise<void> | null>(null);
  const eventQueueRef = useRef<RealtimeEventQueue | null>(null);

  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current && typeof window !== 'undefined') {
    let existing = sessionStorage.getItem('realtime_client_id');
    if (!existing) {
      existing = `CLIENT_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      sessionStorage.setItem('realtime_client_id', existing);
    }
    clientIdRef.current = existing;
  }
  const clientId = clientIdRef.current || 'CLIENT_UNKNOWN';

  if (!eventQueueRef.current) {
    eventQueueRef.current = new RealtimeEventQueue((processed) => {
      processed.forEach((evt) => {
        if (evt.table === 'shifts') {
          setShiftsData((prev) => {
            let nextShifts: any[];
            if (evt.eventType === 'DELETE') {
              nextShifts = prev.filter((s) => s.id !== evt.payload.id);
            } else {
              const idx = prev.findIndex((s) => s.id === evt.payload.id);
              if (idx !== -1) {
                const copy = [...prev];
                copy[idx] = mergeRealtimeRecord(copy[idx], evt.payload);
                nextShifts = copy;
              } else {
                nextShifts = [evt.payload, ...prev];
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
            let nextState: any[];
            if (idx !== -1) {
              const copy = [...prev];
              copy[idx] = mergeRealtimeRecord(copy[idx], evt.payload);
              nextState = copy;
            } else {
              nextState = [evt.payload, ...prev];
            }
            return nextState;
          });
        }
      });
    });
  }

  const derived = useMemo(
    () => processShiftsData(shiftsData, rawVolunteers, sessionsData),
    [shiftsData, rawVolunteers, sessionsData]
  );
  
  const reliabilityMap = useMemo(
    () => computeReliabilityMap(rawVolunteers, derived.globalShifts, confirmedReminders),
    [rawVolunteers, derived.globalShifts, confirmedReminders]
  );

  const fetchData = useCallback(
    async (force = false) => {
      const { authenticated, canViewAll, committeeId, cacheKey } = getAuthScope();
      const isFresh =
        !force &&
        lastCacheKeyRef.current === cacheKey &&
        Date.now() - lastFetchedAtRef.current < STALE_TIME_MS &&
        rawVolunteers.length >= 0 &&
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
            const activeComms = (commsResData ?? []).filter((c: any) => c.status !== 'archived');
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
                '*, committees(name)'
              )
            : fetchAllRows(
                supabase,
                'volunteers',
                '*, committees(name)',
                (q) => q.eq('committee_id', committeeId!)
              );

          const [volsData, commsRes, shiftsResult, reqsData, loadedSessions] =
            await Promise.all([
              volsQuery,
              supabase
                .from('committees')
                .select('*')
                .or('status.is.null,status.neq.archived'),
              fetchAllRows(supabase, 'shifts', '*'),
              fetchAllRows(
                supabase,
                'committee_shift_requirements',
                '*, committees(name)'
              ),
              getAttendanceSessionsAction()
            ]);

          const commsData = commsRes.data ?? [];
          const activeComms = commsData.filter((c: any) => c.status !== 'archived');
          const cleanVols = volsData ?? [];
          const allowedVolunteerIds = new Set(cleanVols.map((v: any) => v.id));
          const cleanShifts = canViewAll
            ? (shiftsResult ?? [])
            : (shiftsResult ?? []).filter((s: any) => allowedVolunteerIds.has(s.volunteer_id));

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
          const activeNames = new Set(activeComms.map((c: any) => c.name));
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
    console.log('[REALTIME CHANNEL DIAGNOSTIC]', {
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
          const recordId = (payload.new as any)?.id || (payload.old as any)?.id;

          console.log('[RT-TRACE][CALLBACK]', {
            clientId,
            traceId,
            table: 'shifts',
            eventType: payload.eventType,
            recordId,
            timestamp: new Date().toISOString()
          });

          const newRec = payload.new as any;
          const oldRec = payload.old as any;

          realtimeDebugLogger.addLog({
            traceId,
            stage: 'REALTIME_RECEIVED',
            table: 'shifts',
            eventType: payload.eventType as any,
            volunteerId: newRec?.volunteer_id,
            details: `Shift event ${payload.eventType} for shift ${newRec?.day_key || ''} ${newRec?.shift_key || ''}`,
            payload: payload.eventType === 'DELETE' ? payload.old : payload.new,
          });

          if (payload.eventType === 'DELETE' && payload.old) {
            eventQueueRef.current?.enqueue('DELETE', payload.old, 'shifts', traceId);
          } else if (payload.eventType && payload.new) {
            eventQueueRef.current?.enqueue(payload.eventType as any, payload.new, 'shifts', traceId);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'shift_sync' },
        (eventPayload) => {
          const payload = eventPayload?.payload;
          if (!payload || payload.table !== 'shifts' || !payload.record) return;

          const traceId = realtimeDebugLogger.generateTraceId();
          const eventType = payload.eventType;
          const record = payload.record;

          console.log('[RT-TRACE][BROADCAST_CALLBACK]', {
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
            eventType: eventType as any,
            volunteerId: record.volunteer_id,
            details: `Broadcast shift ${eventType}: ${record.day_key || ''} / ${record.shift_key || ''}`,
            payload: record,
          });

          if (eventType === 'DELETE') {
            eventQueueRef.current?.enqueue('DELETE', record, 'shifts', traceId);
          } else if (eventType) {
            eventQueueRef.current?.enqueue(eventType as any, record, 'shifts', traceId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'volunteers' },
        (payload) => {
          const traceId = realtimeDebugLogger.generateTraceId();
          const recordId = (payload.new as any)?.id || (payload.old as any)?.id;

          console.log('[RT-TRACE][CALLBACK]', {
            clientId,
            traceId,
            table: 'volunteers',
            eventType: payload.eventType,
            recordId,
            timestamp: new Date().toISOString()
          });

          const newRec = payload.new as any;
          const oldRec = payload.old as any;
          const volName = newRec ? `${newRec.first_name || ''} ${newRec.last_name || ''}`.trim() : undefined;

          realtimeDebugLogger.addLog({
            traceId,
            stage: 'REALTIME_RECEIVED',
            table: 'volunteers',
            eventType: payload.eventType as any,
            volunteerId: newRec?.id || oldRec?.id,
            volunteerName: volName,
            details: `Volunteer ${payload.eventType}: ${volName || ''} (${newRec?.neighborhood || ''})`,
            payload: payload.eventType === 'DELETE' ? payload.old : payload.new,
          });

          if (payload.eventType === 'DELETE' && payload.old) {
            eventQueueRef.current?.enqueue('DELETE', payload.old, 'volunteers', traceId);
          } else if (payload.eventType && payload.new) {
            eventQueueRef.current?.enqueue(payload.eventType as any, payload.new, 'volunteers', traceId);
          }
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME CHANNEL STATUS]', {
          channel: 'global_coordinator_realtime',
          status,
          clientId,
          timestamp: new Date().toISOString()
        });

        realtimeDebugLogger.setConnectionStatus(status);
        if (status === 'SUBSCRIBED') {
          console.log(`
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
  }, [supabase, fetchData, clientId]);

  const refresh = useCallback(
    async (force = true) => {
      await fetchData(force);
    },
    [fetchData]
  );

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
