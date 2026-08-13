'use client'

import { useState, useEffect, useTransition, useMemo, useRef } from "react";
import { getReportsData, ReportItem, ReportsData, AttendanceSummary } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { cn } from "@/lib/utils";
import { getActiveEventDays, formatDateShort } from "@/lib/dates";
import { canViewReports } from "@/lib/permissions";
import { VolunteerProfileDrawer } from "@/components/VolunteerProfileDrawer";
import { canViewVolunteerProfile } from "@/lib/permissions";
import { useCoordinatorData } from "@/lib/coordinator-data-context";
import { formatUnifiedDuration } from "@/lib/shift-calculations";
import { SortableTableHead, TableSortDirection } from "@/components/SortableTableHead";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { HighlightText } from "@/components/HighlightText";

// Day names for week headers
const DAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Maps ISO date string to short label shown under the day number
const DAY_SHORT: Record<string, string> = {
  "1": "Lun", "2": "Mar", "3": "Mié",
  "4": "Jue", "5": "Vie", "6": "Sáb", "0": "Dom"
};
// Utilidad para formatear minutos
function getCommitteeColor(committee: string) {
  if (!committee) return 'bg-white/5 text-text-dim border-white/10';
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía') || comm.includes('guia')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción') || comm.includes('traduccion')) return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
  if (comm.includes('auxilios') || comm.includes('médico') || comm.includes('medico')) return 'bg-teal-500/15 text-teal-500 border-teal-500/20';

  const colors = [
    'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20',
    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    'bg-rose-500/15 text-rose-400 border-rose-500/20',
    'bg-orange-500/15 text-orange-400 border-orange-500/20',
    'bg-sky-500/15 text-sky-400 border-sky-500/20'
  ];
  let hash = 0;
  for (let i = 0; i < committee.length; i++) {
    hash = committee.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  return dateStr;
}

function formatMinutes(totalMinutes: number): string {
  return formatUnifiedDuration(totalMinutes);
}

type SortOrder = 'asc' | 'desc';
type HistorySortField = 'volunteerName' | 'committeeName' | 'neighborhood' | 'date' | 'durationMinutes' | 'status';
type VolunteerSortField = 'name' | 'committee' | 'confirmed' | 'reliability' | 'minutes';
type DailySortField = 'date' | 'required' | 'assigned' | 'checkedIn' | 'missing' | 'coverageRate';

function ReportPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-dark3/40 px-4 py-3 sm:px-5">
      <span className="text-[11px] font-bold font-inter text-text-dim">
        {firstItem}–{lastItem} de {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="flex h-8 items-center gap-1 rounded-full border border-border bg-dark2 px-3 text-[11px] font-bold text-text transition-colors hover:bg-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[15px]">chevron_left</span>
          Anterior
        </button>
        <span className="min-w-14 text-center text-[11px] font-bold font-inter text-text-dim">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="flex h-8 items-center gap-1 rounded-full border border-border bg-dark2 px-3 text-[11px] font-bold text-text transition-colors hover:bg-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
          <span className="material-symbols-outlined text-[15px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<'history' | 'volunteers' | 'recruitment' | 'daily'>('history');

  // Filters State (Multi-Selection arrays)
  const { inputValue, setInputValue, appliedSearch, applySearch } = useDebouncedSearch();

  // Table Column Sort States
  const [historySortField, setHistorySortField] = useState<HistorySortField | null>(null);
  const [historySortOrder, setHistorySortOrder] = useState<SortOrder>('asc');

  const handleHistorySort = (field: HistorySortField) => {
    if (historySortField === field) {
      setHistorySortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setHistorySortField(field);
      setHistorySortOrder('asc');
    }
  };

  const [volunteerSortField, setVolunteerSortField] = useState<VolunteerSortField | null>(null);
  const [volunteerSortOrder, setVolunteerSortOrder] = useState<SortOrder>('asc');
  const [dailySortField, setDailySortField] = useState<DailySortField>('date');
  const [dailySortDirection, setDailySortDirection] = useState<TableSortDirection>('asc');

  const handleVolunteerSort = (field: VolunteerSortField) => {
    if (volunteerSortField === field) {
      setVolunteerSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setVolunteerSortField(field);
      setVolunteerSortOrder('asc');
    }
  };

  const handleDailySort = (field: string) => {
    const nextField = field as DailySortField;
    if (dailySortField === nextField) {
      setDailySortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setDailySortField(nextField);
    setDailySortDirection('asc');
  };

  // Selected multi-filters
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Pagination State (30 items per page for instant 1ms DOM rendering)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // Drawer state for Volunteer Profile
  const [drawerVolunteer, setDrawerVolunteer] = useState<any>(null);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);

  let rawVolunteers: any[] = [];
  try {
    const coordCtx = useCoordinatorData();
    rawVolunteers = coordCtx.rawVolunteers || [];
  } catch (e) {}

  const handleOpenProfile = (item: any) => {
    if (!item) return;
    const targetCommitteeId = item.committeeId || item.committee_id || null;
    if (!canViewVolunteerProfile(targetCommitteeId)) return;
    const targetVolId = item.id || item.volunteer_id || item.volunteerId;
    const targetName = item.volunteerName || item.name || item.volunteer || '';

    // Precise search by ID or full name match
    const match = rawVolunteers.find((v: any) => {
      if (targetVolId && v.id === targetVolId) return true;
      const vName = (v.name || `${v.first_name || ''} ${v.last_name || ''}`).trim().toLowerCase();
      if (targetName && vName === targetName.trim().toLowerCase()) return true;
      return false;
    });

    if (match) {
      setDrawerVolunteer(match);
    } else {
      // Normalize item properties for drawer display
      setDrawerVolunteer({
        id: targetVolId || item.id,
        name: targetName,
        first_name: item.first_name || targetName.split(' ')[0] || '',
        last_name: item.last_name || targetName.split(' ').slice(1).join(' ') || '',
        committee: item.committee || item.committeeName || '',
        ward: item.ward || item.neighborhood || '',
        stake: item.stake || '',
        phone: item.phone || '',
        reliability: item.reliability ?? 100,
        age: item.age ?? undefined,
      });
    }
    setIsProfileDrawerOpen(true);
  };

  const [permTick, setPermTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handlePermissionsChange = () => setPermTick(v => v + 1);
    window.addEventListener("storage", handlePermissionsChange);
    window.addEventListener("permissions-changed", handlePermissionsChange);
    return () => {
      window.removeEventListener("storage", handlePermissionsChange);
      window.removeEventListener("permissions-changed", handlePermissionsChange);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Reset page to 1 whenever filters or search submit
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedCommittees, selectedNeighborhoods, selectedStakes, selectedStatuses, selectedDates, appliedSearch]);

  const [isPending, startTransition] = useTransition();
  const hasLoadedReportsRef = useRef(false);

  const loadData = async () => {
    setLoading(true);
    const res = await getReportsData();
    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (hasLoadedReportsRef.current) return;
    hasLoadedReportsRef.current = true;
    loadData();
  }, []);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const itemSearchIndex = useMemo(() => {
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return new Map(items.map(item => [
      item.registrationId,
      normalize(`${item.volunteerName} ${item.phone} ${item.neighborhood} ${item.stake} ${item.committeeName} ${item.committeeId}`),
    ]));
  }, [items]);

  // Compute ALL event days (Sep 10–26, excluding Sundays) matching Turnos page
  const allEventDays = useMemo(() => {
    return getActiveEventDays().map(date => {
      const isoDate = date.toISOString().split('T')[0];
      const dateNum = date.getDate();
      const monthShort = date.toLocaleString('es', { month: 'short' });
      const dayShort = formatDateShort(date).split(' ')[0]; // 'jue', 'vie', etc.
      return {
        date,
        isoDate,
        dateNum,
        monthShort,
        dayShort,
        key: formatDateShort(date)
      };
    });
  }, []);

  // Map dates with active shift registrations in the dataset
  const datesWithData = useMemo(() => {
    if (items.length === 0) return new Set<string>();
    return new Set(items.map(i => i.date));
  }, [items]);

  // Memoized Item Filtering with applied search term
  const filteredItems = useMemo(() => {
    if (items.length === 0) return [];

    const searchTerms = appliedSearch
      .split(',')
      .map(term => term.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
      .filter(Boolean);

    return items.filter(item => {
      // 1. Search term
      if (searchTerms.length > 0) {
        const searchText = itemSearchIndex.get(item.registrationId) || '';
        if (!searchTerms.every(term => searchText.includes(term))) return false;
      }
      
      // 2. Committee filter (check both ID and Name)
      if (selectedCommittees.length > 0) {
        const matchesComm = selectedCommittees.includes(item.committeeId) || selectedCommittees.includes(item.committeeName);
        if (!matchesComm) return false;
      }

      // 3. Neighborhood filter
      if (selectedNeighborhoods.length > 0) {
        if (!selectedNeighborhoods.includes(item.neighborhood)) return false;
      }

      // 4. Stake filter
      if (selectedStakes.length > 0) {
        if (!selectedStakes.includes(item.stake)) return false;
      }

      // 5. Status filter
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(item.status)) return false;
      }

      // 6. Multi-Date filter
      if (selectedDates.length > 0) {
        if (!selectedDates.includes(item.date)) return false;
      }

      return true;
    });
  }, [items, itemSearchIndex, appliedSearch, selectedCommittees, selectedNeighborhoods, selectedStakes, selectedStatuses, selectedDates]);

  // Single-pass calculation of KPIs from filtered items
  const kpiStats = useMemo(() => {
    let confirmed = 0;
    let absent = 0;
    let registered = 0;
    let replaced = 0;
    let totalMins = 0;

    for (let i = 0; i < filteredItems.length; i++) {
      const st = filteredItems[i].status;
      if (st === 'confirmed') {
        confirmed++;
        totalMins += filteredItems[i].durationMinutes;
      } else if (st === 'absent') {
        absent++;
      } else if (st === 'registered') {
        registered++;
      } else if (st === 'replaced') {
        replaced++;
      }
    }

    const total = filteredItems.length;
    const completedOrAbsent = confirmed + absent;
    const attRate = completedOrAbsent > 0 
      ? Math.round((confirmed / completedOrAbsent) * 100) 
      : (total > 0 ? Math.round((confirmed / total) * 100) : 0);

    return {
      totalShifts: total,
      confirmedShifts: confirmed,
      absentShifts: absent,
      pendingShifts: registered,
      replacedShifts: replaced,
      totalMinutes: totalMins,
      attendanceRate: attRate
    };
  }, [filteredItems]);

  const { totalShifts, confirmedShifts, absentShifts, pendingShifts, totalMinutes, attendanceRate } = kpiStats;

  const summary = data?.attendanceSummary;
  const globalAttendanceRate = summary?.attendanceRate ?? attendanceRate;
  const globalCoverageRate = summary?.coverageRate ?? 0;

  // Memoized volunteer summary ranking calculation
  const volunteerRanking = useMemo(() => {
    if (filteredItems.length === 0) return [];

    const volunteerMap = new Map<string, {
      id: string;
      name: string;
      phone: string;
      neighborhood: string;
      stake: string;
      committee: string;
      totalShifts: number;
      confirmed: number;
      absent: number;
      reliability: number;
      minutes: number;
    }>();

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      let v = volunteerMap.get(item.volunteerId);
      if (!v) {
        v = {
          id: item.volunteerId,
          name: item.volunteerName,
          phone: item.phone,
          neighborhood: item.neighborhood,
          stake: item.stake,
          committee: item.committeeName,
          totalShifts: 0,
          confirmed: 0,
          absent: 0,
          reliability: 100,
          minutes: 0
        };
        volunteerMap.set(item.volunteerId, v);
      }

      v.totalShifts += 1;
      if (item.status === 'confirmed') {
        v.confirmed += 1;
        v.minutes += item.durationMinutes;
      } else if (item.status === 'absent') {
        v.absent += 1;
      }
    }

    return Array.from(volunteerMap.values()).map(v => {
      const totalCount = v.confirmed + v.absent;
      v.reliability = totalCount > 0 ? Math.round((v.confirmed / totalCount) * 100) : 100;
      return v;
    }).sort((a, b) => b.minutes - a.minutes);
  }, [filteredItems]);

  // Dynamic Recruitment Summary filtered by active filters
  const filteredRecruitmentSummary = useMemo(() => {
    if (!data || activeTab !== 'recruitment') return [];

    const activeCommittees = data.uniqueCommittees.filter(c => {
      if (selectedCommittees.length > 0) {
        return selectedCommittees.includes(c.id) || selectedCommittees.includes(c.name);
      }
      return true;
    });

    return activeCommittees.map(c => {
      const commItems = filteredItems.filter(i => i.committeeId === c.id || i.committeeName.trim().toLowerCase() === c.name.trim().toLowerCase());
      const uniqueVolIds = new Set(commItems.map(i => i.volunteerId));
      const totalVolunteers = uniqueVolIds.size;

      const origRec = data.recruitmentSummary.find(r => r.committeeId === c.id || r.committeeName.trim().toLowerCase() === c.name.trim().toLowerCase());
      
      let totalRequiredShifts = origRec ? origRec.totalRequiredShifts : 0;
      if (selectedDates.length > 0 && data.dailyCoverage.length > 0) {
        const dateRatio = selectedDates.length / data.dailyCoverage.length;
        totalRequiredShifts = Math.round(totalRequiredShifts * dateRatio);
      }

      const assignedShifts = commItems.length;
      const missingShifts = Math.max(0, totalRequiredShifts - assignedShifts);
      const coverageRate = totalRequiredShifts > 0 ? Math.round((assignedShifts / totalRequiredShifts) * 100) : 0;

      return {
        committeeId: c.id,
        committeeName: c.name,
        totalVolunteers,
        totalRequiredShifts,
        assignedShifts,
        missingShifts,
        coverageRate,
      };
    });
  }, [data, filteredItems, selectedCommittees, selectedDates, activeTab]);

  // Dynamic Age Segmentation filtered by active filters
  const filteredAgeSegmentation = useMemo(() => {
    if (activeTab !== 'recruitment') return [];
    const ageCounts: Record<string, number> = {
      '< 18': 0,
      '18 - 25': 0,
      '26 - 35': 0,
      '36 - 50': 0,
      '50+': 0,
      'Sin edad': 0,
    };

    const uniqueVolMap = new Map<string, number | null>();
    filteredItems.forEach(item => {
      if (!uniqueVolMap.has(item.volunteerId)) {
        uniqueVolMap.set(item.volunteerId, item.age ?? null);
      }
    });

    uniqueVolMap.forEach((ageNum) => {
      if (ageNum === null || isNaN(ageNum) || ageNum <= 0) {
        ageCounts['Sin edad']++;
      } else if (ageNum < 18) {
        ageCounts['< 18']++;
      } else if (ageNum <= 25) {
        ageCounts['18 - 25']++;
      } else if (ageNum <= 35) {
        ageCounts['26 - 35']++;
      } else if (ageNum <= 50) {
        ageCounts['36 - 50']++;
      } else {
        ageCounts['50+']++;
      }
    });

    const totalVolsCount = uniqueVolMap.size;
    return Object.entries(ageCounts).map(([range, count]) => ({
      range,
      count,
      percentage: totalVolsCount > 0 ? Math.round((count / totalVolsCount) * 100) : 0,
    }));
  }, [filteredItems, activeTab]);

  // Dynamic Daily Coverage filtered by active filters
  const filteredDailyCoverage = useMemo(() => {
    if (!data || activeTab !== 'daily') return [];

    const activeDays = data.dailyCoverage.filter(day => selectedDates.length === 0 || selectedDates.includes(day.date));

    return activeDays.map(day => {
      const dayItems = filteredItems.filter(i => i.date === day.date);

      let dayRequired = day.required;
      if (selectedCommittees.length > 0 && data.uniqueCommittees.length > 0) {
        const commRatio = selectedCommittees.length / data.uniqueCommittees.length;
        dayRequired = Math.round(day.required * commRatio);
      }

      const dayAssigned = dayItems.length;
      const dayCheckedIn = dayItems.filter(i => i.status === 'confirmed').length;
      const missing = Math.max(0, dayRequired - dayAssigned);

      const byShift: Record<string, { required: number; assigned: number; checkedIn: number; missing: number }> = {
        T1: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
        T2: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
        T3: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
        T4: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
      };

      ['T1', 'T2', 'T3', 'T4'].forEach(sk => {
        const shiftNum = parseInt(sk.substring(1));
        const shiftItems = dayItems.filter(i => i.shiftNumber === shiftNum);
        const shiftAssigned = shiftItems.length;
        const shiftCheckedIn = shiftItems.filter(i => i.status === 'confirmed').length;
        const origReq = day.byShift[sk]?.required || 0;
        const shiftRequired = selectedCommittees.length > 0 && data.uniqueCommittees.length > 0
          ? Math.round(origReq * (selectedCommittees.length / data.uniqueCommittees.length))
          : origReq;

        byShift[sk] = {
          required: shiftRequired,
          assigned: shiftAssigned,
          checkedIn: shiftCheckedIn,
          missing: Math.max(0, shiftRequired - shiftAssigned),
        };
      });

      return {
        date: day.date,
        dayLabel: day.dayLabel,
        required: dayRequired,
        assigned: dayAssigned,
        checkedIn: dayCheckedIn,
        missing,
        coverageRate: dayRequired > 0 ? Math.round((dayAssigned / dayRequired) * 100) : 0,
        byShift,
      };
    });
  }, [data, filteredItems, selectedCommittees, selectedDates, activeTab]);

  const sortedDailyCoverage = useMemo(() => {
    return [...filteredDailyCoverage].sort((left, right) => {
      const leftValue = left[dailySortField];
      const rightValue = right[dailySortField];
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'es', { numeric: true, sensitivity: 'base' });
      return dailySortDirection === 'asc' ? comparison : -comparison;
    });
  }, [dailySortDirection, dailySortField, filteredDailyCoverage]);

  const sortedHistoryItems = useMemo(() => {
    if (!historySortField) return filteredItems;

    return [...filteredItems].sort((a, b) => {
      let valA: any = a[historySortField];
      let valB: any = b[historySortField];

      if (typeof valA === 'string' || typeof valB === 'string') {
        valA = (valA || '').trim();
        valB = (valB || '').trim();
        const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true });
        return historySortOrder === 'asc' ? cmp : -cmp;
      }

      if (typeof valA === 'number' || typeof valB === 'number') {
        const numA = valA ?? 0;
        const numB = valB ?? 0;
        return historySortOrder === 'asc' ? numA - numB : numB - numA;
      }

      return 0;
    });
  }, [filteredItems, historySortField, historySortOrder]);

  const sortedVolunteerRanking = useMemo(() => {
    if (!volunteerSortField) return volunteerRanking;

    return [...volunteerRanking].sort((a, b) => {
      let valA: any = a[volunteerSortField];
      let valB: any = b[volunteerSortField];

      if (typeof valA === 'string' || typeof valB === 'string') {
        valA = (valA || '').trim();
        valB = (valB || '').trim();
        const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true });
        return volunteerSortOrder === 'asc' ? cmp : -cmp;
      }

      if (typeof valA === 'number' || typeof valB === 'number') {
        const numA = valA ?? 0;
        const numB = valB ?? 0;
        return volunteerSortOrder === 'asc' ? numA - numB : numB - numA;
      }

      return 0;
    });
  }, [volunteerRanking, volunteerSortField, volunteerSortOrder]);

  const historyTotalPages = Math.max(1, Math.ceil(sortedHistoryItems.length / pageSize));
  const volunteerTotalPages = Math.max(1, Math.ceil(sortedVolunteerRanking.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedHistoryItems = sortedHistoryItems.slice(pageStart, pageStart + pageSize);
  const paginatedVolunteerItems = sortedVolunteerRanking.slice(pageStart, pageStart + pageSize);

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center text-white p-4">
        <span className="material-symbols-outlined text-[56px] text-red-500 mb-6 font-bold">warning</span>
        <h3 className="text-xl font-bold mb-4">{errorMsg}</h3>
        <Button onClick={loadData} className="bg-[#4d7cfe] text-white px-6 h-10 rounded-xl">Reintentar</Button>
      </div>
    );
  }

  // CSV Export
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = "";

    if (activeTab === 'history') {
      headers = ["Nombre Voluntario", "Teléfono", "Comité", "Barrio / Rama", "Estaca", "Fecha", "Turno", "Horario", "Duración", "Estado"];
      rows = filteredItems.map(item => [
        item.volunteerName,
        item.phone,
        item.committeeName,
        item.neighborhood,
        item.stake,
        item.date,
        `T${item.shiftNumber}`,
        `${item.startTime}-${item.endTime}`,
        formatMinutes(item.durationMinutes),
        item.status === 'confirmed' ? 'Asistió' :
        item.status === 'registered' ? 'Pendiente' :
        item.status === 'absent' ? 'Ausente' : 'Reemplazado'
      ]);
      filename = `historial_asistencia_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ["Nombre Voluntario", "Teléfono", "Comité", "Barrio / Rama", "Estaca", "Turnos Totales", "Asistidos", "Ausencias", "Fiabilidad (%)", "Total Tiempo"];
      rows = volunteerRanking.map(v => [
        v.name,
        v.phone,
        v.committee,
        v.neighborhood,
        v.stake,
        v.totalShifts,
        v.confirmed,
        v.absent,
        `${v.reliability}%`,
        formatMinutes(v.minutes)
      ]);
      filename = `ranking_horas_voluntarios_${new Date().toISOString().split('T')[0]}.csv`;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setInputValue("");
    setSelectedCommittees([]);
    setSelectedNeighborhoods([]);
    setSelectedStakes([]);
    setSelectedStatuses([]);
    setSelectedDates([]);
    setCurrentPage(1);
  };

  // Helper toggle functions for multi-select
  const toggleCommittee = (id: string) => {
    setSelectedCommittees(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleNeighborhood = (name: string) => {
    setSelectedNeighborhoods(prev => 
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  const toggleStake = (name: string) => {
    setSelectedStakes(prev => 
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(item => item !== status) : [...prev, status]
    );
  };

  const toggleDate = (isoDate: string) => {
    setSelectedDates(prev =>
      prev.includes(isoDate) ? prev.filter(d => d !== isoDate) : [...prev, isoDate]
    );
  };

  const STATUS_LABELS: Record<string, string> = {
    'confirmed': 'Asistió',
    'registered': 'Pendiente',
    'absent': 'Ausente',
    'replaced': 'Reemplazado'
  };

  const renderFilterControls = () => (
    <div className="space-y-5">
      {/* Committee Select using Shadcn Select */}
      {data?.uniqueCommittees && data.uniqueCommittees.length > 0 && (
        <div>
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Comité</label>
          <Select
            value={selectedCommittees[0] || ""}
            onValueChange={(val) => {
              setSelectedCommittees(val ? [val] : []);
            }}
          >
            <SelectTrigger className="w-full h-11 bg-dark2 border-border text-xs text-text rounded-xl px-3 font-medium font-inter hover:border-border-strong transition-all outline-none">
              <SelectValue placeholder="Todos los subcomités">
                {data.uniqueCommittees.find(c => c.id === selectedCommittees[0])?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-dark2 border-border text-text font-inter text-xs z-[200]">
              <SelectItem value="">Todos los comités</SelectItem>
              {data.uniqueCommittees.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Stake Select using Shadcn Select */}
      {data?.uniqueStakes && data.uniqueStakes.length > 0 && (
        <div>
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Estaca</label>
          <Select
            value={selectedStakes[0] || ""}
            onValueChange={(val) => {
              setSelectedStakes(val ? [val] : []);
            }}
          >
            <SelectTrigger className="w-full h-11 bg-dark2 border-border text-xs text-text rounded-xl px-3 font-medium font-inter hover:border-border-strong transition-all outline-none">
              <SelectValue placeholder="Todas las estacas" />
            </SelectTrigger>
            <SelectContent className="bg-dark2 border-border text-text font-inter text-xs z-[200]">
              <SelectItem value="">Todas las estacas</SelectItem>
              {data.uniqueStakes.map(s => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Neighborhood Select using Shadcn Select */}
      {data?.uniqueNeighborhoods && data.uniqueNeighborhoods.length > 0 && (
        <div>
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Barrio / Rama</label>
          <Select
            value={selectedNeighborhoods[0] || ""}
            onValueChange={(val) => {
              setSelectedNeighborhoods(val ? [val] : []);
            }}
          >
            <SelectTrigger className="w-full h-11 bg-dark2 border-border text-xs text-text rounded-xl px-3 font-medium font-inter hover:border-border-strong transition-all outline-none">
              <SelectValue placeholder="Todos los barrios / ramas" />
            </SelectTrigger>
            <SelectContent className="bg-dark2 border-border text-text font-inter text-xs z-[200]">
              <SelectItem value="">Todos los barrios / ramas</SelectItem>
              {data.uniqueNeighborhoods.map(n => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status Filter Pills */}
      <div>
        <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Estado del Turno</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'confirmed', label: 'Asistió', color: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' },
            { id: 'registered', label: 'Pendiente', color: 'border-blue-500/30 text-blue-500 bg-blue-500/10' },
            { id: 'absent', label: 'Ausente', color: 'border-rose-500/30 text-rose-500 bg-rose-500/10' },
            { id: 'replaced', label: 'Reemplazado', color: 'border-border text-text-dim bg-dark3' }
          ].map(st => {
            const isSelected = selectedStatuses.includes(st.id);
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => toggleStatus(st.id)}
                className={cn(
                  "py-2.5 px-3 rounded-xl border text-xs font-bold font-inter transition-all flex items-center justify-between cursor-pointer",
                  isSelected
                    ? "bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-md shadow-blue-500/20"
                    : `${st.color} hover:border-border-strong active:scale-95`
                )}
              >
                <span>{st.label}</span>
                {isSelected && <span className="material-symbols-outlined text-[16px]">check</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mini Calendario Visual – Multi-Date Selector */}
      <div className="mt-3 border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <label className="text-[10px] font-inter font-bold uppercase text-text-dim block">Calendario del Evento (Selección múltiple)</label>
            <p className="text-[9px] text-text-dim/60 font-inter mt-0.5">
              {selectedDates.length === 0
                ? "Mostrando todas las fechas (Sep 10 – Sep 26)"
                : `${selectedDates.length} día${selectedDates.length !== 1 ? 's' : ''} seleccionado${selectedDates.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {selectedDates.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedDates([])}
              className="text-[10px] font-inter font-bold text-[#4d7cfe] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[12px]">close</span>
              <span>Ver todas</span>
            </button>
          )}
        </div>

        {/* All Event Days Grid */}
        <div className="grid grid-cols-5 gap-1.5">
          {allEventDays.map((cell) => {
            const isSelected = selectedDates.includes(cell.isoDate);
            const hasData = datesWithData.has(cell.isoDate);

            return (
              <button
                key={cell.isoDate}
                type="button"
                onClick={() => toggleDate(cell.isoDate)}
                className={`
                  relative flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 font-inter cursor-pointer
                  ${
                    isSelected
                      ? "bg-[#4d7cfe] text-white shadow-lg shadow-blue-500/20 scale-[1.05]"
                      : "bg-dark3 border border-border hover:border-[#4d7cfe]/50 hover:bg-[#4d7cfe]/5 active:scale-95"
                  }
                `}
              >
                <span className={`text-xs font-black leading-none ${isSelected ? "text-white" : "text-text"}`}>
                  {cell.dateNum}
                </span>
                <span className={`text-[8px] font-bold mt-0.5 leading-none capitalize ${isSelected ? "text-white/80" : "text-text-dim"}`}>
                  {cell.dayShort}
                </span>
                {hasData && (
                  <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-[#4d7cfe]"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (mounted && !canViewReports()) {
    return (
      <div className="w-full min-h-[65vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Acceso Restringido a Reportes</h2>
        <p className="text-xs text-text-dim max-w-md leading-relaxed">
          El Administrador ha deshabilitado el acceso a la sección de Reportes para los Coordinadores. Si necesitas acceso, contacta a un Administrador para habilitar esta política en Ajustes.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full pb-32 flex flex-col min-h-full">
      {/* Sticky Header matching other sections design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto shrink-0">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Reportes
            <span className="text-xs font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 px-2.5 py-1 rounded-full border border-[#4d7cfe]/20">
              {filteredItems.length}
            </span>
          </h1>
          <div className="flex items-center gap-2">
            {/* Filter Toggle button */}
            <Button
              onClick={() => setIsFilterDrawerOpen(true)}
              variant="outline"
              className="rounded-full shadow-lg h-9 px-4 text-xs font-bold font-inter transition-all active:scale-[0.97] flex items-center gap-1.5 bg-dark2 border-border text-text hover:bg-dark3 relative"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt</span>
              <span className="hidden sm:inline">Filtros</span>
              {(selectedCommittees.length > 0 || selectedNeighborhoods.length > 0 || selectedStakes.length > 0 || selectedStatuses.length > 0 || selectedDates.length > 0) && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#4d7cfe] rounded-full border-2 border-dark2"></span>
              )}
            </Button>
            <Button
              onClick={handleExportCSV}
              className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold font-inter transition-all active:scale-[0.97] flex items-center gap-1.5"
              disabled={filteredItems.length === 0}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </div>
        </div>

        {/* Search Input with inline Buscar / Limpiar button */}
        <SmartSearchBar
          value={inputValue}
          onValueChange={setInputValue}
          onImmediateSearch={value => {
            applySearch(value);
            setCurrentPage(1);
          }}
          placeholder="Buscar por nombre, teléfono, barrio, estaca o subcomité..."
          className="z-10"
        />
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 w-full">
        {/* Primary KPIs - Edge to Edge Fine Line Grid matching Dashboard */}
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-border bg-dark3/40 mb-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px]">
            {/* KPI 1: Horas de Servicio */}
            <div className="bg-dark2 p-4 sm:p-6 group transition-colors hover:bg-dark3">
              <div className="flex items-start justify-between mb-3 sm:mb-5">
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-sm group-hover:bg-[#4d7cfe] group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-inter font-bold uppercase tracking-[0.15em] text-text-dim">Horas</span>
                  <Badge variant="secondary" className="bg-[#4d7cfe]/10 text-[#4d7cfe] font-inter font-bold border-none text-[9px] px-2 h-4.5 mt-1">
                    Totales
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-inter font-bold text-text tracking-tight flex items-baseline gap-1">
                  {formatMinutes(totalMinutes)}
                </p>
                <p className="text-[10px] text-text-dim font-inter font-bold">Horas de servicio confirmadas</p>
              </div>
            </div>

            {/* KPI 2: Tasa de Asistencia */}
            <div className="bg-dark2 p-4 sm:p-6 group transition-colors hover:bg-dark3">
              <div className="flex items-start justify-between mb-3 sm:mb-5">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-sm group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-inter font-bold uppercase tracking-[0.15em] text-text-dim">Asistencia</span>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 font-inter font-bold border-none text-[9px] px-2 h-4.5 mt-1">
                    QR Scan
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-inter font-bold text-emerald-400 tracking-tight">
                  {attendanceRate}%
                </p>
                <p className="text-[10px] text-text-dim font-inter font-bold">
                  Check-in confirmados: {confirmedShifts}
                </p>
              </div>
            </div>

            {/* KPI 3: Turnos Asistidos */}
            <div className="bg-dark2 p-4 sm:p-6 group transition-colors hover:bg-dark3">
              <div className="flex items-start justify-between mb-3 sm:mb-5">
                <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-sm group-hover:bg-purple-500 group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-[18px]">done</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-inter font-bold uppercase tracking-[0.15em] text-text-dim">Turnos</span>
                  <Badge variant="secondary" className="bg-white/5 text-text-dim font-inter font-bold border-none text-[9px] px-2 h-4.5 mt-1">
                    {pendingShifts} pend.
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-inter font-bold text-text tracking-tight">
                  {confirmedShifts}
                </p>
                <p className="text-[10px] text-text-dim font-inter font-bold">Turnos asistidos</p>
              </div>
            </div>

            {/* KPI 4: Ausencias */}
            <div className="bg-dark2 p-4 sm:p-6 group transition-colors hover:bg-dark3">
              <div className="flex items-start justify-between mb-3 sm:mb-5">
                <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-sm group-hover:bg-rose-500 group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-inter font-bold uppercase tracking-[0.15em] text-text-dim">Ausencias</span>
                  <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 font-inter font-bold border-none text-[9px] px-2 h-4.5 mt-1">
                    Alerta
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-inter font-bold text-rose-400 tracking-tight">
                  {absentShifts}
                </p>
                <p className="text-[10px] text-text-dim font-inter font-bold">Sin justificación</p>
              </div>
            </div>
          </div>
        </div>

      {/* Signature App Drawer (Matches Volunteers & Shifts Profile Drawer) */}
      <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isFilterDrawerOpen ? "pointer-events-auto" : "pointer-events-none")}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isFilterDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsFilterDrawerOpen(false)}
        />

        {/* Drawer Content Panel */}
        <div
          id="drawer-filters"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 border-border",
            isMobile
              ? `w-full h-[90dvh] rounded-t-[40px] shadow-2xl border-t ${isFilterDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[440px] h-full shadow-2xl border-l ${isFilterDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >
          <div className="relative z-10 flex flex-col h-full w-full">
            {/* Mobile Drag Handle */}
            {isMobile && (
              <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            )}

            {/* Drawer Header without close button */}
            <div className={cn("flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0", !isMobile && "pt-8")}>
              <div>
                <h2 className="text-lg font-black text-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4d7cfe] text-[22px]">filter_alt</span>
                  Filtros del Reporte
                </h2>
                <p className="text-[11px] text-text-dim font-inter">Personaliza el historial y estadísticas</p>
              </div>

              {(selectedCommittees.length > 0 || selectedNeighborhoods.length > 0 || selectedStakes.length > 0 || selectedStatuses.length > 0 || selectedDates.length > 0) && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-inter font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/20 active:scale-95"
                >
                  <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
                  <span>Limpiar</span>
                </button>
              )}
            </div>

            {/* Filter Content with touch-to-drag dismiss on mobile */}
            <div
              className="flex-1 overflow-y-auto scrollbar-hide px-6 py-6 space-y-6 overscroll-contain"
              onTouchStart={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById('drawer-filters');
                if (!drawer) return;
                drawer.dataset.startY = e.touches[0].clientY.toString();
                drawer.style.transition = 'none';
              }}
              onTouchMove={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById('drawer-filters');
                if (!drawer) return;
                const startY = parseFloat(drawer.dataset.startY || '0');
                const currentY = e.touches[0].clientY;
                const deltaY = currentY - startY;
                if (deltaY > 0) {
                  drawer.style.transform = `translateY(${deltaY}px)`;
                }
              }}
              onTouchEnd={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById('drawer-filters');
                if (!drawer) return;
                drawer.style.transition = 'transform 300ms ease-out';
                const startY = parseFloat(drawer.dataset.startY || '0');
                const currentY = e.changedTouches[0].clientY;
                if (currentY - startY > 120) {
                  setIsFilterDrawerOpen(false);
                  drawer.style.transform = '';
                } else {
                  drawer.style.transform = 'translateY(0)';
                }
              }}
            >
              {renderFilterControls()}
            </div>
          </div>
        </div>
      </div>

        {/* Tab Selection: Segmented 4-Column Control on Mobile, Underline Tabs on Desktop */}
        <div className="grid grid-cols-4 sm:flex border-b border-border mb-6 gap-1 sm:gap-6 bg-dark2/60 sm:bg-transparent p-1 sm:p-0 rounded-2xl sm:rounded-none">
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2.5 sm:pb-3 font-inter font-bold text-[11px] sm:text-sm transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer rounded-xl sm:rounded-none ${
              activeTab === 'history'
                ? 'bg-[#4d7cfe] sm:bg-transparent text-white sm:text-[#4d7cfe] sm:border-b-2 sm:border-[#4d7cfe] shadow-sm sm:shadow-none'
                : 'text-text-dim hover:text-text sm:border-b-2 sm:border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span className="hidden sm:inline">Historial ({filteredItems.length})</span>
            <span className="inline sm:hidden">Historial</span>
          </button>

          <button
            onClick={() => setActiveTab('volunteers')}
            className={`py-2.5 sm:pb-3 font-inter font-bold text-[11px] sm:text-sm transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer rounded-xl sm:rounded-none ${
              activeTab === 'volunteers'
                ? 'bg-[#4d7cfe] sm:bg-transparent text-white sm:text-[#4d7cfe] sm:border-b-2 sm:border-[#4d7cfe] shadow-sm sm:shadow-none'
                : 'text-text-dim hover:text-text sm:border-b-2 sm:border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">bar_chart</span>
            <span className="hidden sm:inline">Horas por Voluntario ({volunteerRanking.length})</span>
            <span className="inline sm:hidden">Ranking</span>
          </button>

          <button
            onClick={() => setActiveTab('recruitment')}
            className={`py-2.5 sm:pb-3 font-inter font-bold text-[11px] sm:text-sm transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer rounded-xl sm:rounded-none ${
              activeTab === 'recruitment'
                ? 'bg-[#4d7cfe] sm:bg-transparent text-white sm:text-[#4d7cfe] sm:border-b-2 sm:border-[#4d7cfe] shadow-sm sm:shadow-none'
                : 'text-text-dim hover:text-text sm:border-b-2 sm:border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">group_add</span>
            <span className="hidden sm:inline">Reclutamiento y Edades</span>
            <span className="inline sm:hidden">Reclutamiento</span>
          </button>

          <button
            onClick={() => setActiveTab('daily')}
            className={`py-2.5 sm:pb-3 font-inter font-bold text-[11px] sm:text-sm transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer rounded-xl sm:rounded-none ${
              activeTab === 'daily'
                ? 'bg-[#4d7cfe] sm:bg-transparent text-white sm:text-[#4d7cfe] sm:border-b-2 sm:border-[#4d7cfe] shadow-sm sm:shadow-none'
                : 'text-text-dim hover:text-text sm:border-b-2 sm:border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_month</span>
            <span className="hidden sm:inline">Cobertura por Día</span>
            <span className="inline sm:hidden">Cobertura</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="min-h-[400px]">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-dark2/40 rounded-3xl border border-border">
              <span className="material-symbols-outlined text-[48px] text-text-dim mb-4 animate-pulse">database</span>
              <p className="text-sm font-bold text-text mb-1">Sin registros</p>
              <p className="text-xs text-text-dim max-w-xs font-inter leading-relaxed">
                Ninguna asistencia o registro coincide con los filtros aplicados en este momento.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'history' ? (
                <motion.div
                  key="history-tab"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                  className="bg-dark2 border border-border rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full"
                >
                  {/* Desktop Table View */}
                  <div className="hidden lg:block max-h-[calc(100dvh-310px)] overflow-auto overscroll-contain">
                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                      <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md text-[10px] font-inter font-bold text-text-dim uppercase tracking-wider select-none">
                        <tr>
                          <th className="px-5 py-4 font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleHistorySort('volunteerName')}
                              className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Voluntario"
                            >
                              <span className={cn(historySortField === 'volunteerName' && "text-[#4d7cfe] font-extrabold")}>Voluntario</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                historySortField === 'volunteerName' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {historySortField === 'volunteerName' ? (historySortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleHistorySort('committeeName')}
                              className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Comité"
                            >
                              <span className={cn(historySortField === 'committeeName' && "text-[#4d7cfe] font-extrabold")}>Comité</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                historySortField === 'committeeName' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {historySortField === 'committeeName' ? (historySortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleHistorySort('neighborhood')}
                              className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Barrio / Estaca"
                            >
                              <span className={cn(historySortField === 'neighborhood' && "text-[#4d7cfe] font-extrabold")}>Barrio / Rama · Estaca</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                historySortField === 'neighborhood' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {historySortField === 'neighborhood' ? (historySortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 text-center font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleHistorySort('date')}
                              className="flex items-center justify-center gap-1.5 w-full hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Fecha"
                            >
                              <span className={cn(historySortField === 'date' && "text-[#4d7cfe] font-extrabold")}>Fecha y Turno</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                historySortField === 'date' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {historySortField === 'date' ? (historySortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 text-center font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleHistorySort('durationMinutes')}
                              className="flex items-center justify-center gap-1.5 w-full hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Horas"
                            >
                              <span className={cn(historySortField === 'durationMinutes' && "text-[#4d7cfe] font-extrabold")}>Horas</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                historySortField === 'durationMinutes' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {historySortField === 'durationMinutes' ? (historySortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-4 text-right font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleHistorySort('status')}
                              className="flex items-center justify-end gap-1.5 w-full hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Estado"
                            >
                              <span className={cn(historySortField === 'status' && "text-[#4d7cfe] font-extrabold")}>Estado</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                historySortField === 'status' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {historySortField === 'status' ? (historySortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedHistoryItems.map((item) => (
                          <tr key={item.registrationId} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors group">
                            <td className="px-5 py-4">
                              <p className="font-inter font-bold text-text text-sm tracking-tight"><HighlightText text={item.volunteerName} term={appliedSearch} /></p>
                              <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">{item.phone}</p>
                            </td>
                            <td className="px-4 py-4 font-inter font-bold text-[13px] text-text-dim"><HighlightText text={item.committeeName} term={appliedSearch} /></td>
                            <td className="px-4 py-4 font-inter">
                              <p className="leading-snug text-text font-inter font-bold text-[13px]">{item.neighborhood}</p>
                              <p className="text-[11px] font-inter font-bold text-text-dim opacity-70 mt-0.5">{item.stake}</p>
                            </td>
                            <td className="px-4 py-4 text-center font-inter">
                              <p className="font-inter font-bold text-text text-[13px]">{formatDateDDMMYYYY(item.date)}</p>
                              <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">T{item.shiftNumber}</p>
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold text-[13px] text-text tabular-nums">{formatMinutes(item.durationMinutes)}</td>
                            <td className="px-5 py-4 text-right">
                              <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${
                                item.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                item.status === 'registered' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                item.status === 'absent' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                'bg-dark3 text-text-dim border-border'
                              }`}>
                                {item.status === 'confirmed' && 'Asistió'}
                                {item.status === 'registered' && 'Pendiente'}
                                {item.status === 'absent' && 'Ausente'}
                                {item.status === 'replaced' && 'Reemplazado'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Flat List View (Matches Volunteers layout) */}
                  <div className="block lg:hidden divide-y divide-border bg-dark2">
                    {paginatedHistoryItems.map((item) => (
                      <div key={item.registrationId} className="px-4 py-3.5 flex flex-col gap-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors">
                        {/* Line 1: Volunteer Name + Committee & Stake Badges */}
                        <div className="flex items-center justify-between gap-2 w-full">
                          <p className="font-inter font-bold text-text text-sm tracking-tight truncate"><HighlightText text={item.volunteerName} term={appliedSearch} /></p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.committeeName && (
                              <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${getCommitteeColor(item.committeeName)}`}>
                                <HighlightText text={item.committeeName} term={appliedSearch} />
                              </Badge>
                            )}
                            {item.stake && (
                              <Badge variant="outline" className="font-inter font-bold text-[10px] py-0.5 px-2 border bg-dark3 text-text-dim border-border">
                                {item.stake}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        {/* Line 2: Phone + Turno Info on left, Duration on right */}
                        <div className="flex items-center justify-between gap-2 w-full text-[11px] font-inter font-bold text-text-dim">
                          <p className="truncate flex items-center gap-1.5">
                            <span>{item.phone || 'Sin teléfono'}</span>
                            <span className="opacity-40">·</span>
                            <span className="text-text">T{item.shiftNumber}</span>
                            <span className="opacity-40">·</span>
                            <span className="text-[#4d7cfe]">{formatDateDDMMYYYY(item.date)}</span>
                          </p>
                          <span className="text-xs font-inter font-bold text-text tabular-nums shrink-0">{formatMinutes(item.durationMinutes)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <ReportPagination
                    currentPage={currentPage}
                    totalPages={historyTotalPages}
                    totalItems={sortedHistoryItems.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                  />
                </motion.div>
              ) : activeTab === 'volunteers' ? (
                <motion.div
                  key="volunteers-tab"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                  className="bg-dark2 border border-border rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full"
                >
                  {/* Desktop Table View */}
                  <div className="hidden lg:block max-h-[calc(100dvh-310px)] overflow-auto overscroll-contain">
                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                      <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md text-[10px] font-inter font-bold text-text-dim uppercase tracking-wider select-none">
                        <tr>
                          <th className="px-5 py-4 font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleVolunteerSort('name')}
                              className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Voluntario"
                            >
                              <span className={cn(volunteerSortField === 'name' && "text-[#4d7cfe] font-extrabold")}>Voluntario</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                volunteerSortField === 'name' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {volunteerSortField === 'name' ? (volunteerSortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleVolunteerSort('committee')}
                              className="flex items-center gap-1.5 hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Comité / Estaca"
                            >
                              <span className={cn(volunteerSortField === 'committee' && "text-[#4d7cfe] font-extrabold")}>Comité / Estaca</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                volunteerSortField === 'committee' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {volunteerSortField === 'committee' ? (volunteerSortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 text-center font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleVolunteerSort('confirmed')}
                              className="flex items-center justify-center gap-1.5 w-full hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Turnos Asistidos"
                            >
                              <span className={cn(volunteerSortField === 'confirmed' && "text-[#4d7cfe] font-extrabold")}>Turnos Asistidos</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                volunteerSortField === 'confirmed' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {volunteerSortField === 'confirmed' ? (volunteerSortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-4 py-4 text-center font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleVolunteerSort('reliability')}
                              className="flex items-center justify-center gap-1.5 w-full hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Fiabilidad"
                            >
                              <span className={cn(volunteerSortField === 'reliability' && "text-[#4d7cfe] font-extrabold")}>Fiabilidad</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                volunteerSortField === 'reliability' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {volunteerSortField === 'reliability' ? (volunteerSortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-4 text-right font-inter font-bold">
                            <button
                              type="button"
                              onClick={() => handleVolunteerSort('minutes')}
                              className="flex items-center justify-end gap-1.5 w-full hover:text-text transition-colors cursor-pointer group"
                              title="Ordenar por Horas Acumuladas"
                            >
                              <span className={cn(volunteerSortField === 'minutes' && "text-[#4d7cfe] font-extrabold")}>Horas Acumuladas</span>
                              <span className={cn(
                                "material-symbols-outlined text-[14px] transition-all",
                                volunteerSortField === 'minutes' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                              )}>
                                {volunteerSortField === 'minutes' ? (volunteerSortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedVolunteerItems.map((v, index) => {
                          const globalRank = (currentPage - 1) * pageSize + index + 1;
                          return (
                            <tr
                              key={v.id}
                              onClick={() => handleOpenProfile(v)}
                              className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                              title="Haz clic para ver el perfil completo del voluntario"
                            >
                              <td className="px-5 py-4 flex items-center gap-3">
                                <span className="font-inter font-bold text-text-dim text-sm w-4 shrink-0">#{globalRank}</span>
                                <div>
                                  <p className="font-inter font-bold text-text text-sm tracking-tight">{v.name}</p>
                                  <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">{v.neighborhood} · {v.phone}</p>
                                </div>
                              </td>
                              <td className="px-4 py-4 font-inter">
                                <p className="font-inter font-bold text-text text-[13px] leading-snug">{v.committee}</p>
                                <p className="text-[11px] text-text-dim font-inter font-bold opacity-70 mt-0.5">{v.stake}</p>
                              </td>
                              <td className="px-4 py-4 text-center font-inter font-bold text-[13px] text-text tabular-nums">
                                {v.confirmed} / {v.totalShifts}
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`font-inter font-bold text-[13px] tabular-nums ${
                                    v.reliability >= 85 ? 'text-emerald-500' :
                                    v.reliability >= 60 ? 'text-amber-500' : 'text-rose-500'
                                  }`}>{v.reliability}%</span>
                                  <div className="w-16 h-1 bg-dark3 border border-border rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        v.reliability >= 85 ? 'bg-emerald-500' :
                                        v.reliability >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${v.reliability}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-right font-inter font-bold text-text text-sm tabular-nums">
                                {formatMinutes(v.minutes)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Flat List View for Ranking (Matches Volunteers layout) */}
                  <div className="block lg:hidden divide-y divide-border bg-dark2">
                    {paginatedVolunteerItems.map((v, index) => {
                      const globalRank = (currentPage - 1) * pageSize + index + 1;
                      return (
                        <div key={v.id} className="px-4 py-3.5 flex flex-col gap-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors">
                          {/* Line 1: Rank + Volunteer Name + Committee & Stake Badges */}
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-inter font-bold text-text-dim text-xs shrink-0">#{globalRank}</span>
                              <p className="font-inter font-bold text-text text-sm tracking-tight truncate">{v.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {v.committee && (
                                <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${getCommitteeColor(v.committee)}`}>
                                  {v.committee}
                                </Badge>
                              )}
                              {v.stake && (
                                <Badge variant="outline" className="font-inter font-bold text-[10px] py-0.5 px-2 border bg-dark3 text-text-dim border-border">
                                  {v.stake}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Line 2: Phone & Turnos on left, Reliability & Total Hours on right */}
                          <div className="flex items-center justify-between gap-2 w-full text-[11px] font-inter font-bold text-text-dim">
                            <p className="truncate flex items-center gap-1.5 min-w-0">
                              <span>{v.phone || 'Sin teléfono'}</span>
                              <span className="opacity-40">·</span>
                              <span className="text-text">{v.confirmed}/{v.totalShifts} turnos</span>
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[11px] font-inter font-bold ${v.reliability >= 85 ? 'text-emerald-500' : v.reliability >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {v.reliability}% fiab.
                              </span>
                              <span className="font-inter font-bold text-[#4d7cfe] text-sm tabular-nums">{formatMinutes(v.minutes)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <ReportPagination
                    currentPage={currentPage}
                    totalPages={volunteerTotalPages}
                    totalItems={sortedVolunteerRanking.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                  />
                </motion.div>
              ) : activeTab === 'recruitment' ? (
                <motion.div
                  key="recruitment-tab"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6 sm:space-y-8"
                >
                  {/* Reclutamiento y Faltantes por Comité */}
                  <div className="bg-dark2 border border-border rounded-[20px] p-4 sm:p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#4d7cfe]">group_add</span>
                          Reclutamiento y Meta por Comité
                        </h3>
                        <p className="text-xs text-text-dim mt-0.5 font-inter">
                          Total de voluntarios registrados, turnos asignados vs requeridos y faltantes por comité.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                      {filteredRecruitmentSummary.map(rec => (
                        <div key={rec.committeeId} className="bg-dark3/50 border border-border rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-border-strong transition-all">
                          <div>
                            <div className="flex items-center justify-between mb-2 gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getCommitteeColor(rec.committeeName)}`}>
                                {rec.committeeName}
                              </span>
                              <Badge variant="outline" className={`text-[10px] font-bold ${rec.missingShifts === 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                {rec.missingShifts === 0 ? 'Completado' : `Faltan ${rec.missingShifts} turnos`}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 my-3 pt-2 border-t border-white/5 text-xs font-inter">
                              <div className="bg-dark2/60 p-2.5 rounded-lg border border-white/5">
                                <span className="text-[9px] text-text-dim uppercase font-bold block">Voluntarios</span>
                                <span className="text-base font-bold text-text">{rec.totalVolunteers}</span>
                              </div>
                              <div className="bg-dark2/60 p-2.5 rounded-lg border border-white/5">
                                <span className="text-[9px] text-text-dim uppercase font-bold block">Faltan Turnos</span>
                                <span className={`text-base font-bold ${rec.missingShifts > 0 ? 'text-rose-400 font-extrabold' : 'text-emerald-400'}`}>
                                  {rec.missingShifts}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-white/5">
                            <div className="flex justify-between text-[11px] font-inter font-bold">
                              <span className="text-text-dim">Cobertura de Turnos:</span>
                              <span className="text-text">{rec.assignedShifts} / {rec.totalRequiredShifts} ({rec.coverageRate}%)</span>
                            </div>
                            <div className="w-full bg-dark2 h-2 rounded-full overflow-hidden border border-white/5">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${rec.coverageRate >= 100 ? 'bg-emerald-500' : rec.coverageRate >= 70 ? 'bg-[#4d7cfe]' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(100, rec.coverageRate)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Segmentación por Edades */}
                  <div className="bg-dark2 border border-border rounded-[20px] p-4 sm:p-6 shadow-lg">
                    <div className="mb-4 sm:mb-6">
                      <h3 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#4d7cfe]">cake</span>
                        Segmentación Demográfica por Edad
                      </h3>
                      <p className="text-xs text-text-dim mt-0.5 font-inter">
                        Distribución de voluntarios registrados por rangos de edad.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                      {filteredAgeSegmentation.map(seg => (
                        <div key={seg.range} className="bg-dark3/50 border border-border rounded-xl p-3.5 sm:p-4 space-y-2">
                          <div className="flex items-center justify-between text-xs font-inter">
                            <span className="font-bold text-text">Rango: <span className="text-[#4d7cfe] font-extrabold">{seg.range}</span></span>
                            <span className="font-bold text-text-dim">{seg.count} vols ({seg.percentage}%)</span>
                          </div>
                          <div className="w-full bg-dark2 h-2.5 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-[#4d7cfe] rounded-full transition-all duration-500"
                              style={{ width: `${seg.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="daily-tab"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                  className="bg-dark2 border border-border rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full p-4 sm:p-6 space-y-6"
                >
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#4d7cfe]">calendar_month</span>
                      Cobertura por Día de Evento
                    </h3>
                    <p className="text-xs text-text-dim mt-0.5 font-inter">
                      Detalle diario de turnos requeridos, asignados, asistidos y faltantes del 10 al 26 de septiembre.
                    </p>
                  </div>

                  {/* Desktop Table View (lg+) */}
                  <div className="hidden lg:block max-h-[calc(100dvh-320px)] overflow-auto overscroll-contain">
                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                      <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md text-[10px] font-inter font-bold text-text-dim uppercase tracking-wider">
                        <tr>
                          <SortableTableHead field="date" activeField={dailySortField} direction={dailySortDirection} onSort={handleDailySort} className="px-5 py-4 font-inter font-bold">Día / Fecha</SortableTableHead>
                          <SortableTableHead field="required" activeField={dailySortField} direction={dailySortDirection} onSort={handleDailySort} className="px-4 py-4 font-inter font-bold" buttonClassName="justify-center">Requeridos</SortableTableHead>
                          <SortableTableHead field="assigned" activeField={dailySortField} direction={dailySortDirection} onSort={handleDailySort} className="px-4 py-4 font-inter font-bold" buttonClassName="justify-center">Asignados</SortableTableHead>
                          <SortableTableHead field="checkedIn" activeField={dailySortField} direction={dailySortDirection} onSort={handleDailySort} className="px-4 py-4 font-inter font-bold" buttonClassName="justify-center">Asistieron (Check-in)</SortableTableHead>
                          <SortableTableHead field="missing" activeField={dailySortField} direction={dailySortDirection} onSort={handleDailySort} className="px-4 py-4 font-inter font-bold" buttonClassName="justify-center">Faltantes</SortableTableHead>
                          <SortableTableHead field="coverageRate" activeField={dailySortField} direction={dailySortDirection} onSort={handleDailySort} className="px-4 py-4 font-inter font-bold" buttonClassName="justify-center">% Cobertura</SortableTableHead>
                          <th className="px-5 py-4 text-center font-inter font-bold">Desglose por Turno</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedDailyCoverage.map(day => (
                          <tr key={day.date} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-4 font-inter font-bold text-text text-sm">
                              {day.dayLabel}
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold text-text text-sm tabular-nums">
                              {day.required}
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold text-text text-sm tabular-nums">
                              {day.assigned}
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold text-emerald-400 text-sm tabular-nums">
                              {day.checkedIn}
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold tabular-nums">
                              <span className={day.missing > 0 ? "text-rose-400 font-extrabold" : "text-emerald-400"}>
                                {day.missing}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center font-inter">
                              <Badge variant="outline" className={`font-inter font-bold text-xs py-0.5 px-2 border ${
                                day.coverageRate >= 100 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                day.coverageRate >= 70 ? 'bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/20' :
                                'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}>
                                {day.coverageRate}%
                              </Badge>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <div className="flex items-center justify-center gap-1.5 text-[10px] font-inter font-bold">
                                {Object.entries(day.byShift).map(([sk, info]) => (
                                  <span key={sk} className={`px-1.5 py-0.5 rounded border ${info.missing > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                    {sk}: {info.assigned}/{info.required}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View (< lg) */}
                  <div className="block lg:hidden space-y-3">
                    {filteredDailyCoverage.map(day => (
                      <div key={day.date} className="bg-dark3/50 border border-border rounded-xl p-4 space-y-3">
                        {/* Line 1: Day Label + Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className="material-symbols-outlined text-[#4d7cfe] text-[18px]">calendar_today</span>
                            <span className="font-inter font-bold text-text text-sm truncate">{day.dayLabel}</span>
                          </div>
                          <Badge variant="outline" className={`font-inter font-bold text-[11px] py-0.5 px-2.5 border shrink-0 ${
                            day.coverageRate >= 100 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            day.coverageRate >= 70 ? 'bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/20' :
                            'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {day.coverageRate}% Cobertura
                          </Badge>
                        </div>

                        {/* Line 2: Stat Cards Grid */}
                        <div className="grid grid-cols-4 gap-1.5 bg-dark2/70 p-2.5 rounded-xl border border-white/5 text-center text-xs font-inter">
                          <div>
                            <span className="text-[9px] text-text-dim uppercase font-bold block">Req.</span>
                            <span className="font-bold text-text">{day.required}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-text-dim uppercase font-bold block">Asig.</span>
                            <span className="font-bold text-text">{day.assigned}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-text-dim uppercase font-bold block">Check-in</span>
                            <span className="font-bold text-emerald-400">{day.checkedIn}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-text-dim uppercase font-bold block">Faltan</span>
                            <span className={`font-bold ${day.missing > 0 ? 'text-rose-400 font-extrabold' : 'text-emerald-400'}`}>
                              {day.missing}
                            </span>
                          </div>
                        </div>

                        {/* Line 3: Shifts Grid */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Turnos del Día</span>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-inter font-bold">
                            {Object.entries(day.byShift).map(([sk, info]) => {
                              const shiftLabels: Record<string, string> = { T1: 'T1 (8-12)', T2: 'T2 (12-3)', T3: 'T3 (3-6)', T4: 'T4 (5-10)' };
                              return (
                                <div key={sk} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${
                                  info.missing > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                  <span className="text-text-dim">{shiftLabels[sk] || sk}:</span>
                                  <span>{info.assigned}/{info.required}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Unified Volunteer Profile Drawer */}
      <VolunteerProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
        volunteer={drawerVolunteer}
        mode="coordinator"
      />
    </div>
  );
}
