'use client'

import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DataTableFilter } from "@/components/DataTableFilter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { checkOutVolunteer } from "@/app/actions/attendance";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch } from "@/lib/search-context";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { cn, normalizeSearch } from "@/lib/utils";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { canEditShifts } from "@/lib/permissions";

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

const getProfileBg = (committee: string) => {
  if (!committee) return 'bg-[#4fa752]';
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#e94582]';
  if (comm.includes('guía')) return 'bg-[#4fa752]'; // Match reference image
  if (comm.includes('historia')) return 'bg-[#3b82f6]';
  if (comm.includes('traducción')) return 'bg-[#f59e0b]';
  if (comm.includes('transporte')) return 'bg-[#8b5cf6]';
  if (comm.includes('auxilios')) return 'bg-[#14b8a6]';
  return 'bg-[#4fa752]';
};

// ─── helper: highlight search term ─────────────────────────────────────────
function HighlightText({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} style={{ backgroundColor: '#fde047', color: '#111827', borderRadius: '6px', padding: '0 4px', display: 'inline', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

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
  const [viewMode, setViewMode] = useState<'turnos' | 'active' | 'completed'>('active');
  const [rawShiftsData, setRawShiftsData] = useState<any[]>([]);
  const [checkoutModal, setCheckoutModal] = useState<{ isOpen: boolean; item: any | null }>({ isOpen: false, item: null });

  // Reassign State
  const [isReassignSheetOpen, setIsReassignSheetOpen] = useState(false);
  const [reassignVolunteer, setReassignVolunteer] = useState<VolunteerType | null>(null);
  const [reassignSourceDayKey, setReassignSourceDayKey] = useState<string>("");
  const [reassignSourceShiftId, setReassignSourceShiftId] = useState<string>("");
  const [reassignDayKey, setReassignDayKey] = useState<string>("");
  const [reassignShiftId, setReassignShiftId] = useState<string>("");

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
    const cMap: Record<string, boolean> = {};
    const coMap: Record<string, boolean> = {};

    if (shiftsData) {
      setRawShiftsData(shiftsData);
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

          if (s.checked_in) {
            cMap[`${s.volunteer_id}-${s.day_key}-${s.shift_key}`] = true;
          }
          if (s.checked_out) {
            coMap[`${s.volunteer_id}-${s.day_key}-${s.shift_key}`] = true;
          }
        }
      });
    }

    setGlobalShifts(gShifts);
    setCheckedInMap(cMap);
    setCheckedOutMap(coMap);

    if (volsData) {
      const mapped = volsData.map((v: any) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        first_name: v.first_name || '',
        last_name: v.last_name || '',
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

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Estados del Sheet de Perfil
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Edit Volunteer Profile states
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit_profile'>('view');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStake, setEditStake] = useState('');
  const [editWard, setEditWard] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editCommitteeId, setEditCommitteeId] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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
  
  // Track shifts that are already checked in / out
  const [checkedInMap, setCheckedInMap] = useState<Record<string, boolean>>({});
  const [checkedOutMap, setCheckedOutMap] = useState<Record<string, boolean>>({});

  // Track completed shifts in local storage / state
  const [completedShiftsMap, setCompletedShiftsMap] = useState<Record<string, { checkedOutAt: string }>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("completed_shifts_map");
        if (saved) {
          setCompletedShiftsMap(JSON.parse(saved));
        }
      } catch (e) {}
    }
  }, []);

  const markShiftCompleted = useCallback((volId: string, dayKey: string, shiftKey: string) => {
    const key = `${volId}-${dayKey}-${shiftKey}`;
    const info = { checkedOutAt: new Date().toISOString() };
    setCompletedShiftsMap(prev => {
      const next = { ...prev, [key]: info };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("completed_shifts_map", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  }, []);

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

  const handleStartEditProfile = (vol: VolunteerType) => {
    const parts = (vol.name || '').trim().split(/\s+/);
    const fn = (vol as any).first_name || (parts.length >= 2 ? parts.slice(0, Math.ceil(parts.length / 2)).join(' ') : parts[0] || '');
    const ln = (vol as any).last_name || (parts.length >= 2 ? parts.slice(Math.ceil(parts.length / 2)).join(' ') : '');

    setEditFirstName(fn);
    setEditLastName(ln);
    setEditPhone(vol.phone || '');
    setEditStake(vol.stake || '');
    setEditWard(vol.ward || '');
    setEditAge(vol.age ? String(vol.age) : '');

    const comm = committeesList.find(c => c.name === vol.committee);
    setEditCommitteeId(comm ? comm.id : '');

    setDrawerMode('edit_profile');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVolunteer) return;

    const trimmedFirstName = editFirstName.trim();
    const trimmedLastName = editLastName.trim();
    const trimmedPhone = editPhone.trim();
    const trimmedStake = editStake.trim();
    const trimmedWard = editWard.trim();
    const trimmedAge = editAge.trim();

    // Validaciones de campos
    if (!trimmedFirstName || trimmedFirstName.length < 2) {
      showToast("Ingresa un nombre válido (mínimo 2 caracteres)", "error");
      return;
    }

    if (!trimmedLastName || trimmedLastName.length < 2) {
      showToast("Ingresa un apellido válido (mínimo 2 caracteres)", "error");
      return;
    }

    const phoneDigits = trimmedPhone.replace(/[^\d]/g, '');
    if (!trimmedPhone || phoneDigits.length < 7) {
      showToast("Ingresa un número de teléfono válido (mínimo 7 dígitos)", "error");
      return;
    }

    let ageNum: number | null = null;
    if (trimmedAge) {
      const parsedAge = parseInt(trimmedAge, 10);
      if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
        showToast("La edad debe ser un número entre 10 y 120 años", "error");
        return;
      }
      ageNum = parsedAge;
    }

    setIsSavingProfile(true);
    const supabase = createClient();

    const fullName = `${trimmedFirstName} ${trimmedLastName}`.trim();
    const commObj = committeesList.find(c => c.id === editCommitteeId || c.name === editCommitteeId);
    const commName = commObj ? commObj.name : editingVolunteer.committee;

    const { error } = await supabase
      .from('volunteers')
      .update({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        phone: trimmedPhone,
        stake: trimmedStake,
        neighborhood: trimmedWard,
        committee_id: commObj ? commObj.id : (editCommitteeId || null),
        age: ageNum,
      })
      .eq('id', editingVolunteer.id);

    if (error) {
      showToast("Error al guardar cambios del perfil", "error");
    } else {
      showToast("Perfil de voluntario actualizado correctamente");

      const updatedVol: VolunteerType = {
        ...editingVolunteer,
        name: fullName,
        phone: trimmedPhone,
        stake: trimmedStake,
        ward: trimmedWard,
        committee: commName,
        age: ageNum ?? undefined,
      };

      setEditingVolunteer(updatedVol);
      setDrawerMode('view');
      loadData();
    }
    setIsSavingProfile(false);
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
    const isAssigned = !!(shifts && shifts[dateKey] && shifts[dateKey].includes(shiftId));
    const hasShiftRecord = rawShiftsData.some(r => r.volunteer_id === vol.id && r.day_key === dateKey && r.shift_key === shiftId);
    return isAssigned || hasShiftRecord;
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

      const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
      const normName = normalizeSearch(v.name);
      const normCommittee = normalizeSearch(v.committee);
      const normStake = normalizeSearch(v.stake);
      const normWard = normalizeSearch(v.ward);

      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
        normName.includes(term) ||
        normCommittee.includes(term) ||
        normStake.includes(term) ||
        normWard.includes(term)
      );

      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [volunteers, searchTerm, selectedCommittees, selectedStakes, selectedWards, currentRole]);

  const totalActiveCount = useMemo(() => {
    return rawShiftsData.filter(s => s.checked_in && !s.checked_out).length;
  }, [rawShiftsData]);

  const activeVolunteers = useMemo(() => {
    if (!rawShiftsData || rawShiftsData.length === 0 || volunteers.length === 0) return [];

    const volMap = new Map(volunteers.map(v => [v.id, v]));
    const list: {
      shiftId: string;
      volunteer: VolunteerType;
      dayKey: string;
      shiftKey: string;
      checkedInAt?: string;
      checkedOut?: boolean;
    }[] = [];

    rawShiftsData.forEach(s => {
      if (s.checked_in && !s.checked_out) {
        const vol = volMap.get(s.volunteer_id);
        if (vol) {
          list.push({
            shiftId: s.id,
            volunteer: vol,
            dayKey: s.day_key,
            shiftKey: s.shift_key,
            checkedInAt: s.checked_in_at,
            checkedOut: !!s.checked_out
          });
        }
      }
    });

    return list.filter(item => {
      const v = item.volunteer;
      const userCommittee = localStorage.getItem('mock_committee');
      if (currentRole === 'Editor' && v.committee !== userCommittee) return false;

      const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
      const normName = normalizeSearch(v.name);
      const normCommittee = normalizeSearch(v.committee);
      const normStake = normalizeSearch(v.stake);
      const normWard = normalizeSearch(v.ward);

      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
        normName.includes(term) ||
        normCommittee.includes(term) ||
        normStake.includes(term) ||
        normWard.includes(term)
      );

      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [rawShiftsData, volunteers, currentRole, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  const handleConfirmCheckout = async () => {
    if (!checkoutModal.item) return;
    const item = checkoutModal.item;
    setCheckoutModal({ isOpen: false, item: null });

    const volId = item.volunteer?.id;
    const dayKey = item.dayKey || "";
    const shiftKey = item.shiftKey || "";

    if (volId && dayKey && shiftKey) {
      markShiftCompleted(volId, dayKey, shiftKey);
    }

    if (item.shiftId) {
      await checkOutVolunteer(item.shiftId);
    } else if (volId && dayKey && shiftKey) {
      try {
        await supabase
          .from('shifts')
          .upsert({
            volunteer_id: volId,
            day_key: dayKey,
            shift_key: shiftKey,
            checked_in: true,
            checked_out: true,
            checked_out_at: new Date().toISOString()
          }, { onConflict: 'volunteer_id,day_key,shift_key' });
      } catch (e) {
        console.error("Supabase upsert shift error:", e);
      }
    }

    showToast(`Turno completado para ${item.volunteer.name}`);
    await loadData();
  };

  const totalCompletedCount = useMemo(() => {
    const dbCount = rawShiftsData.filter(s => s.checked_out === true).length;
    let localCount = 0;
    
    // Contar los turnos en completedShiftsMap que NO están en dbCount (para evitar contar doble)
    Object.keys(completedShiftsMap).forEach(key => {
      const [volId, dayKey, shiftKey] = key.split('-');
      const isInDbAsCompleted = rawShiftsData.some(s => 
        s.volunteer_id === volId && s.day_key === dayKey && s.shift_key === shiftKey && s.checked_out === true
      );
      if (!isInDbAsCompleted) {
        localCount++;
      }
    });
    
    return dbCount + localCount;
  }, [rawShiftsData, completedShiftsMap]);

  const getElapsedInfoBetween = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return null;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (isNaN(start) || isNaN(end)) return null;
    const diffMs = Math.max(0, end - start);
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMins / 60);
    const minutes = totalMins % 60;
    const isOver8Hours = hours > 8 || (hours === 8 && minutes > 0);

    let text = '';
    if (hours > 0 && minutes > 0) text = `${hours}h ${minutes}m`;
    else if (hours > 0) text = `${hours}h`;
    else text = `${minutes}m`;

    return { text, isOver8Hours, hours, minutes };
  };

  const getReassignCapacityInfo = (targetDayKey: string, targetShiftId: string, volTarget?: VolunteerType | null) => {
    const vol = volTarget || reassignVolunteer;
    if (!targetDayKey || !targetShiftId || !vol) return null;

    const commName = vol.committee || 'Sin comité';
    const maxReq = committeeRequirements[commName]?.[targetShiftId] ?? 0;

    const currentlyAssignedCount = volunteers.filter(v =>
      v.committee === commName &&
      isVolunteerAssignedToShift(v, targetDayKey, targetShiftId)
    ).length;

    const isAlreadyAssigned = isVolunteerAssignedToShift(vol, targetDayKey, targetShiftId);
    const projectedTotal = isAlreadyAssigned ? currentlyAssignedCount : currentlyAssignedCount + 1;

    if (maxReq > 0 && (currentlyAssignedCount >= maxReq || projectedTotal > maxReq)) {
      return {
        isFull: true,
        committeeName: commName,
        currentCount: currentlyAssignedCount,
        maxReq,
        projectedTotal
      };
    }

    return { isFull: false };
  };

  const handleOpenReassign = (vol: VolunteerType, sourceDayKey: string = "", sourceShiftId: string = "") => {
    setReassignVolunteer(vol);
    setReassignSourceDayKey(sourceDayKey);
    setReassignSourceShiftId(sourceShiftId);
    setReassignDayKey(sourceDayKey || EVENT_DAYS[0]?.key || "");
    setReassignShiftId(sourceShiftId || "T1");
    setIsReassignSheetOpen(true);
  };

  const handleConfirmReassignInShifts = async () => {
    if (!reassignVolunteer || !reassignDayKey || !reassignShiftId) {
      showToast("Selecciona día y turno para reasignar", "error");
      return;
    }

    const capacityInfo = getReassignCapacityInfo(reassignDayKey, reassignShiftId, reassignVolunteer);
    if (capacityInfo?.isFull) {
      showToast(
        `El turno ${reassignShiftId} del ${reassignDayKey} ya está lleno para el comité de ${capacityInfo.committeeName} (${capacityInfo.currentCount}/${capacityInfo.maxReq} requeridos). Selecciona otra fecha u otro turno.`,
        "error"
      );
      return;
    }

    setLoading(true);

    if (reassignSourceDayKey && reassignSourceShiftId) {
      await supabase
        .from('shifts')
        .delete()
        .eq('volunteer_id', reassignVolunteer.id)
        .eq('day_key', reassignSourceDayKey)
        .eq('shift_key', reassignSourceShiftId);
    }

    const { error: insErr } = await supabase
      .from('shifts')
      .upsert({
        volunteer_id: reassignVolunteer.id,
        day_key: reassignDayKey,
        shift_key: reassignShiftId
      }, { onConflict: 'volunteer_id,day_key,shift_key', ignoreDuplicates: true });

    if (insErr) {
      console.error("Error reassigning shift:", insErr);
      showToast("Error al reasignar: " + insErr.message, "error");
    } else {
      showToast(`Turno de ${reassignVolunteer.name} reasignado a ${reassignShiftId} el ${reassignDayKey}`);
      setIsReassignSheetOpen(false);
      setReassignVolunteer(null);
      await loadData();
    }
    setLoading(false);
  };

  // Lógica determinista para asignar voluntarios a los turnos basándose en los filtros actuales
  const getAssignedVolunteers = (dateKey: string, shiftId: string) => {
    return filteredVolunteers
      .filter(vol => {
        const isAssigned = isVolunteerAssignedToShift(vol, dateKey, shiftId);
        if (!isAssigned) return false;

        if (viewMode === 'active') {
          const s = rawShiftsData.find(r => r.volunteer_id === vol.id && r.day_key === dateKey && r.shift_key === shiftId);
          return !!(s && (s.checked_in || s.checked_out || s.checked_in_at || s.checked_out_at));
        }

        return true;
      })
      .sort((a, b) => a.committee.localeCompare(b.committee));
  };

  const getTodayNicaraguaKey = useCallback(() => {
    try {
      const nicaraguaStr = new Date().toLocaleDateString("en-US", { timeZone: "America/Managua" });
      const nicDate = new Date(nicaraguaStr);
      const match = EVENT_DAYS.find(d => {
        const dDate = new Date(d.date);
        return dDate.getFullYear() === nicDate.getFullYear() &&
               dDate.getMonth() === nicDate.getMonth() &&
               dDate.getDate() === nicDate.getDate();
      });
      if (match) return match.key;
    } catch (e) {
      console.error("Error calculating Nicaragua date:", e);
    }
    return EVENT_DAYS[0]?.key || "";
  }, [EVENT_DAYS]);

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

    if (totalVolsOnDay === 0) {
      return null;
    }

    const isOpen = !!expanded[key];

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
      <div key={key} className="rounded-[20px] shadow-sm w-full bg-white dark:bg-dark2 border border-border overflow-hidden flex">
        {/* Etiqueta de color lateral estructural */}
        <div className={`w-3 shrink-0 ${cardBg} opacity-90`} />
        
        {/* Contenedor del contenido */}
        <div className="flex-1 flex flex-col min-w-0">
          <button
            onClick={() => toggleDay(key)}
            className="w-full flex items-center justify-between px-5 sm:px-6 py-5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            {/* Left: Date & Expand Indicator */}
            <div className="flex-1 min-w-0 pr-4 flex items-center gap-2">
              <p className="font-inter font-bold text-text text-[13px] truncate capitalize">
                {format(date, "EEEE", { locale: es })} {dateNum}
              </p>
              <span className={cn("material-symbols-outlined text-[20px] text-text-dim transition-transform duration-300", isOpen && "rotate-180 text-primary")}>
                expand_more
              </span>
            </div>

            {/* Right: 4 Columns */}
            <div className="flex items-center shrink-0 ml-auto">
              {(['T1', 'T2', 'T3', 'T4'] as const).map((t, i) => {
                let count = shiftData[t].length;
                if (viewMode === 'active') {
                  count = shiftData[t].filter(vol => {
                    const s = rawShiftsData.find(r => r.volunteer_id === vol.id && r.day_key === key && r.shift_key === t);
                    const isCompletedLocal = !!completedShiftsMap[`${vol.id}-${key}-${t}`];
                    const isCheckedOut = s?.checked_out || isCompletedLocal;
                    return !!(s && s.checked_in && !isCheckedOut);
                  }).length;
                }

                return (
                  <div key={t} className={`flex flex-col items-center justify-center w-12 sm:w-16 ${i !== 0 ? 'border-l border-border' : ''}`}>
                    <span className="text-[16px] font-semibold text-text leading-none">{count}</span>
                    <span className="font-inter text-[10px] font-bold text-text-dim uppercase mt-1 tracking-widest">{t}</span>
                  </div>
                );
              })}
            </div>
          </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key={`desktop-expand-${key}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
              className="hidden md:block"
            >
              <div className="grid grid-cols-2 gap-4 p-4 md:p-5 items-start border-t border-border/50">
                {(['T1', 'T2', 'T3', 'T4'] as const).map((t, index) => {
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
                    <motion.div
                      key={t}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.02, ease: [0.16, 1, 0.3, 1] }}
                      onClick={(e) => {
                        if (hasMore) {
                          e.stopPropagation();
                          toggleShiftExpand(key, t);
                        }
                      }}
                      className={`rounded-sm border p-3.5 h-fit ${c.card} ${c.border} ${hasMore ? 'cursor-pointer hover:shadow-sm transition-shadow group/card' : ''}`}
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
                              {displayedVols.map(vol => {
                                const shiftRecord = rawShiftsData.find(s => s.volunteer_id === vol.id && s.day_key === key && s.shift_key === t);
                                const completedLocal = completedShiftsMap[`${vol.id}-${key}-${t}`];
                                const isCheckedOut = (shiftRecord ? (!!shiftRecord.checked_out || !!shiftRecord.checked_out_at) : false) || !!completedLocal;
                                const isCheckedIn = shiftRecord ? (!!shiftRecord.checked_in || !!shiftRecord.checked_in_at || !!shiftRecord.checked_out || !!shiftRecord.checked_out_at) : (checkedInMap[`${vol.id}-${key}-${t}`] || !!completedLocal);
                                const checkInTimeStr = shiftRecord?.checked_in_at ? format(new Date(shiftRecord.checked_in_at), "hh:mm a") : undefined;
                                const checkOutTimeStr = shiftRecord?.checked_out_at ? format(new Date(shiftRecord.checked_out_at), "hh:mm a") : (completedLocal?.checkedOutAt ? format(new Date(completedLocal.checkedOutAt), "hh:mm a") : undefined);
                                const elapsed = getElapsedInfoBetween(shiftRecord?.checked_in_at, shiftRecord?.checked_out_at || completedLocal?.checkedOutAt);

                                return (
                                  <div
                                    key={vol.id}
                                    className={`flex items-center justify-between group border rounded-sm px-2 py-1.5 transition-all cursor-pointer ${
                                      isCheckedOut
                                        ? 'opacity-60 bg-gray-500/10 border-gray-500/20 text-text-dim dark:bg-white/5 dark:border-white/10 dark:text-gray-400 hover:opacity-100'
                                        : isCheckedIn
                                        ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15'
                                        : 'bg-dark2 border-border/40 hover:bg-dark3'
                                    }`}
                                    onClick={(e) => { e.stopPropagation(); handleEditClick(vol); }}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${isCheckedOut ? 'bg-gray-400 dark:bg-gray-600' : isCheckedIn ? 'bg-emerald-400 animate-pulse' : c.dot}`} />
                                      <div className="flex flex-col min-w-0">
                                        <span className={`font-inter font-bold text-[12px] truncate group-hover:text-[#4d7cfe] transition-colors ${
                                          isCheckedOut ? 'text-gray-400 dark:text-gray-400 font-bold' : isCheckedIn ? 'text-emerald-400 font-extrabold' : 'text-text'
                                        }`}>
                                          <HighlightText text={vol.name} term={searchTerm} />
                                        </span>
                                        {isCheckedOut ? (
                                          <span className={`font-inter font-bold text-[9px] leading-tight ${elapsed?.isOver8Hours ? 'text-red-400 font-extrabold' : 'text-gray-400 dark:text-gray-500'}`}>
                                            Completado {checkInTimeStr ? `· ${checkInTimeStr} - ${checkOutTimeStr || ''}` : ''} {elapsed ? `(${elapsed.text})` : ''}
                                          </span>
                                        ) : isCheckedIn ? (
                                          <span className={`font-inter font-bold text-[9px] leading-tight ${
                                            shiftRecord?.checked_in_at && (Date.now() - new Date(shiftRecord.checked_in_at).getTime() > 8 * 3600 * 1000)
                                              ? 'text-red-400 font-extrabold'
                                              : 'text-emerald-400/90'
                                          }`}>
                                            En turno {checkInTimeStr ? `· ${checkInTimeStr}` : ''}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                      {isCheckedIn && !isCheckedOut ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCheckoutModal({ isOpen: true, item: { shiftId: shiftRecord?.id, volunteer: vol, checkedInAt: shiftRecord?.checked_in_at, dayKey: key, shiftKey: t } });
                                            }}
                                            className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95"
                                            title="Turno Completado"
                                          >
                                            <span className="material-symbols-outlined text-[12px]">task_alt</span>
                                            <span>Completar</span>
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenReassign(vol, key, t);
                                            }}
                                            className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95"
                                            title="Reasignar Turno"
                                          >
                                            <span className="material-symbols-outlined text-[12px]">sync_alt</span>
                                            <span>Reasignar</span>
                                          </button>
                                        </div>
                                      ) : isCheckedOut ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenReassign(vol, key, t);
                                          }}
                                          className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95"
                                          title="Reasignar Turno"
                                        >
                                          <span className="material-symbols-outlined text-[12px]">sync_alt</span>
                                          <span>Reasignar</span>
                                        </button>
                                      ) : (
                                        <Badge variant="outline" className={`font-inter font-bold text-[9px] px-1.5 py-0 h-[18px] border ${getCommitteeColor(vol.committee)}`}>
                                          {vol.committee}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
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
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isOpen && (
          <>
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
                    <h3 className="text-drawer-title text-white mb-1">
                      {format(date, "EEEE", { locale: es })} {dateNum} {format(date, "MMM", { locale: es }).replace('.', '')}
                    </h3>
                    <p className="text-drawer-subtitle text-white/80">Volunteer Manager</p>
                  </div>

                  {/* Big Scores (1 vs 1) -> Total Vols vs Required */}
                  <div className="flex items-center w-full px-4 mb-8">
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-drawer-kpi-value text-white drop-shadow-md">{totalVolsOnDay}</span>
                      <span className="text-drawer-kpi-label text-white/70 mt-2">Cubiertos</span>
                    </div>
                    <div className="text-xl font-black text-white/40 mb-4 px-2">-</div>
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-drawer-kpi-value text-white drop-shadow-md">
                        {(['T1', 'T2', 'T3', 'T4'] as const).reduce((acc, t) => {
                          let minReq = 0;
                          if (activeCommittee) minReq = committeeRequirements[activeCommittee]?.[t] ?? 0;
                          else committees.forEach(c => minReq += (committeeRequirements[c]?.[t] ?? 0));
                          return acc + minReq;
                        }, 0)}
                      </span>
                      <span className="text-drawer-kpi-label text-white/70 mt-2">Requeridos</span>
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

                  {/* Match highlights -> Turnos del Día (1 Card por Turno en Mobile) */}
                  <div className="w-full">
                    <div className="space-y-3">
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

                        const combinedKey = `${key}-${t}`;
                        const isShiftExpanded = !!expandedShifts[combinedKey];

                        const limit = 5;
                        const hiddenCount = Math.max(0, vols.length - limit);
                        const hasMore = vols.length > limit;

                        return (
                          <div
                            key={t}
                            className="bg-black/20 backdrop-blur-md rounded-[24px] p-4 shadow-lg border border-white/10 flex flex-col h-fit"
                          >
                            {/* Turno Header */}
                            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-drawer-label text-white font-black text-xs sm:text-sm">{t}</span>
                                <span className="font-inter text-[11px] text-white/70 font-medium">{info?.time}</span>
                              </div>
                              <span className="font-inter text-[10px] font-bold text-white bg-white/15 px-2 py-0.5 rounded-full leading-none flex items-center justify-center shrink-0 border border-white/10">
                                {count}/{minRequired}
                              </span>
                            </div>

                            {/* Vols List */}
                            <div className="flex flex-col flex-1 gap-1.5">
                              {vols.length === 0 ? (
                                <p className="text-[11px] text-white/40 italic py-1.5 text-center">Sin asignaciones</p>
                              ) : (
                                (isShiftExpanded ? vols : vols.slice(0, limit)).map(vol => {
                                  const isMatch = searchTerm.trim() !== '' && vol.name.toLowerCase().includes(searchTerm.toLowerCase());
                                  const shiftRecord = rawShiftsData.find(s => s.volunteer_id === vol.id && s.day_key === key && s.shift_key === t);
                                  const completedLocal = completedShiftsMap[`${vol.id}-${key}-${t}`];
                                  const isCheckedOut = (shiftRecord ? (!!shiftRecord.checked_out || !!shiftRecord.checked_out_at) : false) || !!completedLocal;
                                  const isCheckedIn = shiftRecord ? (!!shiftRecord.checked_in || !!shiftRecord.checked_in_at || !!shiftRecord.checked_out || !!shiftRecord.checked_out_at) : (checkedInMap[`${vol.id}-${key}-${t}`] || !!completedLocal);
                                  const checkInTimeStr = shiftRecord?.checked_in_at ? format(new Date(shiftRecord.checked_in_at), "hh:mm a") : undefined;
                                  const checkOutTimeStr = shiftRecord?.checked_out_at ? format(new Date(shiftRecord.checked_out_at), "hh:mm a") : (completedLocal?.checkedOutAt ? format(new Date(completedLocal.checkedOutAt), "hh:mm a") : undefined);
                                  const elapsed = getElapsedInfoBetween(shiftRecord?.checked_in_at, shiftRecord?.checked_out_at || completedLocal?.checkedOutAt);

                                  return (
                                    <div
                                      key={vol.id}
                                      className={`flex items-center justify-between gap-2 cursor-pointer p-2 rounded-xl transition-all ${
                                        isCheckedOut
                                          ? 'opacity-60 bg-gray-500/10 border border-gray-500/20 dark:bg-white/5 dark:border-white/10 hover:opacity-100'
                                          : isCheckedIn
                                          ? 'bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25'
                                          : isMatch
                                          ? 'bg-yellow-400/20 ring-1 ring-yellow-300/40 hover:bg-yellow-400/30'
                                          : 'bg-white/5 hover:bg-white/10 border border-white/5'
                                      }`}
                                      onClick={(e) => { e.stopPropagation(); toggleDay(key); handleEditClick(vol); }}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                                          isCheckedOut ? 'bg-gray-400 dark:bg-gray-600' : isCheckedIn ? 'bg-emerald-400 animate-pulse' : isMatch ? 'bg-yellow-300' : 'bg-white/60'
                                        }`} />
                                        <div className="flex flex-col min-w-0">
                                          <span className={`font-inter font-bold text-[12px] truncate ${
                                            isCheckedOut ? 'text-gray-400 font-bold' : isCheckedIn ? 'text-emerald-300 font-extrabold' : 'text-white'
                                          }`}>
                                            <HighlightText text={vol.name} term={searchTerm} />
                                          </span>
                                          {isCheckedOut ? (
                                            <span className={`font-inter font-bold text-[9px] leading-tight ${elapsed?.isOver8Hours ? 'text-red-400 font-extrabold' : 'text-gray-400 dark:text-gray-400'}`}>
                                              Completado {checkInTimeStr ? `· ${checkInTimeStr} - ${checkOutTimeStr || ''}` : ''} {elapsed ? `(${elapsed.text})` : ''}
                                            </span>
                                          ) : isCheckedIn ? (
                                            <span className={`font-inter font-bold text-[9px] leading-tight ${
                                              shiftRecord?.checked_in_at && (Date.now() - new Date(shiftRecord.checked_in_at).getTime() > 8 * 3600 * 1000)
                                                ? 'text-red-400 font-extrabold'
                                                : 'text-emerald-400/90'
                                            }`}>
                                              En turno {checkInTimeStr ? `· Ingreso: ${checkInTimeStr}` : ''}
                                            </span>
                                          ) : (
                                            <span className="font-inter text-[10px] text-white/60 truncate">
                                              {[vol.committee, vol.ward].filter(Boolean).join(' · ')}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {isCheckedIn && !isCheckedOut ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCheckoutModal({ isOpen: true, item: { shiftId: shiftRecord?.id, volunteer: vol, checkedInAt: shiftRecord?.checked_in_at, dayKey: key, shiftKey: t } });
                                            }}
                                            className="w-7 h-7 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/40 transition-all flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
                                            title="Turno Completado (Check-out)"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">task_alt</span>
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenReassign(vol, key, t);
                                            }}
                                            className="w-7 h-7 rounded-full bg-purple-500/25 text-purple-200 border border-purple-400/40 hover:bg-purple-500/40 transition-all flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
                                            title="Reasignar Turno"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">sync_alt</span>
                                          </button>
                                        </div>
                                      ) : isCheckedOut ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenReassign(vol, key, t);
                                          }}
                                          className="w-7 h-7 rounded-full bg-purple-500/25 text-purple-200 border border-purple-400/40 hover:bg-purple-500/40 transition-all flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
                                          title="Reasignar Turno"
                                        >
                                          <span className="material-symbols-outlined text-[15px]">sync_alt</span>
                                        </button>
                                      ) : (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenReassign(vol, key, t);
                                            }}
                                            className="w-7 h-7 rounded-full bg-purple-500/25 text-purple-200 border border-purple-400/40 hover:bg-purple-500/40 transition-all flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
                                            title="Reasignar Turno"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">sync_alt</span>
                                          </button>
                                          <Badge variant="outline" className={`font-inter font-bold text-[9px] px-1.5 py-0 h-[18px] border ${getCommitteeColor(vol.committee)}`}>
                                            {vol.committee}
                                          </Badge>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Expand Button */}
                            {hasMore && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleShiftExpand(key, t); }}
                                className="w-full mt-2 pt-1.5 pb-1 flex items-center justify-center gap-1 font-inter text-[10px] font-bold text-white/70 hover:text-white uppercase tracking-widest border-t border-white/10 transition-colors"
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
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full mx-auto pb-32 md:pb-12"
    >

      {/* Sticky Header matching image design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight">Turnos</h1>
          <div className="flex bg-gray-200 dark:bg-dark3 rounded-full p-1 border border-black/5 dark:border-white/10">
            <button
              onClick={() => setViewMode('active')}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10px] transition-all flex items-center gap-1.5 font-inter font-bold",
                viewMode === 'active'
                  ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                  : "text-text-dim hover:text-text"
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              En Turno ({totalActiveCount})
            </button>
            <button
              onClick={() => setViewMode('turnos')}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10px] transition-all font-inter font-bold",
                viewMode === 'turnos'
                  ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                  : "text-text-dim hover:text-text"
              )}
            >
              Programación
            </button>
          </div>
        </motion.div>

        {/* Search Input matching image */}
        <motion.div variants={itemVariants} className="w-full relative z-10">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder={viewMode === 'active' ? "Buscar voluntario en turno..." : "Buscar turnos o grupos..."}
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
        </motion.div>
      </div>

      {viewMode === 'active' && totalActiveCount === 0 && (
        <div className="w-full px-4 sm:px-6 lg:px-8 mb-4">
          <div className="bg-dark2 border border-white/10 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <span className="material-symbols-outlined text-[20px]">no_accounts</span>
            </div>
            <div>
              <h4 className="font-inter font-bold text-text text-xs">Sin voluntarios activos en turno</h4>
              <p className="text-[11px] text-text-dim">
                Los voluntarios aparecerán en los turnos de cada día automáticamente al escanear su pase QR de ingreso.
              </p>
            </div>
          </div>
        </div>
      )}



      {/* Lista de días (layout unificado para Programación y En Turno) */}
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

      {/* Editor Drawer (from Shifts) — MATCHING VOLUNTEERS DIRECTORY DRAWER */}
      <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isSheetOpen ? "pointer-events-auto" : "pointer-events-none")}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isSheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsSheetOpen(false)}
        />

        {/* Drawer Content */}
        <div
          id="drawer-profile"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-[#0a101d]",
            isMobile
              ? `w-full h-[94dvh] rounded-t-[40px] shadow-2xl ${isSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[450px] h-full shadow-2xl border-l border-white/10 ${isSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >
          <div className="absolute inset-0 z-0 dark:hidden">
            <MeshGradientBackground colors={["#60a5fa", "#3b82f6", "#93c5fd", "#4d7cfe"]} backgroundColor="#1e3a8a" />
          </div>
          {/* Fondo animado (Tema Oscuro) */}
          <div className="absolute inset-0 z-0 hidden dark:block">
            <MeshGradientBackground colors={["#4d7cfe", "#1e3a8a", "#0ea5e9", "#2563eb"]} backgroundColor="#050a15" />
          </div>

          <div className="relative z-10 flex flex-col h-full w-full">
            {/* Handle */}
            {isMobile && (
              <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            )}

          <div
            className={cn("flex-1 overflow-y-auto scrollbar-hide px-4 pb-6 overscroll-contain", !isMobile && "pt-12 px-6")}
            onTouchStart={(e) => {
              if (!isMobile) return;
              const drawer = document.getElementById('drawer-profile');
              if (!drawer) return;
              drawer.dataset.startY = e.touches[0].clientY.toString();
              drawer.style.transition = 'none';
            }}
            onTouchMove={(e) => {
              if (!isMobile) return;
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
              if (!isMobile) return;
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
              <AnimatePresence mode="wait">
                {drawerMode === 'view' ? (
                  <motion.div
                    key="view"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {/* Header Profile Info */}
                    <div className="text-center mt-4 mb-8 px-4">
                      <div className="flex flex-col items-center justify-center leading-[1.25] font-black text-[26px] sm:text-[30px] text-white tracking-tight">
                        {(() => {
                          const parts = (editingVolunteer.name || '').trim().split(/\s+/).filter(Boolean);
                          if (parts.length >= 4) {
                            return (
                              <>
                                <span>{parts.slice(0, 2).join(' ')}</span>
                                <span className="text-white/95">{parts.slice(2).join(' ')}</span>
                              </>
                            );
                          }
                          return <span>{parts.join(' ')}</span>;
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                        {editingVolunteer.committee && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-[#4d7cfe]/20 text-[#8bb0ff] border border-[#4d7cfe]/30 shadow-sm">
                            <span className="material-symbols-outlined text-[13px]">groups</span>
                            {editingVolunteer.committee}
                          </span>
                        )}
                        {editingVolunteer.stake && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/25 shadow-sm">
                            <span className="material-symbols-outlined text-[13px]">account_balance</span>
                            {editingVolunteer.stake}
                          </span>
                        )}
                        {editingVolunteer.ward && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shadow-sm">
                            <span className="material-symbols-outlined text-[13px]">location_on</span>
                            {editingVolunteer.ward}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Top Stats Row */}
                    <div className="flex items-center mb-8 -mx-4">
                      {(() => {
                        const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                        const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;

                        return (
                          <>
                            <div className="flex flex-col items-center flex-1 border-r border-white/20">
                              <span className="text-drawer-kpi-value font-black text-white drop-shadow-md">{totalTurnos}</span>
                              <span className="text-drawer-kpi-label text-white/80 mt-2 font-inter font-extrabold">Turnos</span>
                            </div>
                            <div className="flex flex-col items-center flex-1 border-r border-white/20">
                              <span className="text-drawer-kpi-value font-black text-white drop-shadow-md">{diasCubiertos}</span>
                              <span className="text-drawer-kpi-label text-white/80 mt-2 font-inter font-extrabold">Días</span>
                            </div>
                            <div className="flex flex-col items-center flex-1 border-r border-white/20">
                              <span className="text-drawer-kpi-value font-black text-white drop-shadow-md">
                                {editingVolunteer.reliability}
                                <span className="text-[16px] font-bold text-white/80 ml-0.5">%</span>
                              </span>
                              <span className="text-drawer-kpi-label text-white/80 mt-2 font-inter font-extrabold">Confia.</span>
                            </div>
                            <div className="flex flex-col items-center flex-1">
                              <span className="text-drawer-kpi-value font-black text-white drop-shadow-md">{editingVolunteer.age || '-'}</span>
                              <span className="text-drawer-kpi-label text-white/80 mt-2 font-inter font-extrabold">Edad</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Acciones de Contacto y Edición de Datos */}
                    <div className="px-2 mb-8">
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          className="h-11 px-1.5 gap-1.5 text-white border-white/20 bg-white/10 font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all hover:bg-white/20 truncate"
                          onClick={() => window.open(`https://wa.me/${editingVolunteer.phone.replace(/\s+/g, '')}`, '_blank')}
                        >
                          <span className="material-symbols-outlined text-[17px] shrink-0">message</span>
                          <span>WHATSAPP</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 px-1.5 gap-1.5 text-white border-white/20 bg-white/10 font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all hover:bg-white/20 truncate"
                          onClick={() => window.location.href = `tel:${editingVolunteer.phone.replace(/\s+/g, '')}`}
                        >
                          <span className="material-symbols-outlined text-[17px] shrink-0">call</span>
                          <span>LLAMAR</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 px-1.5 gap-1.5 text-white border-white/25 bg-white/15 hover:bg-white/25 font-bold text-[11px] sm:text-xs rounded-xl shadow-md active:scale-95 transition-all truncate"
                          onClick={() => handleStartEditProfile(editingVolunteer)}
                        >
                          <span className="material-symbols-outlined text-[17px] shrink-0">edit_square</span>
                          <span>EDITAR</span>
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="pt-2 px-2"
                  >
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/15">
                      <button
                        onClick={() => setDrawerMode('view')}
                        className="flex items-center gap-1.5 text-white/80 hover:text-white font-bold text-xs bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-full transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Volver al Perfil
                      </button>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/60 font-inter">Editar Información</span>
                    </div>

                    <form onSubmit={handleSaveProfile} className="space-y-5 pb-6">
                      <div className="mb-6">
                        <h3 className="font-black text-white text-xl leading-tight">Editar Perfil</h3>
                        <p className="text-xs text-white/70 mt-1 font-inter">Actualiza los datos personales y comité asignado</p>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-white/90">Nombres</label>
                            <Input
                              value={editFirstName}
                              onChange={(e) => setEditFirstName(e.target.value)}
                              placeholder="Ej: Juan Carlos"
                              required
                              className="bg-white/10 border-white/20 text-white text-sm h-10 font-bold placeholder:text-white/40 focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-white/90">Apellidos</label>
                            <Input
                              value={editLastName}
                              onChange={(e) => setEditLastName(e.target.value)}
                              placeholder="Ej: Pérez Rodríguez"
                              required
                              className="bg-white/10 border-white/20 text-white text-sm h-10 font-bold placeholder:text-white/40 focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-white/90">Teléfono</label>
                            <Input
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              placeholder="Ej: +52 5512345678"
                              required
                              className="bg-white/10 border-white/20 text-white text-sm h-10 font-bold placeholder:text-white/40 focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-white/90">Edad</label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={editAge}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d{0,3}$/.test(val)) {
                                  setEditAge(val);
                                }
                              }}
                              placeholder="Ej: 24"
                              className="bg-white/10 border-white/20 text-white text-sm h-10 font-bold placeholder:text-white/40 focus:border-[#4d7cfe] rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-extrabold text-white/90">Comité</label>
                          <Select value={editCommitteeId} onValueChange={(v) => setEditCommitteeId(v || '')}>
                            <SelectTrigger className="w-full h-10 border text-white font-bold bg-white/10 border-white/20 rounded-lg px-3">
                              <SelectValue placeholder="Selecciona un comité">
                                {committeesList.find(c => c.id === editCommitteeId || c.name === editCommitteeId)?.name || editingVolunteer?.committee || "Selecciona un comité"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-[#0f172a] border-white/20 text-white font-bold z-[120]">
                              {committeesList.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-white/90">Estaca</label>
                            <Input
                              value={editStake}
                              onChange={(e) => setEditStake(e.target.value)}
                              placeholder="Ej: Estaca Central"
                              className="bg-white/10 border-white/20 text-white text-sm h-10 font-bold placeholder:text-white/40 focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-white/90">Barrio / Vecindario</label>
                            <Input
                              value={editWard}
                              onChange={(e) => setEditWard(e.target.value)}
                              placeholder="Ej: Barrio 1"
                              className="bg-white/10 border-white/20 text-white text-sm h-10 font-bold placeholder:text-white/40 focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 flex items-center gap-3 border-t border-white/15">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDrawerMode('view')}
                          className="flex-1 h-11 rounded-full text-xs font-bold border-white/20 text-white hover:bg-white/10"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSavingProfile}
                          className="flex-1 bg-white hover:bg-white/90 text-black rounded-full h-11 text-xs font-bold shadow-lg active:scale-95 transition-all"
                        >
                          {isSavingProfile ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
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

      <ConfirmationModal
        isOpen={checkoutModal.isOpen}
        title="Completar Turno"
        message={(() => {
          const name = checkoutModal.item?.volunteer?.name || 'este voluntario';
          const checkedInAt = checkoutModal.item?.checkedInAt;

          let elapsedText = '';
          let isOver8Hours = false;

          if (checkedInAt) {
            const start = new Date(checkedInAt).getTime();
            if (!isNaN(start)) {
              const diffMs = Math.max(0, Date.now() - start);
              const totalMins = Math.floor(diffMs / (1000 * 60));
              const hours = Math.floor(totalMins / 60);
              const minutes = totalMins % 60;

              isOver8Hours = hours > 8 || (hours === 8 && minutes > 0);

              if (hours > 0 && minutes > 0) {
                elapsedText = `${hours} ${hours === 1 ? 'hora' : 'horas'} y ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
              } else if (hours > 0) {
                elapsedText = `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
              } else {
                elapsedText = `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
              }
            }
          }

          return (
            <div className="flex flex-col gap-3 text-center">
              <span>¿Deseas marcar el turno de <strong>{name}</strong> como completado?</span>
              {elapsedText && (
                <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-inter font-medium text-slate-500 dark:text-text-dim">
                    Tiempo transcurrido de servicio:
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-inter font-bold border shadow-sm",
                      isOver8Hours
                        ? "bg-red-500/15 text-red-500 border-red-500/30 dark:bg-red-500/20 dark:text-red-400"
                        : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400"
                    )}
                  >
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    <span>{elapsedText}</span>
                  </span>
                </div>
              )}
            </div>
          );
        })()}
        confirmText="Turno Completado"
        type="primary"
        onConfirm={handleConfirmCheckout}
        onCancel={() => setCheckoutModal({ isOpen: false, item: null })}
      />

      {/* Reasignar Turno Drawer */}
      <div className={`fixed inset-0 z-[115] flex flex-col justify-end transition-all duration-300 ${isReassignSheetOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isReassignSheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsReassignSheetOpen(false)}
        />

        <div
          className={`relative w-full md:w-[420px] md:mx-auto bg-dark2 border border-white/10 rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${isReassignSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
          
          <div className="p-6">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-text mb-1">Reasignar Turno</h3>
              <p className="text-sm font-inter font-bold text-text-dim">Moviendo a {reassignVolunteer?.name}</p>
              {reassignVolunteer?.committee && (
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-inter font-bold bg-[#4d7cfe]/20 text-[#8bb0ff] border border-[#4d7cfe]/30">
                  {reassignVolunteer.committee}
                </span>
              )}
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
                        className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-lg border transition-all bg-dark3 ${isSelected
                          ? 'border-text text-text shadow-sm scale-105 z-10'
                          : 'border-border text-text-dim opacity-70 hover:opacity-100'
                          }`}
                      >
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cardBg} opacity-90`} />
                        <span className={`font-inter font-bold text-[9px] uppercase tracking-widest ${isSelected ? 'text-text' : 'text-text-dim'}`}>
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
                    const capInfo = reassignDayKey ? getReassignCapacityInfo(reassignDayKey, t) : null;
                    const isFull = capInfo?.isFull;

                    return (
                      <button
                        key={t}
                        disabled={!reassignDayKey}
                        onClick={() => setReassignShiftId(t)}
                        className={`flex flex-col items-center justify-center py-2.5 rounded-lg border text-sm font-bold transition-all relative ${
                          !reassignDayKey ? 'bg-dark2 border-border text-text-dim opacity-50 cursor-not-allowed' :
                          isFull
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25'
                          : isSelected
                          ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-sm scale-105 z-10'
                          : 'bg-dark3 border-border text-text hover:bg-dark3/80 hover:text-text'
                          }`}
                      >
                        <span>{t}</span>
                        {isFull && (
                          <span className="text-[8px] font-extrabold text-rose-400 leading-none mt-0.5 uppercase tracking-wider">Lleno</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Warning message for full shift */}
              {(() => {
                const currentCap = (reassignDayKey && reassignShiftId) ? getReassignCapacityInfo(reassignDayKey, reassignShiftId) : null;
                if (!currentCap?.isFull) return null;

                return (
                  <div className="mt-4 p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-3 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[22px] text-rose-400 shrink-0">block</span>
                    <div>
                      <p className="text-rose-200 font-extrabold text-xs mb-1">Turno Lleno</p>
                      <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                        El turno <strong className="text-white">{reassignShiftId}</strong> del <strong className="text-white">{reassignDayKey}</strong> ya alcanzó la meta máxima para el comité de <strong className="text-white">{currentCap.committeeName}</strong> ({currentCap.currentCount}/{currentCap.maxReq} requeridos).
                      </p>
                      <p className="text-[11px] text-white font-bold mt-2">
                        Por favor selecciona otra fecha u otro turno disponible para reasignar.
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-4 flex gap-3">
                <Button 
                  variant="outline"
                  onClick={() => setIsReassignSheetOpen(false)}
                  className="flex-1 bg-dark3 border-border text-text hover:bg-dark2 font-bold h-12 rounded-xl"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConfirmReassignInShifts}
                  disabled={!reassignDayKey || !reassignShiftId || !!(reassignDayKey && reassignShiftId && getReassignCapacityInfo(reassignDayKey, reassignShiftId)?.isFull)}
                  className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:bg-dark3 disabled:text-text-dim disabled:border-border text-white font-bold h-12 rounded-xl transition-all"
                >
                  Confirmar Reasignación
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </motion.div>
  );
}
