'use client';

import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCoordinatorData } from "@/lib/coordinator-data-context";
import { canViewGlobalReports, getAuthorizationSnapshotCache, syncAllPermissionsFromDatabase } from "@/lib/permissions";
import {
  getDashboardOperationalDataAction,
  type DashboardOperationalData,
} from "@/app/actions/dashboard";
import { getActiveEventDays, getAvailableShiftKeys, formatDateShort } from "@/lib/dates";
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from "@/components/ui/select";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DashboardDistributionChart, type DistributionItem } from "@/components/DashboardDistributionChart";
import { DashboardInsightPanel } from "@/components/DashboardInsightPanel";
import type { DashboardInsight } from "@/lib/dashboard-insight-types";
import { hasCapability, type AuthorizationSnapshot } from "@/lib/role-permissions";
import {
  DASHBOARD_SIMULATION_STORAGE_KEY,
  preparedDashboardMatches,
  readPreparedDashboardSession,
  writePreparedDashboardSession,
} from "@/lib/dashboard-session-cache";

type DashboardGreeting = {
  timeOfDay: string;
  userName: string;
  emoji: string;
  message: string;
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 24
    }
  }
};

function readStoredSimulationPreference() {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(DASHBOARD_SIMULATION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function CoordinatorDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view');
  const shouldReduceMotion = useReducedMotion();
  const {
    rawVolunteers,
    committeesList,
    shiftsData,
    globalShifts,
    checkedInMap: dbCheckedInMap,
    requirementsByCommittee,
    loading,
  } = useCoordinatorData();
  const [dashboardAccess, setDashboardAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [includeSimulation, setIncludeSimulation] = useState(readStoredSimulationPreference);

  const EVENT_DAYS = useMemo(() => getActiveEventDays({ includeSimulation }).map(date => ({
      date,
      key: formatDateShort(date),
      label: formatDateShort(date).split(' ')[0],
      dateNum: formatDateShort(date).split(' ')[1],
    })), [includeSimulation]);

  const committeeRequirements = useMemo(() => {
    return requirementsByCommittee || {};
  }, [requirementsByCommittee]);

  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [selectedChartDay, setSelectedChartDay] = useState<string | null>(null);
  const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'volunteers' | 'shifts'>('volunteers');
  const [selectedHeatmapCommittee, setSelectedHeatmapCommittee] = useState<string>('todos');
  const [distributionView, setDistributionView] = useState<'list' | 'chart'>('list');
  const [distributionMetric, setDistributionMetric] = useState<'volunteers' | 'shifts'>('volunteers');
  const [committeeAreas, setCommitteeAreas] = useState<Array<{ id: string; committee_id: string; name: string; description?: string | null; sort_order?: number }>>([]);
  const [isHeatmapFullscreen, setIsHeatmapFullscreen] = useState<boolean>(false);
  const [autoRotateInterval, setAutoRotateInterval] = useState<number>(0); // 0 = OFF, 5, 10, 15, 30
  const [rotateProgress, setRotateProgress] = useState<number>(0);
  const [activeKpiInfo, setActiveKpiInfo] = useState<{ title: string; explanation: string; formula: string } | null>(null);
  const [greeting, setGreeting] = useState<DashboardGreeting | null>(null);
  const [dashboardInsight, setDashboardInsight] = useState<DashboardInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(true);
  const [, setConfirmedReminders] = useState<Record<string, boolean>>({});
  const [userCommittee, setUserCommittee] = useState<string>('');
  const [permTick, setPermTick] = useState(0);
  const [operationalData, setOperationalData] = useState<DashboardOperationalData | null>(null);
  const lastInsightScopeRef = useRef<string | null>(null);
  const preparedSessionCheckedRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let isMounted = true;
    const loadAreas = async () => {
      try {
        const { data, error } = await supabase
          .from('committee_areas')
          .select('id, committee_id, name, description, sort_order')
          .eq('status', 'active')
          .order('sort_order', { ascending: true });
        if (!error && data && isMounted) {
          setCommitteeAreas(data);
        }
      } catch (err) {
        console.error('Error fetching committee areas for dashboard:', err);
      }
    };
    loadAreas();
    return () => { isMounted = false; };
  }, [supabase]);

  const volunteers = useMemo(
    () =>
      rawVolunteers.map((v) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        committee: v.committees?.name || 'Sin comité',
        reliability: v.reliability_score ?? 100,
        status: v.status || 'active',
      })),
    [rawVolunteers]
  );

  const availableHeatmapCommittees = useMemo(() => {
    const active = committeesList
      .filter((committee) => (committee.status || '').toLowerCase() !== 'archived')
      .map((committee) => committee.name);
    return ['todos', ...active];
  }, [committeesList]);

  const currentCommitteeIndex = useMemo(() => {
    const idx = availableHeatmapCommittees.indexOf(selectedHeatmapCommittee);
    return idx >= 0 ? idx : 0;
  }, [availableHeatmapCommittees, selectedHeatmapCommittee]);

  const handlePrevCommittee = useCallback(() => {
    if (!canViewGlobalReports()) return;
    const newIndex = (currentCommitteeIndex - 1 + availableHeatmapCommittees.length) % availableHeatmapCommittees.length;
    setSelectedHeatmapCommittee(availableHeatmapCommittees[newIndex]);
  }, [currentCommitteeIndex, availableHeatmapCommittees]);

  const handleNextCommittee = useCallback(() => {
    if (!canViewGlobalReports()) return;
    const newIndex = (currentCommitteeIndex + 1) % availableHeatmapCommittees.length;
    setSelectedHeatmapCommittee(availableHeatmapCommittees[newIndex]);
  }, [currentCommitteeIndex, availableHeatmapCommittees]);

  const ROTATE_OPTIONS = useMemo(() => [0, 30, 60, 300], []);

  const getAutoRotateLabel = useCallback((seconds: number) => {
    if (seconds === 0) return 'OFF';
    if (seconds === 30) return '30 seg';
    if (seconds === 60) return '1 min';
    if (seconds === 300) return '5 min';
    return `${seconds}s`;
  }, []);

  const cycleAutoRotate = useCallback(() => {
    setAutoRotateInterval(curr => {
      const curIdx = ROTATE_OPTIONS.indexOf(curr);
      const nextIdx = (curIdx + 1) % ROTATE_OPTIONS.length;
      const nextVal = ROTATE_OPTIONS[nextIdx];
      setRotateProgress(nextVal);
      return nextVal;
    });
  }, [ROTATE_OPTIONS]);

  useEffect(() => {
    if (!isHeatmapFullscreen || autoRotateInterval <= 0 || !canViewGlobalReports()) {
      return;
    }

    const initialFrame = window.requestAnimationFrame(() => {
      setRotateProgress(autoRotateInterval);
    });
    const timer = setInterval(() => {
      setRotateProgress(prev => {
        if (prev <= 1) {
          handleNextCommittee();
          return autoRotateInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.cancelAnimationFrame(initialFrame);
      clearInterval(timer);
    };
  }, [isHeatmapFullscreen, autoRotateInterval, handleNextCommittee]);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Minimum swipe distance threshold (35px) and ensure horizontal intent
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      if (deltaX > 0) {
        // Swiped right -> Previous committee
        handlePrevCommittee();
      } else {
        // Swiped left -> Next committee
        handleNextCommittee();
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  }, [handlePrevCommittee, handleNextCommittee]);

  const openVolunteersForHeatmapSlot = useCallback((dayKey: string, shiftKey: string) => {
    const params = new URLSearchParams({ day: dayKey, shift: shiftKey });
    if (
      selectedHeatmapCommittee
      && selectedHeatmapCommittee !== 'todos'
      && selectedHeatmapCommittee !== 'all'
    ) {
      params.set('committee', selectedHeatmapCommittee);
    }

    setIsHeatmapFullscreen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    router.push(`/volunteers?${params.toString()}`);
  }, [router, selectedHeatmapCommittee]);

  const openVolunteersForChartDay = useCallback((dayKey: string) => {
    const params = new URLSearchParams({ day: dayKey });
    if (
      selectedHeatmapCommittee
      && selectedHeatmapCommittee !== 'todos'
      && selectedHeatmapCommittee !== 'all'
    ) {
      params.set('committee', selectedHeatmapCommittee);
    }

    router.push(`/volunteers?${params.toString()}`);
  }, [router, selectedHeatmapCommittee]);

  const toggleSimulation = useCallback(() => {
    setIncludeSimulation(currentValue => {
      const nextValue = !currentValue;
      try {
        window.localStorage.setItem(DASHBOARD_SIMULATION_STORAGE_KEY, String(nextValue));
      } catch {
        // Keep the in-memory preference when browser storage is unavailable.
      }
      return nextValue;
    });
  }, []);

  const openHeatmapFullscreen = useCallback(() => {
    setIsHeatmapFullscreen(true);
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    } catch {}
  }, []);

  const closeHeatmapFullscreen = useCallback(() => {
    setIsHeatmapFullscreen(false);
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {}
    if (typeof window !== 'undefined' && window.location.search.includes('view=heatmap-fullscreen')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const toggleHeatmapFullscreen = useCallback(() => {
    setIsHeatmapFullscreen(prev => {
      const nextState = !prev;
      if (nextState) {
        try {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          }
        } catch {}
      } else {
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
        } catch {}
        if (typeof window !== 'undefined' && window.location.search.includes('view=heatmap-fullscreen')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
      return nextState;
    });
  }, []);

  useEffect(() => {
    if (requestedView === 'heatmap-fullscreen') {
      const frame = window.requestAnimationFrame(() => {
        openHeatmapFullscreen();
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [requestedView, openHeatmapFullscreen]);

  useEffect(() => {
    const handleOpenFullscreen = () => {
      openHeatmapFullscreen();
    };
    window.addEventListener('open-heatmap-fullscreen', handleOpenFullscreen);
    return () => {
      window.removeEventListener('open-heatmap-fullscreen', handleOpenFullscreen);
    };
  }, [openHeatmapFullscreen]);

  useEffect(() => {
    if (!isHeatmapFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevCommittee();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextCommittee();
      } else if (e.key === 'Escape') {
        closeHeatmapFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isHeatmapFullscreen, handlePrevCommittee, handleNextCommittee, closeHeatmapFullscreen]);

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
    window.addEventListener("storage", loadConfirmations);
    window.addEventListener("focus", loadConfirmations);
    return () => {
      window.removeEventListener("storage", loadConfirmations);
      window.removeEventListener("focus", loadConfirmations);
    };
  }, []);

  const loadOperationalData = useCallback(async (targetCommittee?: string, forceInsight = false) => {
    const effectiveTargetCommittee = targetCommittee || selectedHeatmapCommittee;
    const insightScopeKey = `${permTick}:${effectiveTargetCommittee}:${includeSimulation}`;
    const shouldGenerateInsight = forceInsight || lastInsightScopeRef.current !== insightScopeKey;

    if (shouldGenerateInsight) {
      lastInsightScopeRef.current = insightScopeKey;
      setIsInsightLoading(true);
    }

    try {
      const res = await getDashboardOperationalDataAction(
        effectiveTargetCommittee,
        includeSimulation,
        shouldGenerateInsight,
        forceInsight ? 'ai' : 'instant'
      );
      if (res?.data) {
        setOperationalData(res.data);
      }
      if (shouldGenerateInsight) {
        setDashboardInsight(res?.insight || null);
        if (res?.data) {
          writePreparedDashboardSession({
            includeSimulation,
            data: res.data,
            insight: res.insight || null,
          });
        }
      }
    } catch (err) {
      console.error("Error loading dashboard operational data:", err);
      if (shouldGenerateInsight) setDashboardInsight(null);
    } finally {
      if (shouldGenerateInsight) setIsInsightLoading(false);
    }
  }, [includeSimulation, permTick, selectedHeatmapCommittee]);

  useEffect(() => {
    if (dashboardAccess !== 'allowed') return;

    if (!preparedSessionCheckedRef.current) {
      preparedSessionCheckedRef.current = true;
      const prepared = readPreparedDashboardSession();
      if (
        prepared
        && preparedDashboardMatches(prepared, selectedHeatmapCommittee, includeSimulation)
      ) {
        const insightScopeKey = `${permTick}:${selectedHeatmapCommittee}:${includeSimulation}`;
        lastInsightScopeRef.current = insightScopeKey;
        window.queueMicrotask(() => {
          setOperationalData(prepared.data);
          setDashboardInsight(prepared.insight);
          setIsInsightLoading(false);
        });
        return;
      }
    }

    void loadOperationalData(selectedHeatmapCommittee);
  }, [dashboardAccess, selectedHeatmapCommittee, includeSimulation, permTick, loadOperationalData]);

  const regenerateDashboardInsight = useCallback(() => {
    void loadOperationalData(selectedHeatmapCommittee, true);
  }, [loadOperationalData, selectedHeatmapCommittee]);

  useEffect(() => {
    let active = true;

    const fetchUserNameAndSetGreeting = async (snapshot: AuthorizationSnapshot) => {
      // The authorization snapshot is resolved server-side from the signed
      // session (user id + user type). Do not infer identity from phone or
      // localStorage: those values can belong to a previous account on the
      // same device and may show another coordinator's name.
      const authenticatedProfileName = snapshot.name?.trim() || '';
      const userName = authenticatedProfileName
        ? authenticatedProfileName.split(/\s+/)[0]
        : snapshot.role === 'Lector' ? 'Voluntario' : 'Coordinador';

      const hour = new Date().getHours();
      let timeOfDay = 'Buenas noches';
      let emoji = '🌙';
      if (hour >= 5 && hour < 12) {
        timeOfDay = 'Buenos días';
        emoji = '☀️';
      } else if (hour >= 12 && hour < 19) {
        timeOfDay = 'Buenas tardes';
        emoji = '🌤️';
      }

      const messages = [
        `¿Listo para organizar un excelente evento? 🚀`,
        `Aquí tienes el resumen operativo de hoy. 📊`,
        `Vamos a hacer grandes cosas hoy. ✨`,
        `Es un buen momento para revisar los turnos. 🕒`,
        `El equipo cuenta contigo. 💪`
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];

      if (active) setGreeting({ timeOfDay, userName, emoji, message: randomMsg });
    };

    const applyAuthorizationSnapshot = (snapshot: AuthorizationSnapshot) => {
      if (!active) return;
      const committee = snapshot.committeeName || '';
      setUserCommittee(committee);
      if (!hasCapability(snapshot, 'view_global_reports') && committee) {
        setSelectedHeatmapCommittee(committee);
      }
      setDashboardAccess(hasCapability(snapshot, 'view_dashboard') ? 'allowed' : 'denied');
      setPermTick(value => value + 1);
      void fetchUserNameAndSetGreeting(snapshot);
    };

    const handleProfileChange = (event: Event) => {
      const snapshot = (event as CustomEvent<AuthorizationSnapshot>).detail
        || getAuthorizationSnapshotCache();
      applyAuthorizationSnapshot(snapshot);
    };

    window.addEventListener('permissions-changed', handleProfileChange);
    // Resolve the initial snapshot explicitly. Relying only on the event can
    // race with the layout's first permission sync and leave the greeting with
    // a stale compatibility name.
    void syncAllPermissionsFromDatabase().then(applyAuthorizationSnapshot);

    return () => {
      active = false;
      window.removeEventListener('permissions-changed', handleProfileChange);
    };
  }, []);

  const activeVolunteers = useMemo(() => {
    return volunteers.filter(v => (v.status || '').toLowerCase() !== 'archived');
  }, [volunteers]);

  const activeAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    activeVolunteers.forEach(volunteer => {
      const days = globalShifts[volunteer.id];
      if (!days) return;
      Object.entries(days).forEach(([dayKey, shiftKeys]) => {
        shiftKeys.forEach(shiftKey => {
          const key = `${volunteer.committee}|${dayKey}|${shiftKey}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      });
    });
    return counts;
  }, [activeVolunteers, globalShifts]);

  const clientGlobalStats = useMemo(() => {
    let totalRequired = 0;
    let totalAssignedInRequired = 0;
    let criticalAlerts = 0;

    const isFiltered = selectedHeatmapCommittee && selectedHeatmapCommittee !== 'todos' && selectedHeatmapCommittee !== 'all';
    const committeesToInclude = isFiltered
      ? [selectedHeatmapCommittee]
      : committeesList.map(c => c.name);

    EVENT_DAYS.forEach(day => {
      committeesToInclude.forEach(comm => {
        getAvailableShiftKeys(day.key).forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          totalRequired += req;

          const count = activeAssignmentCounts.get(`${comm}|${day.key}|${shiftId}`) || 0;

          totalAssignedInRequired += Math.min(count, req);

          if (count < req) {
            criticalAlerts++;
          }
        });
      });
    });

    const relevantVolunteers = isFiltered
      ? activeVolunteers.filter(v => v.committee === selectedHeatmapCommittee)
      : activeVolunteers;

    const relevantVolunteerIds = new Set(relevantVolunteers.map(v => v.id));

    const totalRecruited = relevantVolunteers.length;
    const targetVolunteers = totalRequired;
    const recruitmentPercentage = targetVolunteers > 0 ? Math.round((totalRecruited / targetVolunteers) * 100) : 0;
    const globalCoveragePercentage = totalRequired > 0 ? Math.round((totalAssignedInRequired / totalRequired) * 100) : 100;
    
    let totalGlobalAssigned = 0;
    let totalGlobalCheckedIn = 0;
    const includedDayKeys = new Set(EVENT_DAYS.map(day => day.key));
    Object.entries(globalShifts).forEach(([volId, days]) => {
      if (!relevantVolunteerIds.has(volId)) return;
      Object.entries(days).forEach(([day, shifts]) => {
        if (!includedDayKeys.has(day)) return;
        shifts.forEach(shift => {
          totalGlobalAssigned++;
          if (dbCheckedInMap[`${volId}-${day}-${shift}`]) {
            totalGlobalCheckedIn++;
          }
        });
      });
    });

    const attendanceRate = totalGlobalAssigned > 0
      ? Math.round((totalGlobalCheckedIn / totalGlobalAssigned) * 100) : 0;

    return {
      totalRecruited,
      targetVolunteers,
      recruitmentPercentage,
      globalCoveragePercentage,
      criticalAlerts,
      attendanceRate,
      checkedInCount: totalGlobalCheckedIn,
      totalAssigned: totalGlobalAssigned,
    };
  }, [activeVolunteers, activeAssignmentCounts, committeesList, globalShifts, committeeRequirements, dbCheckedInMap, selectedHeatmapCommittee, EVENT_DAYS]);

  const clientCommitteeStatus = useMemo(() => {
    const isFiltered = selectedHeatmapCommittee && selectedHeatmapCommittee !== 'todos' && selectedHeatmapCommittee !== 'all';
    const listToProcess = isFiltered
      ? committeesList.filter(c => c.name === selectedHeatmapCommittee)
      : committeesList;

    return listToProcess.map((c, index) => {
      let totalReq = 0;
      let totalAssigned = 0;
      let totalMissing = 0;

      EVENT_DAYS.forEach(day => {
        getAvailableShiftKeys(day.key).forEach(shiftId => {
          const req = committeeRequirements[c.name]?.[shiftId] ?? 0;
          totalReq += req;

          const count = activeAssignmentCounts.get(`${c.name}|${day.key}|${shiftId}`) || 0;

          totalAssigned += Math.min(count, req);
          if (count < req) {
            totalMissing += (req - count);
          }
        });
      });

      const coverage = totalReq > 0 ? Math.round((totalAssigned / totalReq) * 100) : 100;
      let status: 'success' | 'warning' | 'high_risk' = "success";
      if (coverage < 60) status = "high_risk";
      else if (coverage < 85) status = "warning";

      return {
        id: index + 1,
        name: c.name,
        coverage,
        missing: totalMissing,
        status
      };
    }).sort((a, b) => a.coverage - b.coverage);
  }, [activeAssignmentCounts, committeesList, committeeRequirements, selectedHeatmapCommittee, EVENT_DAYS]);

  const clientHeatmapMatrix = useMemo(() => {
    return EVENT_DAYS.map(day => {
      const availableShiftKeys = new Set(getAvailableShiftKeys(day.key));
      const shiftsData = (['T1', 'T2', 'T3', 'T4'] as const).map(shiftId => {
        if (!availableShiftKeys.has(shiftId)) {
          return { id: shiftId, enrolled: 0, required: 0, coverage: 1 };
        }
        let totalReq = 0;
        let totalAssigned = 0;

        const activeCommitteeNames = committeesList.map(committee => committee.name);
        const allCommKeys = activeVolunteers.some(volunteer => volunteer.committee === 'Sin comité')
          ? [...activeCommitteeNames, 'Sin comité']
          : activeCommitteeNames;
        const targetCommittees = (selectedHeatmapCommittee === 'todos' || selectedHeatmapCommittee === 'all')
          ? allCommKeys
          : [selectedHeatmapCommittee];

        targetCommittees.forEach(commName => {
          totalReq += committeeRequirements[commName]?.[shiftId] ?? 0;

          const assigned = activeAssignmentCounts.get(`${commName}|${day.key}|${shiftId}`) || 0;
          totalAssigned += assigned;
        });
        return { shift: shiftId, required: totalReq, assigned: totalAssigned, coverage: totalReq === 0 ? 1 : totalAssigned / totalReq };
      });
      return { day: day.key, shortLabel: day.label, dayLabel: day.dateNum, shifts: shiftsData };
    });
  }, [committeeRequirements, committeesList, activeVolunteers, activeAssignmentCounts, selectedHeatmapCommittee, EVENT_DAYS]);

  // Volunteers per event day (unique volunteers with ≥1 shift that day)
  const clientVolsPerDay = useMemo(() => {
    const counts: Record<string, number> = {};
    EVENT_DAYS.forEach(day => {
      const uniqueVols = new Set<string>();
      activeVolunteers.forEach(vol => {
        const shifts = globalShifts[vol.id];
        if (shifts && shifts[day.key] && shifts[day.key].length > 0) {
          uniqueVols.add(vol.id);
        }
      });
      counts[day.key] = uniqueVols.size;
    });
    return counts;
  }, [activeVolunteers, globalShifts, EVENT_DAYS]);

  // Total shifts assigned per event day (sum of T1+T2+T3+T4 slots)
  const clientShiftsPerDay = useMemo(() => {
    const counts: Record<string, number> = {};
    EVENT_DAYS.forEach(day => {
      let total = 0;
      activeVolunteers.forEach(vol => {
        const shifts = globalShifts[vol.id];
        if (shifts && shifts[day.key]) {
          total += shifts[day.key].length;
        }
      });
      counts[day.key] = total;
    });
    return counts;
  }, [activeVolunteers, globalShifts, EVENT_DAYS]);

  const clientTotalVolsWithShifts = useMemo(() => {
    const unique = new Set<string>();
    const includedDayKeys = new Set(EVENT_DAYS.map(day => day.key));
    activeVolunteers.forEach(vol => {
      const shifts = globalShifts[vol.id];
      if (shifts && Object.entries(shifts).some(([dayKey, arr]) => includedDayKeys.has(dayKey) && arr.length > 0)) {
        unique.add(vol.id);
      }
    });
    return unique.size;
  }, [activeVolunteers, globalShifts, EVENT_DAYS]);

  // The prepared server snapshot makes the first paint immediate. Once the
  // shared realtime dataset is ready, prefer its client-derived values so
  // changes stay live without downloading the same dashboard datasets again.
  const isOperationalSynced = loading
    && !includeSimulation
    && operationalData
    && operationalData.effectiveCommitteeScope === (selectedHeatmapCommittee || 'todos');
  const globalStats = isOperationalSynced ? operationalData.globalStats : clientGlobalStats;
  const committeeStatus = isOperationalSynced ? operationalData.committeeStatus : clientCommitteeStatus;
  const heatmapMatrix = isOperationalSynced ? operationalData.heatmapMatrix : clientHeatmapMatrix;
  const volsPerDay = isOperationalSynced ? operationalData.volsPerDay : clientVolsPerDay;
  const shiftsPerDay = isOperationalSynced ? operationalData.shiftsPerDay : clientShiftsPerDay;
  const totalVolsWithShifts = isOperationalSynced ? operationalData.totalVolsWithShifts : clientTotalVolsWithShifts;
  const coverageStatus = globalStats.globalCoveragePercentage >= 100
    ? { label: 'Completo', className: 'bg-accent/15 text-accent' }
    : globalStats.globalCoveragePercentage >= 70
      ? { label: 'En progreso', className: 'bg-amber-500/15 text-amber-500' }
      : { label: 'Crítico', className: 'bg-red/15 text-red' };
  const chartModel = useMemo(() => {
    const values = chartMetric === 'volunteers' ? volsPerDay : shiftsPerDay;
    const requiredByDay = Object.fromEntries(
      heatmapMatrix.map(day => [
        day.day,
        day.shifts.reduce((total, shift) => total + shift.required, 0),
      ])
    ) as Record<string, number>;
    const dailyValues = EVENT_DAYS.map(day => values[day.key] || 0);
    const volunteerAverage = EVENT_DAYS.length > 0
      ? Math.round(dailyValues.reduce((total, value) => total + value, 0) / EVENT_DAYS.length)
      : 0;
    const hasRequirements = Object.values(requiredByDay).some(value => value > 0);
    const referenceValues = Object.fromEntries(
      EVENT_DAYS.map(day => [
        day.key,
        chartMetric === 'shifts' && hasRequirements
          ? requiredByDay[day.key] || 0
          : volunteerAverage,
      ])
    ) as Record<string, number>;
    const referenceList = EVENT_DAYS.map(day => referenceValues[day.key] || 0);
    const rawMax = Math.max(...dailyValues, ...referenceList, 1);
    const scaleStep = Math.max(10, Math.ceil(rawMax / 40) * 10);
    const scaleMax = scaleStep * 4;
    const nonZeroRequirements = Object.values(requiredByDay).filter(value => value > 0);
    const minimumRequirement = nonZeroRequirements.length > 0 ? Math.min(...nonZeroRequirements) : 0;
    const maximumRequirement = nonZeroRequirements.length > 0 ? Math.max(...nonZeroRequirements) : 0;

    return {
      values,
      referenceValues,
      scaleMax,
      scaleMidpoint: scaleStep * 2,
      referenceLabel: chartMetric === 'shifts' && hasRequirements ? 'Cobertura requerida' : 'Promedio diario',
      referenceSummary: chartMetric === 'shifts' && hasRequirements
        ? minimumRequirement === maximumRequirement
          ? `${maximumRequirement.toLocaleString()} turnos por día`
          : `${minimumRequirement.toLocaleString()}–${maximumRequirement.toLocaleString()} turnos por día`
        : `${volunteerAverage.toLocaleString()} personas por día`,
      referencePoints: EVENT_DAYS.map((day, index) => {
        const x = ((index + 0.5) / EVENT_DAYS.length) * 100;
        const y = 100 - ((referenceValues[day.key] || 0) / scaleMax) * 100;
        return `${x},${y}`;
      }).join(' '),
      hasShiftRequirements: chartMetric === 'shifts' && hasRequirements,
    };
  }, [chartMetric, volsPerDay, shiftsPerDay, heatmapMatrix, EVENT_DAYS]);
  const activeChartDay = hoveredDay || selectedChartDay;
  const selectedChartDayInfo = selectedChartDay
    ? EVENT_DAYS.find(day => day.key === selectedChartDay) || null
    : null;

  const isScopedToSingleCommittee = useMemo(() => {
    if (!canViewGlobalReports()) return true;
    return Boolean(
      selectedHeatmapCommittee &&
      selectedHeatmapCommittee !== 'todos' &&
      selectedHeatmapCommittee !== 'all'
    );
  }, [selectedHeatmapCommittee]);

  const targetCommitteeName = useMemo(() => {
    if (isScopedToSingleCommittee) {
      if (selectedHeatmapCommittee && selectedHeatmapCommittee !== 'todos' && selectedHeatmapCommittee !== 'all') {
        return selectedHeatmapCommittee;
      }
      return userCommittee || committeesList[0]?.name || '';
    }
    return null;
  }, [isScopedToSingleCommittee, selectedHeatmapCommittee, userCommittee, committeesList]);

  const targetCommitteeObj = useMemo(() => {
    if (!targetCommitteeName) return null;
    return committeesList.find(c => c.name === targetCommitteeName) || null;
  }, [targetCommitteeName, committeesList]);

  const distributionItems = useMemo<DistributionItem[]>(() => {
    if (!isScopedToSingleCommittee) {
      // Global View: Breakdown by Committee
      return committeesList.map((comm) => {
        const commVols = activeVolunteers.filter((volunteer) => volunteer.committee === comm.name);
        const volCount = commVols.length;
        let shiftCount = 0;
        commVols.forEach((volunteer) => {
          const s = globalShifts[volunteer.id];
          if (s) {
            Object.values(s).forEach((arr) => { shiftCount += arr.length; });
          }
        });

        return {
          id: comm.id,
          name: comm.name,
          count: distributionMetric === 'volunteers' ? volCount : shiftCount,
          secondaryCount: distributionMetric === 'volunteers' ? shiftCount : volCount,
          description: `${commVols.length} voluntarios · ${shiftCount} turnos`,
        };
      });
    }

    // Scoped View: Breakdown by Areas for this specific committee
    if (!targetCommitteeObj) return [];
    const committeeId = targetCommitteeObj.id;
    const areasOfCommittee = committeeAreas.filter(a => a.committee_id === committeeId);

    if (areasOfCommittee.length === 0) {
      return [];
    }

    const commVolunteers = activeVolunteers.filter((volunteer) => volunteer.committee === targetCommitteeName);
    const commVolIds = new Set(commVolunteers.map(v => v.id));

    const areaAssignedVolIds = new Set<string>();
    const items: DistributionItem[] = [];

    areasOfCommittee.forEach((area) => {
      const areaVolunteers = new Set<string>();
      let areaShifts = 0;

      shiftsData.forEach((shift) => {
        if (!commVolIds.has(shift.volunteer_id)) return;
        if (shift.area_id === area.id || shift.area_name === area.name) {
          areaVolunteers.add(shift.volunteer_id);
          areaAssignedVolIds.add(shift.volunteer_id);
          areaShifts++;
        }
      });

      items.push({
        id: area.id,
        name: area.name,
        count: distributionMetric === 'volunteers' ? areaVolunteers.size : areaShifts,
        secondaryCount: distributionMetric === 'volunteers' ? areaShifts : areaVolunteers.size,
        description: area.description || `${areaVolunteers.size} voluntarios asignados`,
      });
    });

    // Calculate volunteers in this committee without assigned area
    const unassignedVolunteers = commVolunteers.filter(v => !areaAssignedVolIds.has(v.id));
    let unassignedShifts = 0;
    shiftsData.forEach((shift) => {
      if (commVolIds.has(shift.volunteer_id) && !shift.area_id) {
        unassignedShifts++;
      }
    });

    if (unassignedVolunteers.length > 0 || unassignedShifts > 0) {
      items.push({
        id: 'unassigned',
        name: 'Sin área asignada',
        count: distributionMetric === 'volunteers' ? unassignedVolunteers.length : unassignedShifts,
        secondaryCount: distributionMetric === 'volunteers' ? unassignedShifts : unassignedVolunteers.length,
        color: '#64748b',
        description: 'Voluntarios sin asignación de área',
      });
    }

    return items;
  }, [
    isScopedToSingleCommittee,
    committeesList,
    activeVolunteers,
    globalShifts,
    shiftsData,
    targetCommitteeObj,
    targetCommitteeName,
    committeeAreas,
    distributionMetric
  ]);

  if (dashboardAccess === 'checking') {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50" aria-label="Verificando acceso al Dashboard">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  if (dashboardAccess === 'denied') {
    return (
      <div className="w-full min-h-[65vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Acceso Restringido a Dashboard</h2>
        <p className="text-xs text-text-dim max-w-md leading-relaxed">
          El Administrador ha deshabilitado el acceso al Dashboard para este rol. Si necesitas acceso, contacta a un Administrador para habilitar esta política en Ajustes.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex shrink-0 flex-col gap-3 border-b border-white/5 bg-dark/70 px-4 py-3 backdrop-blur-xl pointer-events-auto dark:bg-dark/70 sm:px-6 sm:py-4 lg:px-8">
        <div className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          {greeting ? (
            <motion.h1
              key={`${greeting.timeOfDay}-${greeting.userName}`}
              className="flex min-w-0 flex-wrap items-center gap-3 text-[32px] font-black tracking-tight !text-text sm:text-4xl lg:min-h-10"
              aria-live="polite"
              initial={shouldReduceMotion ? false : { opacity: 0.45, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {greeting.timeOfDay}, {greeting.userName} {greeting.emoji}
            </motion.h1>
          ) : (
            <div className="h-8 w-64 max-w-[70vw] animate-pulse rounded-md bg-dark3 motion-reduce:animate-none" aria-hidden="true" />
          )}

          <div className="relative z-10 flex w-full items-center justify-start gap-2 overflow-x-auto pb-0.5 lg:w-auto lg:justify-end lg:overflow-visible lg:pb-0">
            <button
              type="button"
              aria-pressed={includeSimulation}
              onClick={toggleSimulation}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:min-h-10 ${
                includeSimulation
                  ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'border-white/10 bg-dark2 text-text-dim hover:bg-dark3 hover:text-text'
              }`}
              title={includeSimulation ? 'La simulación del 5 de septiembre está incluida' : 'Incluir la simulación del 5 de septiembre'}
            >
              <span className="material-symbols-outlined text-[17px]" aria-hidden="true">science</span>
              Simulación
            </button>
            <Link href="/settings" className="shrink-0">
              <Button variant="outline" className="flex min-h-11 w-auto items-center justify-center gap-1.5 rounded-full border-white/10 bg-dark2 px-4 text-xs font-bold text-text shadow-lg transition-all hover:bg-dark3 active:scale-[0.97] sm:min-h-10">
                <span className="material-symbols-outlined text-[17px]" aria-hidden="true">settings</span>
                Ajustes
              </Button>
            </Link>
            <Link href="/shifts" className="shrink-0">
              <Button className="group flex min-h-11 w-auto items-center justify-center gap-1.5 rounded-full bg-[#4d7cfe] px-4 text-xs font-bold text-white shadow-lg shadow-blue-500/10 transition-all hover:bg-[#3b66e0] active:scale-[0.97] sm:min-h-10">
                <span className="material-symbols-outlined text-[17px]" aria-hidden="true">calendar_month</span>
                Turnos
              </Button>
            </Link>
          </div>
        </div>

        {greeting && (
          <DashboardInsightPanel
            insight={dashboardInsight}
            isLoading={isInsightLoading}
            fallbackMessage={greeting.message}
            onRegenerate={regenerateDashboardInsight}
          />
        )}
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-12 pb-20 pt-4"
      >

      {/* Primary KPIs */}
      <div className="-mx-4 mb-8 border-y border-border bg-border sm:-mx-6 lg:-mx-8">
        <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
          <section className="group flex min-h-[188px] flex-col bg-dark2 p-4 transition-colors duration-200 hover:bg-dark3 sm:min-h-[222px] sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-[18px] text-blue-500 sm:size-9">groups</span>
                <p className="min-w-0 text-[11px] font-bold leading-[1.15] text-text sm:text-sm sm:leading-tight">Voluntarios activos</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiInfo({
                  title: "Voluntarios Activos",
                  explanation: "Muestra la cantidad real de personas activas disponibles en el alcance seleccionado. El dato secundario indica cuántas ya tienen al menos un turno asignado.",
                  formula: "Conteo único de voluntarios activos"
                })}
                className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="¿Cómo se calcula este KPI?"
                aria-label="Cómo se calcula Voluntarios Activos"
              >
                <span className="material-symbols-outlined text-[19px]">help_outline</span>
              </button>
            </div>
            <div className="flex flex-1 items-center py-4 sm:py-5">
              <p className="text-[44px] font-black leading-none tracking-[-0.045em] text-text tabular-nums sm:text-[60px] xl:text-[68px]">
                {globalStats.totalRecruited}
              </p>
            </div>
            <div className="flex items-end justify-between gap-2 border-t border-border pt-3">
              <p className="max-w-[10rem] text-[11px] font-semibold leading-tight text-text-dim sm:text-xs">Con turnos asignados</p>
              <p className="shrink-0 text-lg font-extrabold leading-none text-blue-500 tabular-nums sm:text-xl">{totalVolsWithShifts}</p>
            </div>
          </section>

          <section className="group flex min-h-[188px] flex-col bg-dark2 p-4 transition-colors duration-200 hover:bg-dark3 sm:min-h-[222px] sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[18px] text-accent sm:size-9">monitoring</span>
                <p className="min-w-0 text-[11px] font-bold leading-[1.15] text-text sm:text-sm sm:leading-tight">Turnos registrados</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiInfo({
                  title: "Turnos Registrados",
                  explanation: "Muestra el porcentaje de cobertura de requerimientos que ya cuentan con un voluntario asignado en la agenda.",
                  formula: "(Turnos Asignados válidos / Suma de Requerimientos Totales) × 100"
                })}
                className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title="¿Cómo se calcula este KPI?"
                aria-label="Cómo se calcula Turnos Registrados"
              >
                <span className="material-symbols-outlined text-[19px]">help_outline</span>
              </button>
            </div>
            <div className="flex flex-1 items-center py-4 sm:py-5">
              <p className="flex items-start text-[44px] font-black leading-none tracking-[-0.045em] text-text tabular-nums sm:text-[60px] xl:text-[68px]">
                {globalStats.globalCoveragePercentage}
                <span className="ml-1 mt-1 text-[0.42em] font-extrabold tracking-[-0.02em] text-accent sm:mt-1.5">%</span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] font-semibold leading-tight text-text-dim sm:text-xs">Cobertura de cupos</p>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold leading-none sm:text-[11px] ${coverageStatus.className}`}>
                {coverageStatus.label}
              </span>
            </div>
          </section>

          <section className="group flex min-h-[188px] flex-col bg-dark2 p-4 transition-colors duration-200 hover:bg-dark3 sm:min-h-[222px] sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg text-[18px] sm:size-9 ${globalStats.criticalAlerts > 0 ? 'bg-red/15 text-red' : 'bg-white/5 text-text-dim'}`}>security</span>
                <p className="min-w-0 text-[11px] font-bold leading-[1.15] text-text sm:text-sm sm:leading-tight">Alertas críticas</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiInfo({
                  title: "Alertas Críticas",
                  explanation: "Cantidad de turnos (por comité y día) donde los voluntarios asignados son menores al mínimo de requerimientos configurado.",
                  formula: "Conteo de slots donde Voluntarios Asignados < Requerimiento Configurado"
                })}
                className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red"
                title="¿Cómo se calcula este KPI?"
                aria-label="Cómo se calcula Alertas Críticas"
              >
                <span className="material-symbols-outlined text-[19px]">help_outline</span>
              </button>
            </div>
            <div className="flex flex-1 items-center py-4 sm:py-5">
              <p className={`text-[44px] font-black leading-none tracking-[-0.045em] tabular-nums sm:text-[60px] xl:text-[68px] ${globalStats.criticalAlerts > 0 ? 'text-red' : 'text-text'}`}>
                {globalStats.criticalAlerts}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] font-semibold leading-tight text-text-dim sm:text-xs">
                {globalStats.criticalAlerts > 0 ? 'Turnos bajo el mínimo' : 'Estabilidad operativa'}
              </p>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold leading-none sm:text-[11px] ${globalStats.criticalAlerts > 0 ? 'bg-red/15 text-red' : 'bg-accent/15 text-accent'}`}>
                {globalStats.criticalAlerts > 0 ? 'Revisar' : 'Normal'}
              </span>
            </div>
          </section>

          <section className="group flex min-h-[188px] flex-col bg-dark2 p-4 transition-colors duration-200 hover:bg-dark3 sm:min-h-[222px] sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-[18px] text-emerald-500 sm:size-9">person_check</span>
                <p className="min-w-0 text-[11px] font-bold leading-[1.15] text-text sm:text-sm sm:leading-tight">Asistencia general</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiInfo({
                  title: "Asistencia General (QR Confirmados)",
                  explanation: "Porcentaje de turnos donde el voluntario escaneó su código QR de asistencia respecto al total de turnos asignados.",
                  formula: "(Turnos con QR Confirmado / Total de Turnos Asignados a Voluntarios) × 100"
                })}
                className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                title="¿Cómo se calcula este KPI?"
                aria-label="Cómo se calcula Asistencia General"
              >
                <span className="material-symbols-outlined text-[19px]">help_outline</span>
              </button>
            </div>
            <div className="flex flex-1 items-center py-4 sm:py-5">
              <p className="flex items-start text-[44px] font-black leading-none tracking-[-0.045em] text-text tabular-nums sm:text-[60px] xl:text-[68px]">
                {globalStats.attendanceRate}
                <span className="ml-1 mt-1 text-[0.42em] font-extrabold tracking-[-0.02em] text-emerald-500 sm:mt-1.5">%</span>
              </p>
            </div>
            <div className="flex items-end justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] font-semibold leading-tight text-text-dim sm:text-xs">QR confirmados</p>
              <p className="shrink-0 text-base font-extrabold leading-none text-text tabular-nums sm:text-lg">
                {globalStats.checkedInCount}
                {globalStats.totalAssigned > 0 && <span className="text-text-dim">/{globalStats.totalAssigned}</span>}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Activity by day — edge to edge */}
      <motion.section variants={itemVariants} className="-mx-4 mb-8 border-y border-border bg-dark2 sm:-mx-6 lg:-mx-8">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-text">Actividad por día</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-xl font-extrabold leading-none text-text tabular-nums">
                {chartMetric === 'volunteers' ? totalVolsWithShifts.toLocaleString() : globalStats.totalAssigned.toLocaleString()}
              </p>
              <p className="text-[11px] font-semibold leading-tight text-text-dim">
                {chartMetric === 'volunteers' ? 'voluntarios únicos en el evento' : 'turnos cubiertos en el evento'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-dark3 p-1" role="group" aria-label="Métrica de la gráfica">
              <button
                type="button"
                onClick={() => setChartMetric('volunteers')}
                aria-pressed={chartMetric === 'volunteers'}
                className={`min-h-8 rounded-md px-3 text-[11px] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] ${
                  chartMetric === 'volunteers'
                    ? 'bg-[#4d7cfe] text-white'
                    : 'text-text-dim hover:bg-dark2 hover:text-text'
                }`}
              >
                Personas únicas
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('shifts')}
                aria-pressed={chartMetric === 'shifts'}
                className={`min-h-8 rounded-md px-3 text-[11px] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] ${
                  chartMetric === 'shifts'
                    ? 'bg-[#4d7cfe] text-white'
                    : 'text-text-dim hover:bg-dark2 hover:text-text'
                }`}
              >
                Turnos cubiertos
              </button>
            </div>

            <div className="hidden items-center rounded-md border border-border bg-dark3 px-2.5 py-1.5 text-[10px] font-bold text-text-dim md:flex">
              {includeSimulation ? '5 – 26 Sep' : '10 – 26 Sep'}
            </div>
          </div>
        </div>

        <div className="px-3 py-5 sm:px-8 sm:py-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pl-9 sm:pl-11">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-text-dim">
              <span className={`block w-6 border-t border-dashed ${chartModel.hasShiftRequirements ? 'border-amber-500' : 'border-text-dim'}`} />
              <span>{chartModel.referenceLabel}</span>
              <span className="text-text">{chartModel.referenceSummary}</span>
            </div>
            <p className="text-[10px] font-semibold text-text-dim">Selecciona una barra para consultar el día</p>
          </div>

          <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 sm:grid-cols-[38px_minmax(0,1fr)] sm:gap-3">
            <div className="relative h-[240px] pt-12 text-right text-[9px] font-semibold text-text-dim tabular-nums sm:text-[10px]">
              <span className="absolute right-0 top-[42px]">{chartModel.scaleMax.toLocaleString()}</span>
              <span className="absolute right-0 top-[calc(50%+18px)] -translate-y-1/2">{chartModel.scaleMidpoint.toLocaleString()}</span>
              <span className="absolute bottom-0 right-0">0</span>
            </div>

            <div className="relative h-[240px] pt-12">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-12">
                <div className="absolute inset-x-0 top-0 border-t border-border" />
                <div className="absolute inset-x-0 top-1/2 border-t border-border/70" />
                <div className="absolute inset-x-0 bottom-0 border-t border-border" />
                <svg className={`absolute inset-0 z-10 size-full overflow-visible ${chartModel.hasShiftRequirements ? 'text-amber-500' : 'text-text-dim'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={chartModel.referencePoints}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>

              <div className="absolute inset-x-0 bottom-0 top-12 z-20 flex items-end gap-0.5 sm:gap-1.5">
                {EVENT_DAYS.map((day, idx) => {
                  const count = chartModel.values[day.key] || 0;
                  const volsCount = volsPerDay[day.key] || 0;
                  const shiftsCount = shiftsPerDay[day.key] || 0;
                  const heightPct = Math.max((count / chartModel.scaleMax) * 100, count > 0 ? 3 : 1);
                  const isActive = activeChartDay === day.key;
                  const isSelected = selectedChartDay === day.key;
                  const totalDays = EVENT_DAYS.length;
                  let alignClass = "left-1/2 -translate-x-1/2";
                  if (idx < 3) alignClass = "left-0 translate-x-0";
                  if (idx >= totalDays - 3) alignClass = "right-0 left-auto translate-x-0";

                  return (
                    <button
                      key={day.key}
                      type="button"
                      aria-label={`${day.label} ${day.dateNum}: ${volsCount} personas únicas y ${shiftsCount} turnos cubiertos`}
                      aria-pressed={isSelected}
                      className="group flex h-full flex-1 cursor-pointer items-end justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe]"
                      onMouseEnter={() => setHoveredDay(day.key)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onFocus={() => setHoveredDay(day.key)}
                      onBlur={() => setHoveredDay(null)}
                      onClick={() => setSelectedChartDay(previous => previous === day.key ? null : day.key)}
                    >
                      <motion.span
                        initial={false}
                        animate={{ height: `${heightPct}%` }}
                        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className={`relative block w-full rounded-t-[3px] transition-colors duration-200 ${
                          isSelected
                            ? 'bg-[#4d7cfe]'
                            : isActive
                              ? 'bg-[#4d7cfe]/70'
                              : 'bg-[#4d7cfe]/25 group-hover:bg-[#4d7cfe]/50'
                        }`}
                      >
                        {isActive && (
                          <span className={`pointer-events-none absolute bottom-full z-30 mb-2 flex min-w-[116px] flex-col gap-0.5 whitespace-nowrap rounded-lg border border-border bg-dark2 px-3 py-2 text-center text-[10px] font-bold text-text shadow-md ${alignClass}`}>
                            <span className="text-[11px] font-extrabold text-[#4d7cfe]">{day.label} {day.dateNum}</span>
                            <span>{volsCount} personas únicas</span>
                            <span className="text-[9px] text-text-dim">{shiftsCount} turnos cubiertos</span>
                          </span>
                        )}
                      </motion.span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ml-10 mt-2 flex gap-0.5 sm:ml-[50px] sm:gap-1.5">
            {EVENT_DAYS.map(day => (
              <div key={day.key} className="flex-1 text-center">
                <span className={`text-[8px] font-bold transition-colors sm:text-[10px] ${activeChartDay === day.key ? 'text-[#4d7cfe]' : 'text-text-dim'}`}>
                  {day.dateNum}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-[11px] font-semibold text-text-dim">Septiembre 2026</p>
            {selectedChartDayInfo ? (
              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <p className="text-[11px] font-bold text-text">
                  <span className="text-[#4d7cfe]">{selectedChartDayInfo.label} {selectedChartDayInfo.dateNum}</span>
                  {' · '}{(volsPerDay[selectedChartDayInfo.key] || 0).toLocaleString()} personas
                  {' · '}{(shiftsPerDay[selectedChartDayInfo.key] || 0).toLocaleString()} turnos
                </p>
                <button
                  type="button"
                  onClick={() => openVolunteersForChartDay(selectedChartDayInfo.key)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#4d7cfe] px-3 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-[#3b66e0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2"
                >
                  Ver voluntarios
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            ) : (
              <p className="text-[10px] font-semibold text-text-dim sm:hidden">Toca una barra para ver el detalle</p>
            )}
          </div>
        </div>
      </motion.section>

      {/* Cobertura por Comité & Distribución en Donut / Pie Chart — edge to edge */}
      <motion.div variants={itemVariants} className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/[0.02] mb-8">
        <div className="px-5 sm:px-8 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-text tracking-tight leading-none text-sm font-bold">
              {distributionView === 'chart' ? 'Distribución de Voluntarios' : 'Cobertura por Comité'}
            </h3>
            <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-widest mt-0.5">
              {distributionView === 'chart'
                ? isScopedToSingleCommittee
                  ? `División por Áreas Operativas · ${targetCommitteeName}`
                  : 'Distribución de Voluntarios entre Comités'
                : 'Porcentaje de requerimientos asignados'}
            </p>
          </div>

          {/* View Switcher Controls: Cobertura (Lista) vs Distribución (Pie Chart) */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center p-0.5 rounded-lg bg-dark3 border border-border">
              <button
                type="button"
                onClick={() => setDistributionView('list')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-bold font-inter transition-all flex items-center gap-1.5 cursor-pointer",
                  distributionView === 'list'
                    ? "bg-[#4d7cfe] text-white shadow-sm font-extrabold"
                    : "text-text-dim hover:text-text"
                )}
                title="Ver lista de cobertura y requerimientos"
              >
                <span className="material-symbols-outlined text-[15px]">view_list</span>
                <span>Cobertura</span>
              </button>
              <button
                type="button"
                onClick={() => setDistributionView('chart')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-bold font-inter transition-all flex items-center gap-1.5 cursor-pointer",
                  distributionView === 'chart'
                    ? "bg-[#4d7cfe] text-white shadow-sm font-extrabold"
                    : "text-text-dim hover:text-text"
                )}
                title="Ver gráfico circular de distribución"
              >
                <span className="material-symbols-outlined text-[15px]">donut_large</span>
                <span>Distribución</span>
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {distributionView === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="divide-y divide-white/5"
            >
              {committeeStatus.map((committee, idx) => (
                <motion.div
                  key={committee.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + idx * 0.03 }}
                  className="px-5 sm:px-8 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group cursor-default"
                >
                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider group-hover:text-text transition-colors truncate" title={committee.name}>{committee.name}</p>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="w-32 sm:w-48 h-1.5 bg-dark3 rounded-full overflow-hidden border border-border">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${committee.coverage}%` }}
                        transition={{ duration: 0.8, delay: 0.1 + idx * 0.03 }}
                        className={`h-full rounded-full ${committee.status === 'success' ? 'bg-accent' :
                          committee.status === 'warning' ? 'bg-amber-400' : 'bg-red'
                          }`}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-text-dim w-10 tabular-nums text-right">{committee.coverage}%</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="chart"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardDistributionChart
                title={isScopedToSingleCommittee ? `Distribución por Áreas` : 'Distribución por Comités'}
                subtitle={isScopedToSingleCommittee ? `Comité: ${targetCommitteeName}` : 'Todos los Comités'}
                items={distributionItems}
                totalLabel={distributionMetric === 'volunteers' ? 'Total Voluntarios' : 'Total Turnos'}
                unitLabel={distributionMetric === 'volunteers' ? 'voluntarios' : 'turnos cubiertos'}
                isScopedToCommittee={isScopedToSingleCommittee}
                committeeName={targetCommitteeName || ''}
                selectedCommitteeId={targetCommitteeObj?.id}
                canManageAreas={true}
                metric={distributionMetric}
                onMetricChange={setDistributionMetric}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Mapa de Calor Operativo — edge to edge, no card */}
      <motion.div variants={itemVariants} className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/[0.02]">
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
<div>
            <h3 className="text-text tracking-tight leading-none text-sm font-bold">Mapa de Calor Operativo</h3>
            <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-widest mt-0.5">Cobertura por Día y Turno</p>
          </div>

          {/* Committee Filter Selector & Fullscreen Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider hidden sm:inline">Comité:</span>
            {canViewGlobalReports() ? (
              <Select
                value={selectedHeatmapCommittee}
                onValueChange={(val) => setSelectedHeatmapCommittee(val || 'todos')}
              >
                <SelectTrigger className="h-8 min-h-[32px] w-full sm:w-[210px] bg-dark3 border-border text-xs font-bold text-text rounded-lg">
                  <SelectValue placeholder="Todos los subcomités">
                    {selectedHeatmapCommittee === 'todos' || selectedHeatmapCommittee === 'all'
                      ? 'Todos los comités'
                      : selectedHeatmapCommittee}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-dark2 border-border text-text z-50">
                  <SelectItem value="todos" className="text-xs font-bold">
                    Todos los comités
                  </SelectItem>
                  {committeesList
                    .filter((committee) => (committee.status || '').toLowerCase() !== 'archived')
                    .map((committee) => (
                      <SelectItem key={committee.id} value={committee.name} className="text-xs font-bold">
                        {committee.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 text-[#4d7cfe] px-3 py-1 rounded-full text-xs font-bold font-inter">
                <span className="material-symbols-outlined text-[14px]">groups</span>
                <span>{selectedHeatmapCommittee || userCommittee || 'Mi Comité'}</span>
              </div>
            )}

            <button
              type="button"
              onClick={toggleHeatmapFullscreen}
              className="h-8 w-8 rounded-lg bg-dark3 border border-border text-text-dim hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
              title="Pantalla Completa (Modo Proyección TV)"
              aria-label="Pantalla completa"
            >
              <span className="material-symbols-outlined text-[18px]">fullscreen</span>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto w-full">
          <div className="min-w-full flex">
            <div className="w-16 sm:w-20 shrink-0 bg-dark3 border-r border-border flex flex-col pt-8">
              {heatmapMatrix.map((dayData) => {
                const isHovered = hoveredHeatmapDay === dayData.day;
                return (
                  <div
                    key={dayData.day}
                    onMouseEnter={() => setHoveredHeatmapDay(dayData.day)}
                    onMouseLeave={() => setHoveredHeatmapDay(null)}
                    className={`flex-1 min-h-[60px] flex items-center justify-center border-b border-border last:border-0 px-1 text-center transition-colors duration-150 cursor-pointer ${
                      isHovered ? 'bg-[#4d7cfe]/15' : ''
                    }`}
                  >
                    <span className={`text-[10px] sm:text-xs font-bold leading-none transition-colors duration-150 ${isHovered ? 'text-[#4d7cfe]' : 'text-text-dim'}`}>
                      {dayData.shortLabel} {dayData.dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 grid grid-cols-4">
              {['T1', 'T2', 'T3', 'T4'].map((shiftId, shiftIdx) => (
                <div key={shiftId} className="flex flex-col border-r border-border last:border-0 min-w-0">
                  <div className="h-8 flex flex-col items-center justify-center bg-dark3 border-b border-border">
                    <span className="text-[10px] font-bold text-text">{shiftId}</span>
                  </div>
                  {heatmapMatrix.map((dayData) => {
                    const shift = dayData.shifts[shiftIdx];
                    const isHovered = hoveredHeatmapDay === dayData.day;
                    return (
                      <button
                        type="button"
                        key={dayData.day}
                        onClick={() => openVolunteersForHeatmapSlot(dayData.day, shiftId)}
                        onMouseEnter={() => setHoveredHeatmapDay(dayData.day)}
                        onMouseLeave={() => setHoveredHeatmapDay(null)}
                        className={`flex-1 min-h-[60px] flex flex-col items-center justify-center border-b border-dark2 last:border-b-0 p-1 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe] ${
                          isHovered ? 'brightness-125 saturate-125' : ''
                        }`}
                        aria-label={`Ver voluntarios de ${shiftId} el ${dayData.day}`}
                        title={`Ver ${shift.assigned} voluntario${shift.assigned === 1 ? '' : 's'} de ${shiftId} el ${dayData.day}`}
                        style={{
                          backgroundColor: shift.required === 0 ? (isHovered ? 'var(--dark2)' : 'var(--dark3)') :
                            shift.coverage >= 1 ? (isHovered ? 'rgba(20, 184, 166, 0.28)' : 'rgba(20, 184, 166, 0.15)') :
                              shift.coverage >= 0.7 ? (isHovered ? 'rgba(251, 191, 36, 0.28)' : 'rgba(251, 191, 36, 0.15)') :
                                (isHovered ? 'rgba(248, 113, 113, 0.28)' : 'rgba(248, 113, 113, 0.15)')
                        }}
                      >
                        {shift.required > 0 ? (
                          <>
                            <span className="text-xs font-inter font-bold text-text">{Math.round(shift.coverage * 100)}%</span>
                            <span className="text-[10px] font-inter font-bold text-text-dim mt-0.5">{shift.assigned}/{shift.required}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted">-</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 sm:gap-8 py-5 border-t border-white/5 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: 'rgba(248, 113, 113, 0.15)', borderColor: 'rgba(248, 113, 113, 0.3)' }} />
            <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Crítico</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.3)' }} />
            <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Riesgo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: 'rgba(20, 184, 166, 0.15)', borderColor: 'rgba(20, 184, 166, 0.3)' }} />
            <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Óptimo</span>
          </div>
        </div>
      </motion.div>

      {/* Heatmap Fullscreen TV / Mobile / Desktop Projection View */}
      <AnimatePresence>
        {isHeatmapFullscreen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="fixed inset-0 z-[99999] bg-dark text-text flex flex-col p-2 sm:p-4 md:p-6 w-screen h-screen overflow-hidden select-none"
          >
            {/* Top Bar - Centered Committee Focus without Heatmap Title */}
            <div className="shrink-0 flex items-center justify-between gap-2 sm:gap-4 pb-2 sm:pb-3 border-b border-border">
              {/* Left spacer for perfect centering on desktop/tablet */}
              <div className="hidden md:flex items-center w-24 sm:w-32 shrink-0">
                <span className="text-[10px] sm:text-xs font-bold text-text-dim uppercase tracking-wider">
                  Proyección
                </span>
              </div>

              {/* Center: Prominent Committee Name & Selector with Navigation Arrows */}
              <div className="flex items-center gap-1.5 sm:gap-3 flex-1 justify-center max-w-xl mx-auto min-w-0">
                {canViewGlobalReports() && (
                  <button
                    type="button"
                    onClick={handlePrevCommittee}
                    className="h-8 w-8 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-xl bg-dark2 border border-border text-text hover:bg-dark3 hover:border-primary/40 flex items-center justify-center transition-all active:scale-95 shadow-sm group shrink-0"
                    title="Comité anterior (Flecha Izquierda ◀)"
                    aria-label="Comité anterior"
                  >
                    <span className="material-symbols-outlined text-[20px] sm:text-[24px] md:text-[26px] group-hover:-translate-x-0.5 transition-transform">chevron_left</span>
                  </button>
                )}

                <div className="px-3 sm:px-6 py-1 sm:py-2 rounded-xl bg-dark2 border border-border shadow-sm flex flex-col items-center justify-center flex-1 max-w-[380px] sm:max-w-[440px] min-w-0">
                  <span className="text-xs sm:text-base md:text-xl font-black text-text tracking-tight text-center truncate w-full">
                    {selectedHeatmapCommittee === 'todos' || selectedHeatmapCommittee === 'all'
                      ? 'Todos los comités'
                      : selectedHeatmapCommittee}
                  </span>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] md:text-xs font-bold text-[#4d7cfe] tracking-wider uppercase mt-0.5">
                    {canViewGlobalReports() ? (
                      <>
                        <span>{currentCommitteeIndex + 1} / {availableHeatmapCommittees.length}</span>
                        {autoRotateInterval > 0 && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/10 px-1 py-0.2 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Auto: {rotateProgress}s
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Tu Comité</span>
                    )}
                  </div>
                </div>

                {canViewGlobalReports() && (
                  <button
                    type="button"
                    onClick={handleNextCommittee}
                    className="h-8 w-8 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-xl bg-dark2 border border-border text-text hover:bg-dark3 hover:border-primary/40 flex items-center justify-center transition-all active:scale-95 shadow-sm group shrink-0"
                    title="Comité siguiente (Flecha Derecha ▶)"
                    aria-label="Comité siguiente"
                  >
                    <span className="material-symbols-outlined text-[20px] sm:text-[24px] md:text-[26px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                  </button>
                )}
              </div>

              {/* Right: Auto-Rotate Timer, Legend & Exit Fullscreen Button */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {canViewGlobalReports() && (
                  <button
                    type="button"
                    onClick={cycleAutoRotate}
                    className={`h-8 sm:h-10 px-2 sm:px-3 rounded-xl border text-[10px] sm:text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${
                      autoRotateInterval > 0
                        ? 'bg-[#4d7cfe]/10 border-[#4d7cfe]/40 text-[#4d7cfe]'
                        : 'bg-dark2 border-border text-text-dim hover:text-text hover:bg-dark3'
                    }`}
                    title="Cambiar temporizador de rotación automática (OFF / 30 seg / 1 min / 5 min)"
                  >
                    <span className={`material-symbols-outlined text-[16px] sm:text-[18px] ${autoRotateInterval > 0 ? 'animate-spin' : ''}`}>sync</span>
                    <span className="hidden sm:inline">Auto:</span>
                    <span>{getAutoRotateLabel(autoRotateInterval)}</span>
                  </button>
                )}

                <div className="hidden lg:flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-dark2 border border-border">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-xs bg-red-500/20 border border-red-500/40" />
                    <span className="text-[10px] font-bold text-text-dim uppercase">Crítico</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-xs bg-amber-500/20 border border-amber-500/40" />
                    <span className="text-[10px] font-bold text-text-dim uppercase">Riesgo</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-xs bg-emerald-500/20 border border-emerald-500/40" />
                    <span className="text-[10px] font-bold text-text-dim uppercase">Óptimo</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeHeatmapFullscreen}
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-dark2 border border-border text-text-dim hover:text-red hover:bg-red-500/10 hover:border-red/30 flex items-center justify-center transition-all active:scale-95 shadow-sm shrink-0"
                  title="Salir de pantalla completa (Esc)"
                  aria-label="Salir de pantalla completa"
                >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">close_fullscreen</span>
                </button>
              </div>
            </div>

            {/* Heatmap Grid Container - Fits 100% Height and Width without scroll */}
            <div className="flex-1 min-h-0 min-w-0 w-full flex border border-border bg-dark2 overflow-hidden mt-1.5 sm:mt-3">
              {/* Day Labels Column */}
              <div className="w-14 sm:w-20 md:w-28 shrink-0 bg-dark3 border-r border-border flex flex-col pt-7 sm:pt-8 md:pt-9">
                {heatmapMatrix.map((dayData) => {
                  const isHovered = hoveredHeatmapDay === dayData.day;
                  return (
                    <div
                      key={dayData.day}
                      onMouseEnter={() => setHoveredHeatmapDay(dayData.day)}
                      onMouseLeave={() => setHoveredHeatmapDay(null)}
                      className={`flex-1 min-h-0 flex items-center justify-center border-b border-border last:border-0 px-1 text-center transition-colors duration-150 cursor-pointer ${
                        isHovered ? 'bg-[#4d7cfe]/15' : ''
                      }`}
                    >
                      <span className={`text-[10px] sm:text-xs md:text-sm font-bold leading-none transition-colors duration-150 ${isHovered ? 'text-[#4d7cfe]' : 'text-text-dim'}`}>
                        {dayData.shortLabel} {dayData.dayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 4 Shift Columns */}
              <div className="flex-1 min-h-0 grid grid-cols-4">
                {['T1', 'T2', 'T3', 'T4'].map((shiftId, shiftIdx) => (
                  <div key={shiftId} className="flex flex-col border-r border-border last:border-0 min-w-0 h-full">
                    <div className="h-7 sm:h-8 md:h-9 flex flex-col items-center justify-center bg-dark3 border-b border-border shrink-0">
                      <span className="text-[11px] sm:text-xs md:text-sm font-bold text-text">{shiftId}</span>
                    </div>
                    {heatmapMatrix.map((dayData) => {
                      const shift = dayData.shifts[shiftIdx];
                      const isHovered = hoveredHeatmapDay === dayData.day;
                      return (
                        <button
                          type="button"
                          key={dayData.day}
                          onClick={() => openVolunteersForHeatmapSlot(dayData.day, shiftId)}
                          onMouseEnter={() => setHoveredHeatmapDay(dayData.day)}
                          onMouseLeave={() => setHoveredHeatmapDay(null)}
                          className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-dark2 last:border-b-0 p-0.5 sm:p-1 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe] ${
                            isHovered ? 'brightness-125 saturate-125' : ''
                          }`}
                          aria-label={`Ver voluntarios de ${shiftId} el ${dayData.day}`}
                          title={`Ver ${shift.assigned} voluntario${shift.assigned === 1 ? '' : 's'} de ${shiftId} el ${dayData.day}`}
                          style={{
                            backgroundColor: shift.required === 0 ? (isHovered ? 'var(--dark2)' : 'var(--dark3)') :
                              shift.coverage >= 1 ? (isHovered ? 'rgba(20, 184, 166, 0.28)' : 'rgba(20, 184, 166, 0.15)') :
                                shift.coverage >= 0.7 ? (isHovered ? 'rgba(251, 191, 36, 0.28)' : 'rgba(251, 191, 36, 0.15)') :
                                  (isHovered ? 'rgba(248, 113, 113, 0.28)' : 'rgba(248, 113, 113, 0.15)')
                          }}
                        >
                          {shift.required > 0 ? (
                            <>
                              <span className="text-[11px] sm:text-xs md:text-sm font-inter font-bold text-text leading-tight">
                                {Math.round(shift.coverage * 100)}%
                              </span>
                              <span className="text-[9px] sm:text-[10px] md:text-xs font-inter font-bold text-text-dim mt-0.5">
                                {shift.assigned}/{shift.required}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] sm:text-xs text-muted font-bold">-</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Bar: Quick Help & Status */}
            <div className="shrink-0 pt-1.5 sm:pt-2 flex items-center justify-between text-[9px] sm:text-xs text-text-dim font-bold">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="material-symbols-outlined text-[14px] sm:text-[16px] text-[#4d7cfe]">swipe</span>
                <span className="hidden sm:inline">Desliza o usa ◀ / ▶ para cambiar de comité • Esc para salir</span>
                <span className="sm:hidden">Desliza o usa ◀ / ▶</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <span>Días: {heatmapMatrix.length}</span>
                <span className="text-border">•</span>
                <span className="text-[#4d7cfe] font-extrabold truncate">VolunteerManager</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Explanation Modal */}
      <AnimatePresence>
        {activeKpiInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveKpiInfo(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-dark2 border border-white/10 p-6 rounded-lg max-w-md w-full shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="text-lg font-bold text-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4d7cfe]">info</span>
                  {activeKpiInfo.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveKpiInfo(null)}
                  className="text-text-dim hover:text-white transition-colors p-1 rounded-sm hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-text-dim leading-relaxed">
                  {activeKpiInfo.explanation}
                </p>
                <div className="p-3 bg-dark3 rounded-sm border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold text-[#4d7cfe] uppercase tracking-wider">Cálculo / Fórmula</span>
                  <p className="text-xs font-mono font-bold text-text">{activeKpiInfo.formula}</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setActiveKpiInfo(null)}
                  className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white text-xs font-bold px-4 h-9"
                >
                  Entendido
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </motion.div>
    </>
  );
}
