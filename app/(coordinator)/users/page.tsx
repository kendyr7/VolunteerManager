'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { validatePhone8Digits } from "@/lib/whatsapp";
import { canManageUsers } from "@/lib/permissions";
import {
  createUserProfileAction,
  listUserProfilesAction,
  resetPlatformUserPinAction,
  sendBulkPlatformUserPinsWhatsAppAction,
  sendPlatformUserPinWhatsAppAction,
  updatePlatformUserStatusAction,
  updateUserProfileAction,
} from "@/app/actions/user-actions";
import { CoordinatorType } from "@/lib/role-permissions";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { DataTableFilter } from "@/components/DataTableFilter";
import { cn } from "@/lib/utils";
import { AlphabetScrubber, ALPHABET } from "@/components/AlphabetScrubber";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { SortableTableHead, TableSortDirection } from "@/components/SortableTableHead";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { HighlightText } from "@/components/HighlightText";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { useMobileDrawerNavigation } from "@/lib/use-mobile-drawer-navigation";
import { useRemoveSearchParam } from "@/lib/use-remove-search-param";

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

// ─── helper: highlight search term ─────────────────────────────────────────
const ROLES = ['Admin', 'Editor', 'Lector'] as const;
type Role = typeof ROLES[number];
type PlatformRoleSelection = 'admin' | 'technology' | 'committee' | 'volunteer';

const PLATFORM_ROLE_OPTIONS: Array<{
  value: PlatformRoleSelection;
  label: string;
  icon: string;
  iconClassName: string;
}> = [
  { value: 'admin', label: 'Administrador', icon: 'admin_panel_settings', iconClassName: 'text-amber-400' },
  { value: 'technology', label: 'Coordinador de tecnología', icon: 'qr_code_scanner', iconClassName: 'text-[#4d7cfe]' },
  { value: 'committee', label: 'Coordinador de comité', icon: 'groups', iconClassName: 'text-emerald-400' },
];

interface PlatformUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  coordinatorType?: CoordinatorType | null;
  committee?: string;
  status: 'pending' | 'active';
  isArchived?: boolean;
  inviteLink?: string;
}

type UserSortField = 'name' | 'phone' | 'role';

function getPlatformRoleLabel(user: Pick<PlatformUser, 'role' | 'coordinatorType'>) {
  if (user.role === 'Admin') return 'Administrador';
  if (user.role === 'Lector') return 'Voluntario';
  return user.coordinatorType === 'technology' ? 'Coord. tecnología' : 'Coord. comité';
}

function getPlatformRoleSelection(
  role: Role,
  coordinatorType?: CoordinatorType | null
): PlatformRoleSelection {
  if (role === 'Admin') return 'admin';
  if (role === 'Lector') return 'volunteer';
  return coordinatorType === 'technology' ? 'technology' : 'committee';
}

function getPlatformRoleDescription(selection: PlatformRoleSelection) {
  switch (selection) {
    case 'admin':
      return 'Acceso total al sistema, incluyendo usuarios, comités y permisos.';
    case 'technology':
      return 'Acceso global sujeto a los permisos que configure un Administrador.';
    case 'committee':
      return 'Acceso limitado a los voluntarios, turnos y reportes de su comité.';
    case 'volunteer':
      return 'Perfil legado. Los voluntarios se administran por separado desde Voluntarios.';
  }
}

