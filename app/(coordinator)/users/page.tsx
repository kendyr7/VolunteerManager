'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  name: "font-sans font-normal text-text text-[13px] tracking-wide drop-shadow-sm truncate",
  phone: "font-mono text-xs text-text-dim",
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
      setUsers(profilesData.map(p => ({
        id: p.id,
        name: p.full_name,
        phone: p.phone || '',
        role: p.role as Role,
        committee: p.committees?.name,
        status: p.pin ? 'active' : 'pending',
        pin: p.pin || ''
      })));
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

  const handleDeleteUser = async (user: PlatformUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Usuario',
      message: `¿Estás seguro de que deseas eliminar a ${user.name}? Esta acción es permanente y no se puede deshacer.`,
      confirmText: 'Eliminar permanentemente',
      type: 'danger',
      onConfirm: async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id);

        if (error) {
          console.error("Error deleting user:", error);
          showToast("Error al eliminar el usuario", "error");
        } else {
          showToast(`Usuario ${user.name} eliminado`);
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
    return users.filter(user => 
      !searchTerm || 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      user.phone.includes(searchTerm)
    ).sort((a, b) => a.name.localeCompare(b.name));
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
              <span className="material-symbols-outlined text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar usuarios por nombre o teléfono..."
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
                  <th className="px-5 py-4">Usuario</th>
                  <th className="px-5 py-4">Teléfono</th>
                  <th className="px-5 py-4">Rol y Acceso</th>
                  <th className="px-5 py-4 text-center">Estado</th>
                  <th className="px-5 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-text-dim">
                      Cargando usuarios...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-text-dim">
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
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                          <td className="px-5 py-4">
                            <p className={USER_TABLE_STYLES.name}>
                              <HighlightText text={user.name} term={searchTerm} />
                            </p>
                          </td>
                          <td className={cn("px-5 py-4", USER_TABLE_STYLES.phone)}>
                            {user.phone}
                          </td>
                          <td className="px-5 py-4">
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
                          <td className="px-5 py-4 text-center">
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, user.status === 'active' ? USER_TABLE_STYLES.statusActive : USER_TABLE_STYLES.statusPending)} title={user.status !== 'active' ? "No ha ingresado su PIN" : undefined}>
                              {user.status === 'active' ? 'Activo' : 'Pendiente'}
                            </Badge>
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
                              <DropdownMenuContent align="end" className="bg-dark2 border-white/10 text-text min-w-[140px] p-1 rounded-[12px] shadow-md">
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/5 rounded-[8px] focus:bg-white/5 focus:text-text transition-colors flex items-center gap-2" onClick={() => handleEditClick(user)}>
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                  Editar Perfil
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/5 rounded-[8px] focus:bg-white/5 focus:text-text transition-colors flex items-center gap-2" onClick={() => handleResetPin(user)}>
                                  <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                                  Resetear PIN
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-red hover:bg-red-500/10 hover:text-red rounded-[8px] focus:bg-red-500/10 focus:text-red transition-colors flex items-center gap-2" onClick={() => handleDeleteUser(user)}>
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                        
                        onSwipeLeft={() => handleDeleteUser(user)}
                        swipeLeftIcon="delete"
                        swipeLeftText="Eliminar"
                        swipeLeftColorClass="text-red"
                        swipeLeftBgColor="rgba(239, 68, 68, 0.2)"
                        
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
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, user.status === 'active' ? USER_TABLE_STYLES.statusActive : USER_TABLE_STYLES.statusPending)}>
                              {user.status === 'active' ? 'Activo' : 'Pendiente'}
                            </Badge>
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

      {/* Sheet de Edición */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent
          id="edit-user-drawer"
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

          <form onSubmit={handleUpdateUser} className="flex-1 flex flex-col overflow-hidden">
            <div 
              className={cn("flex-1 overflow-y-auto scrollbar-hide overscroll-contain", isMobile ? "px-6 pb-6 pt-4 text-white font-light" : "p-7 space-y-7")}
              onTouchStart={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById("edit-user-drawer");
                if (!drawer) return;
                drawer.dataset.startY = e.touches[0].clientY.toString();
                drawer.style.transition = 'none';
              }}
              onTouchMove={(e) => {
                if (!isMobile) return;
                const drawer = document.getElementById("edit-user-drawer");
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
                const drawer = document.getElementById("edit-user-drawer");
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
                      setIsEditSheetOpen(false);
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
                <h2 className={cn("font-medium tracking-tight leading-none mb-2", isMobile ? "text-white text-lg" : "text-text")}>Editar Perfil</h2>
                <p className={cn("text-sm font-inter font-bold", isMobile ? "text-white/80" : "text-text-dim")}>Modifica los datos de acceso y el rol del usuario en la plataforma.</p>
              </div>

              <div className="space-y-6 pb-6">
                <div className="space-y-5">
                <div className="space-y-2">
                  <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Nombre completo</label>
                  <input 
                    required 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)}
                    className={cn(
                      "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all", 
                      isMobile 
                        ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white" 
                        : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Teléfono WhatsApp</label>
                  <input 
                    required 
                    pattern="[0-9]{8}"
                    value={newPhone} 
                    onChange={e => setNewPhone(e.target.value)}
                    className={cn(
                      "w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all", 
                      isMobile 
                        ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white" 
                        : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Rol en la plataforma</label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                    <SelectTrigger className={cn(
                      "w-full h-10 border text-text font-inter font-bold flex items-center justify-between",
                      isMobile ? "border-white/20 bg-white/10 text-white" : "bg-dark2 border-border"
                    )}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-dark2 border-border text-text">
                      <SelectItem value="Admin">Admin (Acceso total)</SelectItem>
                      <SelectItem value="Editor">Editor (Coordinador de comité)</SelectItem>
                      <SelectItem value="Lector">Lector (Solo lectura)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newRole === 'Editor' && (
                  <div className="space-y-2">
                    <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>Comité Asignado</label>
                    <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                      <SelectTrigger className={cn(
                        "w-full h-10 border text-text font-inter font-bold flex items-center justify-between",
                        isMobile ? "border-white/20 bg-white/10 text-white" : "bg-dark2 border-border"
                      )}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-dark2 border-border text-text">
                        {committeesList.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className={cn("block mb-2 text-xs font-normal", isMobile ? "text-white/90" : "text-text")}>PIN de Acceso Actual</label>
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
                        className={cn(
                          "w-full h-10 pl-3 pr-8 rounded-sm border text-sm font-inter font-bold outline-none tracking-widest text-left",
                          isMobile ? "border-white/20 bg-white/5 text-white/70" : "border-border bg-dark3 text-text-dim"
                        )}
                      />
                      {(currentUserRole?.toLowerCase() === 'admin' || (currentUserRole?.toLowerCase() === 'editor' && editingUser?.committee === currentUserCommittee)) && editingUser?.pin && (
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className={cn("absolute right-2 top-1/2 -translate-y-1/2 p-0.5 transition-colors flex items-center justify-center",
                            isMobile ? "text-white/50 hover:text-white" : "text-text-dim hover:text-text"
                          )}
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
                      className={cn(
                        "flex-1 h-10 px-4 p-0 flex items-center justify-center gap-2 border rounded-sm",
                        isMobile ? "text-white border-white/20 bg-white/10 hover:bg-white/25" : "text-[#4d7cfe] border-[#4d7cfe] hover:bg-[#4d7cfe]/10"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                      <span className="font-bold font-inter text-sm">Resetear PIN</span>
                    </Button>
                  </div>
                  <p className={cn("text-[10px] italic font-inter", isMobile ? "text-white/70" : "text-text-dim")}>El PIN por defecto tras un reseteo es '1234'.</p>
                </div>
              </div>

              {errorMsg && (
                <div className={cn(
                  "p-3 text-sm rounded-sm border",
                  isMobile ? "text-white bg-white/10 border-white/20" : "text-red bg-red-50 border-red-200"
                )}>
                  {errorMsg}
                </div>
              )}

              </div>
            </div>

            <div className="flex flex-row w-full mt-auto">
              <Button 
                type="button" 
                variant="ghost"
                onClick={() => setIsEditSheetOpen(false)} 
                className="btn-cancel flex-1 h-[52px] rounded-none rounded-tl-[24px] shadow-none font-inter font-bold text-base border-r border-black/5 dark:border-white/5"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isUpdating} 
                className="btn-action flex-1 h-[52px] rounded-none rounded-tr-[24px] shadow-none font-inter font-bold text-base"
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
    </motion.div>
  );
}
