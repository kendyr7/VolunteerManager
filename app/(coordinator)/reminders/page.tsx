'use client'

import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { AlphabetScrubber } from "@/components/AlphabetScrubber";
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
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { USER_TABLE_STYLES } from "@/app/(coordinator)/users/page";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { normalizeSearch } from "@/lib/utils";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";

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
  age?: number;
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
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileSelectorExpanded, setIsMobileSelectorExpanded] = useState(true);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // Contactados (localStorage)
  const [contactedReminders, setContactedReminders] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("contacted_reminders");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error loading contacted reminders", e);
        }
      }
    }
    return {};
  });

  // Bulk Actions State
  const [selectedVolunteers, setSelectedVolunteers] = useState<Set<string>>(new Set());
  const [isReassignSheetOpen, setIsReassignSheetOpen] = useState(false);
  const [reassignDayKey, setReassignDayKey] = useState<string>("");
  const [reassignShiftId, setReassignShiftId] = useState<string>("");

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
        committee_id: v.committee_id,
        age: v.age
      }));
      setVolunteers(mapped);
    }
  };

  // Estado del turno seleccionado (ninguno por defecto)
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isScrolled, setIsScrolled] = useState(false);

  // Auto-collapse selector on mobile scroll
  useEffect(() => {
    if (!isMobile) return;
    
    // On mobile, the main scroll container is likely the 'main' element in the layout
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    
    let lastScrollY = mainEl.scrollTop;
    
    const handleScroll = () => {
      const currentScrollY = mainEl.scrollTop;
      setIsScrolled(currentScrollY > 20);

      // If we scroll down more than 50px, collapse it, but only if day and shift are selected
      if (currentScrollY > 50 && isMobileSelectorExpanded && selectedDayKey && selectedShiftId) {
        setIsMobileSelectorExpanded(false);
      }
      lastScrollY = currentScrollY;
    };
    
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [isMobile, isMobileSelectorExpanded, selectedDayKey, selectedShiftId]);

  // Drawer states
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);

  const handleEditClick = (vol: VolunteerType) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);

    const volShifts = globalShifts[vol.id] || Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
    setShiftsByDay(volShifts);
  };

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

  const handleSaveShifts = async () => {
    setIsEditingShifts(false);
    if (!editingVolunteer) return;

    const { error: delErr } = await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', editingVolunteer.id);

    if (delErr) {
      console.error("Error deleting shifts:", delErr);
      return;
    }

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
        const contactedStored = localStorage.getItem("contacted_reminders");
        if (contactedStored) {
          try {
            setContactedReminders(JSON.parse(contactedStored));
          } catch (e) {
            console.error("Error syncing contacted", e);
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
        const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
        const normName = normalizeSearch(vol.name);
        const normCommittee = normalizeSearch(vol.committee);
        const normStake = normalizeSearch(vol.stake);
        const normWard = normalizeSearch(vol.ward);

        const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
          normName.includes(term) ||
          normCommittee.includes(term) ||
          normStake.includes(term) ||
          normWard.includes(term)
        );
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
      const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
      const normName = normalizeSearch(vol.name);
      const normCommittee = normalizeSearch(vol.committee);
      const normStake = normalizeSearch(vol.stake);
      const normWard = normalizeSearch(vol.ward);

      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
        normName.includes(term) ||
        normCommittee.includes(term) ||
        normStake.includes(term) ||
        normWard.includes(term)
      );
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

  const currentVolunteers = activeVolunteers;

  const groupedVolunteers = useMemo(() => {
    const groups: Record<string, VolunteerType[]> = {};
    activeVolunteers.forEach(v => {
      let letter = v.name.charAt(0).toUpperCase();
      if (!/^[A-Z]$/.test(letter)) letter = '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(v);
    });
    return groups;
  }, [activeVolunteers]);
  const sortedLetters = Object.keys(groupedVolunteers).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
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

  const toggleSelection = (volId: string) => {
    setSelectedVolunteers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(volId)) newSet.delete(volId);
      else newSet.add(volId);
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedVolunteers.size === currentVolunteers.length && currentVolunteers.length > 0) {
      setSelectedVolunteers(new Set());
    } else {
      setSelectedVolunteers(new Set(currentVolunteers.map(v => v.id)));
    }
  };

  const handleBulkConfirm = (confirm: boolean) => {
    setConfirmedReminders(prev => {
      const updated = { ...prev };
      selectedVolunteers.forEach(volId => {
        const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
        if (confirm) updated[key] = true;
        else delete updated[key];
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("confirmed_reminders", JSON.stringify(updated));
      }
      return updated;
    });
    setSelectedVolunteers(new Set());
    showToast(confirm ? "Asistencia confirmada" : "Asistencia cancelada");
  };

  const handleBulkContacted = () => {
    setContactedReminders(prev => {
      const updated = { ...prev };
      selectedVolunteers.forEach(volId => {
        const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
        updated[key] = true; // Always mark as contacted in bulk
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("contacted_reminders", JSON.stringify(updated));
      }
      return updated;
    });
    setSelectedVolunteers(new Set());
    showToast("Marcados como contactados");
  };

  const handleBulkReassign = async () => {
    if (!reassignDayKey || !reassignShiftId) {
      showToast("Selecciona día y turno para reasignar", "error");
      return;
    }

    setLoading(true);
    
    // Process reassignments
    const insertRows: any[] = [];
    const deletePromises = Array.from(selectedVolunteers).map(volId => {
      insertRows.push({
        volunteer_id: volId,
        day_key: reassignDayKey,
        shift_key: reassignShiftId
      });
      // Delete old shift for this specific selected day
      return supabase
        .from('shifts')
        .delete()
        .eq('volunteer_id', volId)
        .eq('day_key', selectedDayKey)
        .eq('shift_key', selectedShiftId);
    });

    await Promise.all(deletePromises);

    const { error: insErr } = await supabase
      .from('shifts')
      .upsert(insertRows, { onConflict: 'volunteer_id,day_key,shift_key', ignoreDuplicates: true });

    if (insErr) {
      console.error("Error inserting reassigned shifts:", insErr);
      showToast("Error al reasignar: " + insErr.message, "error");
    } else {
      showToast(`Reasignados a ${reassignShiftId} el ${reassignDayKey}`);
      setIsReassignSheetOpen(false);
      setSelectedVolunteers(new Set());
      await loadData();
    }
    setLoading(false);
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

  const renderQuickSelectorPill = () => {
    if (!selectedDayKey || !selectedShiftId) return null;
    return (
      <button 
        className="lg:hidden flex items-center justify-between w-full px-3 py-2 bg-dark3 transition-colors active:bg-dark2 border-b border-border/50"
        onClick={() => setIsMobileSelectorExpanded(!isMobileSelectorExpanded)}
      >
        <div className="flex items-center w-full">
          {/* Left: Selected Day Card */}
          <div 
            style={{ width: '68px', height: '52px' }}
            className={cn(
              "relative shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg border border-white/50 shadow-sm brightness-110 transition-all text-white",
              (() => {
                const idx = EVENT_DAYS.findIndex(d => d.key === selectedDayKey);
                const bgColors = ['bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]', 'bg-[#981e32]', 'bg-[#7a3994]', 'bg-[#d97c2c]', 'bg-[#10a562]'];
                return idx >= 0 ? bgColors[idx % bgColors.length] : 'bg-dark3';
              })()
            )}
          >
            <span className="font-inter font-bold text-[10px] uppercase tracking-widest text-white/90">
              {EVENT_DAYS.find(d => d.key === selectedDayKey)?.label.substring(0, 3)}
            </span>
            <span className="text-base font-black leading-none drop-shadow-sm">
              {EVENT_DAYS.find(d => d.key === selectedDayKey)?.dateNum}
            </span>
          </div>

          {/* Right: Shift Cards Quick Selector */}
          <div className="flex items-center gap-1.5 ml-auto mr-3">
            {['T1', 'T2', 'T3', 'T4'].map((t) => {
              const isSelected = selectedShiftId === t;
              
              let count = 0;
              if (selectedDayKey) {
                count = shiftCounts[selectedDayKey]?.[t] || 0;
              }
              const isSingleCommittee = selectedCommittees.length === 1;
              const activeCommittee = isSingleCommittee ? selectedCommittees[0] : null;
              const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;
              
              let buttonClass = "";
              if (isSelected) {
                if (isSingleCommittee) {
                  buttonClass = count < minRequired ? "bg-rose-600 border-rose-500 text-white shadow-sm" : "bg-teal-600 border-teal-500 text-white shadow-sm";
                } else {
                  buttonClass = "bg-[#0084d1] border-[#0084d1] text-white shadow-sm";
                }
              } else {
                if (isSingleCommittee) {
                  buttonClass = count < minRequired ? "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/20" : "bg-teal-50 border-teal-100 text-accent hover:bg-teal-100/20";
                } else {
                  buttonClass = count > 0 ? "bg-dark3 border-border text-text hover:bg-dark3" : "bg-dark2 border-border text-text-dim hover:bg-dark3";
                }
              }

              return (
                <div 
                  key={t}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedShiftId(t);
                  }}
                  style={{ width: '52px', height: '52px' }}
                  className={cn(
                    "relative shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg border transition-all font-inter font-bold",
                    buttonClass
                  )}
                >
                  <span className="font-inter font-bold text-xs">{t}</span>
                </div>
              )
            })}
          </div>
        </div>
        <span className="material-symbols-outlined text-text-dim text-[20px] shrink-0">
          {isMobileSelectorExpanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto pb-32 lg:pb-0 flex flex-col min-h-screen lg:h-full lg:overflow-hidden">


      {/* Sticky Header matching users design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-8 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Avisos
          </h1>
          <Button
            onClick={() => setShowTemplate(true)}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
            <span>Ver Plantilla</span>
          </Button>
        </div>
      </div>

      {/* Content wrapper with mobile padding */}
      <div className="flex flex-col gap-4 md:gap-6 flex-1 px-4 sm:px-6 lg:px-8 lg:min-h-0 lg:pb-6">
        {/* Selector de Turnos Rediseñado en Dos Filas */}
        <div className="shrink-0 bg-dark2 border border-border rounded-sm shadow-sm overflow-hidden flex flex-col z-30 bg-dark2/90 backdrop-blur-md sticky top-[96px]">
          
          {/* Mobile Header / Summary Pill */}
          <AnimatePresence mode="popLayout" initial={false}>
            {isScrolled && selectedDayKey && selectedShiftId ? (
              <motion.div
                key="pill"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="w-full"
              >
                {renderQuickSelectorPill()}
              </motion.div>
            ) : (
              <motion.div
                key="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="w-full"
              >
                <button 
                  className="lg:hidden flex items-center justify-between w-full p-4 bg-dark3 transition-colors active:bg-dark2"
                  onClick={() => setIsMobileSelectorExpanded(!isMobileSelectorExpanded)}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-text text-xl">event_available</span>
                    <span className="font-bold text-text text-sm">Filtros de Búsqueda</span>
                  </div>
                  <span className="material-symbols-outlined text-text-dim text-[20px]">
                    {isMobileSelectorExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selector Content (Collapsible on mobile with Framer Motion) */}
          <AnimatePresence initial={false}>
            {(isMobileSelectorExpanded || !isMobile || (!selectedDayKey || !selectedShiftId)) && (
              <motion.div 
                initial={isMobile ? { height: 0, opacity: 0 } : false}
                animate={{ height: 'auto', opacity: 1 }}
                exit={isMobile ? { height: 0, opacity: 0 } : {}}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className={cn("p-4 md:p-5 flex-col gap-4 md:gap-5 overflow-hidden", "flex")}
              >

          {/* FILA 1: FECHA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-text-dim tracking-widest uppercase">FECHA</span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-8 md:flex md:flex-wrap w-full gap-2">
              {EVENT_DAYS.map((day, index) => {
                const dayCounts = shiftCounts[day.key] || { T1: 0, T2: 0, T3: 0, T4: 0 };
                const totalVolunteersOnDay = Object.values(dayCounts).reduce((acc, count) => acc + count, 0);
                const isSelected = selectedDayKey === day.key;
                const dayAbbr = day.label.substring(0, 3); // e.g. 'jue', 'vie', 'sáb'

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
                const cardBg = bgColors[index % bgColors.length];

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
                    className={`relative shrink-0 flex flex-col items-center justify-center gap-1 p-2 md:px-4 md:py-2.5 rounded-lg md:rounded-sm border transition-all md:w-auto md:flex-1 w-full text-white ${cardBg} ${isSelected
                      ? 'border-white/50 shadow-sm scale-105 brightness-110'
                      : 'border-transparent opacity-80 hover:opacity-100 hover:scale-[1.02]'
                      }`}
                  >
                    <span className={`font-inter font-bold text-[10px] md:text-[9px] uppercase tracking-widest ${isSelected ? 'text-white/90' : 'text-white/70'}`}>
                      {dayAbbr}
                    </span>
                    <span className="text-base md:text-sm font-black leading-none drop-shadow-sm">{day.dateNum}</span>
                    <div className={`w-1.5 h-1.5 rounded-full absolute top-1.5 right-1.5 md:static md:mt-1 ${totalVolunteersOnDay > 0 ? (isSelected ? 'bg-white' : 'bg-white/70') : 'bg-black/20'
                      }`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Separador y FILA 2: TURNOS solo si no está el selector rápido visible */}
          <AnimatePresence initial={false}>
            {!(isScrolled && selectedDayKey && selectedShiftId) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="flex flex-col gap-4 md:gap-5 overflow-hidden"
              >
                {/* Separador */}
                <div className="h-px bg-border/40" />

              {/* FILA 2: TURNOS */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-text-dim tracking-widest uppercase block">TURNOS</span>
                <div className="grid grid-cols-4 md:flex md:flex-wrap gap-2">
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
                        className={`shrink-0 flex items-center justify-center gap-1.5 px-2 md:px-4.5 py-2.5 rounded-sm border text-xs transition-all w-full md:w-auto ${buttonClass}`}
                      >
                        <span className="font-inter font-bold">{t}</span>
                        <div className="w-[1px] h-3 bg-current opacity-20" />
                        <span className={`font-inter font-bold ${countTextClass}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Panel de Gestión del Turno Seleccionado (Debajo) */}
        <div className="flex flex-col w-full lg:flex-1 lg:min-h-0">
          {!selectedDayKey || !selectedShiftId ? (
            <div className="flex-1 bg-dark2 border border-border rounded-sm shadow-sm overflow-hidden p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
              <span className="material-symbols-outlined text-[64px] text-text-dim mb-4 animate-pulse">calendar_month</span>
              <h3 className="text-lg font-bold tracking-tight text-text mb-2">Ningún turno seleccionado</h3>
              <p className="text-xs font-inter font-bold text-text-dim max-w-sm leading-relaxed">
                Selecciona un día y un turno específico (T1 - T4) en el selector superior para comenzar a enviar recordatorios de WhatsApp.
              </p>
            </div>
          ) : (
            <>
              {/* Lista de Voluntarios (Completa) */}
              <div className="flex flex-col w-full lg:h-full lg:min-h-0">
                <div className="flex flex-col w-full lg:h-full lg:min-h-0">
                  <div className="bg-dark2 border border-border rounded-sm shadow-sm flex flex-col w-full relative lg:h-full lg:min-h-0">
                    <AlphabetScrubber isMobile={isMobile} />
                    <div className="bg-dark2 w-full relative lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:rounded-sm">
                      {activeVolunteers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-text-dim h-full">
                          <span className="material-symbols-outlined text-[48px] text-text-dim mb-4">group_off</span>
                          <p className="text-base font-bold text-text">Sin voluntarios asignados</p>
                          <p className="text-sm max-w-[250px] mt-1 text-text-dim">No hay voluntarios asignados a este turno para los filtros seleccionados.</p>
                        </div>
                      ) : (
                        <>
                          {/* Vista Mobile/Tablet: Tarjetas Deslizables */}
                          <div className="block lg:hidden divide-y divide-white/5 bg-dark2">
                            {sortedLetters.map(letter => (
                              <Fragment key={letter}>
                                {groupedVolunteers[letter].map((vol, index) => {
                              const isConfirmed = !!confirmedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                              const isContacted = !!contactedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                              const msg = generateReminderMessage(
                                vol.name,
                                dateStr ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) : "",
                                selectedShiftDetails?.name || "",
                                selectedShiftDetails?.time || "",
                                vol.committee,
                                isSelectedHoliday
                              );

                              return (
                                <div key={vol.id} id={index === 0 ? `letter-mobile-${letter}` : undefined} className={cn(
                                  "transition-colors",
                                  isConfirmed && "bg-[#6dd230]/5"
                                )}>
                                  <SwipeableMobileCard
                                    name={vol.name}
                                    phone={vol.phone}
                                    searchTerm={searchTerm}
                                    onEdit={() => handleEditClick(vol)}
                                    isSelected={selectedVolunteers.has(vol.id)}
                                    onToggleSelect={() => toggleSelection(vol.id)}
                                    selectionModeActive={selectedVolunteers.size > 0}

                                    onSwipeRight={() => {
                                      const link = generateWaMeLink(vol.phone, msg);
                                      window.open(link, '_blank');
                                    }}
                                    swipeRightIcon="send"
                                    swipeRightText="WhatsApp"
                                    swipeRightColorClass="text-[#25D366]"
                                    swipeRightBgColor="rgba(37, 211, 102, 0.2)"

                                    onSwipeLeft={() => toggleConfirmed(vol.id)}
                                    swipeLeftIcon={isConfirmed ? "close" : "check"}
                                    swipeLeftText={isConfirmed ? "Desmarcar" : "Confirmar"}
                                    swipeLeftColorClass={isConfirmed ? "text-text-dim" : "text-[#6dd230]"}
                                    swipeLeftBgColor={isConfirmed ? "rgba(255, 255, 255, 0.1)" : "rgba(109, 210, 48, 0.2)"}

                                    badges={
                                      <>
                                        {vol.committee && (
                                          <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(vol.committee))}>
                                            {vol.committee}
                                          </Badge>
                                        )}
                                        <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, isConfirmed ? "bg-accent/10 text-accent border-accent/20" : isContacted ? "bg-sky-500/10 text-sky-500 border-sky-500/20" : "bg-amber-50 text-amber-600 border-amber-200")}>
                                          {isConfirmed ? 'Confirmado' : isContacted ? 'Contactado' : 'Pendiente'}
                                        </Badge>
                                      </>
                                    }
                                  />
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                          </div>

                          {/* Desktop Table (Hidden on small screens) */}
                          <div className="hidden lg:block bg-dark2 relative w-full pb-10">
                            <table className="w-full text-sm text-left font-inter border-separate border-spacing-0">
                              <thead className="bg-dark3/90 sticky top-0 z-20 backdrop-blur-md border-b border-white/10 text-[10px] font-bold text-text-dim uppercase tracking-wider">
                                <tr>
                                  <th className="px-5 py-4 text-center w-24">Asistencia</th>
                                  <th className="px-5 py-4 text-center w-32">Estado</th>
                                  <th className="px-5 py-4">Nombre y Apellido</th>
                                  <th className="px-5 py-4 text-center">Barrio</th>
                                  <th className="px-5 py-4 text-center">Estaca</th>
                                  <th className="px-5 py-4 text-center">Comité</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                <AnimatePresence mode="popLayout">
                                  {sortedLetters.map(letter => (
                                    <Fragment key={letter}>
                                      {groupedVolunteers[letter].map((vol, index) => {
                                    const isConfirmed = !!confirmedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                                    const isContacted = !!contactedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
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
                                        id={index === 0 ? `letter-${letter}` : undefined}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                          if (selectedVolunteers.size > 0) {
                                            toggleSelection(vol.id);
                                          } else {
                                            handleEditClick(vol);
                                          }
                                        }}
                                        className={cn(
                                          "group hover:bg-white/[0.02] transition-colors cursor-pointer",
                                          isConfirmed && "bg-[#6dd230]/5 hover:bg-[#6dd230]/10",
                                          selectedVolunteers.has(vol.id) && "bg-[#4d7cfe]/10 hover:bg-[#4d7cfe]/15"
                                        )}
                                      >

                                        <td className="px-5 py-4 text-center" onClick={(e) => {
                                          if (selectedVolunteers.size === 0) e.stopPropagation();
                                        }}>
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
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                          {!isConfirmed ? (
                                            isContacted ? (
                                              <Badge variant="outline" className="bg-sky-500/10 text-sky-500 border-sky-500/20 font-bold uppercase text-[10px] tracking-widest px-2.5 py-0.5">
                                                Contactado
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 font-bold uppercase text-[10px] tracking-widest px-2.5 py-0.5">
                                                Pendiente
                                              </Badge>
                                            )
                                          ) : (
                                            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 font-bold uppercase text-[10px] tracking-widest px-2.5 py-0.5">
                                              Confirmado
                                            </Badge>
                                          )}
                                        </td>
                                        <td className="px-5 py-4 font-bold text-text">
                                          <div className="flex items-center gap-2">
                                            <span>{vol.name}</span>
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
                                        </td>
                                        <td className="px-5 py-4 text-text text-center">{vol.ward || '—'}</td>
                                        <td className="px-5 py-4 text-text-dim text-center">{vol.stake || '—'}</td>
                                        <td className="px-5 py-4 text-center">
                                          <Badge variant="outline" className={cn("font-bold px-2.5 py-0.5", getCommitteeColor(vol.committee))}>
                                            {vol.committee}
                                          </Badge>
                                        </td>
                                      </motion.tr>
                                    );
                                  })}
                                </Fragment>
                              ))}
                                </AnimatePresence>
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>


                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Ver Plantilla Drawer */}
        <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-all duration-300 ${showTemplate ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${showTemplate ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setShowTemplate(false)}
          />

          {/* Drawer Content */}
          <div
            id="drawer-template"
            className={`relative w-full md:w-[500px] md:mx-auto h-[80vh] md:h-[94vh] bg-dark2 border border-white/10 rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${showTemplate ? 'translate-y-0' : 'translate-y-full'}`}
            style={{ willChange: 'transform' }}
          >
            {/* Handle */}
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />

            <div
              className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-6 pt-2 overscroll-contain"
              onTouchStart={(e) => {
                const drawer = document.getElementById('drawer-template');
                if (!drawer) return;
                drawer.dataset.startY = e.touches[0].clientY.toString();
                drawer.style.transition = 'none';
              }}
              onTouchMove={(e) => {
                const drawer = document.getElementById('drawer-template');
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
                const drawer = document.getElementById('drawer-template');
                if (!drawer) return;

                drawer.style.transition = 'transform 0.3s ease-out';

                if (drawer.dataset.swiping === 'true') {
                  const startY = parseFloat(drawer.dataset.startY || '0');
                  const deltaY = e.changedTouches[0].clientY - startY;

                  drawer.dataset.swiping = 'false';

                  if (deltaY > 150) {
                    setShowTemplate(false);
                    setTimeout(() => { drawer.style.transform = ''; }, 300);
                  } else {
                    drawer.style.transform = `translateY(0)`;
                  }
                } else {
                  drawer.style.transform = '';
                }
              }}
            >
              {/* Header Drawer Info */}
              <div className="text-center mt-2 mb-8 px-4">
                <h3 className="text-xl font-bold text-text flex items-center justify-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[#0084d1]">chat_bubble</span>
                  Mensaje Plantilla
                </h3>
              </div>

              <div className="flex-1 flex flex-col gap-6">
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
            </div>
          </div>
        </div>

        {/* Editor Drawer / Sidebar (from Shifts/Volunteers) */}
        <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isSheetOpen ? "pointer-events-auto" : "pointer-events-none")}>
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isSheetOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setIsSheetOpen(false)}
          />

          {/* Drawer/Sidebar Content */}
          <div
            id="drawer-profile"
            className={cn(
              "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-[#0a101d]",
              isMobile
                ? `w-full max-h-[94dvh] rounded-t-[40px] shadow-2xl ${isSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
                : `w-[400px] h-full shadow-2xl border-l border-white/10 ${isSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
            )}
            style={{ willChange: 'transform' }}
          >
            {/* Fondo animado (Tema Claro) */}
            <div className="absolute inset-0 z-0 dark:hidden">
              <MeshGradientBackground colors={["#60a5fa", "#3b82f6", "#93c5fd", "#4d7cfe"]} backgroundColor="#1e3a8a" />
            </div>
            {/* Fondo animado (Tema Oscuro) */}
            <div className="absolute inset-0 z-0 hidden dark:block">
              <MeshGradientBackground colors={["#4d7cfe", "#1e3a8a", "#0ea5e9", "#2563eb"]} backgroundColor="#050a15" />
            </div>

            <div className="relative z-10 flex flex-col h-full w-full">
              {/* Handle (Mobile only) */}
              <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none lg:hidden" />

            <div
              className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-6 overscroll-contain"
              onTouchStart={(e) => {
                const drawer = document.getElementById('drawer-profile');
                if (!drawer) return;
                drawer.dataset.startY = e.touches[0].clientY.toString();
                drawer.style.transition = 'none';
              }}
              onTouchMove={(e) => {
                const drawer = document.getElementById('drawer-profile');
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
                const drawer = document.getElementById('drawer-profile');
                if (!drawer) return;

                drawer.style.transition = 'transform 0.3s ease-out';

                if (drawer.dataset.swiping === 'true') {
                  const startY = parseFloat(drawer.dataset.startY || '0');
                  const deltaY = e.changedTouches[0].clientY - startY;

                  drawer.dataset.swiping = 'false';

                  if (deltaY > 150) {
                    setIsSheetOpen(false);
                    setTimeout(() => { drawer.style.transform = ''; }, 300);
                  } else {
                    drawer.style.transform = `translateY(0)`;
                  }
                } else {
                  drawer.style.transform = '';
                }
              }}
            >
              {editingVolunteer && (
                <>
                  {/* Header Profile Info */}
                  <div className="text-center mt-4 mb-8 px-4">
                    <h3 className="text-drawer-title text-white mb-1">
                      {editingVolunteer.name}
                    </h3>
                    <p className="text-drawer-subtitle text-white/80">
                      {editingVolunteer.committee} • {editingVolunteer.ward}
                    </p>
                  </div>

                  {/* Top Stats Row */}
                  <div className="flex items-center mb-8 -mx-4">
                    {(() => {
                      const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                      const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;

                      let totalAssigned = 0;
                      let totalConfirmed = 0;
                      for (const [day, shifts] of Object.entries(shiftsByDay)) {
                        for (const shift of shifts) {
                          totalAssigned++;
                          if (confirmedReminders[`${editingVolunteer.id}-${day}-${shift}`]) {
                            totalConfirmed++;
                          }
                        }
                      }
                      const dynamicReliability = totalAssigned === 0 ? '-' : Math.round((totalConfirmed / totalAssigned) * 100);

                      return (
                        <>
                          <div className="flex flex-col items-center flex-1 border-r border-white/20">
                            <span className="text-drawer-kpi-value text-white drop-shadow-md">{totalTurnos}</span>
                            <span className="text-drawer-kpi-label text-white/70 mt-2 font-inter font-bold">Turnos</span>
                          </div>
                          <div className="flex flex-col items-center flex-1 border-r border-white/20">
                            <span className="text-drawer-kpi-value text-white drop-shadow-md">{diasCubiertos}</span>
                            <span className="text-drawer-kpi-label text-white/70 mt-2 font-inter font-bold">Días</span>
                          </div>
                          <div className="flex flex-col items-center flex-1 border-r border-white/20">
                            <span className="text-drawer-kpi-value text-white drop-shadow-md">
                              {dynamicReliability}
                              {dynamicReliability !== '-' && <span className="text-[14px] font-normal text-white/70 ml-0.5">%</span>}
                            </span>
                            <span className="text-drawer-kpi-label text-white/70 mt-2 font-inter font-bold">Confia.</span>
                          </div>
                          <div className="flex flex-col items-center flex-1">
                            <span className="text-drawer-kpi-value text-white drop-shadow-md">{editingVolunteer.age || '-'}</span>
                            <span className="text-drawer-kpi-label text-white/70 mt-2 font-inter font-bold">Edad</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Acciones de Contacto */}
                  <div className="grid grid-cols-2 gap-4 px-2 mb-8">
                    <Button
                      variant="outline"
                      className="flex-1 h-11 gap-2 text-white border-white/20 bg-white/10 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all hover:bg-white/20"
                      onClick={() => window.open(`https://wa.me/${editingVolunteer.phone.replace(/\s+/g, '')}`, '_blank')}
                    >
                      <span className="material-symbols-outlined text-[20px]">message</span>
                      WHATSAPP
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-11 gap-2 text-white border-white/20 bg-white/10 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all hover:bg-white/20"
                      onClick={() => window.location.href = `tel:${editingVolunteer.phone.replace(/\s+/g, '')}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">call</span>
                      LLAMAR
                    </Button>
                  </div>

                  {/* Squad/Schedule / Day Cards List */}
                  <div className="w-full">
                    <div className="flex items-center justify-between px-2 mb-4">
                      <p className="text-drawer-label text-white">Cronograma</p>

                      <div className="flex items-center gap-3">
                        {saved && <span className="text-[11px] text-green-300 font-bold animate-pulse">✓ Listo</span>}
                        {isEditingShifts ? (
                          <button onClick={handleSaveShifts} className="h-7 px-4 bg-white hover:bg-white/90 text-black rounded-full font-bold text-[11px] shadow-md transition-all active:scale-[0.97]">
                            Guardar
                          </button>
                        ) : (
                          <button onClick={() => { setIsEditingShifts(true); setSaved(false); }} className="h-7 px-4 bg-black/20 backdrop-blur-sm border border-white/10 hover:bg-black/30 text-white rounded-full font-bold text-[11px] transition-all active:scale-[0.97]">
                            Editar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Shifts Content as Day Cards */}
                    <div className="flex flex-col gap-2 pb-12">
                      {EVENT_DAYS.map((d, index) => {
                        const dayShifts = shiftsByDay[d.key] || [];
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
                        const cardBg = bgColors[index % bgColors.length];

                        return (
                          <div key={d.key} className={`${cardBg} rounded-[20px] shadow-sm w-full overflow-hidden transition-transform duration-200 hover:scale-[1.01]`}>
                            <div className="w-full flex items-center justify-between px-5 sm:px-6 py-4">
                              {/* Left: Date */}
                              <div className="flex-1 min-w-0 pr-4 flex items-center">
                                <p className="font-inter font-bold text-white text-[13px] drop-shadow-sm truncate capitalize">
                                  {d.label} {d.dateNum}
                                </p>
                              </div>

                              {/* Right: 4 Columns (T1 to T4) */}
                              <div className="flex items-center shrink-0 ml-auto">
                                {(['T1', 'T2', 'T3', 'T4'] as const).map((t, i) => {
                                  const active = dayShifts.includes(t);
                                  return (
                                    <button
                                      key={t}
                                      disabled={!isEditingShifts}
                                      onClick={() => toggleShift(d.key, t)}
                                      className={`flex flex-col items-center justify-center w-12 sm:w-16 h-full ${i !== 0 ? 'border-l border-white/20' : ''} transition-colors ${isEditingShifts ? 'hover:bg-white/20 rounded-lg' : ''} ${active ? 'opacity-100' : 'opacity-50'}`}
                                    >
                                      <span className={`text-[16px] font-semibold drop-shadow-sm leading-none ${active ? 'text-white' : 'text-white'}`}>
                                        {active ? '✓' : '-'}
                                      </span>
                                      <span className={`font-inter text-[10px] font-bold uppercase mt-1 tracking-widest ${active ? 'text-white/90' : 'text-white/70'}`}>
                                        {t}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
        <AnimatePresence>
          {selectedVolunteers.size > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-0 md:bottom-6 left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none"
            >
              <div className="bg-dark2 border border-border shadow-2xl rounded-t-2xl md:rounded-full px-4 py-4 flex flex-col md:flex-row items-center gap-4 pointer-events-auto w-full md:w-auto max-w-2xl">
                <div className="flex items-center justify-between w-full md:w-auto">
                  <div className="flex items-center gap-2 font-bold text-text whitespace-nowrap">
                    <div className="w-6 h-6 rounded-full bg-[#4d7cfe] text-white flex items-center justify-center text-xs">
                      {selectedVolunteers.size}
                    </div>
                    <span>seleccionados</span>
                  </div>
                  {/* Mobile Clear Button */}
                  <Button 
                    variant="ghost"
                    onClick={() => setSelectedVolunteers(new Set())}
                    className="text-text-dim hover:text-text h-9 rounded-full px-2 md:hidden"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </Button>
                </div>
                
                <div className="h-px md:h-8 w-full md:w-px bg-border/50 hidden md:block" />

                <div className="grid grid-cols-2 md:flex md:flex-nowrap items-center gap-2 w-full md:w-auto justify-center">
                  <Button 
                    onClick={() => handleBulkConfirm(true)}
                    className="bg-[#6dd230]/10 hover:bg-[#6dd230]/20 text-[#6dd230] border border-[#6dd230]/20 h-9 rounded-full text-[11px] sm:text-xs font-bold w-full md:w-auto px-2 sm:px-4"
                  >
                    <span className="material-symbols-outlined text-[16px] mr-1 hidden sm:inline-block">check_circle</span>
                    Confirmar
                  </Button>
                  
                  <Button 
                    onClick={() => handleBulkContacted()}
                    className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border border-sky-500/20 h-9 rounded-full text-[11px] sm:text-xs font-bold w-full md:w-auto px-2 sm:px-4"
                  >
                    <span className="material-symbols-outlined text-[16px] mr-1 hidden sm:inline-block">forum</span>
                    Contactados
                  </Button>

                  <Button 
                    onClick={() => setIsReassignSheetOpen(true)}
                    className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 h-9 rounded-full text-[11px] sm:text-xs font-bold w-full md:w-auto px-2 sm:px-4"
                  >
                    <span className="material-symbols-outlined text-[16px] mr-1 hidden sm:inline-block">sync_alt</span>
                    Reasignar
                  </Button>

                  <Button 
                    onClick={() => handleBulkConfirm(false)}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 h-9 rounded-full text-[11px] sm:text-xs font-bold w-full md:w-auto px-2 sm:px-4"
                  >
                    <span className="material-symbols-outlined text-[16px] mr-1 hidden sm:inline-block">cancel</span>
                    Cancelar
                  </Button>
                  
                  {/* Desktop Clear Button */}
                  <Button 
                    variant="ghost"
                    onClick={() => setSelectedVolunteers(new Set())}
                    className="text-text-dim hover:text-text h-9 rounded-full px-2 hidden md:flex"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reasignar Turno Drawer */}
        <div className={`fixed inset-0 z-[105] flex flex-col justify-end transition-all duration-300 ${isReassignSheetOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isReassignSheetOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setIsReassignSheetOpen(false)}
          />

          <div
            className={`relative w-full md:w-[400px] md:mx-auto bg-dark2 border border-white/10 rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${isReassignSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            
            <div className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-text mb-1">Reasignar Turno</h3>
                <p className="text-sm text-text-dim">Moviendo a {selectedVolunteers.size} voluntarios</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-text-dim tracking-widest uppercase mb-3 block">FECHA DESTINO</label>
                  <div className="grid grid-cols-4 gap-2">
                    {EVENT_DAYS.map((d, index) => {
                      const isSelected = reassignDayKey === d.key;
                      const dayAbbr = d.label.substring(0, 3);
                      const bgColors = [
                        'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                        'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                      ];
                      const cardBg = bgColors[index % bgColors.length];
                      
                      return (
                        <button
                          key={d.key}
                          onClick={() => setReassignDayKey(d.key)}
                          className={`relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-white ${cardBg} ${isSelected
                            ? 'border-white/50 shadow-sm scale-105 brightness-110 z-10'
                            : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                        >
                          <span className={`font-inter font-bold text-[9px] uppercase tracking-widest ${isSelected ? 'text-white/90' : 'text-white/70'}`}>
                            {dayAbbr}
                          </span>
                          <span className="text-sm font-black leading-none mt-0.5 drop-shadow-sm">{d.dateNum}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2">
                  <label className="text-[10px] font-bold text-text-dim tracking-widest uppercase mb-3 block">TURNO DESTINO</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['T1', 'T2', 'T3', 'T4'].map((t) => {
                      const isSelected = reassignShiftId === t;
                      return (
                        <button
                          key={t}
                          disabled={!reassignDayKey}
                          onClick={() => setReassignShiftId(t)}
                          className={`flex items-center justify-center py-2.5 rounded-lg border text-sm font-bold transition-all ${
                            !reassignDayKey ? 'bg-dark2 border-border text-text-dim opacity-50 cursor-not-allowed' :
                            isSelected
                            ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-sm scale-105 z-10'
                            : 'bg-dark3 border-border text-text hover:bg-dark3/80 hover:text-text'
                            }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4">
                  <Button 
                    onClick={handleBulkReassign}
                    disabled={!reassignDayKey || !reassignShiftId}
                    className="w-full bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold h-12 rounded-xl"
                  >
                    Confirmar Reasignación
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        />
      </div>
    </div>
  );
}
