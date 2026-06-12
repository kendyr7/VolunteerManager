'use client'

import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DataTableFilter } from "@/components/DataTableFilter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch } from "@/lib/search-context";

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
  status?: string;
  age?: number;
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
      badge: 'bg-red-100 text-red border border-red-200/50', 
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
      badge: 'bg-emerald-50 text-accent border border-emerald-100',  
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
  const { searchTerm } = useSearch();
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');

  const supabase = createClient();
  const [volunteers, setVolunteers] = useState<VolunteerType[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
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

  const committees = committeesList.map(c => c.name);
  const stakes: string[] = [];
  const wards: string[] = [];

  const loadData = async () => {
    // 1. Role-based strict isolation
    const role = localStorage.getItem('mock_role') || 'Admin';
    const committee = localStorage.getItem('mock_committee') || '';

    let query = supabase.from('volunteers').select('*, committees(name)');
    
    if (role === 'Editor' && committee) {
       const { data: commObj } = await supabase
        .from('committees')
        .select('id')
        .eq('name', committee)
        .maybeSingle();
      
      if (commObj) {
        query = query.eq('committee_id', commObj.id);
      }
    }

    const { data: volsData, error: volsError } = await query;
    
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
        committee_id: v.committee_id,
        status: v.status,
        age: v.age
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
        showToast("Error al guardar turnos", "error");
        return;
      }
    }

    setSaved(true);
    showToast("Turnos actualizados");
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
      // Role-based isolation
      const userCommittee = localStorage.getItem('mock_committee');
      if (currentRole === 'Editor' && v.committee !== userCommittee) return false;

      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            v.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            v.ward.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [volunteers, searchTerm, selectedCommittees, selectedStakes, selectedWards, currentRole]);

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
      <div key={key} className="rounded-sm border border-slate-200 bg-slate-50 overflow-hidden h-fit self-start w-full">
        <button
          onClick={() => toggleDay(key)}
          className="w-full flex items-stretch bg-slate-100 hover:bg-slate-100/80 transition-colors text-left"
        >
          {/* Left: full-height white date section */}
          <div className="shrink-0 w-16 flex flex-col items-center justify-center bg-white py-4 px-2">
            <p className="text-[9px] font-bold text-[#4d7cfe] uppercase tracking-widest leading-none">
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
                    <span key={t} className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-sm border transition-all ${c.badge} ${c.border}`}>
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
                ? <span className="material-symbols-outlined text-[18px] text-slate-500">expand_more</span>
                : <span className="material-symbols-outlined text-[18px] text-slate-500">chevron_right</span>
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
                <div key={t} className={`rounded-sm border p-3 h-fit ${c.card} ${c.border}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`material-symbols-outlined text-[14px] ${c.title}`}>schedule</span>
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
                      <div className="bg-slate-50 border border-slate-100 rounded-sm p-3 text-center">
                        <p className="text-[11px] text-slate-500 font-medium italic">Lista de nombres oculta por privacidad.</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          {displayedVols.map(vol => (
                            <div 
                              key={vol.id} 
                              className="flex items-center justify-between group bg-white shadow-sm border border-slate-200/50 rounded-sm px-2.5 py-2 hover:bg-slate-100 transition-colors cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); handleEditClick(vol); }}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                                <span className="text-sm font-medium text-slate-800 truncate group-hover:text-[#4d7cfe] transition-colors">
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
                                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-sm border border-slate-200" 
                                  title={`Editar turnos de ${vol.name}`}
                                >
                                  <span className="material-symbols-outlined text-[14px] text-slate-500 hover:text-slate-800">edit</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {vols.length > 10 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleShiftExpand(key, t); }}
                            className="w-full mt-2 py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-sm transition-colors border border-dashed border-slate-200/60"
                          >
                            {isShiftExpanded ? (
                              <>Ver menos <span className="material-symbols-outlined text-[16px] rotate-180">expand_more</span></>
                            ) : (
                              <>Ver {hiddenCount} más <span className="material-symbols-outlined text-[16px]">expand_more</span></>
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4d7cfe]"></div>
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
          <p className="text-base font-medium text-slate-500">
            {activeCommittee ? `Monitoreo de asignaciones para ${activeCommittee}` : 'Visión global de la distribución de voluntarios en el evento.'}
          </p>
        </div>
        
        {currentRole === 'Admin' && (
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" size="lg" className="rounded-sm font-bold border-slate-200 hover:bg-slate-50 shadow-sm transition-all active:scale-[0.97] group">
              Exportar Reporte
              <span className="material-symbols-outlined text-[18px] ml-2 opacity-40 group-hover:opacity-100 transition-opacity">info</span>
            </Button>
          </div>
        )}
      </motion.div>

      {/* KPI Section */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-sm overflow-hidden h-full">
          <CardContent className="p-5 h-full flex flex-col justify-between">
            <div>
              <div className="text-caption-uppercase text-muted mb-3">Cobertura Global</div>
              <div className="text-display-lg text-ink font-semibold tracking-tighter">
                {kpiData.coverage}%
              </div>
              <p className="text-[11px] mt-2 font-medium text-muted/70">
                Slots cubiertos vs. requeridos
              </p>
            </div>
            <div className="w-full h-2.5 bg-slate-100 mt-4 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${kpiData.coverage}%` }}
                transition={{ duration: 1, ease: "circOut" }}
                className={`h-full rounded-full ${
                  kpiData.coverage < 60
                    ? 'bg-red-500'
                    : kpiData.coverage < 90
                      ? 'bg-amber-400'
                      : 'bg-teal-500'
                }`}
              />
            </div>
          </CardContent>
        </Card>

        {/* KPI Alertas Críticas por Comité */}
        {currentRole === 'Admin' ? (
          <Card className="md:col-span-2 border border-hairline-strong bg-canvas shadow-sm rounded-sm overflow-hidden h-full">
            <CardContent className="p-5 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-hairline-strong shrink-0">
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-caption-uppercase text-muted">Turnos Incompletos por Comité</div>
                    <div className="relative group cursor-pointer inline-flex items-center">
                      <span className="material-symbols-outlined text-[16px] text-muted hover:text-ink transition-colors">info</span>
                      <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-64 sm:w-72 p-3 bg-slate-900 border border-slate-800 text-[11.5px] text-slate-200 rounded-sm shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
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
                  <p className="text-[11px] mt-1 font-medium text-muted/70">Alertas activas donde no se cumple con el mínimo requerido.</p>
                </div>
                <Badge variant="outline" className="bg-error/10 text-error border-error/20 font-bold">
                  {kpiData.totalAlertsCount} Alertas en Total
                </Badge>
              </div>
              
              {committees.length > 0 ? (
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
                            setSelectedCommittees([comm]);
                          }
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-sm border text-left transition-all ${
                          isSelected
                            ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-sm'
                            : alertCount > 0
                              ? 'bg-red-50 border-red-200 hover:bg-red-100 text-slate-800'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span className="text-xs font-bold truncate pr-1">{comm}</span>
                        {alertCount > 0 ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
                          }`}>
                            {alertCount}
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'
                          }`}>
                            OK
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
                  <span className="material-symbols-outlined text-[32px] text-slate-300">group_off</span>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sin comités configurados</p>
                  <p className="text-[11px] text-slate-400 max-w-[200px]">Agrega comités en Ajustes para ver las alertas por comité.</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="md:col-span-2 border border-hairline-strong bg-canvas shadow-sm rounded-sm overflow-hidden h-full">
            <CardContent className="p-5 h-full flex flex-col justify-center">
               <div className="flex items-center justify-between mb-5 pb-4 border-b border-hairline-strong shrink-0">
                 <div>
                   <div className="text-caption-uppercase text-muted">Estado de Reclutamiento</div>
                   <p className="text-[11px] mt-1 font-medium text-muted/70">Resumen de asignaciones para tu comité.</p>
                 </div>
                 <Badge variant="outline" className={kpiData.editorMissingVolunteers > 0 ? "bg-error/10 text-error border-error/20 font-bold" : "bg-success/10 text-success border-success/20 font-bold"}>
                   {kpiData.editorMissingVolunteers > 0 ? `Faltan ${kpiData.editorMissingVolunteers} Voluntarios` : "Reclutamiento Completo"}
                 </Badge>
               </div>
               
               <div className="flex gap-4">
                 <div className="flex-1 bg-success/5 rounded-sm border border-success/20 p-4">
                   <p className="text-caption-uppercase text-success mb-2">Turnos Cubiertos</p>
                   <p className="text-display-md font-bold text-success leading-none">{kpiData.editorShiftsOk}</p>
                 </div>
                 <div className="flex-1 bg-error/5 rounded-sm border border-error/20 p-4">
                   <p className="text-caption-uppercase text-error mb-2">Turnos Incompletos</p>
                   <p className="text-display-md font-bold text-error leading-none">{kpiData.editorShiftsUnderstaffed}</p>
                 </div>
               </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Barra de Filtros (Igual a Volunteers) */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center gap-4 flex-wrap">
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
            <div className="p-0 space-y-0">
              {/* Identity Header (High End) */}
              <div className="bg-slate-900 px-8 py-10 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-[#4d7cfe] rounded-2xl flex items-center justify-center shadow-lg shadow-[#4d7cfe]/30">
                      <span className="material-symbols-outlined text-[24px]">person</span>
                    </div>
                  </div>
                  <h2 className="tracking-tight text-white mb-2">{editingVolunteer.name}</h2>
                  <div className="flex items-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-slate-400">corporate_fare</span>
                      <span className="text-sm font-medium text-slate-300">{editingVolunteer.committee}</span>
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-slate-400">call</span>
                      <span className="text-sm font-medium text-slate-300">{editingVolunteer.phone}</span>
                    </div>
                  </div>
                </div>
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#4d7cfe]/10 rounded-full blur-[80px] -mr-32 -mt-32" />
              </div>

              <div className="p-8 space-y-10">
                {/* Metadata Grid */}
                <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border border-slate-200 rounded-3xl">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Barrio</p>
                    <span className="text-sm font-bold text-slate-800 truncate block" title={editingVolunteer.ward}>{editingVolunteer.ward || '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estaca</p>
                    <span className="text-sm font-bold text-slate-800 truncate block" title={editingVolunteer.stake}>{editingVolunteer.stake || '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edad</p>
                    <span className="text-sm font-bold text-slate-800">{editingVolunteer.age ? `${editingVolunteer.age} años` : '—'}</span>
                  </div>
                </div>

                {/* Resumen de Turnos Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-900 leading-none">Cronograma de Servicio</h3>
                      <p className="text-sm font-medium text-slate-400">Gestión de disponibilidad y asignaciones.</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {saved && <span className="text-[11px] text-accent font-bold animate-pulse">✓ Guardado</span>}
                      {isEditingShifts ? (
                        <Button onClick={handleSaveShifts} className="h-10 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl shadow-lg shadow-blue-500/15 font-bold transition-all active:scale-[0.97]">
                          Confirmar Cambios
                        </Button>
                      ) : (
                        <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} variant="outline" className="h-10 border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold transition-all active:scale-[0.97]">
                          Ajustar Turnos
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Stats Bento */}
                  {(() => {
                    const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                    const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
                    return (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none mb-1">{totalTurnos}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Turnos</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none mb-1">{diasCubiertos}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Días</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm border-b-2 border-b-accent">
                          <p className="text-2xl font-bold text-accent tabular-nums leading-none mb-1">{editingVolunteer.reliability}%</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Confiab.</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Timeline with Shells */}
                  <div className="space-y-4">
                    {EVENT_DAYS.map((d, idx) => {
                      const dayShifts = shiftsByDay[d.key] || [];
                      const hasShifts = dayShifts.length > 0;
                      
                      return (
                        <motion.div 
                          key={d.key}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + idx * 0.03 }}
                          className={`group border rounded-3xl overflow-hidden transition-all duration-300 ${
                            hasShifts || isEditingShifts 
                              ? 'border-slate-200 bg-white shadow-sm' 
                              : 'border-slate-100 bg-slate-50/50 opacity-40 grayscale-[0.5]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-stretch">
                            {/* Date Panel */}
                            <div className={`shrink-0 sm:w-20 flex sm:flex-col items-center justify-center py-4 px-4 border-b sm:border-b-0 sm:border-r transition-colors ${
                              hasShifts ? 'bg-[#4d7cfe]/5 border-[#4d7cfe]/10' : 'bg-slate-50 border-slate-100'
                            }`}>
                              <p className={`text-[10px] font-bold uppercase tracking-widest leading-none mb-1 ${hasShifts ? 'text-[#4d7cfe]' : 'text-slate-400'}`}>
                                {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                              </p>
                              <p className="text-2xl font-bold text-slate-900 leading-tight">{d.dateNum}</p>
                            </div>

                            {/* Shifts Grid (The Shells) */}
                            <div className="flex-1 p-4 grid grid-cols-4 gap-2">
                              {['T1', 'T2', 'T3', 'T4'].map((t) => {
                                const active = dayShifts.includes(t);
                                const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];
                                
                                return (
                                  <button
                                    key={t}
                                    disabled={!isEditingShifts}
                                    onClick={() => toggleShift(d.key, t)}
                                    className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all ${
                                      active 
                                        ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-md shadow-blue-500/20' 
                                        : 'bg-white border-slate-100 text-slate-300 hover:border-slate-300'
                                    } ${
                                      isEditingShifts ? 'cursor-pointer active:scale-[0.92]' : 'cursor-default'
                                    }`}
                                  >
                                    <span className="text-xs font-bold">{t}</span>
                                    <span className={`text-[8px] font-bold uppercase tracking-tighter mt-0.5 ${active ? 'text-white/80' : 'text-slate-300'}`}>
                                      {shiftInfo?.time.split(' - ')[0]}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.isVisible} 
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} 
      />
    </motion.div>
  );
}