function PlatformRoleSelect({
  value,
  onValueChange,
}: {
  value: PlatformRoleSelection;
  onValueChange: (value: PlatformRoleSelection) => void;
}) {
  const selectedOption = PLATFORM_ROLE_OPTIONS.find(option => option.value === value);

  return (
    <Select value={value} onValueChange={nextValue => nextValue && onValueChange(nextValue as PlatformRoleSelection)}>
      <SelectTrigger className="w-full h-10 border border-border bg-dark3 text-text font-inter font-bold flex items-center justify-between px-3 rounded-lg focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]">
        <SelectValue placeholder="Selecciona un rol">
          {() => selectedOption?.label || 'Voluntario (perfil legado)'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-dark2 border border-border text-text z-[200]">
        {PLATFORM_ROLE_OPTIONS.map(option => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="font-inter font-bold text-sm text-text hover:bg-dark3 focus:bg-dark3 cursor-pointer py-2 px-3"
          >
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[18px] ${option.iconClassName}`} aria-hidden="true">
                {option.icon}
              </span>
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
  const searchParams = useSearchParams();
  const requestedSearch = searchParams.get('search')?.trim() || '';
  const removeUrlSearch = useRemoveSearchParam();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const { inputValue, setInputValue, appliedSearch, setAppliedSearch, applySearch } = useDebouncedSearch();
  const [userSortField, setUserSortField] = useState<UserSortField>('name');
  const [userSortDirection, setUserSortDirection] = useState<TableSortDirection>('asc');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const isSelectionActive = selectedUsers.size > 0;
    window.dispatchEvent(new CustomEvent('hide-mobile-bottom-nav', {
      detail: { hidden: isSelectionActive },
    }));

    return () => {
      window.dispatchEvent(new CustomEvent('hide-mobile-bottom-nav', {
        detail: { hidden: false },
      }));
    };
  }, [selectedUsers.size]);

  useEffect(() => {
    if (!requestedSearch) return;
    setInputValue(requestedSearch);
    setAppliedSearch(requestedSearch);
  }, [requestedSearch, setAppliedSearch, setInputValue]);

  const [isMobile, setIsMobile] = useState(false);
  const { drawerRef: addUserDrawerRef, scrollAreaRef: addUserScrollRef } = useMobileDrawerNavigation({
    isOpen: isInviteOpen,
    onClose: () => resetInviteForm(),
    mobileQuery: '(max-width: 767px)',
  });
  const { drawerRef: editUserDrawerRef, scrollAreaRef: editUserScrollRef } = useMobileDrawerNavigation({
    isOpen: isEditSheetOpen,
    onClose: () => setIsEditSheetOpen(false),
    mobileQuery: '(max-width: 767px)',
  });

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
  const [newCoordinatorType, setNewCoordinatorType] = useState<CoordinatorType>('committee');
  const [newCommittee, setNewCommittee] = useState<string>(COMMITTEES[0]);
  const [sendWelcomeWhatsApp, setSendWelcomeWhatsApp] = useState(true);
  const [generatedInvite, setGeneratedInvite] = useState<PlatformUser | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedPlatformRole = getPlatformRoleSelection(newRole, newCoordinatorType);

  const handlePlatformRoleChange = (selection: PlatformRoleSelection) => {
    if (selection === 'admin') {
      setNewRole('Admin');
      return;
    }
    if (selection === 'volunteer') {
      setNewRole('Lector');
      return;
    }

    setNewRole('Editor');
    setNewCoordinatorType(selection);
  };

  const loadData = async () => {
    setLoading(true);
    const result = await listUserProfilesAction();
    if (!result.success) {
      showToast(result.error || "No se pudieron cargar los usuarios", "error");
      setLoading(false);
      return;
    }
    const profilesData = result.profiles;
    const commsData = result.committees;

    if (profilesData) {
      setUsers(
        profilesData.map(p => ({
          id: p.id,
          name: p.full_name,
          phone: p.phone || '',
          role: p.role as Role,
          coordinatorType: p.coordinator_type as CoordinatorType | null,
          committee: p.committees?.[0]?.name,
          status: 'active',
          isArchived: p.status === 'archived',
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

    let commId: string | null = null;
    if (newRole === 'Editor' && newCoordinatorType === 'committee') {
      const targetComm = committeesList.find(c => c.name === newCommittee);
      if (targetComm) {
        commId = targetComm.id;
      }
    }

    const result = await createUserProfileAction({
      fullName: newName.trim(),
      phone: sanitizedPhone,
      role: newRole,
      committeeId: commId,
      coordinatorType: newRole === 'Editor' ? newCoordinatorType : null,
      sendWhatsApp: sendWelcomeWhatsApp
    });

    if (!result.success || !result.user) {
      console.error("Error creating user:", result.error);
      setErrorMsg(result.error || "Error al crear usuario. Posiblemente el teléfono ya esté registrado.");
      return;
    }

    const newUser: PlatformUser = {
      id: result.user.id,
      name: result.user.name,
      phone: result.user.phone,
      role: result.user.role as Role,
      coordinatorType: result.user.coordinatorType as CoordinatorType | null,
      committee: result.user.committee,
      status: 'active',
      inviteLink: `http://localhost:3000/login`
    };

    setGeneratedInvite(newUser);
    if (result.waSuccess) {
      showToast("Usuario añadido y credenciales enviadas por WhatsApp");
    } else {
      showToast("Usuario añadido exitosamente");
    }
    loadData();
  };

  const handleEditClick = (user: PlatformUser) => {
    setEditingUser(user);
    setNewName(user.name);
    setNewPhone(user.phone);
    setNewRole(user.role);
    setNewCoordinatorType(user.coordinatorType || 'committee');
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

    let commId: string | null = null;
    if (newRole === 'Editor' && newCoordinatorType === 'committee') {
      const targetComm = committeesList.find(c => c.name === newCommittee);
      if (targetComm) commId = targetComm.id;
    }

    const result = await updateUserProfileAction({
      userId: editingUser.id,
      fullName: newName.trim(),
      phone: sanitizedPhone,
      role: newRole,
      committeeId: commId,
      coordinatorType: newRole === 'Editor' ? newCoordinatorType : null,
    });

    if (!result.success) {
      console.error("Error updating user:", result.error);
      showToast(result.error || "Error al actualizar usuario", "error");
    } else {
      showToast("Usuario actualizado correctamente");
      setIsEditSheetOpen(false);

      // If updating the currently logged-in user in mock mode, sync local role
      const activePhone = typeof window !== 'undefined' ? localStorage.getItem('volunteer_phone') : null;
      if (activePhone && (activePhone === sanitizedPhone || activePhone === editingUser.phone)) {
        const { setMockRole } = await import('@/lib/permissions');
        setMockRole();
      }

      loadData();
    }
    setIsUpdating(false);
  };

  const handleResetPin = async (user: PlatformUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Resetear PIN',
      message: `Se generará un nuevo PIN temporal para ${user.name}. Por seguridad, el PIN no se mostrará; podrás enviarlo al número registrado por WhatsApp.`,
      confirmText: 'Resetear',
      type: 'danger',
      onConfirm: async () => {
        const result = await resetPlatformUserPinAction(user.id);
        if (!result.success) {
          showToast(result.error || "Error al resetear PIN", "error");
        } else {
          showToast(`PIN de ${user.name} restablecido. Ya puedes enviarlo por WhatsApp.`);
          loadData();
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleSendPinWhatsApp = async (user: PlatformUser) => {
    showToast(`Enviando credenciales a ${user.name}...`, 'info');
    const result = await sendPlatformUserPinWhatsAppAction(user.id);
    if (result.success) {
      showToast(`Credenciales enviadas a ${user.name} por WhatsApp.`);
    } else {
      showToast(result.error || 'No se pudieron enviar las credenciales por WhatsApp.', 'error');
    }
  };

  const handleToggleUserSelection = useCallback((userId: string) => {
    setSelectedUsers(previous => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleBulkSendUsers = () => {
    if (selectedUsers.size === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Enviar credenciales por WhatsApp',
      message: `Se enviarán las credenciales de ${selectedUsers.size} usuario${selectedUsers.size === 1 ? '' : 's'} al teléfono registrado. Los PIN no se mostrarán. ¿Deseas continuar?`,
      confirmText: 'Enviar WhatsApp',
      type: 'primary',
      onConfirm: async () => {
        showToast('Enviando credenciales por WhatsApp...', 'info');
        const result = await sendBulkPlatformUserPinsWhatsAppAction(Array.from(selectedUsers));
        if (result.success) {
          showToast(`${result.sentCount} credencial${result.sentCount === 1 ? '' : 'es'} enviada${result.sentCount === 1 ? '' : 's'}${result.failedCount ? `; ${result.failedCount} fallaron` : ''}.`, result.failedCount ? 'info' : 'success');
        } else {
          showToast(result.error || 'No se pudieron enviar las credenciales.', 'error');
        }
        setSelectedUsers(new Set());
        setConfirmModal(previous => ({ ...previous, isOpen: false }));
      },
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
        const result = await updatePlatformUserStatusAction(user.id, newStatus);
        if (!result.success) {
          showToast(result.error || `Error al ${isArchived ? 'desarchivar' : 'archivar'} el usuario`, "error");
        } else {
          showToast(`${user.name} ${isArchived ? 'desarchivado' : 'archivado'} correctamente`, "success");
          loadData();
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const resetInviteForm = () => {
    setNewName('');
    setNewPhone('');
    setNewRole('Editor');
    setNewCoordinatorType('committee');
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
      const normRole = normalizeSearch(getPlatformRoleLabel(user));
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

  const handleSelectAllVisibleUsers = useCallback(() => {
    const visibleIds = filteredUsers.map(user => user.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedUsers.has(id));
    setSelectedUsers(previous => {
      const next = new Set(previous);
      visibleIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }, [filteredUsers, selectedUsers]);

  const desktopSortedUsers = useMemo(() => {
    const rows = [...filteredUsers];
    rows.sort((left, right) => {
      const leftValue = userSortField === 'role' ? getPlatformRoleLabel(left) : left[userSortField];
      const rightValue = userSortField === 'role' ? getPlatformRoleLabel(right) : right[userSortField];
      const comparison = String(leftValue || '').localeCompare(String(rightValue || ''), 'es', {
        numeric: true,
        sensitivity: 'base',
      });
      return userSortDirection === 'asc' ? comparison : -comparison;
    });
    return rows;
  }, [filteredUsers, userSortDirection, userSortField]);

  const handleUserSort = (field: string) => {
    const nextField = field as UserSortField;
    if (userSortField === nextField) {
      setUserSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortField(nextField);
      setUserSortDirection('asc');
    }
  };

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

  const [permTick, setPermTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handlePermissionsChange = () => setPermTick(v => v + 1);
    window.addEventListener("storage", handlePermissionsChange);
    window.addEventListener("permissions-changed", handlePermissionsChange);
    return () => {
      window.removeEventListener("storage", handlePermissionsChange);
      window.removeEventListener("permissions-changed", handlePermissionsChange);
    };
  }, []);

  if (mounted && !canManageUsers()) {
    return (
      <div className="w-full min-h-[65vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Acceso Restringido a Gestión de Usuarios</h2>
        <p className="text-xs text-text-dim max-w-md leading-relaxed">
          El Administrador ha deshabilitado el acceso a la Gestión de Usuarios para este rol. Si necesitas acceso, contacta a un Administrador para habilitar esta política en Ajustes.
        </p>
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
          <SmartSearchBar
            value={inputValue}
            onValueChange={setInputValue}
            onImmediateSearch={applySearch}
            onClear={removeUrlSearch}
            placeholder="Buscar por nombre, teléfono, rol o subcomité..."
            className="flex-1"
          />

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

        {mounted && typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {selectedUsers.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 32, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 32, scale: 0.96 }}
                className="fixed left-1/2 z-[80] flex w-[92%] max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-full border border-white/15 bg-[#141517]/95 px-4 py-2.5 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              >
                <div className="flex min-w-0 items-center gap-2.5 pl-1">
                  <Badge className="rounded-full bg-[#25D366] px-2.5 py-0.5 text-xs font-black text-black shadow-sm">{selectedUsers.size}</Badge>
                  <span className="hidden truncate text-xs font-bold text-white sm:inline">
                    {selectedUsers.size === 1 ? 'usuario seleccionado' : 'usuarios seleccionados'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUsers(new Set())}
                    className="rounded-full px-2.5 py-1.5 text-xs font-bold text-text-dim transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <Button
                    type="button"
                    onClick={handleBulkSendUsers}
                    className="flex h-9 items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-xs font-extrabold text-black shadow-md transition-all hover:bg-[#1ebd5a] active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">send_to_mobile</span>
                    <span>Enviar WhatsApp</span>
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
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
          ref={addUserDrawerRef}
          id="add-user-drawer"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border",
            isMobile
              ? `w-full h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] rounded-t-[40px] border-0 pb-[env(safe-area-inset-bottom)] ${isInviteOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[450px] h-full ${isInviteOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >
          <div className="relative z-10 flex flex-col h-full w-full">
            {isMobile && (
              <div className="w-12 h-1.5 bg-text-dim/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            )}

            {!generatedInvite ? (
              <form
                id="add-user-form"
                onSubmit={handleInvite}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div ref={addUserScrollRef} className={cn("flex-1 overflow-y-auto scrollbar-hide overscroll-contain", isMobile ? "px-6 pb-6 pt-4" : "p-7 space-y-7")}>
                  <div className="mb-6">
                    <h2 className="text-xl font-black text-text tracking-tight leading-none mb-1.5">Añadir Usuario</h2>
                    <p className="text-xs font-inter font-bold text-text-dim">Registra un nuevo usuario en la plataforma.</p>
                  </div>

                  <div className="space-y-6 pb-6">
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="block mb-1.5 text-xs font-extrabold text-text">Nombre Completo</label>
                        <Input
                          required
                          minLength={3}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-dark3 text-text placeholder:text-text-dim focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-sm font-inter font-bold outline-none transition-all"
                          placeholder="Ej. Juan Pérez"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block mb-1.5 text-xs font-extrabold text-text">Teléfono (WhatsApp)</label>
                        <Input
                          required
                          type="tel"
                          inputMode="numeric"
                          maxLength={8}
                          onKeyPress={(e) => {
                            if (!/[0-9]/.test(e.key)) e.preventDefault();
                          }}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-dark3 text-text placeholder:text-text-dim focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-sm font-inter font-bold outline-none transition-all"
                          placeholder="Ej. 88888888"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                        <p className="text-[11px] italic font-inter text-text-dim">Solo 8 dígitos, sin código de país o espacios.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="block mb-1.5 text-xs font-extrabold text-text">Rol en la plataforma</label>
                        <PlatformRoleSelect value={selectedPlatformRole} onValueChange={handlePlatformRoleChange} />
                        <p className="text-[11px] font-inter text-text-dim">
                          {getPlatformRoleDescription(selectedPlatformRole)}
                        </p>
                      </div>

                      {selectedPlatformRole === 'committee' && (
                        <div className="space-y-2 animate-in fade-in zoom-in-95">
                          <label className="block mb-1.5 text-xs font-extrabold text-text">Comité asignado</label>
                          <Select value={newCommittee} onValueChange={(v) => setNewCommittee(v || '')}>
                            <SelectTrigger className="w-full h-10 px-3 rounded-lg border border-border bg-dark3 text-text text-sm font-inter font-bold">
                              <SelectValue placeholder="Selecciona un subcomité" />
                            </SelectTrigger>
                            <SelectContent className="bg-dark2 border border-border text-text z-[200]">
                              {committeesList.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-dark3 cursor-pointer mt-4">
                        <input
                          type="checkbox"
                          checked={sendWelcomeWhatsApp}
                          onChange={(e) => setSendWelcomeWhatsApp(e.target.checked)}
                          className="w-4 h-4 rounded border-border bg-dark3 accent-[#4d7cfe]"
                        />
                        <span className="text-xs font-bold text-text">Enviar credenciales por WhatsApp Meta al registrar</span>
                      </label>
                    </div>

                    {errorMsg && (
                      <div className="p-3 text-xs font-bold text-red bg-red/10 border border-red/20 rounded-xl">
                        {errorMsg}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={cn("flex flex-row w-full mt-auto shrink-0 gap-3 border-t border-border p-7 pt-4", isMobile && "px-6 pt-3")}
                  style={isMobile ? { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' } : undefined}
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetInviteForm}
                    className="flex-1 rounded-full shadow-md h-11 px-4 text-xs sm:text-sm font-bold bg-dark3 hover:bg-dark text-text border border-border transition-all active:scale-[0.97]"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/20 h-11 px-4 text-xs sm:text-sm font-bold transition-all active:scale-[0.97]"
                  >
                    Añadir
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col p-6 space-y-4 animate-in fade-in zoom-in-95 justify-center items-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-[32px]">check_circle</span>
                </div>
                <div>
                  <h4 className="font-extrabold text-text text-lg">¡Usuario Añadido!</h4>
                  <p className="text-xs text-text-dim mt-1 leading-relaxed px-2">
                    Envía las credenciales de acceso a <span className="font-bold text-text">{generatedInvite.name}</span>.
                  </p>
                </div>

                <div className="w-full bg-dark3 border border-border rounded-2xl p-4 flex items-start gap-3 text-left">
                  <span className="material-symbols-outlined text-[20px] text-[#4d7cfe] shrink-0">shield_lock</span>
                  <p className="text-xs text-text-dim leading-relaxed">
                    El PIN está protegido y no puede visualizarse ni copiarse. Solo se enviará al número registrado del usuario.
                  </p>
                </div>

                {/* Primary Meta WhatsApp Button */}
                <Button
                  type="button"
                  onClick={async () => {
                    showToast(`Enviando WhatsApp a ${generatedInvite.name}...`);
                    await handleSendPinWhatsApp(generatedInvite);
                  }}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebd5a] text-black font-extrabold text-xs transition-all shadow-lg active:scale-95 mt-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  Enviar credenciales por WhatsApp Meta
                </Button>

                <Button
                  variant="outline"
                  onClick={resetInviteForm}
                  className="w-full h-11 rounded-full text-xs font-bold bg-dark3 hover:bg-dark text-text border border-border mt-1"
                >
                  Cerrar y Crear Otro Usuario
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
          className="overflow-clip flex flex-col w-full bg-dark2 border border-border rounded-[20px] shadow-lg"
        >
          <AlphabetScrubber isMobile={isMobile} />

          {/* Table view for Desktop (md and up) */}
          <div className="hidden md:block bg-dark2 flex-1 relative w-full max-h-[calc(100dvh-250px)] overflow-auto overscroll-contain">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
              <thead className="bg-dark3 sticky top-0 z-20 text-[10px] font-bold text-text-dim uppercase tracking-wider border-b border-border/70">
                <tr>
                  <th className="w-12 px-3 py-4 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAllVisibleUsers}
                      className={cn(
                        'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-all',
                        filteredUsers.length > 0 && filteredUsers.every(user => selectedUsers.has(user.id))
                          ? 'border-[#25D366] bg-[#25D366] text-black'
                          : filteredUsers.some(user => selectedUsers.has(user.id))
                            ? 'border-[#25D366] bg-[#25D366]/40 text-black'
                            : 'border-white/30 hover:border-white/60'
                      )}
                      aria-label="Seleccionar usuarios visibles"
                    >
                      {filteredUsers.length > 0 && filteredUsers.every(user => selectedUsers.has(user.id)) && <span className="material-symbols-outlined text-[14px]">check</span>}
                      {filteredUsers.some(user => selectedUsers.has(user.id)) && !filteredUsers.every(user => selectedUsers.has(user.id)) && <span className="material-symbols-outlined text-[14px]">remove</span>}
                    </button>
                  </th>
                  <SortableTableHead field="name" activeField={userSortField} direction={userSortDirection} onSort={handleUserSort} className="px-5 py-4">Usuario</SortableTableHead>
                  <SortableTableHead field="phone" activeField={userSortField} direction={userSortDirection} onSort={handleUserSort} className="px-3 py-4">Teléfono</SortableTableHead>
                  <SortableTableHead field="role" activeField={userSortField} direction={userSortDirection} onSort={handleUserSort} className="px-3 py-4">Rol y Acceso</SortableTableHead>
                  <th className="px-3 py-4 text-center w-px whitespace-nowrap">Acciones</th>
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
                  desktopSortedUsers.map((user, index) => {
                    const initial = /^[A-Z]$/.test(user.name.charAt(0).toUpperCase())
                      ? user.name.charAt(0).toUpperCase()
                      : '#';
                    const firstIndexForInitial = desktopSortedUsers.findIndex(candidate => {
                      const candidateInitial = candidate.name.charAt(0).toUpperCase();
                      return (/^[A-Z]$/.test(candidateInitial) ? candidateInitial : '#') === initial;
                    });

                    return (
                        <tr 
                          key={user.id} 
                          id={index === firstIndexForInitial ? `letter-${initial}` : undefined}
                          className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                          onClick={() => handleEditClick(user)}
                        >
                          <td className="w-12 px-3 py-4 text-center" onClick={event => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleToggleUserSelection(user.id)}
                              className={cn(
                                'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-all',
                                selectedUsers.has(user.id) ? 'border-[#25D366] bg-[#25D366] text-black' : 'border-white/30 hover:border-white/60'
                              )}
                              aria-label={`Seleccionar a ${user.name}`}
                            >
                              {selectedUsers.has(user.id) && <span className="material-symbols-outlined text-[14px]">check</span>}
                            </button>
                          </td>
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
                                {getPlatformRoleLabel(user)}
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
                                className="h-8 w-8 text-[#25D366] hover:bg-[#25D366]/15 hover:text-[#25D366] transition-all active:scale-90"
                                title="Enviar credenciales por WhatsApp"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  showToast(`Enviando WhatsApp a ${user.name}...`);
                                  await handleSendPinWhatsApp(user);
                                }}
                              >
                                <span className="material-symbols-outlined text-[18px]">send_to_mobile</span>
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
                    );
                  })
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

                        isSelected={selectedUsers.has(user.id)}
                        onToggleSelect={() => handleToggleUserSelection(user.id)}
                        selectionModeActive={selectedUsers.size > 0}
                        
                        badges={
                          <>
                            <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, user.role === 'Admin' ? USER_TABLE_STYLES.roleAdmin : USER_TABLE_STYLES.roleEditor)}>
                              {getPlatformRoleLabel(user)}
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
          ref={editUserDrawerRef}
          id="edit-user-drawer"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border",
            isMobile
              ? `w-full h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] rounded-t-[40px] border-0 pb-[env(safe-area-inset-bottom)] ${isEditSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[400px] h-full ${isEditSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >
          <div className="relative z-10 flex flex-col h-full w-full">
            {/* Handle solo en móvil */}
            {isMobile && (
              <div className="w-full pt-4 pb-2 flex justify-center shrink-0 touch-none">
                <div className="w-12 h-1.5 bg-text-dim/30 rounded-full" />
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="flex-1 flex flex-col overflow-hidden">
              <div
                ref={editUserScrollRef}
                className={cn("flex-1 overflow-y-auto scrollbar-hide overscroll-contain", isMobile ? "px-6 pb-6 pt-4" : "p-8 space-y-7 pt-12")}
              >
                <div className="mb-6">
                  <h2 className="font-black text-text tracking-tight leading-none mb-1.5 text-xl">Editar Perfil</h2>
                  <p className="text-xs font-inter font-bold text-text-dim">Modifica los datos de acceso y el rol del usuario en la plataforma.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="block mb-1.5 text-xs font-extrabold text-text">Nombre completo</label>
                    <input
                      required
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-dark3 text-text placeholder:text-text-dim focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-sm font-inter font-bold outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-1.5 text-xs font-extrabold text-text">Teléfono WhatsApp</label>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={8}
                      onKeyPress={(e) => {
                        if (!/[0-9]/.test(e.key)) e.preventDefault();
                      }}
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-dark3 text-text placeholder:text-text-dim focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-sm font-inter font-bold outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block mb-1.5 text-xs font-extrabold text-text">Rol en la plataforma</label>
                    <PlatformRoleSelect value={selectedPlatformRole} onValueChange={handlePlatformRoleChange} />
                    <p className="text-[11px] font-inter text-text-dim">
                      {getPlatformRoleDescription(selectedPlatformRole)}
                    </p>
                  </div>

                  {selectedPlatformRole === 'committee' && (
                    <div className="space-y-2">
                      <label className="block mb-1.5 text-xs font-extrabold text-text">Comité asignado</label>
                      <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                        <SelectTrigger className="w-full h-10 border border-border bg-dark3 text-text font-inter font-bold px-3 rounded-lg"><SelectValue placeholder="Selecciona un subcomité" /></SelectTrigger>
                        <SelectContent className="bg-dark2 border border-border text-text z-[200]">
                          {committeesList.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block mb-1.5 text-xs font-extrabold text-text">Seguridad del PIN</label>
                    <div className="rounded-xl border border-border bg-dark3 p-3 text-[11px] leading-relaxed text-text-dim">
                      El PIN de acceso es privado. Nadie puede visualizarlo; solo puedes restablecerlo o enviarlo al teléfono registrado por WhatsApp.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleResetPin(editingUser!)}
                        className="flex-1 h-10 px-4 p-0 flex items-center justify-center gap-2 border border-border rounded-lg text-text bg-dark3 hover:bg-dark font-bold font-inter text-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                        <span>Resetear PIN</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => editingUser && handleSendPinWhatsApp(editingUser)}
                        className="h-10 px-4 flex items-center justify-center gap-2 border border-[#25D366]/30 rounded-lg text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/15 font-bold font-inter text-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">chat</span>
                        <span>Enviar por WhatsApp</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 text-xs font-bold text-red bg-red/10 border border-red/20 rounded-xl mt-4">
                    {errorMsg}
                  </div>
                )}

                </div>
              </div>

              {/* Botones */}
              <div
                className="flex flex-row w-full mt-auto shrink-0 gap-3 border-t border-border p-7 pt-4"
                style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditSheetOpen(false)}
                  className="flex-1 rounded-full shadow-md h-11 px-4 text-xs sm:text-sm font-bold bg-dark3 hover:bg-dark text-text border border-border transition-all active:scale-[0.97]"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/20 h-11 px-4 text-xs sm:text-sm font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
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
