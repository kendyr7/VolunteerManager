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
import { fetchCoordinatorShiftEditAllowed } from '@/lib/permissions';

const STALE_TIME_MS = 60_000;

interface CoordinatorDataContextValue {
  rawVolunteers: any[];
  committeesList: { id: string; name: string }[];
  shiftsData: any[];
  requirementsByCommittee: Record<string, Record<string, number>>;
  globalShifts: Record<string, Record<string, string[]>>;
  indexedAssignments: Record<string, Record<string, Record<string, string[]>>>;
  checkedInMap: Record<string, boolean>;
  checkedOutMap: Record<string, boolean>;
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
    return { role: 'Admin', committee: '', cacheKey: 'Admin:' };
  }
  const role = localStorage.getItem('mock_role') || 'Admin';
  const committee = localStorage.getItem('mock_committee') || '';
  return { role, committee, cacheKey: `${role}:${committee}` };
}

export function CoordinatorDataProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [rawVolunteers, setRawVolunteers] = useState<any[]>([]);
  const [committeesList, setCommitteesList] = useState<
    { id: string; name: string }[]
  >([]);
  const [shiftsData, setShiftsData] = useState<any[]>([]);
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

  const derived = useMemo(
    () => processShiftsData(shiftsData, rawVolunteers),
    [shiftsData, rawVolunteers]
  );
  
  const reliabilityMap = useMemo(
    () => computeReliabilityMap(rawVolunteers, derived.globalShifts, confirmedReminders),
    [rawVolunteers, derived.globalShifts, confirmedReminders]
  );

  const fetchData = useCallback(
    async (force = false) => {
      const { role, committee, cacheKey } = getAuthScope();
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
          fetchCoordinatorShiftEditAllowed();

          let commIdFilter: string | null = null;
          if (role === 'Editor' && committee) {
            const { data: commObj } = await supabase
              .from('committees')
              .select('id')
              .eq('name', committee)
              .maybeSingle();
            if (commObj) commIdFilter = commObj.id;
          }

          const [volsData, commsRes, shiftsResult, reqsData] =
            await Promise.all([
              fetchAllRows(
                supabase,
                'volunteers',
                '*, committees(name)',
                (q) => (commIdFilter ? q.eq('committee_id', commIdFilter) : q)
              ),
              supabase.from('committees').select('*'),
              fetchAllRows(supabase, 'shifts', '*'),
              fetchAllRows(
                supabase,
                'committee_shift_requirements',
                '*, committees(name)'
              ),
            ]);

          const commsData = commsRes.data ?? [];
          const activeComms = commsData.filter((c: any) => c.status !== 'archived');

          setRawVolunteers(volsData ?? []);
          setCommitteesList(activeComms);
          setShiftsData(shiftsResult ?? []);

          const parsedReqs = parseRequirementsData(reqsData ?? [], commsData);
          if (Object.keys(parsedReqs).length > 0) {
            const stored = localStorage.getItem('committee_requirements');
            let allReqs: Record<string, Record<string, number>> = stored
              ? JSON.parse(stored)
              : {};
            allReqs = { ...allReqs, ...parsedReqs };
            localStorage.setItem(
              'committee_requirements',
              JSON.stringify(allReqs)
            );
            setRequirementsByCommittee(allReqs);
          }

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
    [supabase, rawVolunteers.length]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      requirementsByCommittee,
      globalShifts: derived.globalShifts,
      indexedAssignments: derived.indexedAssignments,
      checkedInMap: derived.checkedInMap,
      checkedOutMap: derived.checkedOutMap,
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
