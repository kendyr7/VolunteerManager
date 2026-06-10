'use client'

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  generateReminderMessage, 
  generateWaMeLink 
} from "@/lib/whatsapp";
import { 
  getActiveEventDays, 
  formatDateShort, 
  SHIFT_TIMES, 
  isHoliday 
} from "@/lib/dates";
import { 
  Send, 
  Copy, 
  CalendarClock, 
  MessageCircle, 
  Info, 
  Users, 
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  Search
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableFilter } from "@/components/DataTableFilter";

// ─── tipos ────────────────────────────────────────────────────────────────────
type VolunteerType = {
  id: number;
  name: string;
  stake: string;
  ward: string;
  phone: string;
  shifts: number;
  reliability: number;
  committee: string;
};

// ─── datos mock (Consistente con shifts/page.tsx) ─────────────────────────────
const names = ['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'];
const lastNames = ['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'];
const stakes = ['Managua Sur', 'Managua Este', 'Managua Norte', 'Bello Horizonte', 'Las Colinas'];
const wards = ['Barrio 1', 'Barrio 2', 'Barrio 3', 'Barrio 4', 'Barrio 5'];
const committees = ['Historia', 'Seguridad', 'Guía', 'Traducción', 'Transporte', 'Primeros Auxilios'];

const allVolunteers: VolunteerType[] = Array.from({ length: 82 }).map((_, i) => ({
  id: i + 1,
  name: `${names[i % names.length]} ${lastNames[(i * 7) % lastNames.length]}`,
  stake: stakes[i % stakes.length],
  ward: wards[(i * 3) % wards.length],
  phone: `8888 ${1000 + i}`,
  shifts: i % 5 === 0 ? 0 : (i % 3) + 1,
  reliability: i % 7 === 0 ? 50 : 100,
  committee: committees[i % committees.length]
}));

