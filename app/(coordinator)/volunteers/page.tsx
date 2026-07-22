'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { canEditShifts } from "@/lib/permissions";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useSearch } from "@/lib/search-context";
import { USER_TABLE_STYLES } from "../users/page";
import { AlphabetScrubber, ALPHABET } from "@/components/AlphabetScrubber";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { AnimatedLogo } from "@/components/ui/animated-logo";

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
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción')) return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
  if (comm.includes('auxilios')) return 'bg-teal-500/15 text-teal-500 border-teal-500/20';
  return 'bg-dark3 text-text-dim border-border';
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
  const { searchTerm, setSearchTerm } = useSearch();
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);

  const [volunteers, setVolunteers] = useState<VolunteerType[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [globalShifts, setGlobalShifts] = useState<Record<string, Record<string, string[]>>>({});
  const [checkedInMap, setCheckedInMap] = useState<Record<string, boolean>>({});
  const [checkedOutMap, setCheckedOutMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
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
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStake, setNewStake] = useState('');
  const [newWard, setNewWard] = useState('');
  const [newCommitteeId, setNewCommitteeId] = useState('');

  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [volunteerToArchive, setVolunteerToArchive] = useState<VolunteerType | null>(null);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [confirmedReminders, setConfirmedReminders] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    const loadConfirmations = () => {
      const stored = localStorage.getItem("confirmed_reminders");
      if (stored) {
        try {
          setConfirmedReminders(JSON.parse(stored));
        } catch (e) {
          console.error("Error loading confirmations", e);
        }
      }
    };
    loadConfirmations();
    window.addEventListener("storage", loadConfirmations);
    window.addEventListener("focus", loadConfirmations);
    return () => {
      window.removeEventListener("storage", loadConfirmations);
      window.removeEventListener("focus", loadConfirmations);
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

  const handleResetPin = async (vol: VolunteerType) => {
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
  };

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
      await loadData();
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

  const loadData = async () => {
    // 1. Fetch current user role and committee for strict isolation
    const role = localStorage.getItem('mock_role') || 'Admin';
    const committee = localStorage.getItem('mock_committee') || '';

    // 2. Fetch volunteers with server-side filtering for Editors
    let query = supabase.from('volunteers').select('*, committees(name)');

    if (role === 'Editor' && committee) {
      // Find committee ID first
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
        status: v.status || 'active',
        age: v.age
      }));
      setVolunteers(mapped);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    loadData().then(() => setLoading(false));
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
      setVolunteers(prev => prev.map(v => v.id === updatedVol.id ? updatedVol : v));
      setDrawerMode('view');
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

  const handleAddVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = newName.trim().split(/\s+/);
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || '';

    // Validar nombre completo (nombre y apellido)
    if (parts.length < 2 || !last_name) {
      showToast("Por favor, introduce al menos un nombre y un apellido.", "error");
      return;
    }

    // Sanitizar y validar teléfono
    const cleanPhone = newPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 8) {
      showToast("El celular debe tener exactamente 8 dígitos.", "error");
      return;
    }

    const { error } = await supabase
      .from('volunteers')
      .insert([
        {
          first_name,
          last_name,
          phone: cleanPhone,
          committee_id: newCommitteeId || null,
          stake: newStake,
          neighborhood: newWard,
          pin: '1234',
          status: 'active'
        }
      ]);

    if (error) {
      console.error("Error adding volunteer:", error);
      showToast("Error al añadir voluntario", "error");
      return;
    }

    showToast("Voluntario añadido");

    setNewName('');
    setNewPhone('');
    setNewStake('');
    setNewWard('');
    setNewCommitteeId('');
    setIsAddSheetOpen(false);

    await loadData();
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

  const roleFilteredVolunteers = volunteers.filter(v => {
    if (currentRole === 'Admin') return true;
    if (currentRole === 'Editor') return v.committee === currentCommittee;
    if (currentRole === 'Lector') return false; // Lector doesn't see directory
    return false;
  });
  const augmentedVolunteers = useMemo(() => {
    return volunteers.map(vol => {
      let totalAssigned = 0;
      let totalConfirmed = 0;
      const volShifts = globalShifts[vol.id] || {};
      for (const [day, shifts] of Object.entries(volShifts)) {
        for (const shift of shifts) {
          totalAssigned++;
          if (confirmedReminders[`${vol.id}-${day}-${shift}`]) {
            totalConfirmed++;
          }
        }
      }
      return {
        ...vol,
        computedReliability: totalAssigned === 0 ? '-' : Math.round((totalConfirmed / totalAssigned) * 100)
      };
    });
  }, [volunteers, globalShifts, confirmedReminders]);

  const filteredVolunteers = useMemo(() => {
    const result = augmentedVolunteers.filter(v => {
      // 1. Role-based isolation: Editors only see their committee
      if (currentRole === 'Editor' && v.committee !== currentCommittee) return false;
      if (currentRole === 'Lector') return false;

      // 2. Filter by archived status
      const matchesStatus = showArchived ? v.status === 'archived' : v.status !== 'archived';
      if (!matchesStatus) return false;

      // 3. User search and dynamic filters
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
    return result;
  }, [augmentedVolunteers, searchTerm, selectedCommittees, selectedStakes, selectedWards, showArchived, currentRole, currentCommittee]);

  const groupedVolunteers = useMemo(() => {
    const groups: Record<string, VolunteerType[]> = {};
    filteredVolunteers.forEach(v => {
      let letter = v.name.charAt(0).toUpperCase();
      if (!/^[A-Z]$/.test(letter)) letter = '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(v);
    });
    return groups;
  }, [filteredVolunteers]);
  const sortedLetters = Object.keys(groupedVolunteers).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));

  const handleEditClick = (vol: VolunteerType) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);

    const volShifts = globalShifts[vol.id] || Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
    setShiftsByDay(volShifts);
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
      className="w-full mx-auto pb-32 lg:pb-12"
    >

      {/* Sticky Header matching users design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto shrink-0">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Voluntarios
            <span className="text-xs font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 px-2.5 py-1 rounded-full border border-[#4d7cfe]/20">
              {filteredVolunteers.length}
            </span>
          </h1>
          <Button
            onClick={() => setIsAddSheetOpen(true)}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            <span>Añadir</span>
          </Button>
        </motion.div>

        {/* Search Input matching users design */}
        <motion.div variants={itemVariants} className="w-full relative z-10">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar voluntarios por nombre, estaca o barrio..."
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

      <div className="flex flex-col gap-4 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        <motion.div variants={itemVariants} className="bg-dark2 border border-white/10 rounded-[20px] shadow-lg overflow-clip flex flex-col w-full">
          <AlphabetScrubber isMobile={isMobile} />
          {/* Contenedor de Datos */}
          <div className="hidden lg:block bg-dark2 flex-1 relative w-full pb-10">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
              <thead className="bg-dark3/80 sticky top-[140px] z-10 backdrop-blur-md text-[10px] font-bold text-text-dim uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4 w-full">Nombre y Apellido</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Barrio</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Estaca</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Comité</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Turnos</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Confiabilidad</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredVolunteers.length > 0 ? (
                  sortedLetters.map(letter => (
                    <Fragment key={letter}>
                      {groupedVolunteers[letter].map((vol, index) => (
                        <tr
                          key={vol.id}
                          id={index === 0 ? `letter-${letter}` : undefined}
                          className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                          onClick={() => handleEditClick(vol)}
                        >
                          <td className="px-5 py-4 w-full">
                            <p className={USER_TABLE_STYLES.name}>
                              <HighlightText text={vol.name} term={searchTerm} />
                            </p>
                          </td>
                          <td className="px-3 py-4 text-center font-inter font-bold text-[13px] text-text-dim w-px whitespace-nowrap">{vol.ward}</td>
                          <td className="px-3 py-4 text-center font-inter font-bold text-[13px] text-text-dim opacity-70 w-px whitespace-nowrap">{vol.stake}</td>
                          <td className="px-3 py-4 text-center w-px whitespace-nowrap">
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(vol.committee))}>
                              {vol.committee}
                            </Badge>
                          </td>
                          <td className="px-3 py-4 text-center w-px whitespace-nowrap">
                            <Badge variant="secondary" className="bg-dark3 text-text border-none font-inter font-bold text-[10px] px-1.5 py-0.5">
                              {vol.shifts} {vol.shifts === 1 ? 'turno' : 'turnos'}
                            </Badge>
                          </td>
                          <td className="px-3 py-4 text-center w-px whitespace-nowrap">
                            {vol.computedReliability === '-' ? (
                              <span className="font-inter font-bold text-sm text-text-dim">N/A</span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${Number(vol.computedReliability || 0) >= 80 ? 'bg-accent' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'}`} />
                                <span className="font-inter font-bold text-[13px] text-text tabular-nums">{vol.computedReliability}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-4 text-center w-px whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90"
                                title="Editar Perfil"
                                onClick={(e) => { e.stopPropagation(); handleEditClick(vol); }}
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90"
                                title="Resetear PIN"
                                onClick={(e) => { e.stopPropagation(); handleResetPin(vol); }}
                              >
                                <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-500 transition-all active:scale-90"
                                title={vol.status === 'archived' ? 'Desarchivar' : 'Archivar'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVolunteerToArchive(vol);
                                  setIsArchiveModalOpen(true);
                                }}
                              >
                                <span className="material-symbols-outlined text-[18px]">{vol.status === 'archived' ? 'unarchive' : 'archive'}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-text-dim">
                      No se encontraron voluntarios con esos términos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Cards view for Mobile (under lg) */}
          <div className="block lg:hidden divide-y divide-white/5 bg-dark2">
            {filteredVolunteers.length > 0 ? (
              sortedLetters.map(letter => (
                <Fragment key={letter}>
                  {groupedVolunteers[letter].map((vol, index) => (
                    <div key={vol.id} id={index === 0 ? `letter-mobile-${letter}` : undefined}>
                      <SwipeableMobileCard
                        name={vol.name}
                        phone={vol.phone}
                        searchTerm={searchTerm}
                        onEdit={() => handleEditClick(vol)}

                        onSwipeRight={() => handleResetPin(vol)}
                        swipeRightIcon="lock_reset"
                        swipeRightText="Reset PIN"
                        swipeRightColorClass="text-amber-500"
                        swipeRightBgColor="rgba(245, 158, 11, 0.2)"

                        onSwipeLeft={() => {
                          setVolunteerToArchive(vol);
                          setIsArchiveModalOpen(true);
                        }}
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
                    </div>
                  ))}
                </Fragment>
              ))
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
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-[#0a101d]",
            isMobile
              ? `w-full h-[94dvh] rounded-t-[40px] shadow-2xl ${isSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[450px] h-full shadow-2xl border-l border-white/10 ${isSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
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

                    {/* Squad/Schedule / Day Cards List */}
                    <div className="w-full">
                      <div className="flex items-center justify-between px-2 mb-4">
                        <div className="flex items-center gap-2 relative">
                          <p className="text-drawer-label text-white">Cronograma</p>
                          
                          {/* Helper Icon & Legend Popover */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowLegend(prev => !prev)}
                              className="text-white/60 hover:text-white transition-colors p-0.5 rounded-full flex items-center justify-center focus:outline-none"
                              title="Ver leyenda del cronograma"
                            >
                              <span className="material-symbols-outlined text-[15px]">help_outline</span>
                            </button>

                            {showLegend && (
                              <div className="absolute left-0 top-6 z-50 w-60 bg-[#0f172a] border border-white/20 rounded-xl p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/10">
                                  <span className="text-xs font-bold text-white font-inter">Leyenda del Cronograma</span>
                                  <button onClick={() => setShowLegend(false)} className="text-white/50 hover:text-white flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                  </button>
                                </div>
                                <div className="space-y-2 text-[11px] font-inter">
                                  <div className="flex items-center gap-2.5">
                                    <span className="w-6 h-6 rounded-lg bg-[#4d7cfe]/20 border border-[#4d7cfe]/40 text-[#4d7cfe] flex items-center justify-center shrink-0">
                                      <span className="material-symbols-outlined text-[13px]">check</span>
                                    </span>
                                    <div>
                                      <p className="text-white font-bold leading-tight">Programado</p>
                                      <p className="text-white/60 text-[10px]">Turno asignado</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                                      <span className="material-symbols-outlined text-[13px]">check</span>
                                    </span>
                                    <div>
                                      <p className="text-emerald-400 font-bold leading-tight">Entrada</p>
                                      <p className="text-white/60 text-[10px]">Turno registrado con QR</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center shrink-0">
                                      <span className="material-symbols-outlined text-[13px]">check</span>
                                    </span>
                                    <div>
                                      <p className="text-slate-300 font-bold leading-tight">Salida</p>
                                      <p className="text-white/60 text-[10px]">Turno completado en el sistema</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-white/30 flex items-center justify-center shrink-0 text-[12px] font-bold">
                                      -
                                    </span>
                                    <div>
                                      <p className="text-white/50 font-medium leading-tight">Sin Turnos</p>
                                      <p className="text-white/40 text-[10px]">Disponible / No programado</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {saved && <span className="text-[11px] text-green-300 font-bold animate-pulse">✓ Listo</span>}
                          {isEditingShifts ? (
                            <button onClick={handleSaveShifts} className="h-7 px-4 bg-white hover:bg-white/90 text-black rounded-full font-bold text-[11px] shadow-md transition-all active:scale-[0.97]">
                              Guardar
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (!canEditShifts()) {
                                  showToast("No tienes permiso para editar turnos", "error");
                                  return;
                                }
                                setIsEditingShifts(true);
                                setSaved(false);
                              }}
                              className={cn(
                                "h-7 px-4 backdrop-blur-sm border font-bold text-[11px] transition-all rounded-full",
                                canEditShifts()
                                  ? "bg-black/20 border-white/10 hover:bg-black/30 text-white active:scale-[0.97]"
                                  : "bg-white/5 border-white/5 text-white/40 cursor-not-allowed"
                              )}
                              title={canEditShifts() ? "Editar turnos" : "Permiso deshabilitado por el administrador"}
                            >
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
                            <div key={d.key} className={`rounded-[20px] shadow-sm w-full overflow-hidden transition-transform duration-200 hover:scale-[1.01] bg-white/5 border border-white/10 flex`}>
                              {/* Etiqueta de color lateral estructural */}
                              <div className={`w-3 shrink-0 ${cardBg} opacity-90`} />
                              
                              <div className="flex-1 flex items-center justify-between px-5 sm:px-6 py-4">
                                {/* Left: Date */}
                                <div className="flex-1 min-w-0 pr-4 flex items-center">
                                  <p className="font-inter font-bold text-white text-[13px] truncate capitalize">
                                    {d.label} {d.dateNum}
                                  </p>
                                </div>

                                {/* Right: 4 Columns (T1 to T4) */}
                                <div className="flex items-center shrink-0 ml-auto gap-1">
                                  {(['T1', 'T2', 'T3', 'T4'] as const).map((t) => {
                                    const active = dayShifts.includes(t);
                                    const isCheckedIn = checkedInMap[`${editingVolunteer.id}-${d.key}-${t}`];
                                    const isCheckedOut = checkedOutMap[`${editingVolunteer.id}-${d.key}-${t}`];

                                    let statusStyle = "bg-white/[0.03] border-white/10 text-white/30";
                                    let iconContent: React.ReactNode = <span className="text-[13px] font-bold text-white/30">-</span>;
                                    let labelColor = "text-white/40";

                                    if (isCheckedOut) {
                                      statusStyle = "bg-slate-800/80 border-slate-700/60 text-slate-300 shadow-sm";
                                      iconContent = <span className="material-symbols-outlined text-[15px] text-slate-400">check</span>;
                                      labelColor = "text-slate-400 font-bold";
                                    } else if (isCheckedIn) {
                                      statusStyle = "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm";
                                      iconContent = <span className="material-symbols-outlined text-[15px] text-emerald-400">check</span>;
                                      labelColor = "text-emerald-400 font-bold";
                                    } else if (active) {
                                      statusStyle = "bg-[#4d7cfe]/15 border-[#4d7cfe]/35 text-[#4d7cfe] font-bold shadow-sm";
                                      iconContent = <span className="material-symbols-outlined text-[15px] text-[#4d7cfe]">check</span>;
                                      labelColor = "text-[#4d7cfe] font-bold";
                                    }

                                    return (
                                      <button
                                        key={t}
                                        disabled={!isEditingShifts || isCheckedIn || isCheckedOut || !canEditShifts()}
                                        onClick={() => toggleShift(d.key, t)}
                                        className={cn(
                                          "flex flex-col items-center justify-center w-10 sm:w-13 h-11 rounded-lg border transition-all",
                                          statusStyle,
                                          isEditingShifts && !isCheckedIn && !isCheckedOut && canEditShifts() && "hover:bg-white/10 hover:border-white/20 cursor-pointer active:scale-95"
                                        )}
                                      >
                                        <div className="h-4 flex items-center justify-center">
                                          {iconContent}
                                        </div>
                                        <span className={cn("font-inter text-[10px] uppercase tracking-wider mt-0.5", labelColor)}>
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
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-[#0a101d]",
            isMobile
              ? `w-full h-[94dvh] rounded-t-[40px] shadow-2xl border-0 ${isAddSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `border-l border-white/10 w-[450px] h-full ${isAddSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
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
            {isMobile && (
              <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            )}

            <form
              id="add-volunteer-form"
              onSubmit={handleAddVolunteer}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div
              className={cn("flex-1 overflow-y-auto scrollbar-hide overscroll-contain", isMobile ? "px-6 pb-6 pt-4 text-white font-light" : "p-7 space-y-7")}
              onTouchStart={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById("add-volunteer-drawer");
                if (!drawer) return;
                drawer.dataset.startY = e.touches[0].clientY.toString();
                drawer.style.transition = 'none';
              }}
              onTouchMove={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById("add-volunteer-drawer");
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
                const drawer = document.getElementById("add-volunteer-drawer");
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
                      setIsAddSheetOpen(false);
                    }, 300);
                  } else {
                    drawer.style.transform = `translateY(0)`;
                  }
                } else {
                  drawer.style.transform = '';
                }
              }}
            >
              <div className={cn(isMobile ? "mb-6" : "")}>
                <h2 className={cn("font-medium tracking-tight leading-none mb-2", isMobile ? "text-white text-lg" : "text-text")}>Añadir Voluntario</h2>
                <p className={cn("text-sm font-inter font-bold", isMobile ? "text-white/80" : "text-text-dim")}>Registra un nuevo voluntario en el sistema.</p>
              </div>

              <div className="space-y-6 pb-6">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Nombre y Apellido</label>
                    <Input
                      required
                      minLength={3}
                      className={cn(
                        "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all",
                        isMobile
                          ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                          : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                      )}
                      placeholder="Ej. Juan Pérez"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <p className={cn("text-[11px] italic font-inter", isMobile ? "text-white/70" : "text-text-dim")}>Asegúrate de incluir ambos apellidos si es posible.</p>
                  </div>

                  <div className="space-y-2">
                    <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Celular</label>
                    <Input
                      required
                      type="tel"
                      pattern="[0-9]{8}"
                      maxLength={8}
                      onKeyPress={(e) => {
                        if (!/[0-9]/.test(e.key)) e.preventDefault();
                      }}
                      className={cn(
                        "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all",
                        isMobile
                          ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                          : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                      )}
                      placeholder="Ej. 88888888"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                    <p className={cn("text-[11px] italic font-inter", isMobile ? "text-white/70" : "text-text-dim")}>Solo 8 dígitos, sin código de país o espacios.</p>
                  </div>

                  <div className="space-y-2">
                    <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Estaca</label>
                    <Input
                      required
                      className={cn(
                        "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all",
                        isMobile
                          ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                          : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                      )}
                      placeholder="Ej. Managua Sur"
                      value={newStake}
                      onChange={(e) => setNewStake(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Barrio</label>
                    <Input
                      required
                      className={cn(
                        "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all",
                        isMobile
                          ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                          : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                      )}
                      placeholder="Ej. Barrio 1"
                      value={newWard}
                      onChange={(e) => setNewWard(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Comité</label>
                    <Select value={newCommitteeId} onValueChange={(val) => setNewCommitteeId(val || '')}>
                      <SelectTrigger
                        className={cn(
                          "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all flex items-center justify-between",
                          isMobile
                            ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                            : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                        )}
                      >
                        <SelectValue placeholder="Selecciona un comité" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#050a15] border border-white/20 text-white shadow-2xl z-[200]">
                        {committeesList.map(c => (
                          <SelectItem key={c.id} value={c.id} className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={cn("flex flex-row w-full mt-auto shrink-0 gap-3", isMobile ? "px-6 pt-2" : "p-7 pt-4 border-t border-white/5")}
              style={isMobile ? { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' } : undefined}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddSheetOpen(false)}
                className={cn(
                  "flex-1 rounded-full shadow-lg h-11 px-4 text-xs sm:text-sm font-bold transition-all active:scale-[0.97]",
                  isMobile
                    ? "bg-white/10 hover:bg-white/20 text-white border-white/20"
                    : "bg-dark2 hover:bg-dark3 text-text border-white/10"
                )}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-11 px-4 text-xs sm:text-sm font-bold transition-all active:scale-[0.97]"
              >
                Añadir Voluntario
              </Button>
              </div>
            </form>
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


    </motion.div>
  );
}
