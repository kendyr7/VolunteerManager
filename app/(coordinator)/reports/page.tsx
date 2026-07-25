'use client'

import { useState, useEffect, useTransition, useMemo, useDeferredValue } from "react";
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
  if (comm.includes('guía')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción')) return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
  if (comm.includes('auxilios')) return 'bg-teal-500/15 text-teal-500 border-teal-500/20';
  return 'bg-white/5 text-text-dim border-white/10';
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
  if (totalMinutes === 0) return "0 h";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}
export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<'history' | 'volunteers'>('history');

  // Filters State (Multi-Selection arrays)
  const [inputValue, setInputValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const appliedSearchNormalized = useMemo(() => {
    if (!appliedSearch.trim()) return '';
    return appliedSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, [appliedSearch]);

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
    loadData();
  }, []);

  const items = useMemo(() => data?.items || [], [data?.items]);

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

    const normSearch = appliedSearchNormalized;

    return items.filter(item => {
      // 1. Search term (matches name, phone, neighborhood, stake)
      if (normSearch) {
        const itemVolName = (item.volunteerName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const itemPhone = item.phone || '';
        const itemNeigh = (item.neighborhood || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const itemStake = (item.stake || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const matchesName = itemVolName.includes(normSearch);
        const matchesPhone = itemPhone.includes(appliedSearch);
        const matchesNeigh = itemNeigh.includes(normSearch);
        const matchesStake = itemStake.includes(normSearch);

        if (!matchesName && !matchesPhone && !matchesNeigh && !matchesStake) {
          return false;
        }
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
  }, [items, appliedSearchNormalized, appliedSearch, selectedCommittees, selectedNeighborhoods, selectedStakes, selectedStatuses, selectedDates]);

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

  const totalPagesHistory = Math.ceil(filteredItems.length / pageSize) || 1;
  const totalPagesVolunteers = Math.ceil(volunteerRanking.length / pageSize) || 1;
  const currentTotalPages = activeTab === 'history' ? totalPagesHistory : totalPagesVolunteers;

  const paginatedHistoryItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const paginatedVolunteerItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return volunteerRanking.slice(start, start + pageSize);
  }, [volunteerRanking, currentPage, pageSize]);

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
      headers = ["Nombre Voluntario", "Teléfono", "Comité", "Barrio", "Estaca", "Fecha", "Turno", "Horario", "Duración", "Estado"];
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
        item.status === 'registered' ? 'Inscrito' :
        item.status === 'absent' ? 'Ausente' : 'Reemplazado'
      ]);
      filename = `historial_asistencia_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ["Nombre Voluntario", "Teléfono", "Comité", "Barrio", "Estaca", "Turnos Totales", "Asistidos", "Ausencias", "Fiabilidad (%)", "Total Tiempo"];
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
    setAppliedSearch("");
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
              <SelectValue placeholder="Todos los comités" />
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
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Barrio / Colonia</label>
          <Select
            value={selectedNeighborhoods[0] || ""}
            onValueChange={(val) => {
              setSelectedNeighborhoods(val ? [val] : []);
            }}
          >
            <SelectTrigger className="w-full h-11 bg-dark2 border-border text-xs text-text rounded-xl px-3 font-medium font-inter hover:border-border-strong transition-all outline-none">
              <SelectValue placeholder="Todos los barrios" />
            </SelectTrigger>
            <SelectContent className="bg-dark2 border-border text-text font-inter text-xs z-[200]">
              <SelectItem value="">Todos los barrios</SelectItem>
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

  return (
    <div className="w-full pb-32 flex flex-col min-h-full">
      {/* Sticky Header matching other sections design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto shrink-0">
        <div className="w-full flex items-center justify-between max-w-7xl mx-auto">
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (appliedSearch && inputValue === appliedSearch) {
              setInputValue('');
              setAppliedSearch('');
            } else if (inputValue.trim()) {
              setAppliedSearch(inputValue.trim());
            }
            setCurrentPage(1);
          }}
          className="w-full relative z-10 max-w-7xl mx-auto"
        >
          <div className="relative w-full flex items-center">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
              <span className="material-symbols-outlined text-text-dim text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar voluntario por nombre, teléfono, barrio o estaca..."
              className="w-full bg-dark2 border border-border text-text placeholder:text-text-dim rounded-full pl-12 pr-32 py-3.5 focus:outline-none focus:ring-2 focus:ring-[#4d7cfe]/30 transition-all text-[13px] font-bold font-inter h-[48px]"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoComplete="off"
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center z-10">
              {appliedSearch !== '' ? (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    setAppliedSearch('');
                    setCurrentPage(1);
                  }}
                  className="h-9 px-3.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  <span>Limpiar</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="h-9 px-4 bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:opacity-40 text-white rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <span className="material-symbols-outlined text-[16px]">search</span>
                  <span>Buscar</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
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
                  {Math.round(totalMinutes / 60)} <span className="text-xs font-inter font-bold text-text-dim">hrs</span>
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

        {/* Tab Selection */}
        <div className="flex border-b border-border mb-6 gap-2 sm:gap-6">
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 font-inter font-bold text-xs sm:text-sm transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'history' ? 'border-[#4d7cfe] text-[#4d7cfe]' : 'border-transparent text-text-dim hover:text-text'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span className="hidden sm:inline">Historial de Turnos ({filteredItems.length})</span>
            <span className="inline sm:hidden">Historial ({filteredItems.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('volunteers')}
            className={`pb-3 font-inter font-bold text-xs sm:text-sm transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'volunteers' ? 'border-[#4d7cfe] text-[#4d7cfe]' : 'border-transparent text-text-dim hover:text-text'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">bar_chart</span>
            <span className="hidden sm:inline">Horas por Voluntario ({volunteerRanking.length})</span>
            <span className="inline sm:hidden">Voluntarios ({volunteerRanking.length})</span>
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
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                      <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md text-[10px] font-inter font-bold text-text-dim uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-4 font-inter font-bold">Voluntario</th>
                          <th className="px-4 py-4 font-inter font-bold">Comité</th>
                          <th className="px-4 py-4 font-inter font-bold">Barrio / Estaca</th>
                          <th className="px-4 py-4 text-center font-inter font-bold">Fecha y Turno</th>
                          <th className="px-4 py-4 text-center font-inter font-bold">Horas</th>
                          <th className="px-5 py-4 text-right font-inter font-bold">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedHistoryItems.map((item) => (
                          <tr key={item.registrationId} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors group">
                            <td className="px-5 py-4">
                              <p className="font-inter font-bold text-text text-sm tracking-tight">{item.volunteerName}</p>
                              <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">{item.phone}</p>
                            </td>
                            <td className="px-4 py-4 font-inter font-bold text-[13px] text-text-dim">{item.committeeName}</td>
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
                                {item.status === 'registered' && 'Inscrito'}
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
                          <p className="font-inter font-bold text-text text-sm tracking-tight truncate">{item.volunteerName}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.committeeName && (
                              <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${getCommitteeColor(item.committeeName)}`}>
                                {item.committeeName}
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
                </motion.div>
              ) : (
                <motion.div
                  key="volunteers-tab"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                  className="bg-dark2 border border-border rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full"
                >
                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                      <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md text-[10px] font-inter font-bold text-text-dim uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-4 font-inter font-bold">Voluntario</th>
                          <th className="px-4 py-4 font-inter font-bold">Comité / Estaca</th>
                          <th className="px-4 py-4 text-center font-inter font-bold">Turnos Asistidos</th>
                          <th className="px-4 py-4 text-center font-inter font-bold">Fiabilidad</th>
                          <th className="px-5 py-4 text-right font-inter font-bold">Horas Acumuladas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedVolunteerItems.map((v, index) => {
                          const globalRank = (currentPage - 1) * pageSize + index + 1;
                          return (
                            <tr key={v.id} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors group">
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
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Pagination Controls */}
          {currentTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 mt-6 bg-dark2 border border-border rounded-2xl shadow-lg">
              <p className="text-xs text-text-dim font-inter font-bold">
                Página <span className="text-text">{currentPage}</span> de <span className="text-text">{currentTotalPages}</span> (
                {activeTab === 'history' ? filteredItems.length : volunteerRanking.length} registros)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="h-8 px-3 text-xs font-inter font-bold rounded-xl border-border bg-dark2 text-text hover:bg-dark3 disabled:opacity-30 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] mr-1">chevron_left</span>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= currentTotalPages}
                  onClick={() => setCurrentPage(p => Math.min(currentTotalPages, p + 1))}
                  className="h-8 px-3 text-xs font-inter font-bold rounded-xl border-border bg-dark2 text-text hover:bg-dark3 disabled:opacity-30 cursor-pointer"
                >
                  Siguiente
                  <span className="material-symbols-outlined text-[16px] ml-1">chevron_right</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
