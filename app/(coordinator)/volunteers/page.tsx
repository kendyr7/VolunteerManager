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
import { cn } from "@/lib/utils";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useSearch } from "@/lib/search-context";
import { USER_TABLE_STYLES } from "../users/page";
import { AlphabetScrubber, ALPHABET } from "@/components/AlphabetScrubber";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";

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
  const [isMobile, setIsMobile] = useState(false);

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
          .update({ pin_hash: '1234' })
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
    if (committee) setCurrentCommittee(committee);

    loadData().then(() => setLoading(false));
  }, []);

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

    const { error } = await supabase
      .from('volunteers')
      .insert([
        {
          first_name,
          last_name,
          phone: newPhone,
          committee_id: newCommitteeId || null,
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
  const filteredVolunteers = useMemo(() => {
    const result = volunteers.filter(v => {
      // 1. Role-based isolation: Editors only see their committee
      if (currentRole === 'Editor' && v.committee !== currentCommittee) return false;
      if (currentRole === 'Lector') return false;

      // 2. Filter by archived status
      const matchesStatus = showArchived ? v.status === 'archived' : v.status !== 'archived';
      if (!matchesStatus) return false;

      // 3. User search and dynamic filters
      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.ward.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
    return result;
  }, [volunteers, searchTerm, selectedCommittees, selectedStakes, selectedWards, showArchived, currentRole, currentCommittee]);

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
              <span className="material-symbols-outlined text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar voluntarios por nombre, estaca o barrio..."
              className="w-full bg-[#fff6] border border-black/10 dark:border-white/10 text-white placeholder:text-white/70 rounded-full pl-12 pr-10 py-3.5 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all text-[13px] font-bold font-inter"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
            {searchTerm.trim() !== '' && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-3 flex items-center justify-center w-8 text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col gap-4 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        <motion.div variants={itemVariants} className="bg-dark2 border border-white/10 rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full">
          <AlphabetScrubber isMobile={isMobile} />
          {/* Contenedor de Datos */}
          <div className="hidden lg:block overflow-auto bg-dark2 flex-1 relative max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm text-left">
              <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md border-b border-white/10 text-[10px] font-bold text-text-dim uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4">Nombre y Apellido</th>
                  <th className="px-5 py-4 text-center">Barrio</th>
                  <th className="px-5 py-4 text-center">Estaca</th>
                  <th className="px-5 py-4 text-center">Comité</th>
                  <th className="px-5 py-4 text-center">Turnos</th>
                  <th className="px-5 py-4 text-center">Confiabilidad</th>
                  <th className="px-5 py-4 text-center">Contacto</th>
                  <th className="px-5 py-4 text-center">Acciones</th>
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
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                          <td className="px-5 py-4">
                            <p className={USER_TABLE_STYLES.name}>
                              <HighlightText text={vol.name} term={searchTerm} />
                            </p>
                          </td>
                          <td className="px-5 py-4 text-center font-inter font-bold text-[13px] text-text-dim">{vol.ward}</td>
                          <td className="px-5 py-4 text-center font-inter font-bold text-[13px] text-text-dim opacity-70">{vol.stake}</td>
                          <td className="px-5 py-4 text-center">
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(vol.committee))}>
                              {vol.committee}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <Badge variant="secondary" className="bg-dark3 text-text border-none font-inter font-bold text-[10px] px-1.5 py-0.5">
                              {vol.shifts} {vol.shifts === 1 ? 'turno' : 'turnos'}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {vol.shifts === 0 ? (
                              <span className="text-sm text-text-dim">N/A</span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${vol.reliability >= 80 ? 'bg-accent' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'}`} />
                                <span className="text-sm font-bold text-text tabular-nums">{vol.reliability}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#4d7cfe] hover:bg-dark3 hover:text-[#4d7cfe] transition-all active:scale-90"
                                title="WhatsApp"
                                onClick={() => window.open(`https://wa.me/${vol.phone.replace(/\s+/g, '')}`, '_blank')}
                              >
                                <span className="material-symbols-outlined text-[20px]">message</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#4d7cfe] hover:bg-dark3 hover:text-[#4d7cfe] transition-all active:scale-90"
                                title="Llamar"
                                onClick={() => window.location.href = `tel:${vol.phone.replace(/\s+/g, '')}`}
                              >
                                <span className="material-symbols-outlined text-[20px]">call</span>
                              </Button>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <button className="p-1.5 rounded-full hover:bg-white/10 text-text-dim hover:text-text transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                    <span className="material-symbols-outlined text-[18px]">more_vert</span>
                                  </button>
                                }
                              />
                              <DropdownMenuContent align="end" className="bg-dark3 border-border text-text min-w-[160px] p-1 rounded-sm shadow-md">
                                <DropdownMenuItem className="py-2.5 cursor-pointer hover:bg-dark2 rounded-sm focus:bg-dark2 focus:text-text transition-colors flex items-center gap-3" onClick={() => handleEditClick(vol)}>
                                  <span className="material-symbols-outlined text-[20px] text-text-dim">edit</span>
                                  <span className="font-medium">Editar Perfil</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="py-2.5 cursor-pointer hover:bg-dark2 rounded-sm focus:bg-dark2 focus:text-text transition-colors flex items-center gap-3" onClick={() => handleResetPin(vol)}>
                                  <span className="material-symbols-outlined text-[20px] text-text-dim">lock_reset</span>
                                  <span className="font-medium">Resetear PIN</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="py-2.5 cursor-pointer text-red hover:bg-red-faint hover:text-red rounded-sm focus:bg-red-faint focus:text-red transition-colors flex items-center gap-3"
                                  onClick={() => {
                                    setVolunteerToArchive(vol);
                                    setIsArchiveModalOpen(true);
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[20px]">{vol.status === 'archived' ? 'unarchive' : 'archive'}</span>
                                  <span className="font-medium">{vol.status === 'archived' ? 'Desarchivar' : 'Archivar'}</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
      <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-all duration-300 ${isSheetOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        {/* Backdrop */}
        <div 
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isSheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsSheetOpen(false)}
        />

        {/* Drawer Content */}
        <div 
          id="drawer-profile"
          className={`relative w-full md:w-[500px] md:mx-auto h-[94vh] bg-gradient-to-br from-[#009fd4] to-[#4d7cfe] dark:from-[#0f2027] dark:via-[#203a43] dark:to-[#194c7a] rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${isSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ willChange: 'transform' }}
        >
          {/* Handle */}
          <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
          
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
                    return (
                      <>
                        <div className="flex flex-col items-center flex-1 border-r border-white/20">
                          <span className="text-drawer-kpi-value text-white drop-shadow-md">{totalTurnos}</span>
                          <span className="text-drawer-kpi-label text-white/70 mt-2">Turnos</span>
                        </div>
                        <div className="flex flex-col items-center flex-1 border-r border-white/20">
                          <span className="text-drawer-kpi-value text-white drop-shadow-md">{diasCubiertos}</span>
                          <span className="text-drawer-kpi-label text-white/70 mt-2">Días</span>
                        </div>
                        <div className="flex flex-col items-center flex-1 border-r border-white/20">
                          <span className="text-drawer-kpi-value text-white drop-shadow-md">
                            {editingVolunteer.reliability}
                            <span className="text-[14px] font-normal text-white/70 ml-0.5">%</span>
                          </span>
                          <span className="text-drawer-kpi-label text-white/70 mt-2">Confia.</span>
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-drawer-kpi-value text-white drop-shadow-md">{editingVolunteer.age || '-'}</span>
                          <span className="text-drawer-kpi-label text-white/70 mt-2">Edad</span>
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

      {/* Editor Lateral (Añadir) */}
      <Sheet open={isAddSheetOpen} onOpenChange={setIsAddSheetOpen}>
        <SheetContent
          id="add-volunteer-drawer"
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0",
            isMobile 
              ? "h-[94vh] bg-gradient-to-br from-[#009fd4] to-[#4d7cfe] dark:from-[#0f2027] dark:via-[#203a43] dark:to-[#194c7a] rounded-t-[40px] shadow-2xl border-0 overflow-hidden" 
              : "bg-dark2 text-text border-l border-white/10 sm:w-[40vw] sm:max-w-[95vw] h-full overflow-hidden"
          )}
        >
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
                    <DataTableFilter
                      title={newCommitteeId ? (committeesList.find(c => c.id === newCommitteeId)?.name || "Comité") : "Selecciona un comité"}
                      options={committeesList.map(c => c.name)}
                      value={newCommitteeId ? [committeesList.find(c => c.id === newCommitteeId)?.name || ""] : []}
                      dropdownLabel="Comités disponibles"
                      hideClearButton
                      hideCountBadge
                      isCommitteeFilter
                      className={cn(
                        "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all justify-between", 
                        isMobile 
                          ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white" 
                          : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                      )}
                      onChange={(vals) => {
                        if (vals.length === 0) {
                          setNewCommitteeId("");
                          return;
                        }
                        const currentName = committeesList.find(c => c.id === newCommitteeId)?.name;
                        const newName = vals.find(v => v !== currentName) || vals[0];
                        const comm = committeesList.find(c => c.name === newName);
                        setNewCommitteeId(comm ? comm.id : "");
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-row w-full mt-auto shrink-0">
              <Button 
                type="button" 
                variant="ghost"
                onClick={() => setIsAddSheetOpen(false)} 
                className="btn-cancel flex-1 h-[52px] rounded-none rounded-tl-[24px] shadow-none font-inter font-bold text-base border-r border-black/5 dark:border-white/5"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="btn-action flex-1 h-[52px] rounded-none rounded-tr-[24px] shadow-none font-inter font-bold text-base"
              >
                Añadir
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

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
