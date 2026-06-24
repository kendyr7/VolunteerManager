'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { generateWaMeLink } from "@/lib/whatsapp";
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
  const { searchTerm, setSearchTerm } = useSearch();

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
    
    // Fetch users (ignoring archived ones locally to prevent DB schema errors)
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
        profilesData
          .filter(p => p.status !== 'archived')
          .map(p => ({
            id: p.id,
            name: p.full_name,
            phone: p.phone || '',
            role: p.role as Role,
            committee: p.committees?.name,
            status: p.pin ? 'active' : 'pending',
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const supabase = createClient();

    let committeeId: string | null = null;
    if (newRole === 'Editor') {
      const { data: comm } = await supabase
        .from('committees')
        .select('id')
        .eq('name', newCommittee)
        .maybeSingle();
      if (comm) {
        committeeId = comm.id;
      }
    }

    const pin = '1234'; // Default PIN assigned
    const shortCode = Math.random().toString(36).substring(2, 6);
    const link = `https://app.templomanagua.org/invite/${shortCode}`;

    const { data: inserted, error: insertErr } = await supabase
      .from('profiles')
      .insert({
        full_name: newName,
        phone: newPhone,
        role: newRole,
        committee_id: committeeId,
        pin: pin
      })
      .select('*, committees(name)')
      .maybeSingle();

    if (insertErr) {
      console.error("Error inserting user:", insertErr);
      setErrorMsg("Error al crear el usuario. Posiblemente el teléfono ya esté registrado.");
      return;
    }

    if (inserted) {
      const newUser: PlatformUser = {
        id: inserted.id,
        name: inserted.full_name,
        phone: inserted.phone || '',
        role: inserted.role as Role,
        committee: inserted.committees?.name,
        status: 'active',
        pin: pin,
        inviteLink: link
      };

      setGeneratedInvite(newUser);
      loadData();
      showToast("Invitación generada");
    }
  };

  const handleEditClick = (user: PlatformUser) => {
    setEditingUser(user);
    setNewName(user.name);
    setNewPhone(user.phone);
    setNewRole(user.role);
    if (user.committee) {
      setNewCommittee(user.committee);
    } else {
      setNewCommittee(COMMITTEES[0]);
    }
    setIsEditSheetOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setIsUpdating(true);
    setErrorMsg(null);
    const supabase = createClient();

    let committeeId: string | null = null;
    if (newRole === 'Editor') {
      const { data: comm } = await supabase
        .from('committees')
        .select('id')
        .eq('name', newCommittee)
        .maybeSingle();
      if (comm) {
        committeeId = comm.id;
      }
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        full_name: newName,
        phone: newPhone,
        role: newRole,
        committee_id: committeeId
      })
      .eq('id', editingUser.id);

    if (updateErr) {
      console.error("Error updating user:", updateErr);
      setErrorMsg("Error al actualizar el usuario.");
      setIsUpdating(false);
      return;
    }

    await loadData();
    setIsEditSheetOpen(false);
    setEditingUser(null);
    setIsUpdating(false);
    showToast("Perfil actualizado correctamente");
  };

  const handleResetPin = async (user: PlatformUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Resetear PIN',
      message: `¿Estás seguro de que deseas resetear el PIN de ${user.name}? Se establecerá el PIN temporal '1234'.`,
      confirmText: 'Resetear PIN',
      type: 'primary',
      onConfirm: async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from('profiles')
          .update({ pin: '1234' })
          .eq('id', user.id);

        if (error) {
          console.error("Error resetting PIN:", error);
          showToast("Error al resetear el PIN", "error");
        } else {
          showToast(`PIN de ${user.name} reseteado a '1234'`, "success");
          loadData();
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleArchiveUser = async (user: PlatformUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Archivar Usuario',
      message: `¿Estás seguro de que deseas archivar a ${user.name}? Podrás gestionarlo más adelante desde Ajustes.`,
      confirmText: 'Archivar',
      type: 'danger',
      onConfirm: async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from('profiles')
          .update({ status: 'archived' })
          .eq('id', user.id);

        if (error) {
          console.error("Error archiving user:", error);
          showToast("Error al archivar el usuario", "error");
        } else {
          showToast(`${user.name} archivado correctamente`, "success");
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

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) {
      return users.sort((a, b) => a.name.localeCompare(b.name));
    }

    const normalizeSearch = (str: string | undefined | null) => {
      if (!str) return '';
      return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);

    return users.filter(user => {
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
  }, [users, searchTerm]);

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
      {/* Sticky Header matching shifts design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Usuarios 
            <span className="text-xs font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 px-2.5 py-1 rounded-full border border-[#4d7cfe]/20">
              {filteredUsers.length}
            </span>
          </h1>
          <Button 
            onClick={() => setIsInviteOpen(true)}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            <span>Invitar</span>
          </Button>
        </motion.div>

        {/* Search Input matching shifts design */}
        <motion.div variants={itemVariants} className="w-full relative z-10">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, rol o comité..."
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
        {isInviteOpen && (
          <motion.div 
            variants={itemVariants} 
            className="w-full bg-dark2 border border-white/10 rounded-[20px] shadow-md overflow-hidden mb-2 animate-in fade-in slide-in-from-top-4"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-dark3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#4d7cfe]">verified_user</span>
                <h3 className="font-bold text-text tracking-tight">Nueva Invitación</h3>
              </div>
              <button onClick={resetInviteForm} className="text-text-dim hover:text-text transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {!generatedInvite ? (
              <form onSubmit={handleInvite} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-semibold text-text">Nombre completo</label>
                    <input 
                      required 
                      value={newName} 
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full h-10 px-3 rounded-[10px] border border-white/10 bg-dark2 text-sm text-text focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-semibold text-text">Teléfono WhatsApp</label>
                    <input 
                      required 
                      pattern="[0-9]{8}"
                      value={newPhone} 
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="Ej. 88881111"
                      className="w-full h-10 px-3 rounded-[10px] border border-white/10 bg-dark2 text-sm text-text font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-semibold text-text">Rol en la plataforma</label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                      <SelectTrigger className="w-full h-10 bg-dark2 border-white/10 text-text flex items-center justify-between rounded-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-dark2 border-white/10 text-text">
                        <SelectItem value="Admin">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-text-dim">admin_panel_settings</span>
                            <span>Admin</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="Editor">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-text-dim">manage_accounts</span>
                            <span>Editor</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newRole === 'Editor' && (
                    <div className="space-y-2 animate-in fade-in zoom-in-95">
                      <label className="block mb-2 text-xs font-semibold text-text">Comité Asignado</label>
                      <DataTableFilter
                        title={newCommittee || "Selecciona un comité"}
                        options={committeesList.map(c => c.name)}
                        value={newCommittee ? [newCommittee] : []}
                        dropdownLabel="Comités disponibles"
                        hideClearButton
                        hideCountBadge
                        isCommitteeFilter
                        className="w-full bg-dark2 justify-between h-10 border-white/10 rounded-[10px]"
                        onChange={(vals) => {
                          if (vals.length === 0) {
                            setNewCommittee("");
                            return;
                          }
                          const newName = vals.find(v => v !== newCommittee) || vals[0];
                          setNewCommittee(newName);
                        }}
                      />
                    </div>
                  )}
                </div>

                {errorMsg && (
                  <div className="p-3 text-sm text-red bg-red-50 border border-red-200 rounded-sm">
                    {errorMsg}
                  </div>
                )}

                <div className="pt-5 flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={resetInviteForm} className="text-text-dim hover:text-text">
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold shadow-sm rounded-full px-5">
                    Generar Enlace
                  </Button>
                </div>
              </form>
            ) : (
              <div className="p-8 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-accent mb-2">
                  <span className="material-symbols-outlined text-[24px]">check_circle</span>
                </div>
                <div>
                  <h4 className="font-bold text-text">Enlace Generado Exitosamente</h4>
                  <p className="text-sm text-text-dim mt-1 max-w-md mx-auto">
                    Envía este enlace único a <span className="font-semibold text-text">{generatedInvite.name}</span>. Al ingresar, validará su número y creará su PIN de acceso de 4 dígitos.
                  </p>
                </div>

                <div className="w-full max-w-md bg-dark3 border border-white/10 rounded-[12px] p-3 flex items-center justify-between gap-3 mt-4">
                  <code className="text-xs text-text font-mono truncate">{generatedInvite.inviteLink}</code>
                  <button 
                    onClick={() => copyToClipboard(generatedInvite.inviteLink!)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark2 hover:bg-dark3 border border-white/10 text-xs font-semibold text-text-dim transition-colors shadow-sm"
                  >
                    {copied ? <span className="material-symbols-outlined text-[16px] text-accent">check_circle</span> : <span className="material-symbols-outlined text-[16px] text-text-dim">content_copy</span>}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                <a 
                  href={getWaLink(generatedInvite)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#25D366] hover:bg-[#1ebd5a] text-white font-bold text-sm transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  Enviar por WhatsApp
                </a>
              </div>
            )}
          </motion.div>
        )}

        {/* Users Table Card */}
        <motion.div 
          variants={itemVariants} 
          className="bg-dark2 border border-white/10 rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full"
        >
          <AlphabetScrubber isMobile={isMobile} />

          {/* Table view for Desktop (md and up) */}
          <div className="hidden md:block overflow-auto bg-dark2 flex-1 relative max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm text-left">
              <thead className="bg-dark3/80 sticky top-0 z-10 backdrop-blur-md border-b border-white/10 text-[10px] font-bold text-text-dim uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4 w-full">Usuario</th>
                  <th className="px-3 py-4 w-px whitespace-nowrap">Teléfono</th>
                  <th className="px-3 py-4 w-px whitespace-nowrap">Rol y Acceso</th>
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
                          <td className="px-5 py-4 w-full">
                            <p className={USER_TABLE_STYLES.name}>
                              <HighlightText text={user.name} term={searchTerm} />
                            </p>
                          </td>
                          <td className={cn("px-3 py-4 w-px whitespace-nowrap", USER_TABLE_STYLES.phone)}>
                            {user.phone}
                          </td>
                          <td className="px-3 py-4 w-px whitespace-nowrap">
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
                                title="Archivar"
                                onClick={(e) => { e.stopPropagation(); handleArchiveUser(user); }}
                              >
                                <span className="material-symbols-outlined text-[18px]">archive</span>
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
                        searchTerm={searchTerm}
                        onEdit={() => handleEditClick(user)}
                        
                        onSwipeRight={() => handleResetPin(user)}
                        swipeRightIcon="lock_reset"
                        swipeRightText="Reset PIN"
                        swipeRightColorClass="text-amber-500"
                        swipeRightBgColor="rgba(245, 158, 11, 0.2)"
                        
                        onSwipeLeft={() => handleArchiveUser(user)}
                        swipeLeftIcon="archive"
                        swipeLeftText="Archivar"
                        swipeLeftColorClass="text-amber-500"
                        swipeLeftBgColor="rgba(245, 158, 11, 0.2)"
                        
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
              <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
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
                    if (deltaY > 150) {
                      setIsEditSheetOpen(false);
                      setTimeout(() => { drawer.style.transform = ''; }, 300);
                    } else {
                      drawer.style.transform = `translateY(0)`;
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
                      pattern="[0-9]{8}"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      className="w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-2 text-xs font-normal text-white/90">Rol en la plataforma</label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                      <SelectTrigger className="w-full h-10 border font-inter font-bold flex items-center justify-between border-white/20 bg-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#050a15] border-white/10 text-white backdrop-blur-xl">
                        <SelectItem value="Admin">Admin (Acceso total)</SelectItem>
                        <SelectItem value="Editor">Editor (Coordinador de comité)</SelectItem>
                        <SelectItem value="Lector">Lector (Solo lectura)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newRole === 'Editor' && (
                    <div className="space-y-2">
                      <label className="block mb-2 text-xs font-normal text-white/90">Comité Asignado</label>
                      <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                        <SelectTrigger className="w-full h-10 border font-inter font-bold flex items-center justify-between border-white/20 bg-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#050a15] border-white/10 text-white backdrop-blur-xl">
                          {committeesList.map(c => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
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
