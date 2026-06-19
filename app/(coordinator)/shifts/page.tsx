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
      card: 'bg-dark2',
      border: 'border-border shadow-sm',
      title: 'text-text',
      badge: 'bg-dark3 text-text-dim border border-border',
      dot: 'bg-mid'
    };
  }

  const isUnderstaffed = count < minRequired;
  const isCritical = minRequired > 0 && count <= minRequired / 2;

  if (isCritical) {
    // Rojo suave para alertas críticas
    return {
      card: 'bg-red-faint',
      border: 'border-red/30',
      title: 'text-red',
      badge: 'bg-red/20 text-red border border-red/30',
      dot: 'bg-red'
    };
  } else if (isUnderstaffed) {
    // Rosa suave para déficit
    return {
      card: 'bg-amber-400/10',
      border: 'border-amber-400/30',
      title: 'text-text',
      badge: 'bg-amber-400/20 text-amber-500 border border-amber-400/20',
      dot: 'bg-amber-400'
    };
  } else {
    // Verde suave para cubierto
    return {
      card: 'bg-accent-faint',
      border: 'border-accent/30',
      title: 'text-text',
      badge: 'bg-accent/20 text-accent border border-accent/20',
      dot: 'bg-accent'
    };
  }
};

const getCommitteeColor = (committee: string) => {
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción')) return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
  if (comm.includes('auxilios')) return 'bg-teal-500/15 text-teal-500 border-teal-500/20';
  return 'bg-dark3 text-text-dim border-border';
};

