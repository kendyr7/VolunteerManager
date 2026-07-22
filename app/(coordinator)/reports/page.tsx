'use client'

import { useState, useEffect, useTransition } from "react";
import { getReportsData, ReportItem, ReportsData, AttendanceSummary } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuCheckboxItem 
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { cn } from "@/lib/utils";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  const items = data?.items || [];

  // Compute all unique dates that exist in the dataset
  const availableDates = Array.from(new Set(items.map(i => i.date))).sort();

  // Build the week calendar dynamically around the available dates
  // Find the earliest and latest date to determine the week span
  const buildWeekCells = () => {
    if (availableDates.length === 0) return [];
    const firstDate = new Date(availableDates[0] + 'T12:00:00');
    const lastDate = new Date(availableDates[availableDates.length - 1] + 'T12:00:00');
    
    // Start from Monday of the first week
    const startDow = firstDate.getDay(); // 0=Sun,1=Mon...
    const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
    const monday = new Date(firstDate);
    monday.setDate(monday.getDate() + mondayOffset);

    // Generate 7 days (Mon–Sun)
    const cells: { num: number; date: string | null; month: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const isoDate = d.toISOString().split('T')[0];
      const isEvent = availableDates.includes(isoDate);
      cells.push({
        num: d.getDate(),
        date: isEvent ? isoDate : null,
        month: d.toLocaleString('es', { month: 'short' })
      });
    }
    return cells;
  };

  const weekCells = buildWeekCells();

  // Utilidad para remover acentos en la búsqueda
  const normalizeText = (text: string) => 
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Filter Items
  const filteredItems = items.filter(item => {
    const searchNormalized = normalizeText(searchTerm);
    const matchesSearch = normalizeText(item.volunteerName).includes(searchNormalized) || 
                          item.phone.includes(searchTerm);
    
    // Multi-Selection filtering
    const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(item.committeeId);
    const matchesNeighborhood = selectedNeighborhoods.length === 0 || selectedNeighborhoods.includes(item.neighborhood);
    const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(item.stake);
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(item.status);
    const matchesDate = !selectedDate || item.date === selectedDate;

    return matchesSearch && matchesCommittee && matchesNeighborhood && matchesStake && matchesStatus && matchesDate;
  });

  // Calculate KPIs from filtered items (local) and attendanceSummary from server
  const summary = data?.attendanceSummary;
  const totalShifts = filteredItems.length;
  const confirmedShifts = filteredItems.filter(i => i.status === 'confirmed').length;
  const absentShifts = filteredItems.filter(i => i.status === 'absent').length;
  const pendingShifts = filteredItems.filter(i => i.status === 'registered').length;
  const totalMinutes = filteredItems.reduce((acc, i) => i.status === 'confirmed' ? acc + i.durationMinutes : acc, 0);
  const attendanceRate = totalShifts > 0 ? Math.round((confirmedShifts / (totalShifts - filteredItems.filter(i => i.status === 'replaced').length || totalShifts)) * 100) : 0;
  // Global attendance from server summary (not filtered — represents actual event data)
  const globalAttendanceRate = summary?.attendanceRate ?? attendanceRate;
  const globalCoverageRate = summary?.coverageRate ?? 0;

  // Process volunteer summary ranking
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

  filteredItems.forEach(item => {
    if (!volunteerMap.has(item.volunteerId)) {
      volunteerMap.set(item.volunteerId, {
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
      });
    }

    const v = volunteerMap.get(item.volunteerId)!;
    v.totalShifts += 1;
    if (item.status === 'confirmed') {
      v.confirmed += 1;
      v.minutes += item.durationMinutes;
    } else if (item.status === 'absent') {
      v.absent += 1;
    }
  });

  const volunteerRanking = Array.from(volunteerMap.values()).map(v => {
    const totalCount = v.confirmed + v.absent;
    v.reliability = totalCount > 0 ? Math.round((v.confirmed / totalCount) * 100) : 100;
    return v;
  }).sort((a, b) => b.minutes - a.minutes);

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
    setSearchTerm("");
    setSelectedCommittees([]);
    setSelectedNeighborhoods([]);
    setSelectedStakes([]);
    setSelectedStatuses([]);
    setSelectedDate("");
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

  const STATUS_LABELS: Record<string, string> = {
    'confirmed': 'Asistió',
    'registered': 'Pendiente',
    'absent': 'Ausente',
    'replaced': 'Reemplazado'
  };

  const renderFilterControls = () => (
    <div className="space-y-5">
      {/* Committee Multi-Select Dropdown */}
      {data?.uniqueCommittees && data.uniqueCommittees.length > 1 && (
        <div>
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Comité</label>
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
              <span className="truncate">
                {selectedCommittees.length === 0 ? "Todos" :
                 selectedCommittees.length === 1 ? data.uniqueCommittees.find(c => c.id === selectedCommittees[0])?.name :
                 `${selectedCommittees.length} comités`}
              </span>
              <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-64 max-h-60 overflow-y-auto z-[150]">
              {data.uniqueCommittees.map(c => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={selectedCommittees.includes(c.id)}
                  onCheckedChange={() => toggleCommittee(c.id)}
                  closeOnClick={false}
                  className="focus:bg-white/5 focus:text-white cursor-pointer"
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Stake Multi-Select Dropdown */}
      {data?.uniqueStakes && data.uniqueStakes.length > 0 && (
        <div>
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Estaca</label>
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
              <span className="truncate">
                {selectedStakes.length === 0 ? "Todas" :
                 selectedStakes.length === 1 ? selectedStakes[0] :
                 `${selectedStakes.length} estacas`}
              </span>
              <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-64 max-h-60 overflow-y-auto z-[150]">
              {data.uniqueStakes.map(s => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={selectedStakes.includes(s)}
                  onCheckedChange={() => toggleStake(s)}
                  closeOnClick={false}
                  className="focus:bg-white/5 focus:text-white cursor-pointer"
                >
                  {s}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Neighborhood Multi-Select Dropdown */}
      {data?.uniqueNeighborhoods && data.uniqueNeighborhoods.length > 0 && (
        <div>
          <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Barrio</label>
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
              <span className="truncate">
                {selectedNeighborhoods.length === 0 ? "Todos" :
                 selectedNeighborhoods.length === 1 ? selectedNeighborhoods[0] :
                 `${selectedNeighborhoods.length} barrios`}
              </span>
              <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-64 max-h-60 overflow-y-auto z-[150]">
              {data.uniqueNeighborhoods.map(n => (
                <DropdownMenuCheckboxItem
                  key={n}
                  checked={selectedNeighborhoods.includes(n)}
                  onCheckedChange={() => toggleNeighborhood(n)}
                  closeOnClick={false}
                  className="focus:bg-white/5 focus:text-white cursor-pointer"
                >
                  {n}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Status Dropdown */}
      <div>
        <label className="text-[10px] font-inter font-bold uppercase text-text-dim mb-2 block">Estado</label>
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
            <span className="truncate">
              {selectedStatuses.length === 0 ? "Todos" :
               selectedStatuses.length === 1 ? STATUS_LABELS[selectedStatuses[0]] :
               `${selectedStatuses.length} estados`}
            </span>
            <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-64 max-h-60 overflow-y-auto z-50">
            {['confirmed', 'registered', 'absent', 'replaced'].map(status => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={selectedStatuses.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
                closeOnClick={false}
                className="focus:bg-white/5 focus:text-white cursor-pointer"
              >
                {STATUS_LABELS[status]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mini Calendario Visual – Week Picker */}
      <div className="mt-3 border-t border-white/5 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <label className="text-[10px] font-inter font-bold uppercase text-text-dim block">Fecha del Turno</label>
            <p className="text-[9px] text-text-dim/50 font-inter mt-0.5">
              {availableDates.length > 0
                ? `${availableDates.length} día${availableDates.length !== 1 ? 's' : ''} registrados`
                : 'Sin turnos'}
            </p>
          </div>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              className="text-[10px] font-inter font-bold text-text-dim hover:text-white transition-colors flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-[12px]">close</span>
              <span>Limpiar</span>
            </button>
          )}
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-1">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="text-center text-[9px] font-bold text-text-dim/40 uppercase tracking-wider pb-1">
              {d}
            </div>
          ))}

          {weekCells.length === 0 ? (
            <div className="col-span-7 text-center text-xs text-text-dim py-4 font-inter">Sin fechas disponibles</div>
          ) : weekCells.map(({ num, date, month }) => {
            const isEvent = date !== null;
            const isSelected = isEvent && selectedDate === date;
            return (
              <button
                key={num}
                onClick={() => { if (date) setSelectedDate(date); }}
                disabled={!isEvent}
                className={`
                  relative flex flex-col items-center justify-center rounded-lg py-2 transition-all duration-150
                  ${
                    isSelected
                      ? "bg-[#4d7cfe] text-white shadow-lg shadow-blue-500/20 scale-[1.05]"
                      : isEvent
                        ? "bg-dark border border-white/10 hover:border-[#4d7cfe]/50 hover:bg-[#4d7cfe]/5 cursor-pointer active:scale-95"
                        : "opacity-20 cursor-not-allowed"
                  }
                `}
              >
                <span className="text-xs font-black leading-none text-white">
                  {num}
                </span>
                {isEvent && (
                  <span className={`text-[7px] font-bold mt-0.5 leading-none capitalize ${isSelected ? "text-white/70" : "text-text-dim"}`}>
                    {month}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/60" />
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
              className="rounded-full shadow-lg h-9 px-4 text-xs font-bold font-inter transition-all active:scale-[0.97] flex items-center gap-1.5 bg-dark border-white/10 text-white hover:bg-dark3 relative"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt</span>
              <span className="hidden sm:inline">Filtros</span>
              {(selectedCommittees.length > 0 || selectedNeighborhoods.length > 0 || selectedStakes.length > 0 || selectedStatuses.length > 0 || selectedDate) && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#4d7cfe] rounded-full border-2 border-dark"></span>
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

        {/* Search Input matching image */}
        <div className="w-full relative z-10 max-w-7xl mx-auto">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar voluntario por nombre o teléfono..."
              className="w-full bg-black/5 dark:bg-[#fff6] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/70 rounded-full pl-12 pr-10 py-3.5 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 transition-all text-[13px] font-bold font-inter"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
            {searchTerm.trim() !== '' && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-3 flex items-center justify-center w-8 text-black/40 hover:text-black dark:text-white/60 dark:hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Primary KPIs - Edge to Edge Fine Line Grid matching Dashboard */}
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/5 mb-8">
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
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-[#0b101b] border-white/10",
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
            <div className={cn("flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10 shrink-0", !isMobile && "pt-8")}>
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4d7cfe] text-[22px]">filter_alt</span>
                  Filtros del Reporte
                </h2>
                <p className="text-[11px] text-text-dim font-inter">Personaliza el historial y estadísticas</p>
              </div>

              {(selectedCommittees.length > 0 || selectedNeighborhoods.length > 0 || selectedStakes.length > 0 || selectedStatuses.length > 0 || selectedDate) && (
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
        <div className="flex border-b border-white/5 mb-6 gap-2 sm:gap-6">
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 font-inter font-bold text-xs sm:text-sm transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'history' ? 'border-[#4d7cfe] text-[#4d7cfe]' : 'border-transparent text-text-dim hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span className="hidden sm:inline">Historial de Turnos ({filteredItems.length})</span>
            <span className="inline sm:hidden">Historial ({filteredItems.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('volunteers')}
            className={`pb-3 font-inter font-bold text-xs sm:text-sm transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'volunteers' ? 'border-[#4d7cfe] text-[#4d7cfe]' : 'border-transparent text-text-dim hover:text-white'
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
            <div className="flex flex-col items-center justify-center py-20 text-center bg-dark2/40 rounded-3xl border border-white/5">
              <span className="material-symbols-outlined text-[48px] text-white/10 mb-4 animate-pulse">database</span>
              <p className="text-sm font-bold text-white mb-1">Sin registros</p>
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
                  className="bg-dark2 border border-white/10 rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full"
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
                      <tbody className="divide-y divide-white/5">
                        {filteredItems.map((item) => (
                          <tr key={item.registrationId} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-5 py-4">
                              <p className="font-inter font-bold text-white text-sm tracking-tight">{item.volunteerName}</p>
                              <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">{item.phone}</p>
                            </td>
                            <td className="px-4 py-4 font-inter font-bold text-[13px] text-text-dim">{item.committeeName}</td>
                            <td className="px-4 py-4 font-inter">
                              <p className="leading-snug text-white font-inter font-bold text-[13px]">{item.neighborhood}</p>
                              <p className="text-[11px] font-inter font-bold text-text-dim opacity-70 mt-0.5">{item.stake}</p>
                            </td>
                            <td className="px-4 py-4 text-center font-inter">
                              <p className="font-inter font-bold text-white text-[13px]">{formatDateDDMMYYYY(item.date)}</p>
                              <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">T{item.shiftNumber}</p>
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold text-[13px] text-text tabular-nums">{formatMinutes(item.durationMinutes)}</td>
                            <td className="px-5 py-4 text-right">
                              <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${
                                item.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                item.status === 'registered' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                item.status === 'absent' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                'bg-white/5 text-text-dim border-white/10'
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
                  <div className="block lg:hidden divide-y divide-white/5 bg-dark2">
                    {filteredItems.map((item) => (
                      <div key={item.registrationId} className="px-4 py-3.5 flex flex-col gap-1.5 hover:bg-white/[0.02] transition-colors">
                        {/* Line 1: Volunteer Name + Committee & Stake Badges */}
                        <div className="flex items-center justify-between gap-2 w-full">
                          <p className="font-inter font-bold text-white text-sm tracking-tight truncate">{item.volunteerName}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.committeeName && (
                              <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${getCommitteeColor(item.committeeName)}`}>
                                {item.committeeName}
                              </Badge>
                            )}
                            {item.stake && (
                              <Badge variant="outline" className="font-inter font-bold text-[10px] py-0.5 px-2 border bg-dark3 text-text-dim border-white/10">
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
                            <span className="text-white/90">T{item.shiftNumber}</span>
                            <span className="opacity-40">·</span>
                            <span className="text-[#4d7cfe]">{formatDateDDMMYYYY(item.date)}</span>
                          </p>
                          <span className="text-xs font-inter font-bold text-white tabular-nums shrink-0">{formatMinutes(item.durationMinutes)}</span>
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
                  className="bg-dark2 border border-white/10 rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full"
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
                      <tbody className="divide-y divide-white/5">
                        {volunteerRanking.map((v, index) => (
                          <tr key={v.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-5 py-4 flex items-center gap-3">
                              <span className="font-inter font-bold text-text-dim text-sm w-4 shrink-0">#{index + 1}</span>
                              <div>
                                <p className="font-inter font-bold text-white text-sm tracking-tight">{v.name}</p>
                                <p className="text-[11px] text-text-dim font-inter font-bold mt-0.5">{v.neighborhood} · {v.phone}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 font-inter">
                              <p className="font-inter font-bold text-white text-[13px] leading-snug">{v.committee}</p>
                              <p className="text-[11px] text-text-dim font-inter font-bold opacity-70 mt-0.5">{v.stake}</p>
                            </td>
                            <td className="px-4 py-4 text-center font-inter font-bold text-[13px] text-text tabular-nums">
                              {v.confirmed} / {v.totalShifts}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`font-inter font-bold text-[13px] tabular-nums ${
                                  v.reliability >= 85 ? 'text-emerald-400' :
                                  v.reliability >= 60 ? 'text-amber-400' : 'text-red-400'
                                }`}>{v.reliability}%</span>
                                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${
                                      v.reliability >= 85 ? 'bg-emerald-400' :
                                      v.reliability >= 60 ? 'bg-amber-400' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${v.reliability}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right font-inter font-bold text-white text-sm tabular-nums">
                              {formatMinutes(v.minutes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Flat List View for Ranking (Matches Volunteers layout) */}
                  <div className="block lg:hidden divide-y divide-white/5 bg-dark2">
                    {volunteerRanking.map((v, index) => (
                      <div key={v.id} className="px-4 py-3.5 flex flex-col gap-1.5 hover:bg-white/[0.02] transition-colors">
                        {/* Line 1: Rank + Volunteer Name + Committee & Stake Badges */}
                        <div className="flex items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-inter font-bold text-text-dim text-xs shrink-0">#{index + 1}</span>
                            <p className="font-inter font-bold text-white text-sm tracking-tight truncate">{v.name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {v.committee && (
                              <Badge variant="outline" className={`font-inter font-bold text-[10px] py-0.5 px-2 border ${getCommitteeColor(v.committee)}`}>
                                {v.committee}
                              </Badge>
                            )}
                            {v.stake && (
                              <Badge variant="outline" className="font-inter font-bold text-[10px] py-0.5 px-2 border bg-dark3 text-text-dim border-white/10">
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
                            <span className="text-white/80">{v.confirmed}/{v.totalShifts} turnos</span>
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[11px] font-inter font-bold ${v.reliability >= 85 ? 'text-emerald-400' : v.reliability >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                              {v.reliability}% fiab.
                            </span>
                            <span className="font-inter font-bold text-[#4d7cfe] text-sm tabular-nums">{formatMinutes(v.minutes)}</span>
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
      </div>
    );
}
