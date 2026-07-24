'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { generateWaMeLink, validatePhone8Digits } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useSearch } from "@/lib/search-context";
import { DataTableFilter } from "@/components/DataTableFilter";
import { cn } from "@/lib/utils";
import { AlphabetScrubber, ALPHABET } from "@/components/AlphabetScrubber";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
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



const COMMITTEES = ['Historia', 'Seguridad', 'Guía', 'Traducción', 'Transporte', 'Primeros Auxilios'];

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

const ROLES = ['Admin', 'Editor', 'Lector'] as const;
type Role = typeof ROLES[number];

interface PlatformUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  committee?: string;
  status: 'pending' | 'active';
  isArchived?: boolean;
  inviteLink?: string;
  pin?: string;
}

export const USER_TABLE_STYLES = {
  name: "font-inter font-bold text-text text-[13px] tracking-wide drop-shadow-sm truncate",
  phone: "font-inter font-bold text-xs text-text-dim",
  badgeBase: "font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full shrink-0 flex items-center justify-center inline-flex",
  roleAdmin: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  roleEditor: "bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20",
  statusActive: "bg-accent/10 border-accent/20 text-accent",
  statusPending: "bg-white/5 border-white/10 text-text-dim",
};


export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [isMobile, setIsMobile] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [currentUserCommittee, setCurrentUserCommittee] = useState<string>('');

  useEffect(() => {
    setCurrentUserRole(localStorage.getItem('mock_role') || 'Admin');
    setCurrentUserCommittee(localStorage.getItem('mock_committee') || '');
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Lock <main> scroll when mobile drawer is open so the table doesn't jump
  useEffect(() => {
    if (!isMobile) return;
    const main = document.querySelector('main') as HTMLElement | null;
    if (!main) return;
    if (isEditSheetOpen) {
      const scrollY = main.scrollTop;
      main.style.overflow = 'hidden';
      main.style.top = `-${scrollY}px`;
      main.dataset.scrollY = String(scrollY);
    } else {
      const scrollY = parseFloat(main.dataset.scrollY || '0');
      main.style.overflow = '';
      main.style.top = '';
      main.scrollTop = scrollY;
    }
    return () => {
      main.style.overflow = '';
      main.style.top = '';
    };
  }, [isEditSheetOpen, isMobile]);

  // No pagination state needed for infinite scroll

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
    onConfirm: () => {},
    type: 'primary'
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  // Invite/Edit Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<Role>('Editor');
  const [newCommittee, setNewCommittee] = useState<string>(COMMITTEES[0]);
  const [generatedInvite, setGeneratedInvite] = useState<PlatformUser | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();
    
    // Fetch users
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*, committees(name)')
      .order('created_at', { ascending: false });

    // Fetch committees
    const { data: commsData, error: commsError } = await supabase
      .from('committees')
      .select('id, name');

    if (profilesError) console.error("Error loading users:", profilesError);
    if (commsError) console.error("Error loading committees:", commsError);

    if (profilesData) {
      setUsers(
        profilesData.map(p => ({
          id: p.id,
          name: p.full_name,
          phone: p.phone || '',
          role: p.role as Role,
          committee: p.committees?.name,
          status: p.pin ? 'active' : 'pending',
          isArchived: p.status === 'archived',
          pin: p.pin || ''
        }))
      );
    }

    if (commsData) {
      setCommitteesList(commsData);
      if (commsData.length > 0 && !newCommittee) {
        setNewCommittee(commsData[0].name);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const { activeCount, archivedCount } = useMemo(() => {
    const active = users.filter(u => !u.isArchived).length;
    const archived = users.filter(u => u.isArchived).length;
    return { activeCount: active, archivedCount: archived };
  }, [users]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parts = newName.trim().split(/\s+/);
    if (parts.length < 2 || !parts[1]) {
      setErrorMsg("Por favor, introduce al menos un nombre y un apellido.");
      return;
    }

    const phoneValidation = validatePhone8Digits(newPhone);
    if (!phoneValidation.isValid) {
      setErrorMsg(phoneValidation.error || "El celular debe tener exactamente 8 dígitos.");
      return;
    }
    const sanitizedPhone = phoneValidation.formatted;

    const supabase = createClient();

    let commId: string | null = null;
    if (newRole === 'Editor') {
      const targetComm = committeesList.find(c => c.name === newCommittee);
      if (targetComm) {
        commId = targetComm.id;
      }
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();

    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert({
        full_name: newName.trim(),
        phone: sanitizedPhone,
        role: newRole,
        committee_id: commId,
        pin
      })
      .select('*, committees(name)')
      .single();

    if (error) {
      console.error("Error creating user:", error);
      setErrorMsg("Error al crear usuario. Posiblemente el teléfono ya esté registrado.");
      return;
    }

    const newUser: PlatformUser = {
      id: inserted.id,
      name: inserted.full_name,
      phone: inserted.phone,
      role: inserted.role as Role,
      committee: inserted.committees?.name,
      status: 'pending',
      pin: inserted.pin,
      inviteLink: `http://localhost:3000/login`
    };

    setGeneratedInvite(newUser);
    showToast("Usuario añadido exitosamente");
    loadData();
  };

  const handleEditClick = (user: PlatformUser) => {
    setEditingUser(user);
    setNewName(user.name);
    setNewPhone(user.phone);
    setNewRole(user.role);
    setNewCommittee(user.committee || COMMITTEES[0]);
    setIsEditSheetOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const parts = newName.trim().split(/\s+/);
    if (parts.length < 2 || !parts[1]) {
      showToast("Por favor, introduce al menos un nombre y un apellido.", "error");
      return;
    }

    const phoneValidation = validatePhone8Digits(newPhone);
    if (!phoneValidation.isValid) {
      showToast(phoneValidation.error || "El celular debe tener exactamente 8 dígitos.", "error");
      return;
    }
    const sanitizedPhone = phoneValidation.formatted;

    setIsUpdating(true);

    const supabase = createClient();
    let commId: string | null = null;

    if (newRole === 'Editor') {
      const targetComm = committeesList.find(c => c.name === newCommittee);
      if (targetComm) commId = targetComm.id;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: newName.trim(),
        phone: sanitizedPhone,
        role: newRole,
        committee_id: commId
      })
      .eq('id', editingUser.id);

    if (error) {
      console.error("Error updating user:", error);
      showToast("Error al actualizar usuario", "error");
    } else {
      showToast("Usuario actualizado correctamente");
      setIsEditSheetOpen(false);
      loadData();
    }
    setIsUpdating(false);
  };

  const handleResetPin = async (user: PlatformUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Resetear PIN',
      message: `¿Estás seguro de resetear el PIN de ${user.name} a '1234'?`,
      confirmText: 'Resetear',
      type: 'danger',
      onConfirm: async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from('profiles')
          .update({ pin: '1234' })
          .eq('id', user.id);

        if (error) {
          showToast("Error al resetear PIN", "error");
        } else {
          showToast(`PIN de ${user.name} reseteado a '1234'`);
          loadData();
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleArchiveUser = async (user: PlatformUser) => {
    const isArchived = !!user.isArchived;
    const newStatus = isArchived ? 'active' : 'archived';

    setConfirmModal({
      isOpen: true,
      title: isArchived ? 'Desarchivar Usuario' : 'Archivar Usuario',
      message: isArchived
        ? `¿Estás seguro de que deseas desarchivar a ${user.name}? Volverá a aparecer en la lista activa.`
        : `¿Estás seguro de que deseas archivar a ${user.name}? Dejará de aparecer en la lista activa.`,
      confirmText: isArchived ? 'Desarchivar' : 'Archivar',
      type: isArchived ? 'primary' : 'danger',
      onConfirm: async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from('profiles')
          .update({ status: newStatus })
          .eq('id', user.id);

        if (error) {
          console.error("Error updating user status:", error);
          showToast(`Error al ${isArchived ? 'desarchivar' : 'archivar'} el usuario`, "error");
        } else {
          showToast(`${user.name} ${isArchived ? 'desarchivado' : 'archivado'} correctamente`, "success");
          loadData();
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getWaLink = (user: PlatformUser) => {
    const text = `¡Hola ${user.name}! Has sido invitado a ser ${user.role} en Volunteer Manager.\n\nIngresa con tu número y tu PIN temporal (${user.pin}) para acceder:\nhttp://localhost:3000/login`;
    return generateWaMeLink(user.phone, text);
  };

  const resetInviteForm = () => {
    setNewName('');
    setNewPhone('');
    setNewRole('Editor');
    setNewCommittee(COMMITTEES[0]);
    setGeneratedInvite(null);
    setIsInviteOpen(false);
    setErrorMsg(null);
  };

  const normalizeSearch = (str: string | undefined | null) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const filteredUsers = useMemo(() => {
    const searchTerms = appliedSearch.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);

    return users.filter(user => {
      // 1. Filter by archived status
      const matchesStatus = showArchived ? user.isArchived : !user.isArchived;
      if (!matchesStatus) return false;

      const normName = normalizeSearch(user.name);
      const normPhone = normalizeSearch(user.phone);
      const normRole = normalizeSearch(user.role);
      const normCommittee = normalizeSearch(user.committee);
      const normStatus = normalizeSearch(user.status === 'active' ? 'activo' : 'pendiente');

      return searchTerms.every(term => 
        normName.includes(term) || 
        normPhone.includes(term) ||
        normRole.includes(term) ||
        normCommittee.includes(term) ||
        normStatus.includes(term)
      );
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, appliedSearch, showArchived]);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, PlatformUser[]> = {};
    filteredUsers.forEach(u => {
      let letter = u.name.charAt(0).toUpperCase();
      if (!/^[A-Z]$/.test(letter)) letter = '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(u);
    });
    return groups;
  }, [filteredUsers]);
  const sortedLetters = Object.keys(groupedUsers).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full mx-auto pb-32 md:pb-12"
    >
      {/* Sticky Header matching volunteers design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between gap-3">
          <h1 className="text-[28px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Usuarios 
            <span className="text-xs font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 px-2.5 py-1 rounded-full border border-[#4d7cfe]/20">
              {filteredUsers.length}
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
              placeholder="Buscar por nombre, teléfono, rol o comité..."
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
            onClick={() => setIsInviteOpen(true)}
            className="flex bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-[48px] px-4 sm:px-5 text-xs font-bold transition-all active:scale-[0.97] items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Añadir</span>
          </Button>
        </motion.div>
      </div>

      {/* Drawer Lateral (Añadir Usuario) - Custom Fixed Drawer matching Volunteers design */}
      <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isInviteOpen ? "pointer-events-auto" : "pointer-events-none")}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isInviteOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={resetInviteForm}
        />

        {/* Drawer Content */}
        <div
          id="add-user-drawer"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl",
            isMobile
              ? `w-full h-[94dvh] rounded-t-[40px] shadow-2xl border-0 ${isInviteOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `border-l border-white/10 w-[450px] h-full ${isInviteOpen ? 'translate-x-0' : 'translate-x-full'}`
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

            {!generatedInvite ? (
              <form
                id="add-user-form"
                onSubmit={handleInvite}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div className={cn("flex-1 overflow-y-auto scrollbar-hide overscroll-contain", isMobile ? "px-6 pb-6 pt-4 text-white font-light" : "p-7 space-y-7")}>
                  <div className={cn(isMobile ? "mb-6" : "")}>
                    <h2 className={cn("font-medium tracking-tight leading-none mb-2", isMobile ? "text-white text-lg" : "text-text")}>Añadir Usuario</h2>
                    <p className={cn("text-sm font-inter font-bold", isMobile ? "text-white/80" : "text-text-dim")}>Registra un nuevo usuario en la plataforma.</p>
                  </div>

                  <div className="space-y-6 pb-6">
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Nombre Completo</label>
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
                      </div>

                      <div className="space-y-2">
                        <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Teléfono (WhatsApp)</label>
                        <Input
                          required
                          type="tel"
                          inputMode="numeric"
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
                          onChange={(e) => setNewPhone(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                        <p className={cn("text-[11px] italic font-inter", isMobile ? "text-white/70" : "text-text-dim")}>Solo 8 dígitos, sin código de país o espacios.</p>
                      </div>

                      <div className="space-y-2">
                        <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Rol en la plataforma</label>
                        <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                          <SelectTrigger
                            className={cn(
                              "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all flex items-center justify-between",
                              isMobile
                                ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                                : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#050a15] border border-white/20 text-white shadow-2xl z-[200]">
                            <SelectItem value="Admin" className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] text-white/70">admin_panel_settings</span>
                                <span>Administrador (Admin)</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Editor" className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] text-white/70">manage_accounts</span>
                                <span>Coordinador (Editor)</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newRole === 'Editor' && (
                        <div className="space-y-2 animate-in fade-in zoom-in-95">
                          <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Comité Asignado</label>
                          <Select value={newCommittee} onValueChange={(v) => setNewCommittee(v || '')}>
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
                                <SelectItem key={c.id} value={c.name} className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {errorMsg && (
                      <div className="p-3 text-xs font-bold text-red-300 bg-red-500/15 border border-red-500/30 rounded-xl">
                        {errorMsg}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={cn("flex flex-row w-full mt-auto shrink-0 gap-3", isMobile ? "px-6 pt-2" : "p-7 pt-4 border-t border-white/5")}
                  style={isMobile ? { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' } : undefined}
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetInviteForm}
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
                    Añadir
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col p-6 space-y-5 animate-in fade-in zoom-in-95 justify-center items-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-[32px]">check_circle</span>
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-lg">¡Usuario Añadido!</h4>
                  <p className="text-xs text-white/70 mt-1.5 leading-relaxed px-2">
                    Envía los detalles de acceso a <span className="font-bold text-white">{generatedInvite.name}</span>. Al ingresar, validará su número de WhatsApp para acceder.
                  </p>
                </div>

                <div className="w-full bg-black/30 border border-white/15 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <code className="text-xs text-white/90 font-mono truncate">{generatedInvite.inviteLink}</code>
                  <button
                    onClick={() => copyToClipboard(generatedInvite.inviteLink!)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all active:scale-95"
                  >
                    {copied ? <span className="material-symbols-outlined text-[15px] text-emerald-400">check_circle</span> : <span className="material-symbols-outlined text-[15px]">content_copy</span>}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                <a
                  href={getWaLink(generatedInvite)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebd5a] text-white font-bold text-xs transition-all shadow-lg active:scale-95 mt-2"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  Enviar por WhatsApp
                </a>

                <Button
                  variant="outline"
                  onClick={resetInviteForm}
                  className="w-full h-11 rounded-full text-xs font-bold border-white/20 text-white hover:bg-white/10 mt-2"
                >
                  Cerrar y Crear Otra Invitación
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        {/* Users Table Card */}
        <motion.div 
          variants={itemVariants} 
          className="overflow-clip flex flex-col w-full bg-dark2 border border-white/10 rounded-[20px] shadow-lg"
        >
          <AlphabetScrubber isMobile={isMobile} />

          {/* Table view for Desktop (md and up) */}
          <div className="hidden md:block bg-dark2 flex-1 relative w-full pb-10">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
              <thead className="bg-dark3/80 sticky top-[140px] z-10 backdrop-blur-md text-[10px] font-bold text-text-dim uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4">Usuario</th>
                  <th className="px-3 py-4">Teléfono</th>
                  <th className="px-3 py-4">Rol y Acceso</th>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-text-dim">
                      Cargando usuarios...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-text-dim">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  sortedLetters.map(letter => (
                    <Fragment key={letter}>
                      {groupedUsers[letter].map((user, index) => (
                        <tr 
                          key={user.id} 
                          id={index === 0 ? `letter-${letter}` : undefined}
                          className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                          onClick={() => handleEditClick(user)}
                        >
                          <td className="px-5 py-4">
                            <p className={USER_TABLE_STYLES.name}>
                              <HighlightText text={user.name} term={appliedSearch} />
                            </p>
                          </td>
                          <td className={cn("px-3 py-4", USER_TABLE_STYLES.phone)}>
                            {user.phone}
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, user.role === 'Admin' ? USER_TABLE_STYLES.roleAdmin : USER_TABLE_STYLES.roleEditor)}>
                                {user.role}
                              </Badge>
                              {user.committee && (
                                <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(user.committee))}>
                                  {user.committee}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-center w-px whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90"
                                title="Editar Perfil"
                                onClick={(e) => { e.stopPropagation(); handleEditClick(user); }}
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90"
                                title="Resetear PIN"
                                onClick={(e) => { e.stopPropagation(); handleResetPin(user); }}
                              >
                                <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-500 transition-all active:scale-90"
                                title={user.isArchived ? 'Desarchivar' : 'Archivar'}
                                onClick={(e) => { e.stopPropagation(); handleArchiveUser(user); }}
                              >
                                <span className="material-symbols-outlined text-[18px]">{user.isArchived ? 'unarchive' : 'archive'}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Cards view for Mobile (under md) */}
          <div className="block md:hidden divide-y divide-white/5 bg-dark2">
            {loading ? (
              <div className="px-5 py-8 text-center text-text-dim">
                Cargando usuarios...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-dim">
                No se encontraron usuarios.
              </div>
            ) : (
              sortedLetters.map(letter => (
                <Fragment key={letter}>
                  {groupedUsers[letter].map((user, index) => (
                    <div key={user.id} id={index === 0 ? `letter-mobile-${letter}` : undefined}>
                      <SwipeableMobileCard 
                        name={user.name}
                        phone={user.phone}
                        searchTerm={appliedSearch}
                        onEdit={() => handleEditClick(user)}
                        
                        onSwipeRight={() => handleResetPin(user)}
                        swipeRightIcon="lock_reset"
                        swipeRightText="Reset PIN"
                        swipeRightColorClass="text-amber-500"
                        swipeRightBgColor="rgba(245, 158, 11, 0.2)"
                        
                        onSwipeLeft={() => handleArchiveUser(user)}
                        swipeLeftIcon={user.isArchived ? 'unarchive' : 'archive'}
                        swipeLeftText={user.isArchived ? 'Desarchivar' : 'Archivar'}
                        swipeLeftColorClass={user.isArchived ? 'text-blue-500' : 'text-amber-500'}
                        swipeLeftBgColor={user.isArchived ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'}
                        
                        badges={
                          <>
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, user.role === 'Admin' ? USER_TABLE_STYLES.roleAdmin : USER_TABLE_STYLES.roleEditor)}>
                              {user.role}
                            </Badge>
                            {user.committee && (
                              <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(user.committee))}>
                                {user.committee}
                              </Badge>
                            )}
                          </>
                        }
                      />
                    </div>
                  ))}
                </Fragment>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Drawer de Edición — custom fixed drawer (sin Sheet de Base UI para evitar scroll lock) */}
      <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isEditSheetOpen ? "pointer-events-auto" : "pointer-events-none")}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isEditSheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsEditSheetOpen(false)}
        />

        {/* Drawer Content */}
        <div
          id="edit-user-drawer"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-[#0a101d]",
            isMobile
              ? `w-full max-h-[94dvh] rounded-t-[40px] shadow-2xl ${isEditSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[400px] h-full shadow-2xl border-l border-white/10 ${isEditSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
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
            {/* Handle solo en móvil */}
            {isMobile && (
              <div 
                className="w-full pt-4 pb-2 flex justify-center shrink-0 touch-none"
                onTouchStart={(e) => {
                  const drawer = document.getElementById("edit-user-drawer");
                  if (!drawer) return;
                  drawer.dataset.startY = e.touches[0].clientY.toString();
                  drawer.style.transition = 'none';
                }}
                onTouchMove={(e) => {
                  const drawer = document.getElementById("edit-user-drawer");
                  if (!drawer) return;
                  const startY = parseFloat(drawer.dataset.startY || '0');
                  const deltaY = e.touches[0].clientY - startY;
                  if (deltaY > 0) {
                    drawer.style.transform = `translateY(${deltaY}px)`;
                    drawer.dataset.swiping = 'true';
                  }
                }}
                onTouchEnd={(e) => {
                  const drawer = document.getElementById("edit-user-drawer");
                  if (!drawer) return;
                  drawer.style.transition = 'transform 0.3s ease-out';
                  if (drawer.dataset.swiping === 'true') {
                    const startY = parseFloat(drawer.dataset.startY || '0');
                    const deltaY = e.changedTouches[0].clientY - startY;
                    drawer.dataset.swiping = 'false';
                    if (deltaY > 80) {
                      setIsEditSheetOpen(false);
                      setTimeout(() => { drawer.style.transform = ''; }, 300);
                    } else {
                      drawer.style.transform = '';
                    }
                  }
                }}
              >
                <div className="w-12 h-1.5 bg-white/30 rounded-full" />
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="flex-1 flex flex-col overflow-hidden">
              <div
                className={cn("flex-1 overflow-y-auto scrollbar-hide text-white font-light overscroll-contain", isMobile ? "px-6 pb-6 pt-4" : "p-8 space-y-7 pt-12")}
                onTouchStart={(e) => {
                  const drawer = document.getElementById("edit-user-drawer");
                  if (!drawer) return;
                  drawer.dataset.startY = e.touches[0].clientY.toString();
                  drawer.style.transition = 'none';
                }}
                onTouchMove={(e) => {
                  const drawer = document.getElementById("edit-user-drawer");
                  if (!drawer) return;
                  const startY = parseFloat(drawer.dataset.startY || '0');
                  const deltaY = e.touches[0].clientY - startY;
                  if (e.currentTarget.scrollTop <= 0 && deltaY > 0) {
                    drawer.style.transform = `translateY(${deltaY}px)`;
                    drawer.dataset.swiping = 'true';
                  }
                }}
                onTouchEnd={(e) => {
                  const drawer = document.getElementById("edit-user-drawer");
                  if (!drawer) return;
                  drawer.style.transition = 'transform 0.3s ease-out';
                  if (drawer.dataset.swiping === 'true') {
                    const startY = parseFloat(drawer.dataset.startY || '0');
                    const deltaY = e.changedTouches[0].clientY - startY;
                    drawer.dataset.swiping = 'false';
                    if (deltaY > 80) {
                      setIsEditSheetOpen(false);
                      setTimeout(() => { drawer.style.transform = ''; }, 300);
                    } else {
                      drawer.style.transform = '';
                    }
                  } else {
                    drawer.style.transform = '';
                  }
                }}
              >
                <div className="mb-6">
                  <h2 className="font-medium tracking-tight leading-none mb-2 text-white text-lg">Editar Perfil</h2>
                  <p className="text-sm font-inter font-bold text-white/80">Modifica los datos de acceso y el rol del usuario en la plataforma.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-normal text-white/90">Nombre completo</label>
                    <input
                      required
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-normal text-white/90">Teléfono WhatsApp</label>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={8}
                      onKeyPress={(e) => {
                        if (!/[0-9]/.test(e.key)) e.preventDefault();
                      }}
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-normal text-white/90">Rol en la plataforma</label>
                    <Select value={newRole} onValueChange={(v) => v && setNewRole(v as Role)}>
                      <SelectTrigger className="w-full h-10 border font-inter font-bold flex items-center justify-between border-white/20 bg-white/10 text-white">
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#050a15] border border-white/20 text-white shadow-2xl z-[200]">
                        <SelectItem value="Admin" className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">Admin (Acceso total)</SelectItem>
                        <SelectItem value="Editor" className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">Editor (Coordinador de comité)</SelectItem>
                        <SelectItem value="Lector" className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">Lector (Solo lectura)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newRole === 'Editor' && (
                    <div className="space-y-2">
                      <label className="block mb-2 text-xs font-normal text-white/90">Comité Asignado</label>
                      <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                        <SelectTrigger className="w-full h-10 border font-inter font-bold flex items-center justify-between border-white/20 bg-white/10 text-white">
                          <SelectValue placeholder="Selecciona un comité" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#050a15] border border-white/20 text-white shadow-2xl z-[200]">
                          {committeesList.map(c => (
                            <SelectItem key={c.id} value={c.name} className="font-inter font-bold text-sm text-white focus:bg-white/15 focus:text-white cursor-pointer py-2">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-normal text-white/90">PIN de Acceso Actual</label>
                    <div className="flex gap-2">
                      <div className="relative w-32 shrink-0">
                        <input
                          readOnly
                          type={showPin ? "text" : "password"}
                          value={
                            editingUser?.pin
                              ? ((currentUserRole?.toLowerCase() === 'admin' || (currentUserRole?.toLowerCase() === 'editor' && editingUser.committee === currentUserCommittee))
                                  ? editingUser.pin : '****')
                              : ''
                          }
                          className="w-full h-10 pl-3 pr-8 rounded-sm border text-sm font-inter font-bold outline-none tracking-widest text-left border-white/20 bg-white/5 text-white/70"
                        />
                        {(currentUserRole?.toLowerCase() === 'admin' || (currentUserRole?.toLowerCase() === 'editor' && editingUser?.committee === currentUserCommittee)) && editingUser?.pin && (
                          <button
                            type="button"
                            onClick={() => setShowPin(!showPin)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 transition-colors flex items-center justify-center text-white/50 hover:text-white"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {showPin ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleResetPin(editingUser!)}
                        className="flex-1 h-10 px-4 p-0 flex items-center justify-center gap-2 border rounded-sm text-white border-white/20 bg-white/10 hover:bg-white/25"
                      >
                        <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                        <span className="font-bold font-inter text-sm">Resetear PIN</span>
                      </Button>
                    </div>
                    <p className="text-[10px] italic font-inter text-white/70">El PIN por defecto tras un reseteo es '1234'.</p>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 text-sm rounded-sm border text-white bg-white/10 border-white/20 mt-4">
                    {errorMsg}
                  </div>
                )}

                </div>
              </div>

              {/* Botones */}
              <div
                className="flex flex-row w-full mt-auto shrink-0 gap-3 px-6 pt-0"
                style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditSheetOpen(false)}
                  className="flex-1 rounded-full shadow-lg h-11 px-4 text-xs sm:text-sm font-bold transition-all active:scale-[0.97] bg-white/10 hover:!bg-red-500 hover:!text-white hover:!border-red-500 text-white border-white/20"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-11 px-4 text-xs sm:text-sm font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
                >
                  {isUpdating ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      Actualizando...
                    </>
                  ) : (
                    'Guardar Cambios'
                  )}
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
    </motion.div>
  );
}
