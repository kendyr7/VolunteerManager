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
      border: 'border-border/60 shadow-sm',  
      title: 'text-text',  
      badge: 'bg-dark3 text-muted border border-border/50',  
      dot: 'bg-border-strong' 
    };
  }
  
  const isUnderstaffed = count < minRequired;

  if (isUnderstaffed) {
    return { card: 'bg-rose-500/5',  border: 'border-rose-400/20 shadow-sm',  title: 'text-text',  badge: 'bg-rose-400/15 text-rose-600 border border-rose-200/50',  dot: 'bg-rose-400' };
  } else {
    return { card: 'bg-teal-500/5',  border: 'border-teal-400/20 shadow-sm',  title: 'text-text',  badge: 'bg-teal-400/15 text-teal-600 border border-teal-200/50',  dot: 'bg-teal-400' };
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

  // KPIs y alertas para la vista admin
  const kpiData = useMemo(() => {
    let totalRequired = 0;
    let totalAssignedInRequired = 0;
    
    const committeeAlerts: Record<string, number> = {};
    committees.forEach(c => {
      committeeAlerts[c] = 0;
    });

    let totalAlertsCount = 0;

    EVENT_DAYS.forEach(day => {
      committees.forEach(comm => {
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
          }
        });
      });
    });

    const coverage = totalRequired > 0 ? Math.round((totalAssignedInRequired / totalRequired) * 100) : 100;
    return {
      coverage,
      committeeAlerts,
      totalAlertsCount
    };
  }, [globalShifts, committeeRequirements, EVENT_DAYS]);

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(buildEmptyShifts);

  const toggleShift = (day: string, turno: string) => {
    if (!isEditingShifts) return;
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
      setGlobalShifts(prev => ({
        ...prev,
        [editingVolunteer.id]: shiftsByDay
      }));
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

    return (
      <div key={key} className="rounded-2xl border border-border bg-dark2 overflow-hidden h-fit self-start w-full">
        <button
          onClick={() => toggleDay(key)}
          className="w-full flex items-center gap-4 px-5 py-4 bg-dark3 hover:bg-dark3/80 transition-colors text-left"
        >
          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-primary-cta/10 border border-primary-cta/20 shrink-0">
            <span className="text-[9px] font-black text-primary-cta uppercase tracking-widest">Sept</span>
            <span className="text-xl font-black text-primary-cta leading-none">{dateNum}</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text capitalize">{dayName}, {monthName}</p>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {(['T1','T2','T3','T4'] as const).map(t => {
                const count = shiftData[t].length;
                const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;
                const c = getShiftColor(t, count, isSingleCommittee, minRequired);
                return (
                  <span key={t} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-border/40 ${c.badge}`}>
                    {t}: {isSingleCommittee ? `${count}/${minRequired}` : count}
                  </span>
                );
              })}
            </div>
          </div>

          {isOpen
            ? <ChevronDown className="h-4 w-4 text-muted shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted shrink-0" />
          }
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
                      <p className="text-[10px] text-muted mt-0.5">{info?.time}</p>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>
                      {isSingleCommittee ? `${count} / ${minRequired}` : `${count} Vol.`}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {vols.length === 0 ? (
                      <p className="text-[11px] text-muted italic">Sin voluntarios asignados</p>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          {displayedVols.map(vol => (
                            <div 
                              key={vol.id} 
                              className="flex items-center justify-between group bg-white shadow-sm border border-border/50 rounded-lg px-2.5 py-2 hover:bg-dark3 transition-colors cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); handleEditClick(vol); }}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                                <span className="text-sm font-medium text-text truncate group-hover:text-primary-cta transition-colors">
                                  {vol.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-dark text-muted font-semibold border-border/60">
                                  {vol.committee}
                                </Badge>
                                <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    handleEditClick(vol);
                                    setTimeout(() => setIsEditingShifts(true), 0);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-dark p-1 rounded-md border border-border" 
                                  title={`Editar turnos de ${vol.name}`}
                                >
                                  <Pencil className="h-3 w-3 text-muted hover:text-text" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {vols.length > 10 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleShiftExpand(key, t); }}
                            className="w-full mt-2 py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-muted hover:text-text hover:bg-dark3 rounded-lg transition-colors border border-dashed border-border/60"
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-display-md text-text tracking-tight mb-1">Turnos</h2>
        <p className="text-body-md text-muted">Vista de asistencia diaria por turno de voluntarios.</p>
      </div>

      {/* Panel de KPIs / Control de Admin */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI Cobertura */}
        <div className="card-premium p-5 flex flex-col justify-between bg-white shadow-sm border border-border">
          <div>
            <h3 className="text-xs uppercase font-black text-muted tracking-wider mb-1">Cobertura de Requerimientos</h3>
            <p className="text-body-xs text-muted mb-4">Porcentaje de slots cubiertos según el mínimo requerido por comité.</p>
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-display-md font-black text-text leading-none">{kpiData.coverage}%</span>
            <div className="w-2/3 h-2 bg-dark3 rounded-full overflow-hidden border border-border/50">
              <div 
                className={`h-full transition-all duration-500 ${kpiData.coverage < 60 ? 'bg-rose-500' : kpiData.coverage < 90 ? 'bg-amber-500' : 'bg-teal-500'}`}
                style={{ width: `${kpiData.coverage}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI Alertas Críticas por Comité */}
        <div className="md:col-span-2 card-premium p-5 flex flex-col bg-white shadow-sm border border-border">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/40 shrink-0">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs uppercase font-black text-muted tracking-wider">Turnos Incompletos por Comité</h3>
                <div className="relative group cursor-pointer inline-flex items-center">
                  <Info className="h-3.5 w-3.5 text-muted hover:text-text transition-colors" />
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
              <p className="text-body-xs text-muted font-medium mt-0.5">Alertas activas donde no se cumple con el mínimo requerido.</p>
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
                      ? 'bg-primary-cta/10 border-primary-cta text-text shadow-sm' 
                      : alertCount > 0 
                        ? 'bg-rose-500/5 border-rose-200/40 hover:bg-rose-500/10 text-text' 
                        : 'bg-dark hover:bg-dark3 border-border/40 text-muted'
                  }`}
                >
                  <span className="text-xs font-bold truncate pr-1">{comm}</span>
                  {alertCount > 0 ? (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-primary-cta text-canvas' : 'bg-rose-500/10 text-rose-600'
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
      </div>

      {/* Barra de Filtros (Igual a Volunteers) */}
      <div className="card-premium overflow-hidden">
        <div className="p-5 border-b border-border bg-dark2 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <Input 
              placeholder="Buscar por nombre, estaca o barrio..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-dark input-base text-text border-border focus:ring-2 focus:ring-gold-faint"
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
          className="bg-dark text-text border-l border-border p-0 overflow-y-auto"
        >
          {editingVolunteer && (
            <div className="p-7 space-y-7">
              {/* Profile Header */}
              <div className="flex flex-col justify-center bg-dark2 p-5 rounded-2xl border border-border">
                <h3 className="text-2xl font-bold text-text tracking-tight leading-tight mb-3">
                  {editingVolunteer.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary-cta text-canvas border-none text-[10px] px-2 uppercase font-bold tracking-wide">
                    Voluntario
                  </Badge>
                  <Badge variant="outline" className="text-muted border-border text-[10px] px-2 font-medium bg-dark">
                    Comité: {editingVolunteer.committee}
                  </Badge>
                </div>
              </div>

              {/* Datos de Perfil */}
              <div>
                <h4 className="text-xs font-bold text-primary-cta uppercase tracking-widest mb-4">Datos de Perfil</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Phone className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Celular</span>
                    </div>
                    <p className="text-sm font-semibold text-text">{editingVolunteer.phone}</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Calendar className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Edad</span>
                    </div>
                    <p className="text-sm font-semibold text-text">27</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Barrio</span>
                    </div>
                    <p className="text-sm font-semibold text-text">{editingVolunteer.ward}</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Estaca</span>
                    </div>
                    <p className="text-sm font-semibold text-text">{editingVolunteer.stake}</p>
                  </div>
                </div>
              </div>

              <div className="h-[1px] w-full bg-border" />

              {/* Resumen de Turnos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <h4 className="text-xs font-bold text-primary-cta uppercase tracking-widest">Resumen de Turnos</h4>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-sky-600 border border-sky-500" />
                        <span className="text-[10px] text-muted">Seleccionado</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-dark border border-border" />
                        <span className="text-[10px] text-muted">Sin asignar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {saved && (
                      <span className="text-[10px] text-success font-semibold animate-pulse">✓ Guardado</span>
                    )}
                    {isEditingShifts ? (
                      <Button onClick={handleSaveShifts} className="h-8 bg-success hover:bg-success/80 text-canvas text-xs px-3 rounded-lg shrink-0">
                        Guardar
                      </Button>
                    ) : (
                      <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} className="h-8 bg-primary-cta hover:bg-primary-active text-canvas text-xs px-3 rounded-lg shrink-0">
                        Editar Turnos
                      </Button>
                    )}
                  </div>
                </div>
                {isEditingShifts && (
                  <p className="text-[11px] text-muted mb-4">Toca un turno para activarlo o desactivarlo.</p>
                )}

                {/* Stats rápidas */}
                {(() => {
                  const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                  const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
                  return (
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="bg-dark2 border border-border rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-text">{totalTurnos}</p>
                        <p className="text-[10px] text-muted uppercase tracking-wide mt-0.5">Turnos</p>
                      </div>
                      <div className="bg-dark2 border border-border rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-text">{diasCubiertos}</p>
                        <p className="text-[10px] text-muted uppercase tracking-wide mt-0.5">Días</p>
                      </div>
                      <div className="bg-dark2 border border-border rounded-xl p-3 text-center">
                        <p className={`text-2xl font-bold ${editingVolunteer.reliability >= 80 ? 'text-success' : 'text-warning'}`}>
                          {editingVolunteer.reliability}%
                        </p>
                        <p className="text-[10px] text-muted uppercase tracking-wide mt-0.5">Confiab.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline por día */}
                <div className="space-y-2.5">
                  {(isEditingShifts ? EVENT_DAYS : EVENT_DAYS.filter(d => (shiftsByDay[d.key]?.length ?? 0) > 0)).map((d) => (
                    <div key={d.key} className={`flex items-center gap-4 border rounded-xl px-5 py-3 transition-colors ${
                      isEditingShifts ? 'bg-dark3 border-primary-cta/20' : 'bg-dark2 border-border'
                    }`}>
                      <div className="shrink-0 w-16 text-center">
                        <p className="text-xs font-bold text-text capitalize">{d.label}</p>
                        <p className="text-[10px] text-muted">{d.dateNum} Sep</p>
                      </div>
                      <div className="w-px h-8 bg-border shrink-0" />
                      <div className="flex items-center justify-between gap-2 flex-1">
                        {['T1', 'T2', 'T3', 'T4'].map((t) => {
                          const active = (shiftsByDay[d.key] ?? []).includes(t);
                          return (
                            <button
                              key={t}
                              onClick={() => toggleShift(d.key, t)}
                              className={`flex-1 inline-flex items-center justify-center rounded-lg text-xs font-bold py-2 border transition-all ${
                                active
                                  ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                                  : 'bg-dark border-border text-muted'
                              } ${
                                isEditingShifts
                                  ? 'cursor-pointer hover:scale-105 hover:border-sky-400'
                                  : 'cursor-default'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                      <div className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                        (shiftsByDay[d.key]?.length ?? 0) > 0 ? 'bg-success' : 'bg-border'
                      }`} />
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
