'use client'

import { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, Pencil, Clock, Search, Phone, Calendar, MapPin, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DataTableFilter } from "@/components/DataTableFilter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

// ─── datos mock ───────────────────────────────────────────────────────────────
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

const getShiftColor = (shiftId: string, count: number, isSingleCommittee: boolean, minRequired: number) => {
  if (!isSingleCommittee) {
    // Estilo neutro para vista global (blanco con bordes finos)
    return { 
      card: 'bg-white',  
      border: 'border-slate-200/60 shadow-sm',  
      title: 'text-slate-800',  
      badge: 'bg-slate-100 text-slate-500 border border-slate-200/50',  
      dot: 'bg-border-strong' 
    };
  }
  
  const isUnderstaffed = count < minRequired;

  if (isUnderstaffed) {
    return { card: 'bg-rose-500/5',  border: 'border-rose-400/20 shadow-sm',  title: 'text-slate-800',  badge: 'bg-rose-400/15 text-rose-600 border border-rose-200/50',  dot: 'bg-rose-400' };
  } else {
    return { card: 'bg-teal-500/5',  border: 'border-teal-400/20 shadow-sm',  title: 'text-slate-800',  badge: 'bg-teal-400/15 text-teal-600 border border-teal-200/50',  dot: 'bg-teal-400' };
  }
};