export default function RemindersPage() {
  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  // Cargar asignaciones de localStorage
  const [globalShifts, setGlobalShifts] = useState<Record<number, Record<string, string[]>>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("volunteer_assignments");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error loading volunteer assignments", e);
        }
      }
    }
    // Fallback inicial idéntico
    const init: Record<number, Record<string, string[]>> = {};
    const keys = EVENT_DAYS.map(d => d.key);
    allVolunteers.forEach(vol => {
      const volShifts = buildEmptyShifts();
      if (vol.shifts > 0 && keys[0]) volShifts[keys[0]] = ['T4'];
      if (vol.shifts > 1 && keys[1]) volShifts[keys[1]] = ['T2', 'T4'];
      if (vol.shifts > 2 && keys[2]) volShifts[keys[2]] = ['T3'];
      init[vol.id] = volShifts;
    });
    return init;
  });

  // Cargar confirmaciones de localStorage
  const [confirmedReminders, setConfirmedReminders] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("confirmed_reminders");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error loading confirmed reminders", e);
        }
      }
    }
    return {};
  });

  // Requerimientos por comité cargados de localStorage o por defecto
  const [committeeRequirements, setCommitteeRequirements] = useState<Record<string, Record<string, number>>>(() => {
    const defaults = {
      'Historia': { T1: 3, T2: 2, T3: 3, T4: 2 },
      'Seguridad': { T1: 4, T2: 4, T3: 4, T4: 4 },
      'Guía': { T1: 5, T2: 5, T3: 5, T4: 5 },
      'Traducción': { T1: 2, T2: 1, T3: 2, T4: 1 },
      'Transporte': { T1: 3, T2: 2, T3: 3, T4: 2 },
      'Primeros Auxilios': { T1: 2, T2: 2, T3: 2, T4: 2 }
    };
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        try {
          return { ...defaults, ...JSON.parse(stored) };
        } catch (e) {
          console.error("Error loading committee requirements in reminders", e);
        }
      }
    }
    return defaults;
  });

  // Estado del turno seleccionado (ninguno por defecto)
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");

  // Estado de los filtros y visualización de plantilla
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [showTemplate, setShowTemplate] = useState(false);

  // Escuchar actualizaciones del storage en caliente
  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("volunteer_assignments");
        if (stored) {
          try {
            setGlobalShifts(JSON.parse(stored));
          } catch (e) {
            console.error("Error syncing assignments in reminders", e);
          }
        }
        const confirmedStored = localStorage.getItem("confirmed_reminders");
        if (confirmedStored) {
          try {
            setConfirmedReminders(JSON.parse(confirmedStored));
          } catch (e) {
            console.error("Error syncing confirmations", e);
          }
        }
        const storedReqs = localStorage.getItem("committee_requirements");
        if (storedReqs) {
          try {
            setCommitteeRequirements(prev => ({ ...prev, ...JSON.parse(storedReqs) }));
          } catch (e) {
            console.error("Error syncing committee requirements in reminders", e);
          }
        }
      }
    };

    window.addEventListener("focus", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("focus", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Calcular cantidad de voluntarios asignados por turno/día (respetando filtros)
  const shiftCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    EVENT_DAYS.forEach(day => {
      counts[day.key] = { T1: 0, T2: 0, T3: 0, T4: 0 };
      allVolunteers.forEach(vol => {
        // Filtrado multicriterio
        const matchesSearch = !searchTerm || 
          vol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vol.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vol.ward.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(vol.committee);
        const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(vol.stake);
        const matchesWard = selectedWards.length === 0 || selectedWards.includes(vol.ward);

        if (!(matchesSearch && matchesCommittee && matchesStake && matchesWard)) {
          return;
        }

        const shifts = globalShifts[vol.id];
        if (shifts && shifts[day.key]) {
          shifts[day.key].forEach(shId => {
            if (counts[day.key][shId] !== undefined) {
              counts[day.key][shId]++;
            }
          });
        }
      });
    });
    return counts;
  }, [globalShifts, EVENT_DAYS, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  // Obtener voluntarios asignados al turno seleccionado
  const activeVolunteers = useMemo(() => {
    if (!selectedDayKey || !selectedShiftId) return [];
    return allVolunteers.filter(vol => {
      const matchesSearch = !searchTerm || 
        vol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vol.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vol.ward.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(vol.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(vol.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(vol.ward);

      if (!(matchesSearch && matchesCommittee && matchesStake && matchesWard)) {
        return false;
      }

      const shifts = globalShifts[vol.id];
      return shifts && shifts[selectedDayKey] && shifts[selectedDayKey].includes(selectedShiftId);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [globalShifts, selectedDayKey, selectedShiftId, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  // Detalles del turno seleccionado
  const selectedShiftDetails = SHIFT_TIMES.find(s => `T${s.id}` === selectedShiftId);
  const selectedDayObj = EVENT_DAYS.find(d => d.key === selectedDayKey);
  const isSelectedHoliday = selectedDayObj ? isHoliday(selectedDayObj.date) : false;
  
  const dateStr = selectedDayObj 
    ? format(selectedDayObj.date, "EEEE d 'de' MMMM", { locale: es }) 
    : "";

  const previewMessage = generateReminderMessage(
    "[Nombre del Voluntario]", 
    dateStr ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) : "", 
    selectedShiftDetails?.name || "", 
    selectedShiftDetails?.time || "", 
    selectedCommittees.length === 1 ? selectedCommittees[0] : "Seguridad", 
    isSelectedHoliday
  );

  const toggleConfirmed = (volId: number) => {
    const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
    setConfirmedReminders(prev => {
      const updated = {
        ...prev,
        [key]: !prev[key]
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("confirmed_reminders", JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleCopyNumbers = () => {
    if (activeVolunteers.length === 0) {
      alert("No hay voluntarios en este turno para copiar.");
      return;
    }
    const numbers = activeVolunteers.map(v => v.phone).join(", ");
    navigator.clipboard.writeText(numbers);
    alert(`Se copiaron los números de ${activeVolunteers.length} voluntarios al portapapeles.`);
  };

  return (
    <div className="max-w-7xl xl:max-w-[1440px] mx-auto px-4 lg:px-8 space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-800 tracking-tight mb-1">Recordatorios de Turnos</h2>
        <p className="text-sm font-medium text-slate-500">Visualiza las asignaciones reales y envía mensajes de confirmación a los voluntarios.</p>
      </div>

      {/* Barra de Filtros Globales (Prioritaria) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 shadow-sm">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input 
            placeholder="Buscar por nombre, estaca o barrio..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 bg-white text-slate-800 border-slate-200 focus:ring-2 focus:ring-primary-cta"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DataTableFilter
            title="Comité"
            options={committees}
            value={selectedCommittees}
            onChange={setSelectedCommittees}
          />
          <DataTableFilter
            title="Estaca"
            options={stakes}
            value={selectedStakes}
            onChange={setSelectedStakes}
          />
          <DataTableFilter
            title="Barrio"
            options={wards}
            value={selectedWards}
            onChange={setSelectedWards}
          />
          {(selectedCommittees.length > 0 || selectedStakes.length > 0 || selectedWards.length > 0 || searchTerm) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedCommittees([]);
                setSelectedStakes([]);
                setSelectedWards([]);
                setSearchTerm("");
              }}
              className="h-9 px-3 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl"
            >
              Limpiar Filtros
            </Button>
          )}
        </div>
      </div>

      {/* Selector de Turnos Rediseñado en Dos Filas */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 flex flex-col bg-white shadow-sm border border-slate-200 gap-5">
        
        {/* FILA 1: FECHA */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 tracking-widest uppercase">FECHA</span>
            {selectedDayKey && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDayKey("");
                  setSelectedShiftId("");
                }}
                className="h-7 px-3 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-250 hover:bg-rose-100 hover:text-rose-750 transition-colors shadow-sm rounded-lg"
              >
                Limpiar Selección
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {EVENT_DAYS.map((day) => {
              const dayCounts = shiftCounts[day.key] || { T1: 0, T2: 0, T3: 0, T4: 0 };
              const totalVolunteersOnDay = Object.values(dayCounts).reduce((acc, count) => acc + count, 0);
              const isSelected = selectedDayKey === day.key;
              const dayInitial = day.label.charAt(0).toUpperCase(); // e.g. 'J', 'V', 'S', 'D'

              return (
                <button
                  key={day.key}
                  onClick={() => {
                    if (selectedDayKey === day.key) {
                      setSelectedDayKey("");
                      setSelectedShiftId("");
                    } else {
                      setSelectedDayKey(day.key);
                      if (!selectedShiftId) {
                        setSelectedShiftId("T1");
                      }
                    }
                  }}
                  className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-xl border font-bold text-xs transition-all ${
                    isSelected
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm scale-105'
                      : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {dayInitial}
                  </span>
                  <span>{day.dateNum} Sep</span>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    totalVolunteersOnDay > 0 ? (isSelected ? 'bg-white' : 'bg-teal-500') : (isSelected ? 'bg-white/30' : 'bg-slate-200')
                  }`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Separador */}
        <div className="h-px bg-border/40" />

        {/* FILA 2: TURNOS */}
        <div className="space-y-2">
          <span className="text-[10px] font-black text-slate-500 tracking-widest uppercase">TURNOS</span>
          <div className="flex items-center gap-2 flex-wrap">
            {['T1', 'T2', 'T3', 'T4'].map((t) => {
              // Obtener conteo de voluntarios para este turno (si hay día seleccionado, del día; si no, total acumulado de todos los días)
              let count = 0;
              if (selectedDayKey) {
                count = shiftCounts[selectedDayKey]?.[t] || 0;
              } else {
                EVENT_DAYS.forEach(day => {
                  count += shiftCounts[day.key]?.[t] || 0;
                });
              }

              const isSelected = selectedDayKey && selectedShiftId === t;
              
              // Lógica de colores según requerimientos de comité
              const isSingleCommittee = selectedCommittees.length === 1;
              const activeCommittee = isSingleCommittee ? selectedCommittees[0] : null;
              const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;
              
              let buttonClass = "";
              let countTextClass = "";
              
              if (isSelected) {
                if (isSingleCommittee) {
                  const isUnderstaffed = count < minRequired;
                  if (isUnderstaffed) {
                    buttonClass = "bg-rose-600 border-rose-500 text-white shadow-sm scale-105 font-bold";
                    countTextClass = "text-rose-100/90";
                  } else {
                    buttonClass = "bg-teal-600 border-teal-500 text-white shadow-sm scale-105 font-bold";
                    countTextClass = "text-teal-100/90";
                  }
                } else {
                  // Selección neutra global
                  buttonClass = "bg-sky-600 border-sky-500 text-white shadow-sm scale-105 font-bold";
                  countTextClass = "text-sky-100/90";
                }
              } else {
                if (isSingleCommittee) {
                  const isUnderstaffed = count < minRequired;
                  if (isUnderstaffed) {
                    buttonClass = "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/20 hover:text-rose-700 font-bold";
                    countTextClass = "text-rose-500";
                  } else {
                    buttonClass = "bg-teal-50 border-teal-100 text-teal-600 hover:bg-teal-100/20 hover:text-teal-700 font-bold";
                    countTextClass = "text-teal-600";
                  }
                } else {
                  // Estilo neutro vista global
                  if (count > 0) {
                    buttonClass = "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/60 hover:text-slate-800 font-bold";
                    countTextClass = "text-slate-500";
                  } else {
                    buttonClass = "bg-white border-slate-200 text-slate-500 hover:bg-slate-50";
                    countTextClass = "text-slate-500/60";
                  }
                }
              }

              // Si no hay día seleccionado, forzar un estilo atenuado y deshabilitar
              if (!selectedDayKey) {
                buttonClass = "bg-white border-slate-200 text-slate-500 opacity-60 cursor-not-allowed";
                countTextClass = "text-slate-500/50";
              }
              
              const shiftTimeLabel = SHIFT_TIMES.find(s => `T${s.id}` === t)?.name || "";

              return (
                <button
                  key={t}
                  disabled={!selectedDayKey}
                  onClick={() => {
                    if (selectedDayKey) {
                      if (selectedShiftId === t) {
                        setSelectedShiftId("");
                      } else {
                        setSelectedShiftId(t);
                      }
                    }
                  }}
                  title={!selectedDayKey ? "Por favor selecciona una fecha primero" : `Seleccionar ${shiftTimeLabel}`}
                  className={`inline-flex items-center gap-2.5 px-4.5 py-2.5 rounded-xl border text-xs transition-all ${buttonClass}`}
                >
                  <span className="font-black">{t}</span>
                  <span className="text-[10px] opacity-30">|</span>
                  <span className={`font-bold ${countTextClass}`}>
                    {count} {count === 1 ? 'voluntario' : 'voluntarios'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Panel de Gestión del Turno Seleccionado (Debajo) */}
      <div className="space-y-4">
        {!selectedDayKey || !selectedShiftId ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-12 bg-white shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center min-h-[300px]">
            <CalendarClock className="h-16 w-16 text-slate-500/30 mb-4 animate-pulse" />
            <h3 className="text-lg font-bold tracking-tight font-bold text-slate-800 mb-2">Ningún turno seleccionado</h3>
            <p className="text-xs font-medium text-slate-500 max-w-sm leading-relaxed">
              Selecciona un día y un turno específico (T1 - T4) en el selector superior para comenzar a enviar recordatorios de WhatsApp.
            </p>
          </div>
        ) : (
          <>
            {/* Cabecera del Turno Seleccionado */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 bg-white shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge className="bg-blue-600 text-white text-[10px] py-0.5 px-2 uppercase font-bold tracking-wider rounded-md">
                    {selectedShiftDetails?.name}
                  </Badge>
                  {isSelectedHoliday && (
                    <Badge variant="destructive" className="text-[10px] py-0.5 px-2 uppercase font-bold tracking-wider rounded-md">
                      Feriado
                    </Badge>
                  )}
                </div>
                <h4 className="text-lg font-bold tracking-tight font-bold text-slate-800 capitalize">
                  {dateStr}
                </h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-800">{selectedShiftDetails?.time}</span>
                  <span>•</span>
                  <span>
                    Comité: {selectedCommittees.length === 1 ? selectedCommittees[0] : selectedCommittees.length > 1 ? `${selectedCommittees.length} seleccionados` : 'Todos'}
                  </span>
                </p>
              </div>
              
              <div className="shrink-0 flex items-center gap-2">
                <Badge variant="outline" className="bg-slate-50 text-slate-600 font-bold border-slate-200 text-xs py-1 px-3">
                  {activeVolunteers.length} Voluntarios
                </Badge>
              </div>
            </div>

            {/* Barra de Alternar Plantilla */}
            <div className="flex items-center justify-end bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplate(!showTemplate)}
                className="h-9 text-xs font-bold border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center gap-1.5"
              >
                {showTemplate ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    Ocultar Plantilla
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Ver Plantilla
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Lista de Voluntarios (Dos columnas) */}
              <div className={showTemplate ? "lg:col-span-8 space-y-4" : "lg:col-span-12 space-y-4"}>
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col overflow-hidden bg-white border border-slate-200 shadow-sm">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-xs uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-blue-600" />
                      Asistencias
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleCopyNumbers}
                      disabled={activeVolunteers.length === 0}
                      className="h-7 text-[10.5px] font-bold text-blue-600 hover:bg-slate-100 px-2 rounded-md"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar Teléfonos
                    </Button>
                  </div>

                  <div className="p-4 bg-slate-50/20 min-h-[320px] max-h-[500px] overflow-y-auto">
                    {activeVolunteers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                        <Users className="h-10 w-10 text-slate-500/40 mb-3" />
                        <p className="text-sm font-semibold">Sin resultados</p>
                        <p className="text-xs max-w-[200px] mt-1 leading-relaxed">No hay voluntarios de este comité asignados a este turno.</p>
                      </div>
                    ) : (
                      <div className={`grid grid-cols-1 md:grid-cols-2 ${showTemplate ? 'xl:grid-cols-2' : 'xl:grid-cols-3 2xl:grid-cols-4'} gap-3`}>
                        {activeVolunteers.map((vol) => {
                          const isConfirmed = !!confirmedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                          const msg = generateReminderMessage(
                            vol.name, 
                            dateStr ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) : "", 
                            selectedShiftDetails?.name || "", 
                            selectedShiftDetails?.time || "", 
                            vol.committee, 
                            isSelectedHoliday
                          );
                          const link = generateWaMeLink(vol.phone, msg);

                          return (
                            <div 
                              key={vol.id} 
                              className={`flex items-center justify-between group bg-white shadow-sm border rounded-lg px-2.5 py-2 hover:bg-slate-50 transition-colors ${
                                isConfirmed 
                                  ? 'border-teal-500/30 bg-teal-50/5' 
                                  : 'border-slate-200/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {/* Checkbox de Confirmación */}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); toggleConfirmed(vol.id); }}
                                  className="shrink-0 p-0.5 text-slate-500 hover:text-slate-800 transition-colors"
                                  title={isConfirmed ? "Marcar como pendiente" : "Confirmar asistencia"}
                                >
                                  {isConfirmed ? (
                                    <CheckSquare className="h-4 w-4 text-accent fill-accent/10" />
                                  ) : (
                                    <Square className="h-4 w-4 text-slate-500/80" />
                                  )}
                                </button>

                                {/* Dot similar al de turnos */}
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isConfirmed ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'
                                }`} />

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-sm font-medium text-slate-800 truncate transition-colors ${
                                      isConfirmed ? 'text-teal-900 font-bold' : ''
                                    }`}>
                                      {vol.name}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-slate-50 text-slate-500 font-semibold border-slate-200/60">
                                      {vol.committee}
                                    </Badge>
                                    {isConfirmed && (
                                      <Badge className="bg-accent/15 text-accent border border-accent/20 text-[8px] py-0 px-1 font-bold">
                                        CONFIRMADO
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{vol.phone} • {vol.ward}</p>
                                </div>
                              </div>

                              <button 
                                onClick={(e) => { e.stopPropagation(); window.open(link, '_blank', 'noopener,noreferrer'); }}
                                className="h-7 px-2 bg-[#25D366] hover:bg-[#1ebd5a] active:bg-[#128c7e] text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition-colors shadow-sm ml-2 shrink-0"
                              >
                                <Send className="h-2.5 w-2.5" />
                                WA
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Vista Previa del Mensaje (Condicional) */}
              {showTemplate && (
                <div className="lg:col-span-4 space-y-4">
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-hidden bg-white border border-slate-200 shadow-sm h-full flex flex-col">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-blue-600" />
                      <h3 className="text-xs uppercase font-black text-slate-500 tracking-wider">Mensaje Plantilla</h3>
                    </div>
                    <div className="p-4 bg-slate-50/20 flex-1 flex flex-col justify-between gap-4">
                      <div className="bg-sky-50 p-3.5 rounded-2xl rounded-tl-none border border-sky-100 shadow-sm text-[11px] text-sky-950 leading-relaxed whitespace-pre-wrap font-sans relative">
                        {previewMessage}
                        <div className="absolute top-0 -left-2 w-0 h-0 border-8 border-transparent border-r-sky-50 border-t-sky-50" />
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 text-[10px] text-slate-500 flex items-start gap-1.5 leading-normal">
                        <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <span>
                          Este mensaje se genera automáticamente reemplazando el nombre del voluntario, la fecha, y la hora del turno.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );
}
