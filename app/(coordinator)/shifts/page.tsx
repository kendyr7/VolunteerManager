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
import { checkOutVolunteer, adjustCheckoutTimeAction } from "@/app/actions/attendance";
import { undoVolunteerCheckInAction } from "@/app/actions/audit-actions";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch } from "@/lib/search-context";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { cn, normalizeSearch } from "@/lib/utils";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { canEditShifts } from "@/lib/permissions";
import { useCoordinatorData } from "@/lib/coordinator-data-context";
import { ReassignShiftModal } from "@/components/ReassignShiftModal";
import { VolunteerProfileDrawer } from "@/components/VolunteerProfileDrawer";

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

const getShiftColor = (shiftId: string, count: number, minRequired: number, showColors: boolean = true) => {
  if (!showColors || minRequired <= 0) {
    // Estilo neutro y limpio cuando los colores están desactivados
    return {
      card: 'bg-dark2 border-border shadow-sm',
      border: 'border-border',
      title: 'text-text',
      badge: 'bg-dark3 text-text-dim border border-border',
      dot: 'bg-mid'
    };
  }

  const isUnderstaffed = count < minRequired;
  const isCritical = count <= Math.floor(minRequired / 2);

  if (isCritical) {
    // Rojo suave para alertas críticas
    return {
      card: 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/30',
      border: 'border-rose-500/30',
      title: 'text-rose-500',
      badge: 'bg-rose-500/20 text-rose-500 border border-rose-500/30',
      dot: 'bg-rose-500'
    };
  } else if (isUnderstaffed) {
    // Naranja suave para déficit / casi lleno
    return {
      card: 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/30',
      border: 'border-amber-500/30',
      title: 'text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30',
      dot: 'bg-amber-500'
    };
  } else {
    // Verde suave para cubierto / lleno totalmente
    return {
      card: 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/30',
      border: 'border-emerald-500/30',
      title: 'text-emerald-600 dark:text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
      dot: 'bg-emerald-500'
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
  const EVENT_DAYS_DEFAULT = useMemo(() => EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),                   // clave única: 'jue 10'
    label: formatDateShort(date).split(' ')[0],    // solo el día: 'jue'
    dateNum: formatDateShort(date).split(' ')[1],  // solo el número: '10'
  })), [EVENT_DAYS_RAW]);

  // Estados de filtros
  const [inputValue, setInputValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [viewMode, setViewMode] = useState<'turnos' | 'active' | 'completed'>('active');
  const [checkoutModal, setCheckoutModal] = useState<{ isOpen: boolean; item: any | null }>({ isOpen: false, item: null });

  // Reassign State
  const [isReassignSheetOpen, setIsReassignSheetOpen] = useState(false);
  const [reassignVolunteer, setReassignVolunteer] = useState<VolunteerType | null>(null);
  const [reassignSourceDayKey, setReassignSourceDayKey] = useState<string>("");
  const [reassignSourceShiftId, setReassignSourceShiftId] = useState<string>("");
  const [reassignDayKey, setReassignDayKey] = useState<string>("");
  const [reassignShiftId, setReassignShiftId] = useState<string>("");

  const supabase = createClient();

  // ── Shared context cache (no per-page fetch) ──────────────────────────────
  const {
    rawVolunteers,
    committeesList,
    shiftsData: contextShiftsData,
    globalShifts: contextGlobalShifts,
    indexedAssignments: contextIndexedAssignments,
    checkedInMap: contextCheckedInMap,
    checkedOutMap: contextCheckedOutMap,
    shiftCounts: contextShiftCounts,
    loading,
    refresh,
  } = useCoordinatorData();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Map raw volunteers to the local VolunteerType shape
  const volunteers = useMemo<VolunteerType[]>(
    () =>
      rawVolunteers.map((v: any) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        first_name: v.first_name || '',
        last_name: v.last_name || '',
        stake: v.stake || '',
        ward: v.neighborhood || '',
        phone: v.phone || '',
        shifts: contextShiftCounts[v.id] || 0,
        reliability: v.reliability_score || 100,
        committee: v.committees?.name || 'Sin comité',
        committee_id: v.committee_id,
        status: v.status,
        age: v.age,
      })),
    [rawVolunteers, contextShiftCounts]
  );

  // Quick lookup map for volunteers by ID
  const volunteerMap = useMemo(() => {
    const map = new Map<string, VolunteerType>();
    volunteers.forEach(v => map.set(v.id, v));
    return map;
  }, [volunteers]);

  // rawShiftsData comes directly from the shared coordinator context (no local fetch)
  const rawShiftsData = contextShiftsData;

  const EVENT_DAYS = useMemo(() => {
    const existingKeys = new Set(EVENT_DAYS_DEFAULT.map(d => d.key.toLowerCase()));
    const extraDays: Array<{ date: Date; key: string; label: string; dateNum: string }> = [];

    (rawShiftsData || []).forEach((s: any) => {
      if (s.day_key && !existingKeys.has(s.day_key.toLowerCase())) {
        existingKeys.add(s.day_key.toLowerCase());
        const parts = s.day_key.split(' ');
        extraDays.push({
          date: new Date(),
          key: s.day_key,
          label: (parts[0] || s.day_key).substring(0, 3),
          dateNum: parts[1] || ''
        });
      }
    });

    return [...EVENT_DAYS_DEFAULT, ...extraDays];
  }, [EVENT_DAYS_DEFAULT, rawShiftsData]);

  // Toast State
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    isVisible: boolean;
    actionLabel?: string;
    onAction?: () => void;
  }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const showToast = useCallback((
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    actionLabel?: string,
    onAction?: () => void
  ) => {
    setToast({ message, type, isVisible: true, actionLabel, onAction });
  }, []);

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

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee && role !== 'Admin') {
      setSelectedCommittees([committee]);
    }
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
  const [showCapacityColors, setShowCapacityColors] = useState<boolean>(true);

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

  const toggleShiftExpand = useCallback((dayKey: string, shiftKey: string) => {
    const combinedKey = `${dayKey}-${shiftKey}`;
    setExpandedShifts(prev => ({ ...prev, [combinedKey]: !prev[combinedKey] }));
  }, []);

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  // checkedInMap, checkedOutMap, and globalShifts come from CoordinatorDataProvider
  const globalShifts = contextGlobalShifts;
  const checkedInMap = contextCheckedInMap;
  const checkedOutMap = contextCheckedOutMap;

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

    const committeeListNames = committeesList.map(c => c.name);
    const committeeAlerts: Record<string, number> = {};
    committeeListNames.forEach(c => {
      committeeAlerts[c] = 0;
    });

    let totalAlertsCount = 0;
    let editorMissingVolunteers = 0;
    let editorShiftsOk = 0;
    let editorShiftsUnderstaffed = 0;

    const targetCommittees = currentRole === 'Admin' ? committeeListNames : (activeCommittee ? [activeCommittee] : []);

    EVENT_DAYS.forEach(day => {
      const dayAssignments = contextIndexedAssignments[day.key] || {};
      
      targetCommittees.forEach(comm => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          totalRequired += req;

          // Optimization: Use pre-calculated assignments instead of filtering all volunteers
          const commAssignedIds = dayAssignments[shiftId]?.[comm] || [];
          const count = commAssignedIds.length;

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
  }, [committeesList, contextIndexedAssignments, committeeRequirements, EVENT_DAYS, currentRole, activeCommittee]);


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

  // Helper for filtering a single volunteer (used by multiple logic points)
  const matchesFilters = useCallback((v: VolunteerType, searchStr: string, comms: string[], stakes: string[], wards: string[], role: string) => {
    // Role-based isolation
    const userCommittee = localStorage.getItem('mock_committee');
    if (role === 'Editor' && v.committee !== userCommittee) return false;

    const searchTerms = searchStr.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
    const normName = normalizeSearch(v.name);
    const normPhone = v.phone || '';
    const normCommittee = normalizeSearch(v.committee);
    const normStake = normalizeSearch(v.stake);
    const normWard = normalizeSearch(v.ward);

    const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
      normName.includes(term) ||
      normPhone.includes(searchStr) ||
      normCommittee.includes(term) ||
      normStake.includes(term) ||
      normWard.includes(term)
    );

    const matchesCommittee = comms.length === 0 || comms.includes(v.committee);
    const matchesStake = stakes.length === 0 || stakes.includes(v.stake);
    const matchesWard = wards.length === 0 || wards.includes(v.ward);

    return matchesSearch && matchesCommittee && matchesStake && matchesWard;
  }, []);

  const filteredVolunteers = useMemo(() => {
    return volunteers.filter(v => matchesFilters(v, appliedSearch, selectedCommittees, selectedStakes, selectedWards, currentRole));
  }, [volunteers, appliedSearch, selectedCommittees, selectedStakes, selectedWards, currentRole, matchesFilters]);

  // Lógica determinista para asignar voluntarios a los turnos basándose en los filtros actuales
  const getAssignedVolunteers = useCallback((dateKey: string, shiftId: string) => {
    const dayAssignments = contextIndexedAssignments[dateKey]?.[shiftId] || {};
    const assignedIdsFromProps = Object.values(dayAssignments).flat();

    const dbShiftVols = rawShiftsData
      .filter(s => (s.day_key === dateKey || (s.day_key && dateKey && s.day_key.toLowerCase() === dateKey.toLowerCase())) && s.shift_key === shiftId)
      .map(s => s.volunteer_id);

    const allCandidateIds = Array.from(new Set([...assignedIdsFromProps, ...dbShiftVols]));
    const result: VolunteerType[] = [];

    for (const id of allCandidateIds) {
      const vol = volunteerMap.get(id);
      if (!vol) continue;

      if (matchesFilters(vol, appliedSearch, selectedCommittees, selectedStakes, selectedWards, currentRole)) {
        const s = rawShiftsData.find(r => r.volunteer_id === vol.id && (r.day_key === dateKey || (r.day_key && dateKey && r.day_key.toLowerCase() === dateKey.toLowerCase())) && r.shift_key === shiftId);
        const completedLocal = completedShiftsMap[`${vol.id}-${dateKey}-${shiftId}`];
        const isCheckedIn = !!(s && (s.checked_in || s.checked_in_at)) || contextCheckedInMap[`${vol.id}-${dateKey}-${shiftId}`];
        const isCheckedOut = !!(s && (s.checked_out || s.checked_out_at)) || !!completedLocal;

        if (viewMode === 'active') {
          // En Turno: Muestra solo los que hicieron check-in y AÚN NO han completado/marcado salida.
          if (!isCheckedIn || isCheckedOut) continue;
        } else if (viewMode === 'completed') {
          // Completados: Muestra únicamente los que ya registraron salida
          if (!isCheckedOut) continue;
        }

        result.push(vol);
      }
    }

    return result.sort((a, b) => a.committee.localeCompare(b.committee));
  }, [contextIndexedAssignments, volunteerMap, appliedSearch, selectedCommittees, selectedStakes, selectedWards, currentRole, viewMode, rawShiftsData, matchesFilters, completedShiftsMap, contextCheckedInMap]);

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
      await refresh(true);
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
    await refresh(true);
  };

  const isVolunteerAssignedToShift = (vol: VolunteerType, dateKey: string, shiftId: string) => {
    const shifts = globalShifts[vol.id];
    const isAssigned = !!(shifts && shifts[dateKey] && shifts[dateKey].includes(shiftId));
    const hasShiftRecord = rawShiftsData.some(r => r.volunteer_id === vol.id && r.day_key === dateKey && r.shift_key === shiftId);
    return isAssigned || hasShiftRecord;
  };

  const handleEditClick = useCallback((vol: VolunteerType) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);

    setShiftsByDay(globalShifts[vol.id] || buildEmptyShifts());
  }, [globalShifts]);

  // qué días están expandidos (todos colapsados al inicio)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleDay = useCallback((key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] })), []);

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

      const searchTerms = appliedSearch.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
      const normName = normalizeSearch(v.name);
      const normPhone = v.phone || '';
      const normCommittee = normalizeSearch(v.committee);
      const normStake = normalizeSearch(v.stake);
      const normWard = normalizeSearch(v.ward);

      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
        normName.includes(term) ||
        normPhone.includes(appliedSearch) ||
        normCommittee.includes(term) ||
        normStake.includes(term) ||
        normWard.includes(term)
      );

      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [rawShiftsData, volunteers, currentRole, appliedSearch, selectedCommittees, selectedStakes, selectedWards]);

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
        const nowIso = new Date().toISOString();
        await supabase
          .from('shifts')
          .upsert({
            volunteer_id: volId,
            day_key: dayKey,
            shift_key: shiftKey,
            checked_in: true,
            checked_out: true,
            checked_out_at: nowIso
          }, { onConflict: 'volunteer_id,day_key,shift_key' });
      } catch (e) {
        console.error("Supabase upsert shift error:", e);
      }
    }

    const undoCheckout = async () => {
      const volId = item.volunteer?.id || item.volunteerId;
      const dayKey = item.dayKey || item.dateKey;
      const shiftKey = item.shiftKey || item.shiftId;
      if (volId && dayKey && shiftKey) {
        const key = `${volId}-${dayKey}-${shiftKey}`;
        setCompletedShiftsMap(prev => {
          const next = { ...prev };
          delete next[key];
          try {
            localStorage.setItem('completed_shifts_map', JSON.stringify(next));
          } catch (e) {}
          return next;
        });

        try {
          await supabase
            .from('shifts')
            .update({ checked_out: false, checked_out_at: null })
            .eq('volunteer_id', volId)
            .eq('day_key', dayKey)
            .eq('shift_key', shiftKey);
        } catch (e) {}

        await refresh(true);
      }
    };

    showToast(
      `Turno completado para ${item.volunteer.name}`,
      'success',
      'Deshacer',
      undoCheckout
    );
    await refresh(true);
  };

  const handleUndoCheckInInShifts = async (vol: VolunteerType, dayKey: string, shiftKey: string) => {
    if (currentRole !== 'Admin') return;
    const res = await undoVolunteerCheckInAction({
      volunteerId: vol.id,
      dayKey,
      shiftKey,
      actorName: 'Administrador',
      actorRole: currentRole
    });

    if (res.success) {
      showToast(`Check-in de ${vol.name} revertido a pendiente`);
      await refresh(true);
    } else {
      showToast(res.error || 'Error al revertir check-in', 'error');
    }
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

  const formatManaguaTime = (isoString?: string) => {
    if (!isoString) return undefined;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return undefined;
    return d.toLocaleTimeString('es-NI', {
      timeZone: 'America/Managua',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getElapsedInfoBetween = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return null;
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    const diffMs = Math.max(0, end.getTime() - start.getTime());
    const totalMins = Math.round(diffMs / (1000 * 60));

    // Comparación de días en zona horaria de Nicaragua
    const startDateManagua = start.toLocaleDateString('es-NI', { timeZone: 'America/Managua' });
    const endDateManagua = end.toLocaleDateString('es-NI', { timeZone: 'America/Managua' });
    const isOverNextDay = startDateManagua !== endDateManagua || totalMins > 720;

    const hours = Math.floor(totalMins / 60);
    const minutes = totalMins % 60;
    const isOver8Hours = hours > 8 || (hours === 8 && minutes > 0) || isOverNextDay;

    let text = '';
    if (hours > 0 && minutes > 0) text = `${hours}h ${minutes}m`;
    else if (hours > 0) text = `${hours}h`;
    else text = `${minutes}m`;

    return { text, isOver8Hours, isOverNextDay, hours, minutes, startDateManagua, endDateManagua };
  };

  // Modal de Ajuste de Hora de Salida (Alerta de Siguiente Día)
  const [adjustCheckoutModal, setAdjustCheckoutModal] = useState<{
    isOpen: boolean;
    shiftRecord: any;
    volunteer: VolunteerType | null;
    checkInTimeStr?: string;
    checkOutTimeStr?: string;
    elapsed?: any;
  }>({
    isOpen: false,
    shiftRecord: null,
    volunteer: null,
  });

  const [adjustCheckoutTargetTime, setAdjustCheckoutTargetTime] = useState<string>("12:00");
  const [adjustCheckoutReason, setAdjustCheckoutReason] = useState<string>("Ajuste de marcación de salida al mismo día");
  const [isSubmittingAdjustCheckout, setIsSubmittingAdjustCheckout] = useState<boolean>(false);

  const handleOpenAdjustCheckoutModal = (
    shiftRecord: any,
    volunteer: VolunteerType,
    checkInTimeStr?: string,
    checkOutTimeStr?: string,
    elapsed?: any
  ) => {
    setAdjustCheckoutModal({
      isOpen: true,
      shiftRecord,
      volunteer,
      checkInTimeStr,
      checkOutTimeStr,
      elapsed
    });
    setAdjustCheckoutReason("Ajuste de marcación de salida realizada al día siguiente");
  };

  const handleConfirmAdjustCheckout = async () => {
    if (!adjustCheckoutModal.shiftRecord?.id || !adjustCheckoutModal.shiftRecord?.checked_in_at) return;
    setIsSubmittingAdjustCheckout(true);

    try {
      const startIso = adjustCheckoutModal.shiftRecord.checked_in_at;
      const startDate = new Date(startIso);

      const [hStr, mStr] = adjustCheckoutTargetTime.split(':');
      const targetH = parseInt(hStr) || 12;
      const targetM = parseInt(mStr) || 0;

      const year = parseInt(startDate.toLocaleDateString('es-NI', { timeZone: 'America/Managua', year: 'numeric' }));
      const month = parseInt(startDate.toLocaleDateString('es-NI', { timeZone: 'America/Managua', month: '2-digit' }));
      const day = parseInt(startDate.toLocaleDateString('es-NI', { timeZone: 'America/Managua', day: '2-digit' }));

      // Nicaragua UTC-6
      const newUtcMs = Date.UTC(year, month - 1, day, targetH + 6, targetM, 0);
      const newCheckOutIso = new Date(newUtcMs).toISOString();

      const res = await adjustCheckoutTimeAction({
        shiftId: adjustCheckoutModal.shiftRecord.id,
        newCheckOutIso,
        reason: adjustCheckoutReason.trim()
      });

      setIsSubmittingAdjustCheckout(false);
      if (res.success) {
        showToast(res.message || "Hora de salida ajustada exitosamente.", "success");
        setAdjustCheckoutModal({ isOpen: false, shiftRecord: null, volunteer: null });
        await refresh(true);
      } else {
        showToast(res.error || "Ocurrió un error al ajustar la hora de salida.", "error");
      }
    } catch (err: any) {
      setIsSubmittingAdjustCheckout(false);
      showToast(err.message || "Error al procesar el ajuste.", "error");
    }
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
      await refresh(true);
    }
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

    const isFiltering = appliedSearch.trim() !== '' || selectedCommittees.length > 0 || selectedStakes.length > 0 || selectedWards.length > 0;

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

                let minRequired = 0;
                if (activeCommittee) {
                  minRequired = committeeRequirements[activeCommittee]?.[t] ?? 0;
                } else {
                  committees.forEach(c => {
                    minRequired += (committeeRequirements[c]?.[t] ?? 0);
                  });
                }

                let numColorClass = "text-text font-semibold";
                let labelColorClass = "text-text-dim font-bold";

                if (showCapacityColors && minRequired > 0) {
                  const isUnderstaffed = count < minRequired;
                  const isCritical = count <= Math.floor(minRequired / 2);

                  if (isCritical) {
                    numColorClass = "text-rose-500 font-extrabold";
                    labelColorClass = "text-rose-500/80 font-bold";
                  } else if (isUnderstaffed) {
                    numColorClass = "text-amber-500 font-extrabold";
                    labelColorClass = "text-amber-500/80 font-bold";
                  } else {
                    numColorClass = "text-emerald-600 dark:text-emerald-400 font-extrabold";
                    labelColorClass = "text-emerald-600/80 dark:text-emerald-400/80 font-bold";
                  }
                }

                return (
                  <div key={t} className={`flex flex-col items-center justify-center w-12 sm:w-16 ${i !== 0 ? 'border-l border-border' : ''}`}>
                    <span className={cn("text-[16px] leading-none transition-colors", numColorClass)}>{count}</span>
                    <span className={cn("font-inter text-[10px] uppercase mt-1 tracking-widest transition-colors", labelColorClass)}>{t}</span>
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

                  const c = getShiftColor(t, count, minRequired, showCapacityColors);
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
                          {minRequired > 0 ? `${count} / ${minRequired}` : `${count} Vol.`}
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
                                const checkInTimeStr = formatManaguaTime(shiftRecord?.checked_in_at);
                                const checkOutTimeStr = formatManaguaTime(shiftRecord?.checked_out_at || completedLocal?.checkedOutAt);
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
                                          <HighlightText text={vol.name} term={appliedSearch} />
                                        </span>
                                        {isCheckedOut ? (
                                           <div className="flex flex-col gap-0.5 min-w-0">
                                             <span className={`font-inter font-bold text-[9px] leading-tight ${elapsed?.isOverNextDay || elapsed?.isOver8Hours ? 'text-amber-400 font-extrabold' : 'text-gray-400 dark:text-gray-500'}`}>
                                               Completado {checkInTimeStr ? `· ${checkInTimeStr} - ${checkOutTimeStr || ''}` : ''} {elapsed ? `(${elapsed.text})` : ''}
                                             </span>
                                             {elapsed?.isOverNextDay && (
                                               <button
                                                 type="button"
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                   handleOpenAdjustCheckoutModal(shiftRecord, vol, checkInTimeStr, checkOutTimeStr, elapsed);
                                                 }}
                                                 className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-all cursor-pointer w-fit mt-0.5"
                                                 title="El check-out ocurrió en un día distinto al check-in. Haz clic para ajustar la hora de salida al mismo día."
                                               >
                                                 <span className="material-symbols-outlined text-[11px] text-amber-400">warning</span>
                                                 <span>⚠️ Pasó al siguiente día (Ajustar Salida)</span>
                                               </button>
                                             )}
                                           </div>
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
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                      <Badge variant="outline" className={`font-inter font-bold text-[9px] px-1.5 py-0 h-[18px] border ${getCommitteeColor(vol.committee)}`}>
                                        {vol.committee}
                                      </Badge>

                                      {isCheckedIn && !isCheckedOut ? (
                                        <div className="flex items-center gap-1">
                                          {currentRole === 'Admin' && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleUndoCheckInInShifts(vol, key, t);
                                              }}
                                              className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                              title="Deshacer entrada accidental y regresar a pendiente"
                                            >
                                              <span className="material-symbols-outlined text-[12px]">undo</span>
                                              <span>Deshacer</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCheckoutModal({ isOpen: true, item: { shiftId: shiftRecord?.id, volunteer: vol, checkedInAt: shiftRecord?.checked_in_at, dayKey: key, shiftKey: t } });
                                            }}
                                            className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
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
                                            className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                            title="Reasignar Turno"
                                          >
                                            <span className="material-symbols-outlined text-[12px]">sync_alt</span>
                                            <span>Reasignar</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenReassign(vol, key, t);
                                          }}
                                          className="px-2 py-0.5 rounded-full font-inter font-bold text-[9px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                          title="Reasignar Turno"
                                        >
                                          <span className="material-symbols-outlined text-[12px]">sync_alt</span>
                                          <span>Reasignar</span>
                                        </button>
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

                        let drawerCardBg = "bg-black/30 border-white/15";
                        let drawerBadgeBg = "bg-white/15 text-white/90 border-white/20";
                        let drawerIconColor = "text-white/80";

                        if (showCapacityColors && minRequired > 0) {
                          const isUnderstaffed = count < minRequired;
                          const isCritical = minRequired > 0 && count <= Math.floor(minRequired / 2);

                          if (isCritical) {
                            drawerCardBg = "bg-rose-500/20 border-rose-500/40";
                            drawerBadgeBg = "bg-rose-500/30 text-rose-200 border-rose-500/50 font-bold";
                            drawerIconColor = "text-rose-400";
                          } else if (isUnderstaffed) {
                            drawerCardBg = "bg-amber-500/20 border-amber-500/40";
                            drawerBadgeBg = "bg-amber-500/30 text-amber-200 border-amber-500/50 font-bold";
                            drawerIconColor = "text-amber-400";
                          } else {
                            drawerCardBg = "bg-emerald-500/20 border-emerald-500/40";
                            drawerBadgeBg = "bg-emerald-500/30 text-emerald-200 border-emerald-500/50 font-bold";
                            drawerIconColor = "text-emerald-400";
                          }
                        }

                        return (
                          <div
                            key={t}
                            className={cn(
                              "backdrop-blur-md rounded-[24px] p-4 shadow-lg border flex flex-col h-fit transition-all",
                              drawerCardBg
                            )}
                          >
                            {/* Turno Header */}
                            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                              <div className="flex items-center gap-2">
                                <span className={cn("material-symbols-outlined text-[16px]", drawerIconColor)}>schedule</span>
                                <span className="text-drawer-label text-white font-black text-xs sm:text-sm">Turno {t[1]}</span>
                                <span className="font-inter text-[11px] text-white/70 font-medium">{info?.time}</span>
                              </div>
                              <span className={cn("font-inter text-[10px] px-2 py-0.5 rounded-full leading-none flex items-center justify-center shrink-0 border", drawerBadgeBg)}>
                                {isSingleCommittee ? `${count}/${minRequired}` : `${count} Vol.`}
                              </span>
                            </div>

                            {/* Vols List */}
                            <div className="flex flex-col flex-1 gap-1.5">
                              {vols.length === 0 ? (
                                <p className="text-[11px] text-white/40 italic py-1.5 text-center">Sin asignaciones</p>
                              ) : (
                                (isShiftExpanded ? vols : vols.slice(0, limit)).map(vol => {
                                  const isMatch = appliedSearch.trim() !== '' && vol.name.toLowerCase().includes(appliedSearch.toLowerCase());
                                  const shiftRecord = rawShiftsData.find(s => s.volunteer_id === vol.id && s.day_key === key && s.shift_key === t);
                                  const completedLocal = completedShiftsMap[`${vol.id}-${key}-${t}`];
                                  const isCheckedOut = (shiftRecord ? (!!shiftRecord.checked_out || !!shiftRecord.checked_out_at) : false) || !!completedLocal;
                                  const isCheckedIn = shiftRecord ? (!!shiftRecord.checked_in || !!shiftRecord.checked_in_at || !!shiftRecord.checked_out || !!shiftRecord.checked_out_at) : (checkedInMap[`${vol.id}-${key}-${t}`] || !!completedLocal);
                                  const checkInTimeStr = formatManaguaTime(shiftRecord?.checked_in_at);
                                  const checkOutTimeStr = formatManaguaTime(shiftRecord?.checked_out_at || completedLocal?.checkedOutAt);
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
                                            <HighlightText text={vol.name} term={appliedSearch} />
                                          </span>
                                          {isCheckedOut ? (
                                             <div className="flex flex-col gap-0.5 min-w-0">
                                               <span className={`font-inter font-bold text-[9px] leading-tight ${elapsed?.isOverNextDay || elapsed?.isOver8Hours ? 'text-amber-400 font-extrabold' : 'text-gray-400 dark:text-gray-400'}`}>
                                                 Completado {checkInTimeStr ? `· ${checkInTimeStr} - ${checkOutTimeStr || ''}` : ''} {elapsed ? `(${elapsed.text})` : ''}
                                               </span>
                                               {elapsed?.isOverNextDay && (
                                                 <button
                                                   type="button"
                                                   onClick={(e) => {
                                                     e.stopPropagation();
                                                     handleOpenAdjustCheckoutModal(shiftRecord, vol, checkInTimeStr, checkOutTimeStr, elapsed);
                                                   }}
                                                   className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-all cursor-pointer w-fit mt-0.5"
                                                   title="El check-out ocurrió en un día distinto al check-in. Haz clic para ajustar la hora de salida al mismo día."
                                                 >
                                                   <span className="material-symbols-outlined text-[11px] text-amber-400">warning</span>
                                                   <span>⚠️ Pasó al siguiente día (Ajustar Salida)</span>
                                                 </button>
                                               )}
                                             </div>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCapacityColors(!showCapacityColors)}
              className={cn(
                "w-[60px] h-7 rounded-full text-[10px] transition-all flex items-center justify-center gap-1 font-inter font-bold border shrink-0 cursor-pointer active:scale-95",
                showCapacityColors
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30 shadow-sm"
                  : "bg-dark3 text-text-dim border-border hover:text-text"
              )}
              title={showCapacityColors ? "Ocultar colores de capacidad" : "Mostrar colores de capacidad"}
            >
              <span className="material-symbols-outlined text-[14px]">palette</span>
              <span className="w-6 text-center">{showCapacityColors ? "ON" : "OFF"}</span>
            </button>

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
          </div>
        </motion.div>

        {/* Search Input matching image */}
        <motion.div variants={itemVariants} className="w-full relative z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (appliedSearch && inputValue === appliedSearch) {
                setInputValue('');
                setAppliedSearch('');
              } else if (inputValue.trim()) {
                setAppliedSearch(inputValue.trim());
              }
            }}
            className="relative w-full flex items-center"
          >
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder={viewMode === 'active' ? "Buscar voluntario en turno..." : "Buscar por voluntario, grupo o barrio..."}
              className="w-full bg-black/5 dark:bg-[#fff6] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/70 rounded-full pl-12 pr-32 py-3.5 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 transition-all text-[13px] font-bold font-inter h-[48px]"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoComplete="off"
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center z-10">
              {appliedSearch !== '' ? (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    setAppliedSearch('');
                  }}
                  className="h-9 px-3.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  <span>Limpiar</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="h-9 px-4 bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:opacity-40 text-white rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <span className="material-symbols-outlined text-[16px]">search</span>
                  <span>Buscar</span>
                </button>
              )}
            </div>
          </form>
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

      {/* Unified Volunteer Profile Drawer */}
      <VolunteerProfileDrawer
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        volunteer={editingVolunteer}
        mode="coordinator"
      />

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

      {/* Reasignar Turno Modal Unificado */}
      <ReassignShiftModal
        isOpen={isReassignSheetOpen}
        onClose={() => {
          setIsReassignSheetOpen(false);
          setReassignVolunteer(null);
        }}
        volunteer={reassignVolunteer}
        sourceDayKey={reassignSourceDayKey}
        sourceShiftId={reassignSourceShiftId}
        onSuccess={(msg, undoAction) => showToast(msg, 'success', undoAction ? 'Deshacer' : undefined, undoAction)}
        onError={(err) => showToast(err, 'error')}
        mode="coordinator"
      />

      {/* Modal Ajustar Hora de Salida (Alerta de Siguiente Día) */}
      {adjustCheckoutModal.isOpen && adjustCheckoutModal.volunteer && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-dark2 border border-border rounded-3xl p-6 w-full max-w-md space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px]">warning</span>
                Ajustar Hora de Salida (Mismo Día)
              </h3>
              <button
                type="button"
                onClick={() => setAdjustCheckoutModal({ isOpen: false, shiftRecord: null, volunteer: null })}
                className="text-text-dim hover:text-text text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-inter leading-relaxed">
                <p className="font-extrabold text-amber-200 mb-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  Se detectó marcación de salida al día siguiente
                </p>
                <p className="text-[11px] text-amber-300/90">
                  La hora de entrada no se modificará. Elige la hora de salida correspondiente al mismo día de servicio para corregir los reportes e historial.
                </p>
              </div>

              <div className="p-4 bg-dark3 border border-border rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-dim font-medium">Voluntario:</span>
                  <span className="font-bold text-text">{adjustCheckoutModal.volunteer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim font-medium">Entrada (Fija, No modificable):</span>
                  <span className="font-bold text-emerald-400">{adjustCheckoutModal.checkInTimeStr || 'Registrada'}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-1.5">
                  <span className="text-text-dim font-medium">Salida Actual (Siguiente Día):</span>
                  <span className="font-bold text-rose-400">{adjustCheckoutModal.checkOutTimeStr} ({adjustCheckoutModal.elapsed?.text})</span>
                </div>
              </div>

              {/* Presets rápidos */}
              <div>
                <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                  Selección Rápida de Salida (Mismo Día):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '12:00 PM', val: '12:00' },
                    { label: '03:00 PM', val: '15:00' },
                    { label: '06:00 PM', val: '18:00' },
                    { label: '08:00 PM', val: '20:00' },
                    { label: '10:00 PM', val: '22:00' },
                    { label: '11:00 PM', val: '23:00' },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setAdjustCheckoutTargetTime(preset.val)}
                      className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        adjustCheckoutTargetTime === preset.val
                          ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-md'
                          : 'bg-dark3 border-border text-text hover:bg-dark3/80'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1.5">
                  Motivo de la corrección:
                </label>
                <input
                  type="text"
                  value={adjustCheckoutReason}
                  onChange={(e) => setAdjustCheckoutReason(e.target.value)}
                  placeholder="Ej: Olvidó marcar salida y cerró sesión al día siguiente"
                  className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdjustCheckoutModal({ isOpen: false, shiftRecord: null, volunteer: null })}
                  className="flex-1 h-11 rounded-full text-xs font-bold border-border text-text bg-dark3 hover:bg-dark cursor-pointer"
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  disabled={isSubmittingAdjustCheckout}
                  onClick={handleConfirmAdjustCheckout}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-extrabold rounded-full h-11 text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  {isSubmittingAdjustCheckout ? 'Guardando...' : 'Guardar Ajuste de Salida'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        actionLabel={toast.actionLabel}
        onAction={toast.onAction}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </motion.div>
  );
}
