'use client'

import { AddVolunteerForm } from "@/components/AddVolunteerForm";
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { List } from 'react-window';
import { CSSProperties } from 'react';

// ...
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Phone, MoreHorizontal, UserPlus, Mail, Briefcase, MapPin, GraduationCap, Heart, Calendar } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { DataTableFilter } from "@/components/DataTableFilter";
import { createClient } from "@/lib/supabase/client";
import { cn, normalizeSearch } from "@/lib/utils";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { canEditShifts, canViewVolunteers } from "@/lib/permissions";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useSearch } from "@/lib/search-context";
import { useCoordinatorData } from "@/lib/coordinator-data-context";
import { USER_TABLE_STYLES } from "../users/page";
import { AlphabetScrubber, ALPHABET } from "@/components/AlphabetScrubber";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { formatE164, validatePhone8Digits } from "@/lib/whatsapp";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { sendWelcomeWhatsAppAction } from "@/app/actions/whatsapp";
import { VolunteerProfileView } from "@/components/VolunteerProfileView";
import { VolunteerTableRow } from "@/components/VolunteerTableRow";
import { VolunteerSearchService } from "@/lib/services/volunteer-search.service";
import { filterVolunteerIds } from "@/lib/services/volunteer-filter.service";
import { groupVolunteersAlphabetically } from "@/lib/services/volunteer-grouping.service";
import { RealtimeDebugOverlay } from "@/components/RealtimeDebugOverlay";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03
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
      damping: 28
    }
  }
};



// Interfaz para tipo
type VolunteerType = {
  id: string; // UUID de Supabase
  name: string;
  stake: string;
  ward: string;
  phone: string;
  shifts: number;
  reliability: number;
  computedReliability?: number | string;
  committee: string;
  committee_id?: string;
  status?: string;
  age?: number;
};