// ─── página ───────────────────────────────────────────────────────────────────
export default function ShiftsPage() {
  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),                   // clave única: 'jue 10'
    label: formatDateShort(date).split(' ')[0],    // solo el día: 'jue'
    dateNum: formatDateShort(date).split(' ')[1],  // solo el número: '10'
  }));

  // Estados de filtros
  const { searchTerm, setSearchTerm } = useSearch();
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
    const shiftData = {
      T1: getAssignedVolunteers(key, 'T1'),
      T2: getAssignedVolunteers(key, 'T2'),
      T3: getAssignedVolunteers(key, 'T3'),
      T4: getAssignedVolunteers(key, 'T4'),
    };
    const totalVolsOnDay = (['T1', 'T2', 'T3', 'T4'] as const).reduce((acc, t) => acc + shiftData[t].length, 0);

    const isFiltering = searchTerm.trim() !== '' || selectedCommittees.length > 0 || selectedStakes.length > 0 || selectedWards.length > 0;

    if (isFiltering && totalVolsOnDay === 0) {
      return null;
    }

    const isOpen = !!expanded[key] || (isFiltering && totalVolsOnDay > 0);

    const dayIndex = EVENT_DAYS.findIndex(d => d.key === key);
    const bgColors = [
      'bg-[#10a562]',
      'bg-[#4aa9df]',
      'bg-[#f1c130]',
      'bg-[#d54134]',
      'bg-[#981e32]',
      'bg-[#2c44c2]',
      'bg-[#f1c130]',
      'bg-[#ed1b24]'
    ];
    const cardBg = bgColors[dayIndex % bgColors.length];

    return (
      <div key={key} className={`rounded-[20px] shadow-md h-fit self-start w-full ${cardBg}`}>
        <button
          onClick={() => toggleDay(key)}
          className="w-full flex items-center justify-between px-6 sm:px-8 py-5 text-left hover:brightness-110 rounded-[20px] transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          {/* Left: Date */}
          <div className="flex-1 min-w-0 pr-4 flex items-center">
             <p className="font-inter font-bold text-white text-[13px] drop-shadow-sm truncate capitalize">
               {format(date, "EEEE", { locale: es })} {dateNum}
             </p>
          </div>

          {/* Right: 4 Columns */}
          <div className="flex items-center shrink-0 ml-auto">
             {(['T1', 'T2', 'T3', 'T4'] as const).map((t, i) => {
               const count = shiftData[t].length;
               
               return (
                 <div key={t} className={`flex flex-col items-center justify-center px-3 sm:px-4 ${i !== 0 ? 'border-l border-white/20' : ''}`}>
                   <span className="text-[16px] font-semibold text-white drop-shadow-sm leading-none">{count}</span>
                   <span className="font-inter text-[10px] font-bold text-white/80 uppercase mt-1 tracking-widest">{t}</span>
                 </div>
               );
             })}
          </div>
        </button>

        {isOpen && (
          <>
            {/* Desktop inline expansion */}
            <div className="hidden md:block">
              <div className="grid grid-cols-2 gap-3 p-4 items-start border-t border-border/50">
                {(['T1', 'T2', 'T3', 'T4'] as const).map(t => {
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
                  const hasMore = vols.length > 10;

                  return (
                    <div 
                      key={t} 
                      onClick={(e) => {
                        if (hasMore) {
                          e.stopPropagation();
                          toggleShiftExpand(key, t);
                        }
                      }}
                      className={`rounded-sm border p-3 h-fit ${c.card} ${c.border} ${hasMore ? 'cursor-pointer hover:shadow-sm transition-shadow group/card' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`material-symbols-outlined text-[14px] ${c.title}`}>schedule</span>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${c.title}`}>
                              Turno {t[1]}
                            </p>
                          </div>
                          <p className="text-[10px] text-text-dim mt-0.5">{info?.time}</p>
                        </div>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>
                          {isSingleCommittee ? `${count} / ${minRequired}` : `${count} Vol.`}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {vols.length === 0 ? (
                          <p className="text-[11px] text-text-dim italic">Sin voluntarios asignados</p>
                        ) : currentRole === 'Lector' ? (
                          <div className="bg-dark3 border border-border rounded-sm p-3 text-center">
                            <p className="text-[11px] text-text-dim font-medium italic">Lista de nombres oculta por privacidad.</p>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1">
                              {displayedVols.map(vol => (
                                <div
                                  key={vol.id}
                                  className="flex items-center justify-between group bg-dark2 border border-border/40 rounded-sm px-2 py-1 hover:bg-dark3 transition-colors cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); handleEditClick(vol); }}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                                    <span className="text-[12px] font-semibold text-text truncate group-hover:text-[#4d7cfe] transition-colors">
                                      {vol.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-semibold border ${getCommitteeColor(vol.committee)}`}>
                                      {vol.committee}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {vols.length > 10 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleShiftExpand(key, t); }}
                                className="w-full mt-2 py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-text-dim hover:text-text hover:bg-dark3 rounded-sm transition-colors border border-dashed border-border"
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
            </div>

            {/* Mobile Bottom Drawer */}
            <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end pointer-events-none">
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity pointer-events-auto" 
                onClick={(e) => { e.stopPropagation(); toggleDay(key); }}
              />
              <div 
                id={`drawer-${key}`}
                className="relative w-full h-[94vh] bg-gradient-to-br from-[#009fd4] to-[#4d7cfe] dark:from-[#0f2027] dark:via-[#203a43] dark:to-[#194c7a] rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full duration-300 ease-out pointer-events-auto"
                style={{ willChange: 'transform' }}
              >
                {/* Handle */}
                <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
                
                <div 
                  className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-6 overscroll-contain"
                  onTouchStart={(e) => {
                    const drawer = document.getElementById(`drawer-${key}`);
                    if (!drawer) return;
                    drawer.dataset.startY = e.touches[0].clientY.toString();
                    drawer.style.transition = 'none';
                  }}
                  onTouchMove={(e) => {
                    const drawer = document.getElementById(`drawer-${key}`);
                    if (!drawer) return;
                    const startY = parseFloat(drawer.dataset.startY || '0');
                    const currentY = e.touches[0].clientY;
                    const deltaY = currentY - startY;

                    if (e.currentTarget.scrollTop <= 0 && deltaY > 0) {
                      drawer.style.transform = `translateY(${deltaY}px)`;
                      drawer.dataset.swiping = 'true';
                    }
                  }}
                  onTouchEnd={(e) => {
                    const drawer = document.getElementById(`drawer-${key}`);
                    if (!drawer) return;
                    
                    drawer.style.transition = 'transform 0.3s ease-out';
                    
                    if (drawer.dataset.swiping === 'true') {
                      const startY = parseFloat(drawer.dataset.startY || '0');
                      const deltaY = e.changedTouches[0].clientY - startY;
                      
                      drawer.dataset.swiping = 'false';
                      
                      if (deltaY > 150) {
                        drawer.style.transform = `translateY(100%)`;
                        setTimeout(() => {
                          drawer.style.transform = '';
                          toggleDay(key);
                        }, 300);
                      } else {
                        drawer.style.transform = `translateY(0)`;
                      }
                    } else {
                      drawer.style.transform = '';
                    }
                  }}
                >
                  {/* Header (Like "Finished" and "Match 3...") */}
                  <div className="text-center mt-4 mb-8">
                    <h3 className="text-[15px] font-medium text-white mb-1 tracking-tight uppercase">
                      {format(date, "EEEE", { locale: es })} {dateNum} {format(date, "MMM", { locale: es }).replace('.', '')}
                    </h3>
                    <p className="text-[13px] font-normal text-white/80">Volunteer Manager</p>
                  </div>

                  {/* Big Scores (1 vs 1) -> Total Vols vs Required */}
                  <div className="flex items-center justify-between px-4 mb-8">
                    <div className="flex flex-col items-center">
                      <span className="text-4xl font-normal text-white tracking-tighter drop-shadow-md">{totalVolsOnDay}</span>
                      <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Cubiertos</span>
                    </div>
                    <div className="text-xl font-black text-white/40 mb-4">-</div>
                    <div className="flex flex-col items-center">
                      <span className="text-4xl font-normal text-white tracking-tighter drop-shadow-md">
                        {(['T1', 'T2', 'T3', 'T4'] as const).reduce((acc, t) => {
                          let minReq = 0;
                          if (activeCommittee) minReq = committeeRequirements[activeCommittee]?.[t] ?? 0;
                          else committees.forEach(c => minReq += (committeeRequirements[c]?.[t] ?? 0));
                          return acc + minReq;
                        }, 0)}
                      </span>
                      <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Requeridos</span>
                    </div>
                  </div>

                  <div className="text-center mb-8 px-4 border-t border-white/20 pt-6 mt-2">
                    <p className="font-inter text-sm font-medium text-white/90 leading-snug">
                      Estado actual de reclutamiento para el día. {totalVolsOnDay >= (['T1', 'T2', 'T3', 'T4'] as const).reduce((acc, t) => {
                        let minReq = 0;
                        if (activeCommittee) minReq = committeeRequirements[activeCommittee]?.[t] ?? 0;
                        else committees.forEach(c => minReq += (committeeRequirements[c]?.[t] ?? 0));
                        return acc + minReq;
                      }, 0) ? "La meta diaria ha sido alcanzada." : "Aún se necesitan voluntarios."}
                    </p>
                  </div>

                  {/* Match highlights -> Turnos del Día */}
                  <div className="w-full">
                    <div className="space-y-3">
                      {( [ ['T1', 'T2'], ['T3', 'T4'] ] as const ).map((group, groupIdx) => (
                        <div key={groupIdx} className="bg-black/20 backdrop-blur-md rounded-[32px] p-4 shadow-lg border border-white/10">
                          <div className="grid grid-cols-2 gap-4">
                            {group.map(t => {
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
                              
                              const combinedKey = `${key}-${t}`;
                              const isShiftExpanded = !!expandedShifts[combinedKey];
                              
                              const limit = 5;
                              const hiddenCount = Math.max(0, vols.length - limit);
                              const hasMore = vols.length > limit;

                              return (
                                <div 
                                  key={t} 
                                  className="flex flex-col h-fit"
                                >
                                  {/* Turno Header */}
                                  <div className="flex items-start justify-between mb-2 border-b border-white/10 pb-1.5">
                                    <div className="min-w-0 pr-1">
                                      <p className="text-[11px] font-bold text-white uppercase tracking-widest leading-none mb-1">{t}</p>
                                      <p className="font-inter text-[8px] text-white/60 font-medium tracking-tight whitespace-nowrap truncate">{info?.time}</p>
                                    </div>
                                    <span className="font-inter text-[10px] font-medium text-white bg-white/10 px-1.5 py-0.5 rounded-md leading-none flex items-center justify-center shrink-0">
                                      {count}/{minRequired}
                                    </span>
                                  </div>
                                  
                                  {/* Vols List */}
                                  <div className={`flex flex-col flex-1 gap-[3px] max-h-[120px] ${isShiftExpanded ? 'overflow-y-auto scrollbar-hide pr-1' : 'overflow-hidden'}`}>
                                    {vols.length === 0 ? (
                                      <p className="text-[10px] text-white/40 italic py-1 text-center">Sin asignaciones</p>
                                    ) : (
                                      vols.map(vol => (
                                        <div 
                                          key={vol.id} 
                                          className="flex items-center gap-1.5 cursor-pointer hover:bg-white/10 p-1 -mx-1 rounded-md transition-colors" 
                                          onClick={(e) => { e.stopPropagation(); toggleDay(key); handleEditClick(vol); }}
                                        >
                                          <div className="w-1.5 h-1.5 bg-white/60 rounded-full shrink-0" />
                                          <span className="volunteer-name-text text-white/90 truncate">{vol.name}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>

                                  {/* Expand Button */}
                                  {hasMore && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleShiftExpand(key, t); }}
                                      className="w-full mt-2 pt-1.5 pb-1 flex items-center justify-center gap-1 font-inter text-[10px] font-medium text-white/60 hover:text-white uppercase tracking-widest border-t border-white/5 transition-colors"
                                    >
                                      {isShiftExpanded ? (
                                        <>Colapsar <span className="material-symbols-outlined text-[14px] rotate-180">expand_more</span></>
                                      ) : (
                                        <>+{hiddenCount} más <span className="material-symbols-outlined text-[14px]">expand_more</span></>
                                      )}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
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
      className="w-full mx-auto pb-12"
    >

      {/* Sticky Header matching image design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight">Turnos</h1>
          <div className="flex bg-gray-200 dark:bg-dark3 rounded-full p-1 border border-black/5 dark:border-white/10">
            <button className="px-4 py-1.5 rounded-full text-[10px] font-medium text-text-dim hover:text-text transition-colors">Groups</button>
            <button className="bg-white dark:bg-white px-4 py-1.5 rounded-full text-[10px] font-semibold text-black shadow-sm transition-colors">ABC</button>
          </div>
        </motion.div>

        {/* Search Input matching image */}
        <motion.div variants={itemVariants} className="w-full">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar turnos o grupos"
              className="w-full bg-[#fff6] border border-black/10 dark:border-white/10 text-white placeholder:text-white/70 rounded-full pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all text-[13px] font-bold font-inter"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </motion.div>
      </div>

      {/* Lista de días (1 columna para máximo ancho) */}
      <div className="flex flex-col gap-2 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        {EVENT_DAYS.map(d => {
          const card = renderDayCard(d);
          return card ? (
            <motion.div key={d.key} variants={itemVariants} className="w-full">
              {card}
            </motion.div>
          ) : null;
        })}
      </div>

      {/* Editor Lateral */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="right"
          style={{ width: '620px', maxWidth: '95vw' }}
          className="bg-dark2 text-text border-l border-border p-0 overflow-y-auto"
        >
          {editingVolunteer && (
            <div className="p-0 space-y-0">
              {/* Identity Header (High End) */}
              <div className="bg-dark2 px-8 py-10 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-[#4d7cfe] rounded-2xl flex items-center justify-center shadow-lg shadow-[#4d7cfe]/30">
                      <span className="material-symbols-outlined text-[24px]">person</span>
                    </div>
                  </div>
                  <h2 className="tracking-tight text-white mb-2">{editingVolunteer.name}</h2>
                  <div className="flex items-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-text-dim">corporate_fare</span>
                      <span className="text-sm font-medium text-text-dim">{editingVolunteer.committee}</span>
                    </div>
                    <div className="w-px h-4 bg-dark2/10" />
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-text-dim">call</span>
                      <span className="text-sm font-medium text-text-dim">{editingVolunteer.phone}</span>
                    </div>
                  </div>
                </div>
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#4d7cfe]/10 rounded-full blur-[80px] -mr-32 -mt-32" />
              </div>

              <div className="p-8 space-y-10">
                {/* Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-dark3 border border-border rounded-3xl">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Barrio</p>
                    <span className="text-sm font-bold text-text truncate block" title={editingVolunteer.ward}>{editingVolunteer.ward || '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Estaca</p>
                    <span className="text-sm font-bold text-text truncate block" title={editingVolunteer.stake}>{editingVolunteer.stake || '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Edad</p>
                    <span className="text-sm font-bold text-text">{editingVolunteer.age ? `${editingVolunteer.age} años` : '—'}</span>
                  </div>
                </div>

                {/* Resumen de Turnos Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-bold text-text leading-none">Cronograma de Servicio</h3>
                      <p className="text-sm font-medium text-text-dim">Gestión de disponibilidad y asignaciones.</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {saved && <span className="text-[11px] text-accent font-bold animate-pulse">✓ Guardado</span>}
                      {isEditingShifts ? (
                        <Button onClick={handleSaveShifts} className="h-10 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl shadow-lg shadow-blue-500/15 font-bold transition-all active:scale-[0.97]">
                          Confirmar Cambios
                        </Button>
                      ) : (
                        <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} variant="outline" className="h-10 border-border hover:bg-dark3 text-text rounded-xl font-bold transition-all active:scale-[0.97]">
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
                        <div className="bg-dark2 border border-border rounded-2xl p-5 shadow-sm">
                          <p className="text-2xl font-bold text-text tabular-nums leading-none mb-1">{totalTurnos}</p>
                          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Turnos</p>
                        </div>
                        <div className="bg-dark2 border border-border rounded-2xl p-5 shadow-sm">
                          <p className="text-2xl font-bold text-text tabular-nums leading-none mb-1">{diasCubiertos}</p>
                          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Días</p>
                        </div>
                        <div className="bg-dark2 border border-border rounded-2xl p-5 shadow-sm border-b-2 border-b-accent">
                          <p className="text-2xl font-bold text-accent tabular-nums leading-none mb-1">{editingVolunteer.reliability}%</p>
                          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Confiab.</p>
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
                          className={`group border rounded-3xl overflow-hidden transition-all duration-300 ${hasShifts || isEditingShifts
                              ? 'border-border bg-dark2 shadow-sm'
                              : 'border-border bg-dark3 opacity-40 grayscale-[0.5]'
                            }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-stretch">
                            {/* Date Panel */}
                            <div className={`shrink-0 sm:w-20 flex sm:flex-col items-center justify-center py-4 px-4 border-b sm:border-b-0 sm:border-r transition-colors ${hasShifts ? 'bg-[#4d7cfe]/5 border-[#4d7cfe]/10' : 'bg-dark3 border-border'
                              }`}>
                              <p className={`text-[10px] font-bold uppercase tracking-widest leading-none mb-1 ${hasShifts ? 'text-[#4d7cfe]' : 'text-text-dim'}`}>
                                {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                              </p>
                              <p className="text-2xl font-bold text-text leading-tight">{d.dateNum}</p>
                            </div>

                            {/* Shifts Grid (The Shells) */}
                            <div className="flex-1 p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {['T1', 'T2', 'T3', 'T4'].map((t) => {
                                const active = dayShifts.includes(t);
                                const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];

                                return (
                                  <button
                                    key={t}
                                    disabled={!isEditingShifts}
                                    onClick={() => toggleShift(d.key, t)}
                                    className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all ${active
                                        ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-md shadow-blue-500/20'
                                        : 'bg-dark2 border-border text-text-dim hover:border-border'
                                      } ${isEditingShifts ? 'cursor-pointer active:scale-[0.92]' : 'cursor-default'
                                      }`}
                                  >
                                    <span className="text-xs font-bold">{t}</span>
                                    <span className={`text-[8px] font-bold uppercase tracking-tighter mt-0.5 ${active ? 'text-white/80' : 'text-text-dim'}`}>
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
