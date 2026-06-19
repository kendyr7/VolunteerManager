'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

const SwipeableUserCard = ({ 
  user, 
  onEdit, 
  onReset, 
  onDelete,
  searchTerm
}: { 
  user: PlatformUser; 
  onEdit: (user: PlatformUser) => void; 
  onReset: (user: PlatformUser) => void; 
  onDelete: (user: PlatformUser) => void; 
  searchTerm: string;
}) => {
  const x = useMotionValue(0);
  
  const background = useTransform(
    x,
    [-150, 0, 150],
    ["rgba(239, 68, 68, 0.2)", "rgba(0, 0, 0, 0)", "rgba(245, 158, 11, 0.2)"]
  );

  const opacityLeft = useTransform(x, [-100, -10, 0], [1, 0, 0]);
  const opacityRight = useTransform(x, [0, 10, 100], [0, 0, 1]);

  const scaleLeft = useTransform(x, [-100, -20], [1, 0.8]);
  const scaleRight = useTransform(x, [20, 100], [0.8, 1]);

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 80;
    if (info.offset.x > swipeThreshold) {
      onReset(user);
    } else if (info.offset.x < -swipeThreshold) {
      onDelete(user);
    }
  };

  return (
    <div className="relative overflow-hidden w-full bg-dark2 select-none">
      {/* Background action layer underneath */}
      <motion.div 
        style={{ background }}
        className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none"
      >
        {/* Left Side: Dragged Right (Reset PIN) */}
        <motion.div 
          style={{ opacity: opacityRight, scale: scaleRight }}
          className="flex items-center gap-1.5 text-amber-500 font-bold text-[10px] font-inter uppercase tracking-wider"
        >
          <span className="material-symbols-outlined text-[18px]">lock_reset</span>
          <span>Reset PIN</span>
        </motion.div>

        {/* Right Side: Dragged Left (Delete) */}
        <motion.div 
          style={{ opacity: opacityLeft, scale: scaleLeft }}
          className="flex items-center gap-1.5 text-red font-bold text-[10px] font-inter uppercase tracking-wider"
        >
          <span>Eliminar</span>
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </motion.div>
      </motion.div>

      {/* Foreground card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.5 }}
        dragDirectionLock
        style={{ x }}
        onDragEnd={handleDragEnd}
        onClick={() => onEdit(user)}
        className="relative z-10 p-4 bg-dark2 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors cursor-pointer border-b border-white/5 flex flex-col gap-1.5 touch-pan-y"
      >
        {/* Name */}
        <p className="font-sans font-normal text-text text-[13px] tracking-wide drop-shadow-sm truncate">
          <HighlightText text={user.name} term={searchTerm} />
        </p>

        {/* Phone & Badges Line */}
        <div className="flex items-center justify-between w-full gap-2">
          <p className="font-mono text-xs text-text-dim shrink-0">{user.phone}</p>
          
          <div className="flex items-center gap-1.5 shrink">
            <Badge variant="outline" className={`font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full shrink-0 ${
              user.role === 'Admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20'
            }`}>
              {user.role}
            </Badge>
            {user.committee && (
              <Badge variant="outline" className={`font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full shrink-0 ${getCommitteeColor(user.committee)}`}>
                {user.committee}
              </Badge>
            )}
            <Badge variant="outline" className={`font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full shrink-0 ${
              user.status === 'active' ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-white/5 border-white/10 text-text-dim'
            }`}>
              {user.status === 'active' ? 'Activo' : 'Pendiente'}
            </Badge>
          </div>
        </div>
      </motion.div>
    </div>
  );
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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const observerRef = useRef<ResizeObserver | null>(null);

  const tableContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    if (node) {
      observerRef.current = new ResizeObserver((entries) => {
        const height = entries[0].contentRect.height;
        if (height > 42) {
          const calc = Math.floor((height - 42) / 49); // 42px header, ~49px row
          setItemsPerPage((prev) => {
            const next = Math.max(1, calc);
            return prev !== next ? next : prev;
          });
        }
      });
      observerRef.current.observe(node);
    }
  }, []);

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
    );
  }, [users, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredUsers.length]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const currentUsers = filteredUsers.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full mx-auto pb-12"
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
                    <label className="text-xs font-semibold text-text">Nombre completo</label>
                    <input 
                      required 
                      value={newName} 
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full h-10 px-3 rounded-[10px] border border-white/10 bg-dark2 text-sm text-text focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-text">Teléfono WhatsApp</label>
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
                    <label className="text-xs font-semibold text-text">Rol en la plataforma</label>
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
                      <label className="text-xs font-semibold text-text">Comité Asignado</label>
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
          {/* Table view for Desktop (md and up) */}
          <div className="hidden md:block overflow-auto bg-dark2 flex-1 relative [&>div]:h-full" ref={tableContainerRef}>
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
                ) : currentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-text-dim">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  currentUsers.map(user => (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-4">
                        <p className="font-sans font-normal text-text text-[13px] tracking-wide drop-shadow-sm truncate">
                          <HighlightText text={user.name} term={searchTerm} />
                        </p>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-text-dim">
                        {user.phone}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border ${
                            user.role === 'Admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20'
                          }`}>
                            {user.role}
                          </Badge>
                          {user.committee && (
                            <Badge variant="outline" className={`font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-md ${getCommitteeColor(user.committee)}`}>
                              {user.committee}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {user.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[9px] font-bold font-inter leading-none">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-text-dim text-[9px] font-bold font-inter leading-none" title="No ha ingresado su PIN">
                            Pendiente
                          </span>
                        )}
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
                  )))}
              </tbody>
            </table>
          </div>

          {/* Cards view for Mobile (under md) */}
          <div className="block md:hidden divide-y divide-white/5 bg-dark2">
            {loading ? (
              <div className="px-5 py-8 text-center text-text-dim">
                Cargando usuarios...
              </div>
            ) : currentUsers.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-dim">
                No se encontraron usuarios.
              </div>
            ) : (
              currentUsers.map(user => (
                <SwipeableUserCard
                  key={user.id}
                  user={user}
                  onEdit={handleEditClick}
                  onReset={handleResetPin}
                  onDelete={handleDeleteUser}
                  searchTerm={searchTerm}
                />
              ))
            )}
          </div>
          {totalPages > 1 && (
            <div className="bg-dark3 border-t border-white/10 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-text-dim font-medium text-center sm:text-left">
                Mostrando {(safeCurrentPage - 1) * itemsPerPage + 1} - {Math.min(safeCurrentPage * itemsPerPage, filteredUsers.length)} de {filteredUsers.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="h-8 text-xs font-bold rounded-full"
                >
                  Anterior
                </Button>
                <div className="text-xs font-bold text-text-dim px-2">
                  {safeCurrentPage} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="h-8 text-xs font-bold rounded-full"
                >
Siguiente
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Sheet de Edición */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            isMobile 
              ? "h-[94vh] bg-gradient-to-br from-[#009fd4] to-[#4d7cfe] dark:from-[#0f2027] dark:via-[#203a43] dark:to-[#194c7a] rounded-t-[40px] shadow-2xl flex flex-col border-0 overflow-hidden" 
              : "bg-dark2 text-text border-l border-white/10 sm:w-[40vw] sm:max-w-[95vw] h-full overflow-y-auto"
          )}
        >
          {isMobile && (
            <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
          )}
          <div className={cn(isMobile ? "flex-1 overflow-y-auto scrollbar-hide px-6 pb-8 pt-4 text-white" : "p-7 space-y-7")}>
            <div className={cn(isMobile ? "mb-6" : "")}>
              <h2 className={cn("font-bold tracking-tight leading-none mb-2", isMobile ? "text-white text-lg" : "text-text")}>Editar Perfil</h2>
              <p className={cn("text-sm", isMobile ? "text-white/80" : "text-text-dim")}>Modifica los datos de acceso y el rol del usuario en la plataforma.</p>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className={cn("text-xs font-semibold", isMobile ? "text-white/90" : "text-text")}>Nombre completo</label>
                  <input 
                    required 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)}
                    className={cn(
                      "w-full h-10 px-3 rounded-sm border text-sm outline-none transition-all", 
                      isMobile 
                        ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white" 
                        : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className={cn("text-xs font-semibold", isMobile ? "text-white/90" : "text-text")}>Teléfono WhatsApp</label>
                  <input 
                    required 
                    pattern="[0-9]{8}"
                    value={newPhone} 
                    onChange={e => setNewPhone(e.target.value)}
                    className={cn(
                      "w-full h-10 px-3 rounded-sm border text-sm font-mono outline-none transition-all", 
                      isMobile 
                        ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white focus:ring-1 focus:ring-white" 
                        : "border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className={cn("text-xs font-semibold", isMobile ? "text-white/90" : "text-text")}>Rol en la plataforma</label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                    <SelectTrigger className={cn(
                      "w-full h-10 border text-text flex items-center justify-between",
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
                    <label className={cn("text-xs font-semibold", isMobile ? "text-white/90" : "text-text")}>Comité Asignado</label>
                    <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                      <SelectTrigger className={cn(
                        "w-full h-10 border text-text flex items-center justify-between",
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
                  <label className={cn("text-xs font-semibold", isMobile ? "text-white/90" : "text-text")}>PIN de Acceso Actual</label>
                  <div className="flex gap-2">
                    <input 
                      readOnly
                      type="password"
                      value={editingUser?.pin ? '****' : ''} 
                      className={cn(
                        "flex-1 h-10 px-3 rounded-sm border text-sm font-mono outline-none",
                        isMobile ? "border-white/20 bg-white/5 text-white/70" : "border-border bg-dark3 text-text-dim"
                      )}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => handleResetPin(editingUser!)}
                      className={cn(
                        "h-10 w-10 p-0 flex items-center justify-center border rounded-sm shrink-0",
                        isMobile ? "text-white border-white/20 bg-white/10 hover:bg-white/25" : "text-[#4d7cfe] border-[#4d7cfe] hover:bg-[#4d7cfe]/10"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                    </Button>
                  </div>
                  <p className={cn("text-[10px] italic", isMobile ? "text-white/70" : "text-text-dim")}>El PIN por defecto tras un reseteo es '1234'.</p>
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

              <div className={cn(
                "pt-8 flex items-center justify-end gap-3",
                isMobile ? "border-t border-white/10" : "border-t border-border"
              )}>
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsEditSheetOpen(false)} 
                  className={cn(isMobile ? "text-white/80 hover:text-white hover:bg-white/10" : "text-text-dim hover:text-text")}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isUpdating} 
                  className={cn(
                    "font-bold shadow-sm px-6",
                    isMobile ? "bg-white text-[#4d7cfe] hover:bg-white/90" : "bg-[#4d7cfe] hover:bg-[#3b66e0] text-white"
                  )}
                >
                  {isUpdating ? 'Actualizando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          </div>
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
