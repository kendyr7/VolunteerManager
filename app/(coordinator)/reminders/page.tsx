'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTableFilter } from "@/components/DataTableFilter";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/ui/toast";
import { useSearch } from "@/lib/search-context";
import { motion, AnimatePresence } from "framer-motion";

// ─── tipos ────────────────────────────────────────────────────────────────────
type VolunteerType = {
  id: string; // UUID de Supabase
  name: string;
  stake: string;
  ward: string;
  phone: string;
  shifts: number;
  reliability: number;
  committee: string;
  committee_id?: string;
};

const getCommitteeColor = (committee: string) => {
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción')) return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-600 border-purple-500/20';
  if (comm.includes('auxilios')) return 'bg-teal-500/15 text-teal-600 border-teal-500/20';
  return 'bg-dark3 text-text-dim border-border';
};

export default function RemindersPage() {
  const supabase = createClient();
  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  const [volunteers, setVolunteers] = useState<VolunteerType[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [globalShifts, setGlobalShifts] = useState<Record<string, Record<string, string[]>>>({});
  const [loading, setLoading] = useState(true);

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

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

  const loadData = async () => {
    // Fetch volunteers
    const { data: volsData, error: volsError } = await supabase
      .from('volunteers')
      .select('*, committees(name)');

    if (volsError) {
      console.error("Error loading volunteers:", volsError);
    }

    // Fetch committees
    const { data: commsData, error: commsError } = await supabase
      .from('committees')
      .select('id, name');

    if (commsError) {
      console.error("Error loading committees:", commsError);
    } else if (commsData) {
      setCommitteesList(commsData);
    }

    // Fetch shifts
    const { data: shiftsData, error: shiftsError } = await supabase
      .from('shifts')
      .select('*');

    const sCounts: Record<string, number> = {};
    const gShifts: Record<string, Record<string, string[]>> = {};

    if (shiftsData) {
      shiftsData.forEach(s => {
        if (s.volunteer_id) {
          sCounts[s.volunteer_id] = (sCounts[s.volunteer_id] || 0) + 1;

          if (!gShifts[s.volunteer_id]) {
            gShifts[s.volunteer_id] = Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
          }
          if (!gShifts[s.volunteer_id][s.day_key]) {
            gShifts[s.volunteer_id][s.day_key] = [];
          }
          if (!gShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
            gShifts[s.volunteer_id][s.day_key].push(s.shift_key);
          }
        }
      });
    }

    setGlobalShifts(gShifts);

    if (volsData) {
      const mapped = volsData.map((v: any) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        stake: v.stake || '',
        ward: v.neighborhood || '',
        phone: v.phone || '',
        shifts: sCounts[v.id] || 0,
        reliability: v.reliability_score || 100,
        committee: v.committees?.name || 'Sin comité',
        committee_id: v.committee_id
      }));
      setVolunteers(mapped);
    }
  };

  // Estado del turno seleccionado (ninguno por defecto)
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Estado de los filtros y visualización de plantilla
  const { searchTerm } = useSearch();
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [showTemplate, setShowTemplate] = useState(false);

  // Escuchar actualizaciones del storage en caliente
  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== "undefined") {
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

  useEffect(() => {
    loadData().then(() => setLoading(false));
  }, []);

  // Calcular cantidad de voluntarios asignados por turno/día (respetando filtros)
  const shiftCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    EVENT_DAYS.forEach(day => {
      counts[day.key] = { T1: 0, T2: 0, T3: 0, T4: 0 };
      volunteers.forEach(vol => {
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
  }, [volunteers, globalShifts, EVENT_DAYS, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  // Obtener voluntarios asignados al turno seleccionado
  const activeVolunteers = useMemo(() => {
    if (!selectedDayKey || !selectedShiftId) return [];
    return volunteers.filter(vol => {
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
  }, [volunteers, globalShifts, selectedDayKey, selectedShiftId, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  // Reset page when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeVolunteers.length, selectedDayKey, selectedShiftId]);

  const totalPages = Math.max(1, Math.ceil(activeVolunteers.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const currentVolunteers = activeVolunteers.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

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

  const toggleConfirmed = (volId: string) => {
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
      showToast("No hay voluntarios en este turno para copiar.", "info");
      return;
    }
    const numbers = activeVolunteers.map(v => v.phone).join(", ");
    navigator.clipboard.writeText(numbers);
    showToast(`Se copiaron ${activeVolunteers.length} números`);
  };

  const stakes = useMemo(() => {
    const set = new Set<string>();
    volunteers.forEach(v => { if (v.stake) set.add(v.stake); });
    return Array.from(set).sort();
  }, [volunteers]);

  const wards = useMemo(() => {
    const set = new Set<string>();
    volunteers.forEach(v => { if (v.ward) set.add(v.ward); });
    return Array.from(set).sort();
  }, [volunteers]);

  const committees = committeesList.map(c => c.name);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0084d1]"></div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-6 flex flex-col min-h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)]">


      {/* Barra de Filtros Globales (Prioritaria) */}
      <div className="shrink-0 bg-dark2 border border-border rounded-sm shadow-sm overflow-hidden p-4 md:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
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
            showSearch
          />
          <DataTableFilter
            title="Barrio"
            options={wards}
            value={selectedWards}
            onChange={setSelectedWards}
            showSearch
          />
          {(selectedCommittees.length > 0 || selectedStakes.length > 0 || selectedWards.length > 0 || searchTerm) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedCommittees([]);
                setSelectedStakes([]);
                setSelectedWards([]);
              }}
              className="h-9 px-3 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-sm"
            >
              Limpiar Filtros
            </Button>
          )}
          {selectedDayKey && (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDayKey("");
                setSelectedShiftId("");
              }}
              className="h-9 px-3 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-250 hover:bg-rose-100 hover:text-rose-750 transition-colors shadow-sm rounded-sm ml-2"
            >
              Limpiar Selección
            </Button>
          )}
          
          <div className="w-full lg:w-auto flex items-center justify-end mt-2 lg:mt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplate(true)}
              className="w-full sm:w-auto h-9 px-3 text-xs font-bold border-border text-text-dim hover:text-[#0084d1] hover:bg-dark3 hover:border-[#0084d1]/30 transition-colors shadow-sm rounded-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
              Ver Plantilla
            </Button>
          </div>
        </div>
      </div>

      {/* Selector de Turnos Rediseñado en Dos Filas */}
      <div className="shrink-0 bg-dark2 border border-border rounded-sm shadow-sm overflow-hidden p-4 md:p-5 flex flex-col gap-4 md:gap-5">

        {/* FILA 1: FECHA */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-dim tracking-widest uppercase">FECHA</span>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:flex md:flex-wrap gap-2">
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
                  className={`relative shrink-0 flex flex-col items-center justify-center gap-1 p-2 md:px-4 md:py-2.5 rounded-lg md:rounded-sm border transition-all md:w-auto w-full ${isSelected
                      ? 'bg-[#0084d1] border-[#0084d1] text-white shadow-sm scale-105'
                      : 'bg-dark2 border-border text-text hover:bg-dark3'
                    }`}
                >
                  <span className={`text-[10px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-white/80' : 'text-text-dim'}`}>
                    {dayInitial}
                  </span>
                  <span className="text-base md:text-sm font-black leading-none">{day.dateNum}</span>
                  <div className={`w-1.5 h-1.5 rounded-full absolute top-1.5 right-1.5 md:static md:mt-1 ${totalVolunteersOnDay > 0 ? (isSelected ? 'bg-dark2' : 'bg-accent') : (isSelected ? 'bg-dark2/30' : 'bg-dark3')
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
          <span className="text-[10px] font-bold text-text-dim tracking-widest uppercase">TURNOS</span>
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
                  buttonClass = "bg-[#0084d1] border-[#0084d1] text-white shadow-sm scale-105 font-bold";
                  countTextClass = "text-sky-100/90";
                }
              } else {
                if (isSingleCommittee) {
                  const isUnderstaffed = count < minRequired;
                  if (isUnderstaffed) {
                    buttonClass = "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/20 hover:text-rose-700 font-bold";
                    countTextClass = "text-rose-500";
                  } else {
                    buttonClass = "bg-teal-50 border-teal-100 text-accent hover:bg-teal-100/20 hover:text-teal-700 font-bold";
                    countTextClass = "text-accent";
                  }
                } else {
                  // Estilo neutro vista global
                  if (count > 0) {
                    buttonClass = "bg-dark3 border-border text-text hover:bg-dark3 hover:text-text font-bold";
                    countTextClass = "text-text-dim";
                  } else {
                    buttonClass = "bg-dark2 border-border text-text-dim hover:bg-dark3";
                    countTextClass = "text-text-dim";
                  }
                }
              }

              // Si no hay día seleccionado, forzar un estilo atenuado y deshabilitar
              if (!selectedDayKey) {
                buttonClass = "bg-dark2 border-border text-text-dim opacity-60 cursor-not-allowed";
                countTextClass = "text-text-dim";
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
                  className={`shrink-0 inline-flex items-center gap-2.5 px-4.5 py-2.5 rounded-sm border text-xs transition-all ${buttonClass}`}
                >
                  <span className="font-bold">{t}</span>
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
      <div className="flex-1 min-h-0 flex flex-col">
        {!selectedDayKey || !selectedShiftId ? (
          <div className="flex-1 bg-dark2 border border-border rounded-sm shadow-sm overflow-hidden p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
            <span className="material-symbols-outlined text-[64px] text-text-dim mb-4 animate-pulse">calendar_month</span>
            <h3 className="text-lg font-bold tracking-tight text-text mb-2">Ningún turno seleccionado</h3>
            <p className="text-xs font-medium text-text-dim max-w-sm leading-relaxed">
              Selecciona un día y un turno específico (T1 - T4) en el selector superior para comenzar a enviar recordatorios de WhatsApp.
            </p>
          </div>
        ) : (
          <>
            {/* Lista de Voluntarios (Completa) */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-dark2 border border-border rounded-sm shadow-sm flex flex-col flex-1 overflow-hidden">
                  <div className="overflow-auto bg-dark2 flex-1 relative">
                    {activeVolunteers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-text-dim h-full">
                        <span className="material-symbols-outlined text-[48px] text-text-dim mb-4">group_off</span>
                        <p className="text-base font-bold text-text">Sin voluntarios asignados</p>
                        <p className="text-sm max-w-[250px] mt-1 text-text-dim">No hay voluntarios asignados a este turno para los filtros seleccionados.</p>
                      </div>
                    ) : (
                      <>
                        {/* Vista Mobile/Tablet: Tarjetas Expandibles */}
                        <div className="lg:hidden flex flex-col bg-dark3">
                          <div>
                            <AnimatePresence mode="popLayout">
                              {currentVolunteers.map((vol) => {
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
                                  <motion.div
                                    key={vol.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className={cn(
                                      "mb-px bg-dark2 border-b border-border transition-all duration-200",
                                      expandedId === vol.id && "ring-1 ring-[#4d7cfe]/20 shadow-sm z-10",
                                      isConfirmed && "bg-[#6dd230]/5"
                                    )}
                                  >
                                    <div
                                      className="p-4 flex items-center justify-between cursor-pointer active:bg-dark3"
                                      onClick={() => setExpandedId(expandedId === vol.id ? null : vol.id)}
                                    >
                                      <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${isConfirmed ? 'bg-[#6dd230] shadow-[0_0_8px_rgba(109,210,48,0.3)]' : 'bg-dark3'}`} />
                                        <div className="flex flex-col min-w-0">
                                          <span className="font-bold text-text text-[15px] truncate">{vol.name}</span>
                                          <div className="flex mt-0.5 items-center gap-2">
                                            <Badge variant="outline" className={cn("font-bold px-1.5 py-0 text-[9px] h-4 uppercase tracking-tighter", getCommitteeColor(vol.committee))}>
                                              {vol.committee}
                                            </Badge>
                                            {isConfirmed && (
                                              <Badge variant="secondary" className="bg-accent/10 text-accent font-bold px-1.5 py-0 text-[9px] h-4 uppercase tracking-tighter border-none">
                                                Confirmado
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0 ml-2">
                                        <motion.span
                                          animate={{ rotate: expandedId === vol.id ? 180 : 0 }}
                                          className="material-symbols-outlined text-text-dim text-[20px]"
                                        >
                                          expand_more
                                        </motion.span>
                                      </div>
                                    </div>

                                    <AnimatePresence>
                                      {expandedId === vol.id && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: "auto", opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          className="overflow-hidden border-t border-border"
                                        >
                                          <div className="p-4 pt-2 space-y-4">
                                            <div className="grid grid-cols-2 gap-4 p-3 bg-dark3 rounded-xl">
                                              <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Barrio / Estaca</span>
                                                <p className="text-xs font-bold text-text leading-tight">
                                                  {vol.ward || '—'} <br />
                                                  <span className="text-text-dim font-medium">{vol.stake || '—'}</span>
                                                </p>
                                              </div>
                                              <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Estado</span>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                  {isConfirmed ? (
                                                    <Badge variant="outline" className="bg-[#6dd230]/10 text-[#6dd230] border-[#6dd230]/20 font-bold uppercase text-[10px] tracking-widest px-2">
                                                      Confirmado
                                                    </Badge>
                                                  ) : (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 font-bold uppercase text-[10px] tracking-widest px-2">
                                                      Pendiente
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row items-center gap-2">
                                              <Button
                                                variant="outline"
                                                className="w-full sm:flex-1 h-11 gap-2 text-[#25D366] hover:bg-[#25D366] hover:text-white border-border bg-dark2 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  window.open(link, '_blank');
                                                }}
                                              >
                                                <span className="material-symbols-outlined text-[20px]">send</span>
                                                WHATSAPP
                                              </Button>
                                              <Button
                                                className={cn(
                                                  "w-full sm:flex-1 h-11 gap-2 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all",
                                                  isConfirmed
                                                    ? "bg-dark3 text-text-dim hover:bg-dark3"
                                                    : "bg-[#6dd230] text-white hover:bg-[#5bbd24]"
                                                )}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleConfirmed(vol.id);
                                                }}
                                              >
                                                <span className="material-symbols-outlined text-[20px]">{isConfirmed ? 'close' : 'check'}</span>
                                                {isConfirmed ? 'DESMARCAR' : 'CONFIRMAR ASISTENCIA'}
                                              </Button>
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </motion.div>
                                );
                              })}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Desktop Table (Hidden on small screens) */}
                        <div className="hidden lg:block">
                          <Table>
                            <TableHeader className="bg-dark3 border-b border-border">
                              <TableRow className="hover:bg-transparent">
                            <TableHead className="font-medium text-text-dim text-center pl-8 w-16">Asist.</TableHead>
                            <TableHead className="font-medium text-text-dim text-center w-32">Estado</TableHead>
                            <TableHead className="font-medium text-text-dim">Nombre y Apellido</TableHead>
                            <TableHead className="font-medium text-text-dim text-center">Barrio</TableHead>
                            <TableHead className="font-medium text-text-dim text-center">Estaca</TableHead>
                            <TableHead className="font-medium text-text-dim text-center pr-8">Comité</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <AnimatePresence mode="popLayout">
                            {currentVolunteers.map((vol) => {
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
                                <motion.tr 
                                  key={vol.id}
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  onClick={() => toggleConfirmed(vol.id)}
                                  className={cn(
                                    "border-border hover:bg-dark3 transition-colors cursor-pointer",
                                    isConfirmed && "bg-[#6dd230]/5 hover:bg-[#6dd230]/10"
                                  )}
                                >
                                  <TableCell className="pl-8 text-center">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleConfirmed(vol.id); }}
                                      className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90 mx-auto",
                                        isConfirmed 
                                          ? "bg-accent text-white shadow-sm shadow-accent/30" 
                                          : "bg-dark3 border border-border text-transparent hover:border-[#4d7cfe] group-hover:border-[#4d7cfe]/50"
                                      )}
                                    >
                                      <span className="material-symbols-outlined text-[16px] font-bold">
                                        check
                                      </span>
                                    </button>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {!isConfirmed ? (
                                      <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 font-bold uppercase text-[10px] tracking-widest px-2.5 py-0.5">
                                        Pendiente
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 font-bold uppercase text-[10px] tracking-widest px-2.5 py-0.5">
                                        Confirmado
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-bold text-text">
                                    <div className="flex items-center gap-2">
                                      <span className={isConfirmed ? "text-text" : "text-text"}>
                                        {vol.name}
                                      </span>
                                      <a 
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center justify-center h-8 w-8 text-[#25D366] hover:bg-dark3 transition-all active:scale-90 rounded-sm"
                                        title="Enviar recordatorio WhatsApp"
                                      >
                                        <span className="material-symbols-outlined text-[20px]">send</span>
                                      </a>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-text text-center">{vol.ward}</TableCell>
                                  <TableCell className="text-text-dim text-center">{vol.stake}</TableCell>
                                  <TableCell className="text-center pr-8">
                                    <Badge variant="outline" className={cn("font-bold px-2.5 py-0.5", getCommitteeColor(vol.committee))}>
                                      {vol.committee}
                                    </Badge>
                                  </TableCell>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="bg-dark3 border-t border-border px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                      <p className="text-xs text-text-dim font-medium text-center sm:text-left">
                        Mostrando {(safeCurrentPage - 1) * itemsPerPage + 1} - {Math.min(safeCurrentPage * itemsPerPage, activeVolunteers.length)} de {activeVolunteers.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safeCurrentPage === 1}
                          className="h-8 text-xs font-bold"
                        >
                          Anterior
                        </Button>
                        <div className="text-xs font-bold text-text-dim px-2">
                          {safeCurrentPage} / {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safeCurrentPage === totalPages}
                          className="h-8 text-xs font-bold"
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <Sheet open={showTemplate} onOpenChange={setShowTemplate}>
        <SheetContent side="right" className="w-full sm:w-[40vw] bg-dark2 p-0 flex flex-col border-l border-border shadow-2xl">
          <SheetHeader className="p-6 border-b border-border bg-dark3">
            <SheetTitle className="text-xl font-bold text-text flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0084d1]">chat_bubble</span>
              Mensaje Plantilla
            </SheetTitle>
          </SheetHeader>
          <div className="p-6 flex-1 flex flex-col gap-6 bg-dark2 overflow-y-auto">
            <div className="bg-sky-50/80 p-5 rounded-md rounded-tl-none border border-sky-100 shadow-sm text-sm text-sky-950 leading-relaxed whitespace-pre-wrap font-sans relative">
              {previewMessage}
              <div className="absolute top-0 -left-2 w-0 h-0 border-[10px] border-transparent border-r-sky-50 border-t-sky-50" />
            </div>

            <div className="p-4 rounded-sm bg-dark3 border border-border text-xs text-text-dim flex items-start gap-2 leading-relaxed">
              <span className="material-symbols-outlined text-[18px] text-blue-500 shrink-0 mt-0.5">info</span>
              <span>
                Este mensaje se genera automáticamente para cada voluntario. 
                Los datos como el nombre, la fecha y la hora del turno se rellenan automáticamente 
                al hacer clic en enviar WhatsApp.
              </span>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
}
