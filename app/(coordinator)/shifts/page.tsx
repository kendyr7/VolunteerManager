'use client'

import { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, Pencil, Clock, Search, Phone, Calendar, MapPin, Info, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DataTableFilter } from "@/components/DataTableFilter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 30
    }
  }
};

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

const getShiftColor = (shiftId: string, count: number, isSingleCommittee: boolean, minRequired: number) => {
  if (!isSingleCommittee) {
    // Vista Global (Admin sin filtro de comité): Estilo neutro y limpio
    return { 
      card: 'bg-white',  
      border: 'border-slate-200/60 shadow-sm',  
      title: 'text-slate-800',  
      badge: 'bg-slate-100 text-slate-500 border border-slate-200/50',  
      dot: 'bg-border-strong' 
    };
  }

  const isUnderstaffed = count < minRequired;
  const isCritical = minRequired > 0 && count <= minRequired / 2;
  
  if (isCritical) {
    // Rojo suave para alertas críticas
    return { 
      card: 'bg-red-50/50', 
      border: 'border-red-200', 
      title: 'text-red-900', 
      badge: 'bg-red-100 text-red-700 border border-red-200/50', 
      dot: 'bg-red-400' 
    };
  } else if (isUnderstaffed) {
    // Rosa suave para déficit
    return { 
      card: 'bg-rose-50/30',  
      border: 'border-rose-200',  
      title: 'text-slate-800',  
      badge: 'bg-rose-50 text-rose-600 border border-rose-100',  
      dot: 'bg-rose-400' 
    };
  } else {
    // Verde suave para cubierto
    return { 
      card: 'bg-emerald-50/20',  
      border: 'border-emerald-200',  
      title: 'text-slate-800',  
      badge: 'bg-emerald-50 text-emerald-700 border border-emerald-100',  
      dot: 'bg-emerald-400' 
    };
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

  const supabase = createClient();
  const [volunteers, setVolunteers] = useState<VolunteerType[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const committees = committeesList.map(c => c.name);
  const stakes: string[] = [];
  const wards: string[] = [];

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
        stake: '',
        ward: '',
        phone: v.phone || '',
        shifts: sCounts[v.id] || 0,
        reliability: 100,
        committee: v.committees?.name || 'Sin comité',
        committee_id: v.committee_id
      }));
      setVolunteers(mapped);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee && role !== 'Admin') {
      setSelectedCommittees([committee]);
    }
    loadData().then(() => setLoading(false));
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
  const [globalShifts, setGlobalShifts] = useState<Record<string, Record<string, string[]>>>({});

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
    
    const committees = committeesList.map(c => c.name);
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
          const count = volunteers.filter(vol => {
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
  }, [volunteers, committeesList, globalShifts, committeeRequirements, EVENT_DAYS, currentRole, activeCommittee]);

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

  const handleSaveShifts = async () => {
    setIsEditingShifts(false);
    if (!editingVolunteer) return;

    // Delete existing shifts for this volunteer
    const { error: delErr } = await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', editingVolunteer.id);

    if (delErr) {
      console.error("Error deleting shifts:", delErr);
      return;
    }

    // Insert new shift rows
    const insertRows = [];
    for (const [dayKey, shiftKeys] of Object.entries(shiftsByDay)) {
      for (const shiftKey of shiftKeys) {
        insertRows.push({
          volunteer_id: editingVolunteer.id,
          day_key: dayKey,
          shift_key: shiftKey
        });
      }
    }

    if (insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from('shifts')
        .insert(insertRows);

      if (insErr) {
        console.error("Error inserting shifts:", insErr);
        return;
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await loadData();
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

  const filteredVolunteers = useMemo(() => {
    return volunteers.filter(v => {
      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            v.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            v.ward.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [volunteers, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

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
            <p className="text-[9px] font-bold text-[#0084d1] uppercase tracking-widest leading-none">
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
                  
                  // Calculate global requirement if no single committee is selected
                  let minRequired = 0;
                  if (activeCommittee) {
                    minRequired = committeeRequirements[activeCommittee]?.[t] ?? 0;
                  } else {
                    // Global sum for Admin "Heat Map"
                    committees.forEach(c => {
                      minRequired += (committeeRequirements[c]?.[t] ?? 0);
                    });
                  }

                  const c = getShiftColor(t, count, isSingleCommittee, minRequired);
                  return (
                    <span key={t} className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-xl border transition-all ${c.badge} ${c.border}`}>
                      <span className="font-bold">{t}</span>
                      <span className="opacity-25 text-xs">|</span>
                      <span className="font-bold tabular-nums">{count}/{minRequired}</span>
                    </span>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide">
                Total{' '}
                <span className={`font-bold ${totalVolsOnDay > 0 ? 'text-slate-800' : 'text-slate-500'}`}>
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
              
              let minRequired = 0;
              if (activeCommittee) {
                minRequired = committeeRequirements[activeCommittee]?.[t] ?? 0;
              } else {
                committees.forEach(c => {
                  minRequired += (committeeRequirements[c]?.[t] ?? 0);
                });
              }

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
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${c.title}`}>
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
                                <span className="text-sm font-medium text-slate-800 truncate group-hover:text-[#0084d1] transition-colors">
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0084d1]"></div>
      </div>
    );
  }

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
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-1">Mi Perfil</h2>
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
                <p className="text-3xl font-bold text-slate-800">{totalTurnos}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Turnos</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-slate-800">{diasCubiertos}</p>
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
                      <p className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest leading-none">
                        {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
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
                            <span className="text-sm font-bold">{t}</span>
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
                      <p className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest leading-none">
                        {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
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
                            <span className="text-sm font-bold">{t}</span>
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
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-6xl mx-auto space-y-10 pb-12"
    >
      {/* Header Seccional Refinado */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-slate-200/60">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl tracking-tight text-slate-900 leading-none">
              Gestión de Turnos
            </h1>
            <Badge className="bg-slate-900 text-white border-none text-[10px] px-2.5 py-0.5 uppercase font-bold tracking-widest h-5">
              {currentRole}
            </Badge>
          </div>
          <p className="text-base font-medium text-slate-500">
            {activeCommittee ? `Monitoreo de asignaciones para ${activeCommittee}` : 'Visión global de la distribución de voluntarios en el evento.'}
          </p>
        </div>
        
        {currentRole === 'Admin' && (
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" size="lg" className="rounded-xl font-bold border-slate-200 hover:bg-slate-50 shadow-sm transition-all active:scale-[0.97] group">
              Exportar Reporte
              <Info className="w-4 h-4 ml-2 opacity-40 group-hover:opacity-100 transition-opacity" />
            </Button>
          </div>
        )}
      </motion.div>

      {/* KPI Section */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1.5">Cobertura Global</h3>
            <p className="text-xs text-slate-500 font-medium mb-5">Slots cubiertos vs. requeridos.</p>
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-4xl font-bold tracking-tight text-slate-900 leading-none tabular-nums">{kpiData.coverage}%</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/30">
              <div 
                className={`h-full transition-all duration-700 cubic-bezier(0.23, 1, 0.32, 1) ${kpiData.coverage < 60 ? 'bg-red-400' : kpiData.coverage < 90 ? 'bg-amber-400' : 'bg-teal-400'}`}
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
                  <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">Turnos Incompletos por Comité</h3>
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
                        ? 'bg-[#0084d1]/10 border-[#0084d1] text-slate-800 shadow-sm' 
                        : alertCount > 0 
                          ? 'bg-rose-500/5 border-rose-200/40 hover:bg-rose-500/10 text-slate-800' 
                          : 'bg-white hover:bg-slate-100 border-slate-200/40 text-slate-500'
                    }`}
                  >
                    <span className="text-xs font-bold truncate pr-1">{comm}</span>
                    {alertCount > 0 ? (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-[#0084d1] text-white' : 'bg-rose-500/10 text-rose-600'
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
                 <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">Estado de Reclutamiento</h3>
                 <p className="text-body-xs text-slate-500 font-medium mt-0.5">Resumen de asignaciones para tu comité.</p>
               </div>
               <Badge variant="outline" className={kpiData.editorMissingVolunteers > 0 ? "bg-rose-500/10 text-rose-600 border-rose-200/50 font-bold" : "bg-teal-500/10 text-teal-600 border-teal-200/50 font-bold"}>
                 {kpiData.editorMissingVolunteers > 0 ? `Faltan ${kpiData.editorMissingVolunteers} Voluntarios` : "Reclutamiento Completo"}
               </Badge>
             </div>
             
             <div className="flex gap-4">
               <div className="flex-1 bg-teal-50/50 rounded-xl border border-teal-100/50 p-4">
                 <p className="text-[10px] uppercase font-bold text-teal-600 mb-1">Turnos Cubiertos</p>
                 <p className="text-3xl font-bold text-teal-700 leading-none">{kpiData.editorShiftsOk}</p>
               </div>
               <div className="flex-1 bg-rose-50/50 rounded-xl border border-rose-100/50 p-4">
                 <p className="text-[10px] uppercase font-bold text-rose-600 mb-1">Turnos Incompletos</p>
                 <p className="text-3xl font-bold text-rose-700 leading-none">{kpiData.editorShiftsUnderstaffed}</p>
               </div>
             </div>
          </div>
        )}
      </motion.div>

      {/* Barra de Filtros (Igual a Volunteers) */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-hidden">
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
      </motion.div>

      {/* Grid de días (Flex Column Layout para no alinear alturas) */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        {/* Columna Izquierda (Días impares: 1, 3, 5...) */}
        <div className="flex-1 flex flex-col gap-4 w-full">
          {EVENT_DAYS.filter((_, i) => i % 2 === 0).map(d => (
            <motion.div key={d.key} variants={itemVariants}>
              {renderDayCard(d)}
            </motion.div>
          ))}
        </div>
        
        {/* Columna Derecha (Días pares: 2, 4, 6...) */}
        <div className="flex-1 flex flex-col gap-4 w-full">
          {EVENT_DAYS.filter((_, i) => i % 2 === 1).map(d => (
            <motion.div key={d.key} variants={itemVariants}>
              {renderDayCard(d)}
            </motion.div>
          ))}
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
                        <p className="text-3xl font-bold text-slate-800">{totalTurnos}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Turnos</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-slate-800">{diasCubiertos}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Días</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className={`text-3xl font-bold ${editingVolunteer.reliability >= 80 ? 'text-teal-600' : 'text-amber-500'}`}>
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
                        <p className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest leading-none">
                          {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                        </p>
                        <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
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
                              <span className="text-sm font-bold">{t}</span>
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
    </motion.div>
  );
}