// ─── página ───────────────────────────────────────────────────────────────────
export default function ShiftsPage() {
  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee && role !== 'Admin') {
      setSelectedCommittees([committee]);
    }
  }, []);

  // Estados del Sheet de Perfil
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);

  // Estado para expandir las listas de voluntarios por turno
  const [expandedShifts, setExpandedShifts] = useState<Record<string, boolean>>({});

  const toggleShiftExpand = (dayKey: string, shiftKey: string) => {
    const combinedKey = `${dayKey}-${shiftKey}`;
    setExpandedShifts(prev => ({ ...prev, [combinedKey]: !prev[combinedKey] }));
  };

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  // Global state for mock assignments so they can be edited and persisted within the session
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
          console.error("Error loading committee requirements in init", e);
        }
      }
    }
    return defaults;
  });

  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("committee_requirements");
        if (stored) {
          try {
            setCommitteeRequirements(prev => ({ ...prev, ...JSON.parse(stored) }));
          } catch (e) {
            console.error("Error updating committee requirements", e);
          }
        }
      }
    };

    // Escuchar el evento storage por si se cambia en otra pestaña, y ejecutar al montar
    handleUpdate();
    window.addEventListener("storage", handleUpdate);
    window.addEventListener("focus", handleUpdate); // Cargar al regresar al tab
    return () => {
      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener("focus", handleUpdate);
    };
  }, []);

  // Determinar si hay un único comité seleccionado
  const isSingleCommittee = selectedCommittees.length === 1;
  const activeCommittee = isSingleCommittee ? selectedCommittees[0] : null;

  const kpiData = useMemo(() => {
    let totalRequired = 0;
    let totalAssignedInRequired = 0;
    
    const committeeAlerts: Record<string, number> = {};
    committees.forEach(c => {
      committeeAlerts[c] = 0;
    });

    let totalAlertsCount = 0;
    let editorMissingVolunteers = 0;
    let editorShiftsOk = 0;
    let editorShiftsUnderstaffed = 0;

    const targetCommittees = currentRole === 'Admin' ? committees : (activeCommittee ? [activeCommittee] : []);

    EVENT_DAYS.forEach(day => {
      targetCommittees.forEach(comm => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          totalRequired += req;

          // Buscar cuántos voluntarios asignados pertenecen a este comité y turno hoy
          const count = allVolunteers.filter(vol => {
            if (vol.committee !== comm) return false;
            const shifts = globalShifts[vol.id];
            return shifts && shifts[day.key] && shifts[day.key].includes(shiftId);
          }).length;

          totalAssignedInRequired += Math.min(count, req);

          if (count < req) {
            committeeAlerts[comm] = (committeeAlerts[comm] ?? 0) + 1;
            totalAlertsCount++;
            if (currentRole !== 'Admin') {
              editorShiftsUnderstaffed++;
              editorMissingVolunteers += (req - count);
            }
          } else if (req > 0) {
            if (currentRole !== 'Admin') {
              editorShiftsOk++;
            }
          }
        });
      });
    });

    const coverage = totalRequired > 0 ? Math.round((totalAssignedInRequired / totalRequired) * 100) : 100;
    return {
      coverage,
      committeeAlerts,
      totalAlertsCount,
      editorMissingVolunteers,
      editorShiftsOk,
      editorShiftsUnderstaffed
    };
  }, [globalShifts, committeeRequirements, EVENT_DAYS, currentRole, activeCommittee]);

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(buildEmptyShifts);

  const toggleShift = (day: string, turno: string) => {
    if (!isEditingShifts && currentRole !== 'Lector') return;
    setShiftsByDay(prev => {
      const current = prev[day] ?? [];
      return {
        ...prev,
        [day]: current.includes(turno)
          ? current.filter(t => t !== turno)
          : [...current, turno],
      };
    });
  };

  const handleSaveShifts = () => {
    setIsEditingShifts(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    if (editingVolunteer) {
      setGlobalShifts(prev => {
        const updated = {
          ...prev,
          [editingVolunteer.id]: shiftsByDay
        };
        if (typeof window !== "undefined") {
          localStorage.setItem("volunteer_assignments", JSON.stringify(updated));
        }
        return updated;
      });
    }
  };

  const isVolunteerAssignedToShift = (vol: VolunteerType, dateKey: string, shiftId: string) => {
    const shifts = globalShifts[vol.id];
    return shifts && shifts[dateKey] && shifts[dateKey].includes(shiftId);
  };

  const handleEditClick = (vol: VolunteerType) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);
    
    setShiftsByDay(globalShifts[vol.id] || buildEmptyShifts());
  };

  // qué días están expandidos (todos colapsados al inicio)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleDay = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  // Aplicar filtros
  const filteredVolunteers = useMemo(() => {
    return allVolunteers.filter(v => {
      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            v.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            v.ward.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  // Lógica determinista para asignar voluntarios a los turnos basándose en los filtros actuales
  const getAssignedVolunteers = (dateKey: string, shiftId: string) => {
    return filteredVolunteers
      .filter(vol => isVolunteerAssignedToShift(vol, dateKey, shiftId))
      .sort((a, b) => a.committee.localeCompare(b.committee));
  };

  const renderDayCard = (dayObj: typeof EVENT_DAYS[0]) => {
    const { date, key, dateNum } = dayObj;
    const dayName = format(date, "EEEE", { locale: es });
    const monthName = format(date, "d 'de' MMMM", { locale: es });
    const isOpen = !!expanded[key];

    const shiftData = {
      T1: getAssignedVolunteers(key, 'T1'),
      T2: getAssignedVolunteers(key, 'T2'),
      T3: getAssignedVolunteers(key, 'T3'),
      T4: getAssignedVolunteers(key, 'T4'),
    };
    const totalVolsOnDay = (['T1','T2','T3','T4'] as const).reduce((acc, t) => acc + shiftData[t].length, 0);

    return (
      <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden h-fit self-start w-full">
        <button
          onClick={() => toggleDay(key)}
          className="w-full flex items-stretch bg-slate-100 hover:bg-slate-100/80 transition-colors text-left"
        >
          {/* Left: full-height white date section */}
          <div className="shrink-0 w-16 flex flex-col items-center justify-center bg-white py-4 px-2">
            <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest leading-none">
              {format(date, "EEE", { locale: es }).replace('.', '')}
            </p>
            <p className="text-lg font-bold text-slate-800 leading-tight mt-0.5">{dateNum}</p>
            <p className="text-[8px] text-slate-500 font-semibold uppercase tracking-wider leading-none">Sept</p>
          </div>

          {/* Vertical divider */}
          <div className="w-px bg-border/60 shrink-0" />

          {/* Right: chips + total */}
          <div className="flex-1 min-w-0 flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex gap-1.5 flex-wrap">
                {(['T1','T2','T3','T4'] as const).map(t => {
                  const count = shiftData[t].length;
                  const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;
                  const c = getShiftColor(t, count, isSingleCommittee, minRequired);
                  return (
                    <span key={t} className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-xl border transition-all ${c.badge} ${c.border}`}>
                      <span className="font-extrabold">{t}</span>
                      <span className="opacity-25 text-xs">|</span>
                      <span className="font-bold tabular-nums">{isSingleCommittee ? `${count}/${minRequired}` : count}</span>
                    </span>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide">
                Total{' '}
                <span className={`font-black ${totalVolsOnDay > 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                  {totalVolsOnDay}
                </span>
                {' '}voluntarios
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className={`w-2 h-2 rounded-full ${totalVolsOnDay > 0 ? 'bg-teal-400' : 'bg-border'}`} />
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-slate-500" />
                : <ChevronRight className="h-4 w-4 text-slate-500" />
              }
            </div>
          </div>
        </button>

        {isOpen && (
          <div className="grid grid-cols-2 gap-3 p-4 items-start">
            {(['T1','T2','T3','T4'] as const).map(t => {
              const info = SHIFT_TIMES[parseInt(t[1]) - 1];
              const vols = shiftData[t];
              const count = vols.length;
              const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;
              const c = getShiftColor(t, count, isSingleCommittee, minRequired);
              const combinedKey = `${key}-${t}`;
              const isShiftExpanded = !!expandedShifts[combinedKey];
              const displayedVols = isShiftExpanded ? vols : vols.slice(0, 10);
              const hiddenCount = vols.length - displayedVols.length;
              
              return (
                <div key={t} className={`rounded-xl border p-3 h-fit ${c.card} ${c.border}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Clock className={`h-3 w-3 ${c.title}`} />
                        <p className={`text-[10px] font-black uppercase tracking-widest ${c.title}`}>
                          Turno {t[1]}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{info?.time}</p>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>
                      {isSingleCommittee ? `${count} / ${minRequired}` : `${count} Vol.`}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {vols.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic">Sin voluntarios asignados</p>
                    ) : currentRole === 'Lector' ? (
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-slate-500 font-medium italic">Lista de nombres oculta por privacidad.</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          {displayedVols.map(vol => (
                            <div 
                              key={vol.id} 
                              className="flex items-center justify-between group bg-white shadow-sm border border-slate-200/50 rounded-lg px-2.5 py-2 hover:bg-slate-100 transition-colors cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); handleEditClick(vol); }}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                                <span className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                                  {vol.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-white text-slate-500 font-semibold border-slate-200/60">
                                  {vol.committee}
                                </Badge>
                                <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    handleEditClick(vol);
                                    setTimeout(() => setIsEditingShifts(true), 0);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-md border border-slate-200" 
                                  title={`Editar turnos de ${vol.name}`}
                                >
                                  <Pencil className="h-3 w-3 text-slate-500 hover:text-slate-800" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {vols.length > 10 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleShiftExpand(key, t); }}
                            className="w-full mt-2 py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-dashed border-slate-200/60"
                          >
                            {isShiftExpanded ? (
                              <>Ver menos <ChevronDown className="h-3.5 w-3.5 rotate-180" /></>
                            ) : (
                              <>Ver {hiddenCount} más <ChevronDown className="h-3.5 w-3.5" /></>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (currentRole === 'Lector') {
    const mockLector = {
      name: 'Voluntario de Prueba',
      committee: activeCommittee || 'Historia',
      phone: '8888-8888',
      ward: 'Barrio Central',
      stake: 'Managua',
      reliability: 100
    };

    const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
    const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-1">Mi Perfil</h2>
          <p className="text-slate-500 text-sm font-medium">Gestiona tu información personal y selecciona tus turnos de servicio.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 sm:p-8 space-y-8">
          {/* Profile Card */}
          <div className="flex flex-col bg-slate-50 p-6 sm:p-8 rounded-2xl border border-slate-200 gap-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight leading-tight mb-3">
                  {mockLector.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#0084d1] text-white border-none text-[10px] px-2 uppercase font-bold tracking-wide">
                    Voluntario
                  </Badge>
                  <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px] px-2 font-medium bg-white">
                    Comité: {mockLector.committee}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="h-[1px] w-full bg-slate-200/60" />

            {/* Datos de Perfil */}
            <div>
              <h4 className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest mb-4">Datos Personales</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Phone className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Celular</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{mockLector.phone}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Edad</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">27</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Barrio</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{mockLector.ward}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Estaca</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{mockLector.stake}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[1px] w-full bg-border" />

          {/* Resumen de Turnos */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <h4 className="text-xs font-bold text-[#0084d1] uppercase tracking-widest">Mis Turnos</h4>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-[#0084d1] border border-[#006eb3]" />
                    <span className="text-[10px] text-slate-500 font-bold">Seleccionado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-slate-100 border border-slate-200" />
                    <span className="text-[10px] text-slate-500 font-bold">Sin asignar</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {saved && (
                  <span className="text-[11px] text-teal-600 font-bold animate-pulse">✓ Guardado</span>
                )}
                <Button 
                  onClick={() => {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2500);
                  }}
                  className="h-9 w-full sm:w-auto bg-[#0084d1] hover:bg-[#006eb3] text-white text-xs px-5 rounded-xl font-bold shadow-sm"
                >
                  Guardar Cambios
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mb-6">Toca un turno para activarlo o desactivarlo. Asegúrate de guardar tus cambios.</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-black text-slate-800">{totalTurnos}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Turnos</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-black text-slate-800">{diasCubiertos}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Días</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start">
              {/* Columna Izquierda (Días impares) */}
              <div className="flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                {EVENT_DAYS.filter((_, i) => i % 2 === 0).map((d) => (
                  <div key={d.key} className="flex flex-col sm:flex-row sm:items-stretch border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                    {/* Left: date panel */}
                    <div className="shrink-0 sm:w-20 flex sm:flex-col items-center justify-center py-3 px-4 gap-1 sm:gap-0">
                      <p className="text-[10px] font-black text-[#0084d1] uppercase tracking-widest leading-none">
                        {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                      </p>
                      <p className="text-xl sm:text-2xl font-black text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none hidden sm:block">Sept</p>
                    </div>

                    {/* Right: shift buttons */}
                    <div className="flex items-center justify-between gap-2 flex-1 px-4 py-3 sm:py-4">
                      {['T1', 'T2', 'T3', 'T4'].map((t) => {
                        const active = (shiftsByDay[d.key] ?? []).includes(t);
                        const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];
                        return (
                          <button
                            key={t}
                            onClick={() => toggleShift(d.key, t)}
                            className={`flex-1 inline-flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-all cursor-pointer ${
                              active
                                ? 'bg-[#0084d1] text-white shadow-md shadow-blue-900/10 scale-[1.02] active:scale-95'
                                : 'bg-slate-100/70 text-slate-500 hover:bg-slate-200/60 active:scale-95'
                            }`}
                          >
                            <span className="text-sm font-black">{t}</span>
                            <span className={`text-[8px] font-bold tracking-tight mt-0.5 whitespace-nowrap ${active ? 'text-white/90' : 'text-slate-400'}`}>
                              {shiftInfo?.time}
                            </span>
                          </button>
                        );
                      })}
                      {/* Status Dot */}
                      <div className={`shrink-0 w-2 h-2 rounded-full ml-1 ${(shiftsByDay[d.key]?.length ?? 0) > 0 ? 'bg-teal-400' : 'bg-transparent'}`} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Columna Derecha (Días pares) */}
              <div className="flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                {EVENT_DAYS.filter((_, i) => i % 2 === 1).map((d) => (
                  <div key={d.key} className="flex flex-col sm:flex-row sm:items-stretch border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                    {/* Left: date panel */}
                    <div className="shrink-0 sm:w-20 flex sm:flex-col items-center justify-center py-3 px-4 gap-1 sm:gap-0">
                      <p className="text-[10px] font-black text-[#0084d1] uppercase tracking-widest leading-none">
                        {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                      </p>
                      <p className="text-xl sm:text-2xl font-black text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none hidden sm:block">Sept</p>
                    </div>

                    {/* Right: shift buttons */}
                    <div className="flex items-center justify-between gap-2 flex-1 px-4 py-3 sm:py-4">
                      {['T1', 'T2', 'T3', 'T4'].map((t) => {
                        const active = (shiftsByDay[d.key] ?? []).includes(t);
                        const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];
                        return (
                          <button
                            key={t}
                            onClick={() => toggleShift(d.key, t)}
                            className={`flex-1 inline-flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-all cursor-pointer ${
                              active
                                ? 'bg-[#0084d1] text-white shadow-md shadow-blue-900/10 scale-[1.02] active:scale-95'
                                : 'bg-slate-100/70 text-slate-500 hover:bg-slate-200/60 active:scale-95'
                            }`}
                          >
                            <span className="text-sm font-black">{t}</span>
                            <span className={`text-[8px] font-bold tracking-tight mt-0.5 whitespace-nowrap ${active ? 'text-white/90' : 'text-slate-400'}`}>
                              {shiftInfo?.time}
                            </span>
                          </button>
                        );
                      })}
                      {/* Status Dot */}
                      <div className={`shrink-0 w-2 h-2 rounded-full ml-1 ${(shiftsByDay[d.key]?.length ?? 0) > 0 ? 'bg-teal-400' : 'bg-transparent'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-800 tracking-tight mb-1">Turnos</h2>
        <p className="text-sm font-medium text-slate-500">Vista de asistencia diaria por turno de voluntarios.</p>
      </div>

      {/* Panel de KPIs / Control de Admin */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI Cobertura */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 flex flex-col justify-between bg-white shadow-sm border border-slate-200">
          <div>
            <h3 className="text-xs uppercase font-black text-slate-500 tracking-wider mb-1">Cobertura de Requerimientos</h3>
            <p className="text-body-xs text-slate-500 mb-4">Porcentaje de slots cubiertos según el mínimo requerido por comité.</p>
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-3xl font-extrabold tracking-tight font-black text-slate-800 leading-none">{kpiData.coverage}%</span>
            <div className="w-2/3 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
              <div 
                className={`h-full transition-all duration-500 ${kpiData.coverage < 60 ? 'bg-rose-500' : kpiData.coverage < 90 ? 'bg-amber-500' : 'bg-teal-500'}`}
                style={{ width: `${kpiData.coverage}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI Alertas Críticas por Comité */}
        {currentRole === 'Admin' ? (
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/40 shrink-0">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs uppercase font-black text-slate-500 tracking-wider">Turnos Incompletos por Comité</h3>
                  <div className="relative group cursor-pointer inline-flex items-center">
                    <Info className="h-3.5 w-3.5 text-slate-500 hover:text-slate-800 transition-colors" />
                    <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-64 sm:w-72 p-3 bg-slate-900 border border-slate-800 text-[11.5px] text-slate-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                      <p className="font-bold mb-1 text-sky-400">¿Cómo funciona el contador?</p>
                      <p className="leading-relaxed">
                        Este número representa la cantidad de turnos de todo el evento que están por debajo del mínimo requerido.
                        <strong className="text-white"> El contador disminuirá únicamente cuando agregues el mínimo completo de voluntarios </strong>
                        configurado para ese turno en Ajustes. Asignar solo un voluntario no reducirá la alerta si el mínimo es mayor.
                      </p>
                      <div className="absolute bottom-full left-4 sm:left-1/2 sm:-translate-x-1/2 -mb-1 border-4 border-transparent border-b-slate-900" />
                    </div>
                  </div>
                </div>
                <p className="text-body-xs text-slate-500 font-medium mt-0.5">Alertas activas donde no se cumple con el mínimo requerido.</p>
              </div>
              <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-200/50 font-bold">
                {kpiData.totalAlertsCount} Alertas en Total
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {committees.map(comm => {
                const alertCount = kpiData.committeeAlerts[comm] ?? 0;
                const isSelected = selectedCommittees.includes(comm);
                return (
                  <button
                    key={comm}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedCommittees(prev => prev.filter(c => c !== comm));
                      } else {
                        setSelectedCommittees([comm]); // Filtrar solo por este comité
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? 'bg-blue-600/10 border-blue-600 text-slate-800 shadow-sm' 
                        : alertCount > 0 
                          ? 'bg-rose-500/5 border-rose-200/40 hover:bg-rose-500/10 text-slate-800' 
                          : 'bg-white hover:bg-slate-100 border-slate-200/40 text-slate-500'
                    }`}
                  >
                    <span className="text-xs font-bold truncate pr-1">{comm}</span>
                    {alertCount > 0 ? (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {alertCount}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-teal-600 bg-teal-500/10 px-1.5 py-0.5 rounded-full">
                        OK
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 flex flex-col justify-center">
             <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200/40 shrink-0">
               <div>
                 <h3 className="text-xs uppercase font-black text-slate-500 tracking-wider">Estado de Reclutamiento</h3>
                 <p className="text-body-xs text-slate-500 font-medium mt-0.5">Resumen de asignaciones para tu comité.</p>
               </div>
               <Badge variant="outline" className={kpiData.editorMissingVolunteers > 0 ? "bg-rose-500/10 text-rose-600 border-rose-200/50 font-bold" : "bg-teal-500/10 text-teal-600 border-teal-200/50 font-bold"}>
                 {kpiData.editorMissingVolunteers > 0 ? `Faltan ${kpiData.editorMissingVolunteers} Voluntarios` : "Reclutamiento Completo"}
               </Badge>
             </div>
             
             <div className="flex gap-4">
               <div className="flex-1 bg-teal-50/50 rounded-xl border border-teal-100/50 p-4">
                 <p className="text-[10px] uppercase font-bold text-teal-600 mb-1">Turnos Cubiertos</p>
                 <p className="text-3xl font-black text-teal-700 leading-none">{kpiData.editorShiftsOk}</p>
               </div>
               <div className="flex-1 bg-rose-50/50 rounded-xl border border-rose-100/50 p-4">
                 <p className="text-[10px] uppercase font-bold text-rose-600 mb-1">Turnos Incompletos</p>
                 <p className="text-3xl font-black text-rose-700 leading-none">{kpiData.editorShiftsUnderstaffed}</p>
               </div>
             </div>
          </div>
        )}
      </div>

      {/* Barra de Filtros (Igual a Volunteers) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <Input 
              placeholder="Buscar por nombre, estaca o barrio..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-white input-base text-slate-800 border-slate-200 focus:ring-2 focus:ring-gold-faint"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {currentRole === 'Admin' && (
              <DataTableFilter
                title="Comité"
                options={committees}
                value={selectedCommittees}
                onChange={setSelectedCommittees}
              />
            )}
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
          </div>
        </div>
      </div>

      {/* Grid de días (Flex Column Layout para no alinear alturas) */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        {/* Columna Izquierda (Días impares: 1, 3, 5...) */}
        <div className="flex-1 flex flex-col gap-4 w-full">
          {EVENT_DAYS.filter((_, i) => i % 2 === 0).map(renderDayCard)}
        </div>
        
        {/* Columna Derecha (Días pares: 2, 4, 6...) */}
        <div className="flex-1 flex flex-col gap-4 w-full">
          {EVENT_DAYS.filter((_, i) => i % 2 === 1).map(renderDayCard)}
        </div>
      </div>

      {/* Editor Lateral */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="right"
          style={{ width: '620px', maxWidth: '95vw' }}
          className="bg-white text-slate-800 border-l border-slate-200 p-0 overflow-y-auto"
        >
          {editingVolunteer && (
            <div className="p-7 space-y-7">
              {/* Profile Card */}
              <div className="flex flex-col bg-slate-50 p-6 rounded-2xl border border-slate-200 gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight leading-tight mb-3">
                      {editingVolunteer.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#0084d1] text-white border-none text-[10px] px-2 uppercase font-bold tracking-wide">
                        Voluntario
                      </Badge>
                      <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px] px-2 font-medium bg-white">
                        Comité: {editingVolunteer.committee}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="h-[1px] w-full bg-slate-200/60" />

                {/* Datos de Perfil */}
                <div>
                  <h4 className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest mb-4">Datos Personales</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Celular</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{editingVolunteer.phone}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Edad</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">27</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Barrio</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{editingVolunteer.ward}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Estaca</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{editingVolunteer.stake}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen de Turnos */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <h4 className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest">Resumen de Turnos</h4>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-[#0084d1] border border-[#006eb3]" />
                        <span className="text-[10px] text-slate-500 font-bold">Seleccionado</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-slate-100 border border-slate-200" />
                        <span className="text-[10px] text-slate-500 font-bold">Sin asignar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {saved && (
                      <span className="text-[11px] text-teal-600 font-bold animate-pulse shrink-0">✓ Guardado</span>
                    )}
                    {isEditingShifts ? (
                      <Button onClick={handleSaveShifts} className="h-9 w-full sm:w-auto bg-[#0084d1] hover:bg-[#006eb3] text-white text-xs px-5 rounded-xl font-bold shadow-sm">
                        Guardar Cambios
                      </Button>
                    ) : (
                      <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} className="h-9 w-full sm:w-auto bg-[#0084d1] hover:bg-[#006eb3] text-white text-xs px-5 rounded-xl font-bold shadow-sm">
                        Editar Turnos
                      </Button>
                    )}
                  </div>
                </div>
                {isEditingShifts && (
                  <p className="text-[11px] text-slate-500 font-medium mb-5">Toca un turno para activarlo o desactivarlo. Asegúrate de guardar tus cambios.</p>
                )}

                {/* Stats rápidas */}
                {(() => {
                  const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                  const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
                  return (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-3xl font-black text-slate-800">{totalTurnos}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Turnos</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-3xl font-black text-slate-800">{diasCubiertos}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Días</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className={`text-3xl font-black ${editingVolunteer.reliability >= 80 ? 'text-teal-600' : 'text-amber-500'}`}>
                          {editingVolunteer.reliability}%
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Confiab.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline por día */}
                <div className={`flex flex-col border border-slate-200 rounded-2xl overflow-hidden shadow-sm ${
                  isEditingShifts ? 'bg-white' : 'bg-slate-50/50 opacity-80'
                }`}>
                  {(isEditingShifts ? EVENT_DAYS : EVENT_DAYS.filter(d => (shiftsByDay[d.key]?.length ?? 0) > 0)).map((d) => (
                    <div key={d.key} className={`flex flex-col sm:flex-row sm:items-stretch border-b border-slate-100 last:border-b-0 transition-colors ${
                      isEditingShifts ? 'hover:bg-slate-50/50' : ''
                    }`}>
                      {/* Left: date panel */}
                      <div className="shrink-0 sm:w-20 flex sm:flex-col items-center justify-center py-3 px-4 gap-1 sm:gap-0">
                        <p className="text-[10px] font-black text-[#0084d1] uppercase tracking-widest leading-none">
                          {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                        </p>
                        <p className="text-xl sm:text-2xl font-black text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none hidden sm:block">Sept</p>
                      </div>

                      {/* Right: shift buttons */}
                      <div className="flex items-center justify-between gap-2 flex-1 px-4 py-3 sm:py-4">
                        {['T1', 'T2', 'T3', 'T4'].map((t) => {
                          const active = (shiftsByDay[d.key] ?? []).includes(t);
                          const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];
                          return (
                            <button
                              key={t}
                              onClick={() => toggleShift(d.key, t)}
                              className={`flex-1 inline-flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-all ${
                                active
                                  ? 'bg-[#0084d1] text-white shadow-md shadow-blue-900/10 scale-[1.02]'
                                  : 'bg-slate-100/70 text-slate-500'
                              } ${
                                isEditingShifts
                                  ? `cursor-pointer active:scale-95 ${!active && 'hover:bg-slate-200/60'}`
                                  : 'cursor-default'
                              }`}
                            >
                              <span className="text-sm font-black">{t}</span>
                              <span className={`text-[8px] font-bold tracking-tight mt-0.5 whitespace-nowrap ${active ? 'text-white/90' : 'text-slate-400'}`}>
                                {shiftInfo?.time}
                              </span>
                            </button>
                          );
                        })}
                        <div className={`shrink-0 w-2 h-2 rounded-full ml-1 ${
                          (shiftsByDay[d.key]?.length ?? 0) > 0 ? 'bg-teal-400' : 'bg-transparent'
                        }`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
