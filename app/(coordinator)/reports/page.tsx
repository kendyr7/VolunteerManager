'use client'

import { useState, useEffect, useTransition } from "react";
import { getReportsData, ReportItem, ReportsData } from "@/app/actions/reports";
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

// Day names for week headers
const DAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Maps ISO date string to short label shown under the day number
const DAY_SHORT: Record<string, string> = {
  "1": "Lun", "2": "Mar", "3": "Mié",
  "4": "Jue", "5": "Vie", "6": "Sáb", "0": "Dom"
};


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
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center text-white">
        <span className="material-symbols-outlined text-[56px] animate-spin text-[#4d7cfe] mb-6">progress_activity</span>
        <h3 className="text-xl font-bold">Cargando Reportes</h3>
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

  // Filter Items
  const filteredItems = items.filter(item => {
    const matchesSearch = item.volunteerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.phone.includes(searchTerm);
    
    // Multi-Selection filtering
    const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(item.committeeId);
    const matchesNeighborhood = selectedNeighborhoods.length === 0 || selectedNeighborhoods.includes(item.neighborhood);
    const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(item.stake);
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(item.status);
    const matchesDate = !selectedDate || item.date === selectedDate;

    return matchesSearch && matchesCommittee && matchesNeighborhood && matchesStake && matchesStatus && matchesDate;
  });

  // Calculate KPIs
  const totalShifts = filteredItems.length;
  const confirmedShifts = filteredItems.filter(i => i.status === 'confirmed').length;
  const absentShifts = filteredItems.filter(i => i.status === 'absent').length;
  const pendingShifts = filteredItems.filter(i => i.status === 'registered').length;
  const totalHours = Number(filteredItems.reduce((acc, i) => i.status === 'confirmed' ? acc + i.durationHours : acc, 0).toFixed(1));
  const attendanceRate = totalShifts > 0 ? Math.round((confirmedShifts / (totalShifts - filteredItems.filter(i => i.status === 'replaced').length || totalShifts)) * 100) : 0;

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
    hours: number;
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
        hours: 0
      });
    }

    const v = volunteerMap.get(item.volunteerId)!;
    v.totalShifts += 1;
    if (item.status === 'confirmed') {
      v.confirmed += 1;
      v.hours += item.durationHours;
    } else if (item.status === 'absent') {
      v.absent += 1;
    }
  });

  const volunteerRanking = Array.from(volunteerMap.values()).map(v => {
    const totalCount = v.confirmed + v.absent;
    v.reliability = totalCount > 0 ? Math.round((v.confirmed / totalCount) * 100) : 100;
    v.hours = Number(v.hours.toFixed(1));
    return v;
  }).sort((a, b) => b.hours - a.hours);

  // CSV Export
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = "";

    if (activeTab === 'history') {
      headers = ["Nombre Voluntario", "Teléfono", "Comité", "Barrio", "Estaca", "Fecha", "Turno", "Horario", "Horas", "Estado"];
      rows = filteredItems.map(item => [
        item.volunteerName,
        item.phone,
        item.committeeName,
        item.neighborhood,
        item.stake,
        item.date,
        `T${item.shiftNumber}`,
        `${item.startTime}-${item.endTime}`,
        item.durationHours,
        item.status === 'confirmed' ? 'Asistió' :
        item.status === 'registered' ? 'Inscrito' :
        item.status === 'absent' ? 'Ausente' : 'Reemplazado'
      ]);
      filename = `historial_asistencia_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ["Nombre Voluntario", "Teléfono", "Comité", "Barrio", "Estaca", "Turnos Totales", "Asistidos", "Ausencias", "Fiabilidad (%)", "Horas de Servicio"];
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
        v.hours
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

  return (
    <div className="w-full pb-32 flex flex-col min-h-full">
      {/* Sticky Header matching other sections design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 mb-4 flex flex-col gap-4 pointer-events-auto shrink-0 border-b border-white/5">
        <div className="w-full flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Reportes
            <span className="text-xs font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 px-2.5 py-1 rounded-full border border-[#4d7cfe]/20">
              {filteredItems.length}
            </span>
          </h1>
          <Button
            onClick={handleExportCSV}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
            disabled={filteredItems.length === 0}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Exportar</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        {/* KPI Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { title: "Horas de Servicio", val: `${totalHours} h`, sub: "Totales confirmadas", color: "text-[#4d7cfe]", icon: "schedule" },
            { title: "Tasa de Asistencia", val: `${attendanceRate}%`, sub: "Confirmados vs total", color: "text-emerald-400", icon: "check_circle" },
            { title: "Turnos Asistidos", val: confirmedShifts, sub: `${pendingShifts} turnos pendientes`, color: "text-text", icon: "done" },
            { title: "Ausencias", val: absentShifts, sub: "Sin justificación", color: "text-red-400", icon: "cancel" },
          ].map((kpi, idx) => (
            <div key={idx} className="rounded-[20px] border border-white/10 bg-dark2 p-4 flex flex-col justify-between hover:border-white/20 transition-all">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim">{kpi.title}</p>
                <span className="material-symbols-outlined text-[16px] text-text-dim">{kpi.icon}</span>
              </div>
              <div className="mt-3">
                <span className={`text-3xl font-black leading-none ${kpi.color}`}>{kpi.val}</span>
                <p className="text-[10px] text-text-dim font-inter mt-1 leading-snug">{kpi.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter Controls Panel */}
        <div className="bg-dark2 border border-white/10 rounded-[24px] p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-text-dim">filter_alt</span>
              <span>Filtros del Reporte</span>
            </h2>
            {(searchTerm || selectedCommittees.length > 0 || selectedNeighborhoods.length > 0 || selectedStakes.length > 0 || selectedStatuses.length > 0 || selectedDate) && (
              <button onClick={clearFilters} className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
                <span>Limpiar</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search Input (Shadcn UI Input component) */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-2">
              <label className="text-[10px] font-bold uppercase text-text-dim mb-1 block">Buscador</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-3 text-text-dim text-[16px]">search</span>
                <Input
                  type="text"
                  placeholder="Nombre o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 text-xs font-inter border-white/10 bg-dark hover:border-white/20 text-white rounded-xl h-10 transition-all focus-visible:border-[#4d7cfe] focus-visible:ring-0"
                />
              </div>
            </div>

            {/* Committee Multi-Select Dropdown */}
            {data?.uniqueCommittees && data.uniqueCommittees.length > 1 && (
              <div>
                <label className="text-[10px] font-bold uppercase text-text-dim mb-1 block">Comité</label>
                <DropdownMenu>
                  <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
                    <span className="truncate">
                      {selectedCommittees.length === 0 ? "Todos" :
                       selectedCommittees.length === 1 ? data.uniqueCommittees.find(c => c.id === selectedCommittees[0])?.name :
                       `${selectedCommittees.length} comités`}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-48 max-h-60 overflow-y-auto">
                    {data.uniqueCommittees.map(c => (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        checked={selectedCommittees.includes(c.id)}
                        onCheckedChange={() => toggleCommittee(c.id)}
                        className="focus:bg-white/5 focus:text-white"
                      >
                        {c.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Neighborhood Multi-Select Dropdown */}
            <div>
              <label className="text-[10px] font-bold uppercase text-text-dim mb-1 block">Barrio</label>
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
                  <span className="truncate">
                    {selectedNeighborhoods.length === 0 ? "Todos" :
                     selectedNeighborhoods.length === 1 ? selectedNeighborhoods[0] :
                     `${selectedNeighborhoods.length} barrios`}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-48 max-h-60 overflow-y-auto">
                  {data?.uniqueNeighborhoods.map(n => (
                    <DropdownMenuCheckboxItem
                      key={n}
                      checked={selectedNeighborhoods.includes(n)}
                      onCheckedChange={() => toggleNeighborhood(n)}
                      className="focus:bg-white/5 focus:text-white"
                    >
                      {n}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Stake Multi-Select Dropdown */}
            <div>
              <label className="text-[10px] font-bold uppercase text-text-dim mb-1 block">Estaca</label>
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
                  <span className="truncate">
                    {selectedStakes.length === 0 ? "Todos" :
                     selectedStakes.length === 1 ? selectedStakes[0] :
                     `${selectedStakes.length} estacas`}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-48 max-h-60 overflow-y-auto">
                  {data?.uniqueStakes.map(s => (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={selectedStakes.includes(s)}
                      onCheckedChange={() => toggleStake(s)}
                      className="focus:bg-white/5 focus:text-white"
                    >
                      {s}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Status Multi-Select Dropdown */}
            <div>
              <label className="text-[10px] font-bold uppercase text-text-dim mb-1 block">Estado</label>
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full h-10 bg-dark border border-white/10 text-xs text-white flex items-center justify-between rounded-xl px-3 font-normal font-inter hover:bg-dark3 hover:border-white/20 transition-all outline-none">
                  <span className="truncate">
                    {selectedStatuses.length === 0 ? "Todos" :
                     selectedStatuses.length === 1 ? STATUS_LABELS[selectedStatuses[0]] :
                     `${selectedStatuses.length} estados`}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-text-dim">expand_more</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#0b101b] border-white/10 text-white font-inter text-xs w-48 max-h-60 overflow-y-auto">
                  {['confirmed', 'registered', 'absent', 'replaced'].map(status => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={() => toggleStatus(status)}
                      className="focus:bg-white/5 focus:text-white"
                    >
                      {STATUS_LABELS[status]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mini Calendario Visual – Week Picker */}
            <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-6 mt-3 border-t border-white/5 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-text-dim block">Fecha del Turno</label>
                  <p className="text-[9px] text-text-dim/50 font-inter mt-0.5">
                    {availableDates.length > 0
                      ? `${availableDates.length} día${availableDates.length !== 1 ? 's' : ''} con turnos registrados`
                      : 'Sin turnos registrados'}
                  </p>
                </div>
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate("")}
                    className="text-[10px] font-bold text-text-dim hover:text-white transition-colors flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[12px]">close</span>
                    <span>Limpiar</span>
                  </button>
                )}
              </div>

              {/* Week Grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {/* Day-of-week headers */}
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                  <div key={d} className="text-center text-[9px] font-bold text-text-dim/40 uppercase tracking-wider pb-1.5">
                    {d}
                  </div>
                ))}

                {/* Calendar Day Cells – dynamic from actual data */}
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
                        relative flex flex-col items-center justify-center rounded-xl py-2.5 transition-all duration-150
                        ${
                          isSelected
                            ? "bg-[#4d7cfe] text-white shadow-lg shadow-blue-500/20 scale-[1.06]"
                            : isEvent
                              ? "bg-dark border border-white/10 hover:border-[#4d7cfe]/50 hover:bg-[#4d7cfe]/5 cursor-pointer active:scale-95"
                              : "opacity-20 cursor-not-allowed"
                        }
                      `}
                    >
                      <span className={`text-base font-black leading-none ${isSelected ? "text-white" : "text-white"}`}>
                        {num}
                      </span>
                      {isEvent && (
                        <span className={`text-[8px] font-bold mt-0.5 leading-none capitalize ${isSelected ? "text-white/70" : "text-text-dim"}`}>
                          {month}
                        </span>
                      )}
                      {isSelected && (
                        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/60" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-white/5 mb-6 gap-6">
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 font-bold text-sm transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'history' ? 'border-[#4d7cfe] text-[#4d7cfe]' : 'border-transparent text-text-dim hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span>Historial de Turnos ({filteredItems.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('volunteers')}
            className={`pb-3 font-bold text-sm transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'volunteers' ? 'border-[#4d7cfe] text-[#4d7cfe]' : 'border-transparent text-text-dim hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">bar_chart</span>
            <span>Horas por Voluntario ({volunteerRanking.length})</span>
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
                  className="bg-dark2 border border-white/5 rounded-[24px] overflow-hidden"
                >
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/2 text-[10px] font-bold uppercase tracking-wider text-text-dim font-inter">
                          <th className="py-4 px-5">Voluntario</th>
                          <th className="py-4 px-4">Comité</th>
                          <th className="py-4 px-4">Barrio / Estaca</th>
                          <th className="py-4 px-4 text-center">Fecha y Turno</th>
                          <th className="py-4 px-4 text-center">Horas</th>
                          <th className="py-4 px-5 text-right">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item) => (
                          <tr key={item.registrationId} className="border-b border-white/5 hover:bg-white/1 transition-all">
                            <td className="py-3.5 px-5">
                              <p className="font-bold text-white leading-tight">{item.volunteerName}</p>
                              <p className="text-[10px] text-text-dim font-inter mt-0.5">{item.phone}</p>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-white">{item.committeeName}</td>
                            <td className="py-3.5 px-4 font-inter text-text-dim">
                              <p className="leading-snug text-white font-bold">{item.neighborhood}</p>
                              <p className="text-[10px] mt-0.5">{item.stake}</p>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <p className="font-bold text-white">{item.date}</p>
                              <p className="text-[10px] text-text-dim mt-0.5 font-inter">Turno T{item.shiftNumber} ({item.startTime}-{item.endTime})</p>
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-white font-inter">{item.durationHours} h</td>
                            <td className="py-3.5 px-5 text-right">
                              <Badge variant="outline" className={`font-bold text-[9px] py-0.5 px-2 border ${
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

                  {/* Responsive Mobile Ticket List View */}
                  <div className="block md:hidden space-y-3 p-4">
                    {filteredItems.map((item) => (
                      <div key={item.registrationId} className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col gap-2.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-white text-sm tracking-tight">{item.volunteerName}</p>
                            <p className="text-[10px] text-text-dim font-inter mt-0.5">{item.phone}</p>
                          </div>
                          <Badge variant="outline" className={`font-bold text-[9px] py-0.5 px-2 border ${
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
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-white/5 text-[11px] font-inter text-text-dim">
                          <div>
                            <p className="text-[8px] uppercase tracking-wider text-text-dim/60 font-bold mb-0.5">Comité</p>
                            <p className="font-bold text-white leading-tight">{item.committeeName}</p>
                          </div>
                          <div>
                            <p className="text-[8px] uppercase tracking-wider text-text-dim/60 font-bold mb-0.5">Turno</p>
                            <p className="font-bold text-white leading-tight">{item.date} · T{item.shiftNumber}</p>
                            <p className="text-[9px] text-text-dim mt-0.5">({item.startTime}-{item.endTime}) · {item.durationHours}h</p>
                          </div>
                        </div>

                        <div className="text-[10px] text-text-dim/80 font-inter pt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">location_on</span>
                          <span>{item.neighborhood} · {item.stake}</span>
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
                  className="bg-dark2 border border-white/5 rounded-[24px] overflow-hidden"
                >
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/2 text-[10px] font-bold uppercase tracking-wider text-text-dim font-inter">
                          <th className="py-4 px-5">Voluntario</th>
                          <th className="py-4 px-4">Comité / Estaca</th>
                          <th className="py-4 px-4 text-center">Turnos Asistidos</th>
                          <th className="py-4 px-4 text-center">Fiabilidad</th>
                          <th className="py-4 px-5 text-right">Horas Acumuladas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volunteerRanking.map((v, index) => (
                          <tr key={v.id} className="border-b border-white/5 hover:bg-white/1 transition-all">
                            <td className="py-4 px-5 flex items-center gap-3">
                              <span className="font-black text-text-dim font-inter text-sm w-4 shrink-0">{index + 1}</span>
                              <div>
                                <p className="font-bold text-white leading-tight">{v.name}</p>
                                <p className="text-[10px] text-text-dim font-inter mt-0.5">{v.neighborhood} · {v.phone}</p>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <p className="font-bold text-white leading-snug">{v.committee}</p>
                              <p className="text-[10px] text-text-dim font-inter mt-0.5">{v.stake}</p>
                            </td>
                            <td className="py-4 px-4 text-center font-bold text-white font-inter">
                              {v.confirmed} / {v.totalShifts}
                            </td>
                            <td className="py-4 px-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`font-bold font-inter ${
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
                            <td className="py-4 px-5 text-right font-black text-white font-inter text-sm">
                              {v.hours} h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Responsive Mobile Card List View */}
                  <div className="block md:hidden space-y-3 p-4">
                    {volunteerRanking.map((v, index) => (
                      <div key={v.id} className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-text-dim font-inter text-xs">#{index + 1}</span>
                            <div>
                              <p className="font-bold text-white text-sm tracking-tight">{v.name}</p>
                              <p className="text-[10px] text-text-dim font-inter mt-0.5">{v.phone}</p>
                            </div>
                          </div>
                          <p className="font-black text-[#4d7cfe] font-inter text-base">{v.hours} h</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px] font-inter text-text-dim">
                          <div>
                            <p className="text-[8px] uppercase tracking-wider text-text-dim/60 font-bold mb-0.5">Comité</p>
                            <p className="font-bold text-white leading-tight">{v.committee}</p>
                            <p className="text-[9px] text-text-dim mt-0.5 flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[10px]">location_on</span>
                              <span>{v.neighborhood}</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-[8px] uppercase tracking-wider text-text-dim/60 font-bold mb-0.5">Asistencias</p>
                            <p className="font-bold text-white leading-tight">{v.confirmed} / {v.totalShifts} turnos</p>
                            
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className={`font-bold text-[9px] ${
                                v.reliability >= 85 ? 'text-emerald-400' :
                                v.reliability >= 60 ? 'text-amber-400' : 'text-red-400'
                              }`}>{v.reliability}% fiab.</span>
                              <div className="w-8 h-0.5 bg-white/10 rounded-full overflow-hidden shrink-0">
                                <div 
                                  className={`h-full rounded-full ${
                                    v.reliability >= 85 ? 'bg-emerald-400' :
                                    v.reliability >= 60 ? 'bg-amber-400' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${v.reliability}%` }}
                                />
                              </div>
                            </div>
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