const getCommitteeColor = (committee: string) => {
  if (!committee) return 'bg-dark3 text-text-dim border-border';
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía') || comm.includes('guia')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción') || comm.includes('traduccion')) return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
  if (comm.includes('auxilios') || comm.includes('médico') || comm.includes('medico')) return 'bg-teal-500/15 text-teal-500 border-teal-500/20';

  const colors = [
    'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20',
    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    'bg-rose-500/15 text-rose-400 border-rose-500/20',
    'bg-orange-500/15 text-orange-400 border-orange-500/20',
    'bg-sky-500/15 text-sky-400 border-sky-500/20'
  ];
  let hash = 0;
  for (let i = 0; i < committee.length; i++) {
    hash = committee.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

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



export default function VolunteersPage() {
  const supabase = createClient();
  const {
    rawVolunteers,
    committeesList,
    globalShifts,
    checkedInMap,
    checkedOutMap,
    shiftCounts,
    reliabilityMap,
    loading,
    refresh,
  } = useCoordinatorData();
  const [inputValue, setInputValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);

  // Debounce search input to match Shifts page performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const volunteers = useMemo<VolunteerType[]>(
    () =>
      rawVolunteers.map((v: any) => {
        const name = `${v.first_name || ''} ${v.last_name || ''}`.trim();
        const committee = v.committees?.name || 'Sin comité';
        const stake = v.stake || '';
        const ward = v.neighborhood || '';
        const phone = v.phone || '';
        const normalizedSearchText = normalizeSearch(`${name} ${phone} ${committee} ${stake} ${ward}`);

        return {
          id: v.id,
          name,
          first_name: v.first_name || '',
          last_name: v.last_name || '',
          stake,
          ward,
          phone,
          shifts: shiftCounts[v.id] || 0,
          reliability: v.reliability_score || 100,
          committee,
          committee_id: v.committee_id,
          status: v.status || 'active',
          age: v.age,
          normalizedSearchText,
        };
      }),
    [rawVolunteers, shiftCounts]
  );
  const [showArchived, setShowArchived] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    type: 'primary' | 'danger';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => { },
    type: 'primary'
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  // Form states
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [volunteerToArchive, setVolunteerToArchive] = useState<VolunteerType | null>(null);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  const [permTick, setPermTick] = useState(0);

  useEffect(() => {
    const handlePermissionsChange = () => setPermTick(v => v + 1);
    window.addEventListener("storage", handlePermissionsChange);
    window.addEventListener("permissions-changed", handlePermissionsChange);
    return () => {
      window.removeEventListener("storage", handlePermissionsChange);
      window.removeEventListener("permissions-changed", handlePermissionsChange);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('');

  const handleResetPin = useCallback(async (vol: VolunteerType) => {
    setConfirmModal({
      isOpen: true,
      title: 'Resetear PIN',
      message: `¿Estás seguro de que deseas resetear el PIN de ${vol.name}? Se establecerá el PIN temporal '1234'.`,
      confirmText: 'Resetear PIN',
      type: 'primary',
      onConfirm: async () => {
        const { error } = await supabase
          .from('volunteers')
          .update({ pin: '1234' })
          .eq('id', vol.id);

        if (error) {
          console.error("Error resetting PIN:", error);
          showToast("Error al resetear el PIN", "error");
        } else {
          showToast(`PIN de ${vol.name} reseteado a '1234'`, "success");
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, []);

  const handleArchiveVolunteer = async () => {
    if (!volunteerToArchive) return;

    const newStatus = volunteerToArchive.status === 'archived' ? 'active' : 'archived';

    const { error } = await supabase
      .from('volunteers')
      .update({ status: newStatus })
      .eq('id', volunteerToArchive.id);

    if (error) {
      console.error("Error updating status:", error);
      showToast(`Error al ${newStatus === 'archived' ? 'archivar' : 'desarchivar'}`, "error");
    } else {
      showToast(`Voluntario ${newStatus === 'archived' ? 'archivado' : 'desarchivado'}`);
      await refresh();
    }

    setIsArchiveModalOpen(false);
    setVolunteerToArchive(null);
  };

  // Días reales del evento (Sep 10-26, sin domingos)
  const EVENT_DAYS = getActiveEventDays().map(date => ({
    key: formatDateShort(date),                   // clave única: 'jue 10'
    label: formatDateShort(date).split(' ')[0],    // solo el día: 'jue'
    dateNum: formatDateShort(date).split(' ')[1],  // solo el número: '10'
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(buildEmptyShifts);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee) setCurrentCommittee(committee);
  }, []);


  const toggleShift = (day: string, turno: string) => {
    if (!isEditingShifts || !canEditShifts()) {
      if (!canEditShifts()) {
        showToast("No tienes permiso para editar turnos", "error");
      }
      return;
    }
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

  const handleStartEditProfile = useCallback((vol: VolunteerType) => {
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
  }, [committeesList]);

  const handleEditClick = useCallback((vol: VolunteerType, startInEditMode = false) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);

    const volShifts = globalShifts[vol.id] || Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
    setShiftsByDay(volShifts);

    if (startInEditMode) {
      handleStartEditProfile(vol);
    } else {
      setDrawerMode('view');
    }
  }, [globalShifts, handleStartEditProfile]);

  const handleArchive = useCallback((vol: VolunteerType) => {
    setVolunteerToArchive(vol);
    setIsArchiveModalOpen(true);
  }, []);

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

    const phoneValidation = validatePhone8Digits(trimmedPhone);
    if (!phoneValidation.isValid) {
      showToast(phoneValidation.error || "Ingresa un número de teléfono válido (8 dígitos)", "error");
      return;
    }
    const sanitizedPhone = phoneValidation.formatted;

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
        phone: sanitizedPhone,
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
      void refresh();
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
    await refresh();
  };

// Removed handleAddVolunteer as logic is now in AddVolunteerForm component
  
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

  const roleFilteredVolunteers = volunteers.filter(v => {
    if (currentRole === 'Admin') return true;
    if (currentRole === 'Editor') return v.committee === currentCommittee;
    if (currentRole === 'Lector') return false; // Lector doesn't see directory
    return false;
  });
  const augmentedVolunteers = useMemo(() => {
    return volunteers.map(vol => ({
      ...vol,
      computedReliability: reliabilityMap[vol.id] ?? vol.reliability ?? 100
    }));
  }, [volunteers, reliabilityMap]);

  // Hybrid search service instance
  const searchService = useMemo(() => {
    return new VolunteerSearchService(augmentedVolunteers);
  }, [augmentedVolunteers]);

  const filteredVolunteers = useMemo(() => {
    const matchedSearchIds = new Set(searchService.search(appliedSearch));
    return filterVolunteerIds(augmentedVolunteers, matchedSearchIds, {
      currentRole,
      currentCommittee,
      showArchived,
      selectedCommittees,
      selectedStakes,
      selectedWards,
    });
  }, [
    searchService,
    augmentedVolunteers,
    appliedSearch,
    currentRole,
    currentCommittee,
    showArchived,
    selectedCommittees,
    selectedStakes,
    selectedWards,
  ]);

  const { activeCount, archivedCount } = useMemo(() => {
    const baseList = augmentedVolunteers.filter(v => {
      if (currentRole === 'Editor' && v.committee !== currentCommittee) return false;
      if (currentRole === 'Lector') return false;
      return true;
    });
    const active = baseList.filter(v => v.status !== 'archived').length;
    const archived = baseList.filter(v => v.status === 'archived').length;
    return { activeCount: active, archivedCount: archived };
  }, [augmentedVolunteers, currentRole, currentCommittee]);

  const { letters: sortedLetters, groupCounts, groupedVolunteers, groupsRecord, flatVolunteers } = useMemo(() => {
    return groupVolunteersAlphabetically(filteredVolunteers);
  }, [filteredVolunteers]);

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  if (mounted && !canViewVolunteers()) {
    return (
      <div className="w-full min-h-[65vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Acceso Restringido a Voluntarios</h2>
        <p className="text-xs text-text-dim max-w-md leading-relaxed">
          El Administrador ha deshabilitado el acceso a la lista de Voluntarios para este rol. Si necesitas acceso, contacta a un Administrador para habilitar esta política en Ajustes.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full mx-auto pb-32 lg:pb-12"
    >

      {/* Sticky Header matching users design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto shrink-0">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between gap-3">
          <h1 className="text-[28px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Voluntarios
            <span className="text-xs font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 px-2.5 py-1 rounded-full border border-[#4d7cfe]/20">
              {filteredVolunteers.length}
            </span>
          </h1>

          {/* Toggle on top right (matches Turnos page) */}
          <div className="flex bg-gray-200 dark:bg-dark3 rounded-full p-1 border border-black/5 dark:border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10px] transition-all flex items-center gap-1.5 font-inter font-bold",
                !showArchived
                  ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                  : "text-text-dim hover:text-text"
              )}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10px] transition-all flex items-center gap-1.5 font-inter font-bold",
                showArchived
                  ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                  : "text-text-dim hover:text-text"
              )}
            >
              Archivados
            </button>
          </div>
        </motion.div>

        {/* Search Input and Controls Row */}
        <motion.div variants={itemVariants} className="w-full relative z-10 flex items-center gap-2.5">
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
            className="relative flex-1 min-w-0 flex items-center"
          >
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar voluntarios por nombre, teléfono, estaca o barrio..."
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

          {/* Añadir button next to search bar with matching height */}
          <Button
            type="button"
            onClick={() => setIsAddSheetOpen(true)}
            className="flex bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-[48px] px-4 sm:px-5 text-xs font-bold transition-all active:scale-[0.97] items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Añadir</span>
          </Button>
        </motion.div>
      </div>

      <div className="flex flex-col gap-4 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        <motion.div variants={itemVariants} className="bg-dark2 border border-white/10 rounded-[20px] shadow-lg overflow-clip flex flex-col w-full">
          <AlphabetScrubber isMobile={isMobile} />
          {/* Contenedor de Datos: Escritorio PC vs Móvil */}
          {!isMobile ? (
            <div className="bg-dark2 flex-1 relative w-full pb-10">
              {filteredVolunteers.length > 0 ? (
                <div className="w-full overflow-x-auto">
                  {/* Encabezado Fijo de Tabla */}
                  <div className="flex items-center w-full px-5 py-3.5 bg-dark3 sticky top-0 z-20 text-[10px] font-bold text-text-dim uppercase tracking-wider border-b border-white/10">
                    <div className="flex-1 min-w-0 pr-4">Nombre y Apellido</div>
                    <div className="w-32 text-center shrink-0">Barrio</div>
                    <div className="w-32 text-center shrink-0">Estaca</div>
                    <div className="w-40 text-center shrink-0">Comité</div>
                    <div className="w-24 text-center shrink-0">Turnos</div>
                    <div className="w-28 text-center shrink-0">Confiabilidad</div>
                    <div className="w-32 text-center shrink-0">Acciones</div>
                  </div>

                  {/* Cuerpo de la Tabla */}
                  <div className="divide-y divide-white/5">
                    {filteredVolunteers.map((vol: VolunteerType) => (
                      <VolunteerTableRow
                        key={vol.id}
                        vol={vol}
                        appliedSearch={appliedSearch}
                        onEditClick={handleEditClick}
                        onResetPin={handleResetPin}
                        onArchive={handleArchive}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-5 py-12 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-dark3 border border-border rounded-full flex items-center justify-center mb-4 text-text-dim">
                    <span className="material-symbols-outlined text-[32px]">person_off</span>
                  </div>
                  <h3 className="font-bold text-text mb-1">No se encontraron voluntarios</h3>
                  <p className="text-sm text-text-dim">Prueba ajustando los filtros o el término de búsqueda.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-dark2 w-full pb-10">
              {filteredVolunteers.length > 0 ? (
                <div className="divide-y divide-white/5 w-full">
                  {filteredVolunteers.map((vol: VolunteerType) => (
                    <SwipeableMobileCard
                      key={vol.id}
                      name={vol.name}
                      phone={vol.phone}
                      searchTerm={appliedSearch}
                      onEdit={() => handleEditClick(vol)}

                      onSwipeRight={() => handleResetPin(vol)}
                      swipeRightIcon="lock_reset"
                      swipeRightText="Reset PIN"
                      swipeRightColorClass="text-amber-500"
                      swipeRightBgColor="rgba(245, 158, 11, 0.2)"

                      onSwipeLeft={() => handleArchive(vol)}
                      swipeLeftIcon={vol.status === 'archived' ? 'unarchive' : 'archive'}
                      swipeLeftText={vol.status === 'archived' ? 'Desarchivar' : 'Archivar'}
                      swipeLeftColorClass="text-red"
                      swipeLeftBgColor="rgba(254, 77, 151, 0.2)"

                      badges={
                        <>
                          {vol.committee && (
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(vol.committee))}>
                              {vol.committee}
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, vol.status === 'active' ? USER_TABLE_STYLES.statusActive : USER_TABLE_STYLES.statusPending)}>
                            {vol.status === 'active' ? 'Activo' : 'Archivado'}
                          </Badge>
                        </>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-dark3 border border-border rounded-full flex items-center justify-center mb-4 text-text-dim">
                    <span className="material-symbols-outlined text-[32px]">person_off</span>
                  </div>
                  <h3 className="font-bold text-text mb-1">No se encontraron voluntarios</h3>
                  <p className="text-sm text-text-dim">Prueba ajustando los filtros o el término de búsqueda.</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Editor Drawer (from Shifts) */}
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
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border",
            isMobile
              ? `w-full h-[94dvh] rounded-t-[40px] border-0 ${isSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[450px] h-full ${isSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >

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
                    <VolunteerProfileView
                      volunteer={editingVolunteer}
                      mode="coordinator"
                      shiftsByDay={shiftsByDay}
                      checkedInMap={checkedInMap}
                      checkedOutMap={checkedOutMap}
                      onToggleShift={toggleShift}
                      isEditingShifts={isEditingShifts}
                      canEditShifts={canEditShifts()}
                      onStartEditShifts={() => {
                        if (!canEditShifts()) {
                          showToast("No tienes permiso para editar turnos", "error");
                          return;
                        }
                        setIsEditingShifts(true);
                        setSaved(false);
                      }}
                      onSaveShifts={handleSaveShifts}
                      onStartEditProfile={() => handleStartEditProfile(editingVolunteer)}
                      savedNotice={saved}
                    />
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
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                      <button
                        onClick={() => setDrawerMode('view')}
                        className="flex items-center gap-1.5 text-text font-bold text-xs bg-dark3 hover:bg-dark px-3.5 py-1.5 border border-border rounded-full transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Volver al Perfil
                      </button>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-dim font-inter">Editar Información</span>
                    </div>

                    <form onSubmit={handleSaveProfile} className="space-y-5 pb-6">
                      <div className="mb-6">
                        <h3 className="font-black text-text text-xl leading-tight">Editar Perfil</h3>
                        <p className="text-xs text-text-dim mt-1 font-inter">Actualiza los datos personales y comité asignado</p>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-text">Nombres</label>
                            <Input
                              value={editFirstName}
                              onChange={(e) => setEditFirstName(e.target.value)}
                              placeholder="Ej: Juan Carlos"
                              required
                              className="bg-dark3 border-border text-text text-sm h-10 font-bold placeholder:text-text-dim focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-text">Apellidos</label>
                            <Input
                              value={editLastName}
                              onChange={(e) => setEditLastName(e.target.value)}
                              placeholder="Ej: Pérez Rodríguez"
                              required
                              className="bg-dark3 border-border text-text text-sm h-10 font-bold placeholder:text-text-dim focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-text">Teléfono</label>
                            <Input
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              placeholder="Ej: +52 5512345678"
                              required
                              className="bg-dark3 border-border text-text text-sm h-10 font-bold placeholder:text-text-dim focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-text">Edad</label>
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
                              className="bg-dark3 border-border text-text text-sm h-10 font-bold placeholder:text-text-dim focus:border-[#4d7cfe] rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-extrabold text-text">Comité</label>
                          <Select value={editCommitteeId} onValueChange={(v) => setEditCommitteeId(v || '')}>
                            <SelectTrigger className="w-full h-10 border text-text font-bold bg-dark3 border-border rounded-lg px-3">
                              <SelectValue placeholder="Selecciona un comité">
                                {committeesList.find(c => c.id === editCommitteeId || c.name === editCommitteeId)?.name || editingVolunteer?.committee || "Selecciona un comité"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-dark2 border-border text-text font-bold z-[120]">
                              {committeesList.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-text">Estaca</label>
                            <Input
                              value={editStake}
                              onChange={(e) => setEditStake(e.target.value)}
                              placeholder="Ej: Estaca Central"
                              className="bg-dark3 border-border text-text text-sm h-10 font-bold placeholder:text-text-dim focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-extrabold text-text">Barrio / Vecindario</label>
                            <Input
                              value={editWard}
                              onChange={(e) => setEditWard(e.target.value)}
                              placeholder="Ej: Barrio 1"
                              className="bg-dark3 border-border text-text text-sm h-10 font-bold placeholder:text-text-dim focus:border-[#4d7cfe] rounded-lg"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 flex items-center gap-3 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDrawerMode('view')}
                          className="flex-1 h-11 rounded-full text-xs font-bold border-border text-text bg-dark3 hover:bg-dark"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSavingProfile}
                          className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full h-11 text-xs font-bold shadow-lg active:scale-95 transition-all"
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

      {/* Editor Lateral (Añadir) - Custom Fixed Drawer */}
      <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isAddSheetOpen ? "pointer-events-auto" : "pointer-events-none")}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isAddSheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsAddSheetOpen(false)}
        />

        {/* Drawer Content */}
        <div
          id="add-volunteer-drawer"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border",
            isMobile
              ? `w-full h-[94dvh] rounded-t-[40px] border-0 ${isAddSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[450px] h-full ${isAddSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >
          <div className="relative z-10 flex flex-col h-full w-full">
            {isMobile && (
              <div className="w-12 h-1.5 bg-text-dim/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            )}

            <AddVolunteerForm 
              committeesList={committeesList}
              onSuccess={() => {
                setIsAddSheetOpen(false);
                refresh();
              }}
              onClose={() => setIsAddSheetOpen(false)}
              showToast={showToast}
            />
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
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <ConfirmationModal
        isOpen={isArchiveModalOpen}
        title={volunteerToArchive?.status === 'archived' ? 'Desarchivar Voluntario' : 'Archivar Voluntario'}
        message={volunteerToArchive?.status === 'archived'
          ? `¿Estás seguro de que deseas desarchivar a ${volunteerToArchive?.name}? Volverá a aparecer en las listas activas.`
          : `¿Estás seguro de que deseas archivar a ${volunteerToArchive?.name}? Dejará de aparecer en las listas y conteos de turnos.`
        }
        confirmText={volunteerToArchive?.status === 'archived' ? 'Desarchivar' : 'Archivar'}
        type={volunteerToArchive?.status === 'archived' ? 'primary' : 'danger'}
        onConfirm={handleArchiveVolunteer}
        onCancel={() => setIsArchiveModalOpen(false)}
      />

      <RealtimeDebugOverlay />
    </motion.div>
  );
}
