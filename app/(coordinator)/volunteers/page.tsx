'use client'

import { AddVolunteerForm } from "@/components/AddVolunteerForm";
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { List } from 'react-window';
import { CSSProperties } from 'react';
import { useRouter, useSearchParams } from "next/navigation";

// ...
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Phone, MoreHorizontal, UserPlus, Mail, Briefcase, MapPin, GraduationCap, Heart, Calendar } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getOperationalEventDays, formatDateShort, isShiftAvailableForDay } from "@/lib/dates";
import { DataTableFilter } from "@/components/DataTableFilter";
import { createClient } from "@/lib/supabase/client";
import { cn, normalizeSearch } from "@/lib/utils";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import {
  canArchiveVolunteer,
  canCreateVolunteer,
  canEditShifts,
  canEditVolunteerPersonalInfo,
  canSendWhatsappMessages,
  canViewVolunteers,
  getAuthorizationSnapshotCache,
} from "@/lib/permissions";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useCoordinatorData } from "@/lib/coordinator-data-context";
import { USER_TABLE_STYLES } from "../users/page";
import { AlphabetScrubber, ALPHABET } from "@/components/AlphabetScrubber";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { formatE164, validatePhone8Digits, getLocal8Digits } from "@/lib/whatsapp";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { sendWelcomeWhatsAppAction, sendVolunteerCredentialsAction } from "@/app/actions/whatsapp";
import { VolunteerProfileView } from "@/components/VolunteerProfileView";
import { VolunteerProfileDrawer } from "@/components/VolunteerProfileDrawer";
import { VolunteerTableRow } from "@/components/VolunteerTableRow";
import { BulkSendCredentialsModal } from "@/components/BulkSendCredentialsModal";
import { VolunteerSearchService } from "@/lib/services/volunteer-search.service";
import { filterVolunteerIds } from "@/lib/services/volunteer-filter.service";
import { groupVolunteersAlphabetically } from "@/lib/services/volunteer-grouping.service";
import { RealtimeDebugOverlay } from "@/components/RealtimeDebugOverlay";
import { useVolunteerStore } from "@/lib/store/use-volunteer-store";
import { saveShiftsAction, updateVolunteerAction } from "@/app/actions/volunteer-actions";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { HighlightText } from "@/components/HighlightText";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { useMobileDrawerNavigation } from "@/lib/use-mobile-drawer-navigation";


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

type SortField = 'name' | 'ward' | 'stake' | 'committee' | 'shifts' | 'reliability';
type SortOrder = 'asc' | 'desc';

import { updateVolunteerStatusAction, swapVolunteerActivationAction, resetVolunteerPinAction } from "@/app/actions/volunteer-actions";

export default function VolunteersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAction = searchParams.get('action');
  const requestedShiftDay = searchParams.get('day')?.trim() || null;
  const requestedShiftParam = searchParams.get('shift')?.trim().toUpperCase() || null;
  const requestedShiftKey = requestedShiftParam && /^T[1-4]$/.test(requestedShiftParam)
    ? requestedShiftParam
    : null;
  const requestedCommittee = searchParams.get('committee')?.trim() || null;
  const hasDashboardScheduleFilter = Boolean(requestedShiftDay);
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
  const { inputValue, setInputValue, appliedSearch, applySearch } = useDebouncedSearch();
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);

  // Table Column Sort State
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const committeesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of committeesList || []) {
      map.set(c.id, c.name);
    }
    return map;
  }, [committeesList]);

  const volunteers = useMemo<VolunteerType[]>(
    () =>
      rawVolunteers.map((v: any) => {
        const name = `${v.first_name || ''} ${v.last_name || ''}`.trim();
        const committee =
          (v.committee_id ? committeesMap.get(v.committee_id) : undefined)
          ?? v.committees?.name
          ?? 'Sin comité';
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
    [rawVolunteers, shiftCounts, committeesMap]
  );

  useEffect(() => {
    if (volunteers && volunteers.length > 0) {
      console.log(`[VOLUNTEERS PAGE MAP] total=${volunteers.length}, sampleId=${volunteers[0]?.id}, name=${volunteers[0]?.name}, ward=${volunteers[0]?.ward}`);
    }
  }, [volunteers]);
  const [showArchived, setShowArchived] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  // Bulk Selection & Credentials state
  const [selectedVolunteers, setSelectedVolunteers] = useState<Set<string>>(new Set());
  const [isBulkCredentialsModalOpen, setIsBulkCredentialsModalOpen] = useState(false);

  // Hide global mobile nav/QuickWheel search button when selection mode is active
  useEffect(() => {
    const isSelectionActive = selectedVolunteers.size > 0;
    window.dispatchEvent(
      new CustomEvent('hide-mobile-bottom-nav', {
        detail: { hidden: isSelectionActive },
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent('hide-mobile-bottom-nav', {
          detail: { hidden: false },
        })
      );
    };
  }, [selectedVolunteers.size]);

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

  // Reactive selected volunteer ID state (eliminates static object snapshot)
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
  const selectedVolunteer = useMemo(() => {
    if (!selectedVolunteerId) return null;
    return rawVolunteers.find((v: any) => v.id === selectedVolunteerId) ?? null;
  }, [selectedVolunteerId, rawVolunteers]);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addVolunteerFormVersion, setAddVolunteerFormVersion] = useState(0);

  useEffect(() => {
    if (requestedAction !== 'new' || !canCreateVolunteer()) return;
    window.history.replaceState(null, '', '/volunteers');
    const frame = window.requestAnimationFrame(() => {
      setAddVolunteerFormVersion(version => version + 1);
      setIsAddSheetOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedAction]);

  const { drawerRef: addVolunteerDrawerRef } = useMobileDrawerNavigation({
    isOpen: isAddSheetOpen,
    onClose: () => setIsAddSheetOpen(false),
    mobileQuery: '(max-width: 767px)',
  });
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [volunteerToArchive, setVolunteerToArchive] = useState<VolunteerType | null>(null);
  const [unarchiveConflict, setUnarchiveConflict] = useState<{
    isOpen: boolean;
    targetVolunteer: VolunteerType | null;
    activeVolunteer: { id: string; name: string; phone: string; stake?: string; ward?: string; committee?: string } | null;
    newPhoneInput: string;
    isEditingPhone: boolean;
  }>({
    isOpen: false,
    targetVolunteer: null,
    activeVolunteer: null,
    newPhoneInput: '',
    isEditingPhone: false,
  });
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
  const [canViewAllVolunteers, setCanViewAllVolunteers] = useState(false);
  const [, setPermissionRevision] = useState(0);

  const handleResetPin = useCallback(async (vol: VolunteerType) => {
    if (!canEditVolunteerPersonalInfo(vol.committee_id)) {
      showToast("No tienes permiso para restablecer el PIN de este voluntario", "error");
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Resetear PIN',
      message: `¿Estás seguro de que deseas resetear el PIN de ${vol.name}? Se establecerá el PIN temporal '1234'.`,
      confirmText: 'Resetear PIN',
      type: 'primary',
      onConfirm: async () => {
        const res = await resetVolunteerPinAction(vol.id);

        if (!res.success) {
          console.error("Error resetting PIN:", res.error);
          showToast(res.error || "Error al resetear el PIN", "error");
        } else {
          showToast(`PIN de ${vol.name} reseteado a '1234'`, "success");
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, []);

  const handleArchiveVolunteer = async () => {
    if (!volunteerToArchive) return;
    if (!canArchiveVolunteer()) {
      showToast("Solo los administradores pueden archivar voluntarios", "error");
      return;
    }

    const isUnarchiving = volunteerToArchive.status === 'archived';
    const newStatus: 'active' | 'archived' = isUnarchiving ? 'active' : 'archived';

    const res = await updateVolunteerStatusAction({
      volunteerId: volunteerToArchive.id,
      toStatus: newStatus,
    });

    if (!res.success) {
      if (res.reason === 'phone_conflict' && res.conflictingVolunteer) {
        setIsArchiveModalOpen(false);
        setUnarchiveConflict({
          isOpen: true,
          targetVolunteer: volunteerToArchive,
          activeVolunteer: res.conflictingVolunteer,
          newPhoneInput: volunteerToArchive.phone || '',
          isEditingPhone: false,
        });
        setVolunteerToArchive(null);
        return;
      }
      showToast(res.error || `Error al ${newStatus === 'archived' ? 'archivar' : 'desarchivar'}`, "error");
    } else {
      showToast(`Voluntario ${newStatus === 'archived' ? 'archivado' : 'desarchivado'}`);
      const updatedVol = { ...volunteerToArchive, status: newStatus };
      useVolunteerStore.getState().upsertVolunteer(updatedVol);
    }

    setIsArchiveModalOpen(false);
    setVolunteerToArchive(null);
  };

  const handleSwapAndActivate = async () => {
    if (!unarchiveConflict.targetVolunteer || !unarchiveConflict.activeVolunteer) return;

    const res = await swapVolunteerActivationAction(
      unarchiveConflict.activeVolunteer.id,
      unarchiveConflict.targetVolunteer.id
    );

    if (!res.success) {
      showToast(res.error || "Error al intercambiar voluntarios.", "error");
      return;
    }

    showToast(`Se archivó a "${unarchiveConflict.activeVolunteer.name}" y se activó a "${unarchiveConflict.targetVolunteer.name}".`, "success");
    setUnarchiveConflict(prev => ({ ...prev, isOpen: false }));
  };

  const handleUpdatePhoneAndActivate = async () => {
    if (!unarchiveConflict.targetVolunteer) return;

    const phoneValidation = validatePhone8Digits(unarchiveConflict.newPhoneInput);
    if (!phoneValidation.isValid) {
      showToast(phoneValidation.error || "El número debe tener 8 dígitos.", "error");
      return;
    }

    const sanitizedPhone = phoneValidation.formatted;

    const res = await updateVolunteerStatusAction({
      volunteerId: unarchiveConflict.targetVolunteer.id,
      toStatus: 'active',
      newPhone: sanitizedPhone,
    });

    if (!res.success) {
      showToast(res.error || "Error al actualizar y desarchivar voluntario.", "error");
    } else {
      showToast(`Teléfono actualizado a ${sanitizedPhone} y voluntario desarchivado exitosamente.`, "success");
      setUnarchiveConflict(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Días reales del evento (Sep 10-26, sin domingos)
  const EVENT_DAYS = getOperationalEventDays().map(date => ({
    key: formatDateShort(date),                   // clave única: 'jue 10'
    label: formatDateShort(date).split(' ')[0],    // solo el día: 'jue'
    dateNum: formatDateShort(date).split(' ')[1],  // solo el número: '10'
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(buildEmptyShifts);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const syncAuthorization = () => {
      const snapshot = getAuthorizationSnapshotCache();
      setCurrentRole(snapshot.role);
      setCurrentCommittee(snapshot.committeeName || '');
      setCanViewAllVolunteers(snapshot.role === 'Admin' || snapshot.coordinatorType === 'technology');
      setPermissionRevision(value => value + 1);
      setMounted(true);
    };
    syncAuthorization();
    window.addEventListener('permissions-changed', syncAuthorization);
    return () => window.removeEventListener('permissions-changed', syncAuthorization);
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
    if (!canEditVolunteerPersonalInfo(vol.committee_id)) {
      showToast("No tienes permiso para editar la información personal", "error");
      return;
    }
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
    setSelectedVolunteerId(vol.id);
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
    if (!canArchiveVolunteer()) {
      showToast("Solo los administradores pueden archivar voluntarios", "error");
      return;
    }
    setVolunteerToArchive(vol);
    setIsArchiveModalOpen(true);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVolunteer) return;

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

    const fullName = `${trimmedFirstName} ${trimmedLastName}`.trim();
    const commObj = committeesList.find(c => c.id === editCommitteeId || c.name === editCommitteeId);
    const commName = commObj ? commObj.name : selectedVolunteer.committee;

    setIsSavingProfile(true);

    const result = await updateVolunteerAction(selectedVolunteer.id, {
      firstName:   trimmedFirstName,
      lastName:    trimmedLastName,
      phone:       sanitizedPhone,
      stake:       trimmedStake || null,
      neighborhood: trimmedWard || null,
      committeeId: commObj ? commObj.id : (editCommitteeId || null),
      age:         ageNum,
    });

    if (!result.success) {
      console.error("Error updating profile:", result.error);
      showToast(`Error al guardar cambios: ${result.error}`, "error");
    } else {
      showToast("Perfil de voluntario actualizado correctamente");

      const updatedVol: VolunteerType = {
        ...selectedVolunteer,
        name: fullName,
        phone: sanitizedPhone,
        stake: trimmedStake,
        ward: trimmedWard,
        committee: commName,
        age: ageNum ?? undefined,
      };

      useVolunteerStore.getState().upsertVolunteer(updatedVol);
      setDrawerMode('view');
    }
    setIsSavingProfile(false);
  };

  const handleSaveShifts = async () => {
    setIsEditingShifts(false);
    if (!selectedVolunteer) return;

    const hasInvalidSimulationShift = Object.entries(shiftsByDay).some(([dayKey, shiftKeys]) =>
      shiftKeys.some(shiftKey => !isShiftAvailableForDay(dayKey, shiftKey))
    );
    if (hasInvalidSimulationShift) {
      showToast('El 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).', 'error');
      return;
    }

    const result = await saveShiftsAction(selectedVolunteer.id, shiftsByDay);
    if (!result.success) {
      showToast(result.error || 'Error al guardar turnos', 'error');
      setIsEditingShifts(true);
      return;
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
    const baseFiltered = filterVolunteerIds(augmentedVolunteers, matchedSearchIds, {
      currentRole,
      currentCommittee,
      canViewAllVolunteers,
      showArchived,
      selectedCommittees,
      selectedStakes,
      selectedWards,
    });

    if (!requestedShiftDay) return baseFiltered;
    return baseFiltered.filter(volunteer => {
      const assignedShifts = globalShifts[volunteer.id]?.[requestedShiftDay] || [];
      const matchesSchedule = requestedShiftKey
        ? assignedShifts.includes(requestedShiftKey)
        : assignedShifts.length > 0;
      const matchesCommittee = !requestedCommittee || volunteer.committee === requestedCommittee;
      return matchesSchedule && matchesCommittee;
    });
  }, [
    searchService,
    augmentedVolunteers,
    appliedSearch,
    currentRole,
    currentCommittee,
    canViewAllVolunteers,
    showArchived,
    selectedCommittees,
    selectedStakes,
    selectedWards,
    globalShifts,
    requestedShiftDay,
    requestedShiftKey,
    requestedCommittee,
  ]);

  const sortedFilteredVolunteers = useMemo(() => {
    return [...filteredVolunteers].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'reliability') {
        valA = a.computedReliability ?? a.reliability ?? 0;
        valB = b.computedReliability ?? b.reliability ?? 0;
      }

      if (typeof valA === 'string' || typeof valB === 'string') {
        valA = (valA || '').trim();
        valB = (valB || '').trim();
        const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true });
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      if (typeof valA === 'number' || typeof valB === 'number') {
        const numA = valA ?? 0;
        const numB = valB ?? 0;
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }

      return 0;
    });
  }, [filteredVolunteers, sortField, sortOrder]);

  const { activeCount, archivedCount } = useMemo(() => {
    const baseList = augmentedVolunteers.filter(v => {
      if (currentRole === 'Editor' && !canViewAllVolunteers && v.committee !== currentCommittee) return false;
      if (currentRole === 'Lector') return false;
      return true;
    });
    const active = baseList.filter(v => v.status !== 'archived').length;
    const archived = baseList.filter(v => v.status === 'archived').length;
    return { activeCount: active, archivedCount: archived };
  }, [augmentedVolunteers, currentRole, currentCommittee, canViewAllVolunteers]);

  const { letters: sortedLetters, groupCounts, groupedVolunteers, groupsRecord, flatVolunteers } = useMemo(() => {
    return groupVolunteersAlphabetically(sortedFilteredVolunteers);
  }, [sortedFilteredVolunteers]);

  const selectedVolunteerItems = useMemo(() => {
    return Array.from(selectedVolunteers)
      .map(id => volunteers.find(v => v.id === id))
      .filter((v): v is VolunteerType => !!v)
      .map(v => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        committee: v.committee,
        status: v.status,
      }));
  }, [selectedVolunteers, volunteers]);

  const handleToggleSelect = useCallback((vol: VolunteerType) => {
    setSelectedVolunteers(prev => {
      const next = new Set(prev);
      if (next.has(vol.id)) {
        next.delete(vol.id);
      } else {
        next.add(vol.id);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    const visibleIds = sortedFilteredVolunteers.map(v => v.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedVolunteers.has(id));

    setSelectedVolunteers(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [sortedFilteredVolunteers, selectedVolunteers]);

  const handleClearSelection = useCallback(() => {
    setSelectedVolunteers(new Set());
  }, []);

  const handleSingleSendCredentials = useCallback(async (vol: VolunteerType) => {
    if (!canSendWhatsappMessages()) {
      showToast("No tienes permiso para enviar mensajes de WhatsApp", "error");
      return;
    }
    if (!vol.phone) {
      showToast("El voluntario no tiene teléfono registrado", "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Enviar Credenciales por WhatsApp',
      message: `¿Deseas enviar las credenciales de acceso por WhatsApp a ${vol.name} (${vol.phone})? Se enviará la plantilla oficial con su PIN.`,
      confirmText: 'Enviar WhatsApp',
      type: 'primary',
      onConfirm: async () => {
        showToast(`Enviando WhatsApp a ${vol.name}...`, 'info');
        const res = await sendVolunteerCredentialsAction({
          volunteerId: vol.id,
        });

        if (res.success) {
          showToast(`✅ ¡Credenciales enviadas a ${vol.name}!`);
          if (refresh) refresh(true);
        } else {
          showToast(`❌ Error de WhatsApp: ${res.error}`, 'error');
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  }, [refresh]);

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
          <SmartSearchBar
            value={inputValue}
            onValueChange={setInputValue}
            onImmediateSearch={applySearch}
            placeholder="Buscar voluntarios por nombre, teléfono, estaca, barrio o subcomité..."
            className="flex-1"
          />

          {/* Añadir button next to search bar with matching height */}
          {canCreateVolunteer() && (
            <Button
              type="button"
              onClick={() => {
                setAddVolunteerFormVersion(version => version + 1);
                setIsAddSheetOpen(true);
              }}
              className="flex bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-[48px] px-4 sm:px-5 text-xs font-bold transition-all active:scale-[0.97] items-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>Añadir</span>
            </Button>
          )}
        </motion.div>
      </div>

      <div className="flex flex-col gap-4 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        {hasDashboardScheduleFilter && (
          <motion.div
            variants={itemVariants}
            className="w-full flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-[#4d7cfe]">filter_alt</span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Filtro del dashboard</p>
                <p className="truncate text-sm font-extrabold text-text">
                  {requestedShiftKey ? `${requestedShiftKey} · ` : 'Todos los turnos · '}{requestedShiftDay}
                  {requestedCommittee ? ` · ${requestedCommittee}` : ' · Todos los comités'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.replace('/volunteers')}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-dark2 px-3 text-[11px] font-bold text-text-dim transition-colors hover:border-[#4d7cfe]/40 hover:text-text"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Limpiar filtro
            </button>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="bg-dark2 border border-border rounded-[20px] shadow-lg overflow-clip flex flex-col w-full">
          <AlphabetScrubber isMobile={isMobile} />
          {/* Contenedor de Datos: Escritorio PC vs Móvil */}
          {!isMobile ? (
            <div className="bg-dark2 flex-1 relative w-full pb-10">
              {sortedFilteredVolunteers.length > 0 ? (
                <div className="w-full max-h-[calc(100dvh-250px)] overflow-auto overscroll-contain bg-dark2">
                  {/* Encabezado Fijo de Tabla con Ordenamiento */}
                  <div className="flex items-center w-full px-5 py-3.5 bg-dark3 sticky top-0 z-20 text-[10px] font-bold text-text-dim uppercase tracking-wider border-b border-border/70 select-none">
                    {canSendWhatsappMessages() && (
                      <div 
                        className="pr-3 flex items-center shrink-0 cursor-pointer"
                        onClick={handleSelectAllVisible}
                        title={sortedFilteredVolunteers.length > 0 && sortedFilteredVolunteers.every(v => selectedVolunteers.has(v.id)) ? "Deseleccionar visibles" : "Seleccionar visibles"}
                      >
                        <div className={cn(
                          "w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all select-none",
                          sortedFilteredVolunteers.length > 0 && sortedFilteredVolunteers.every(v => selectedVolunteers.has(v.id))
                            ? "bg-[#25D366] border-[#25D366] text-black shadow-sm" 
                            : sortedFilteredVolunteers.some(v => selectedVolunteers.has(v.id))
                              ? "bg-[#25D366]/40 border-[#25D366] text-black"
                              : "border-slate-400 dark:border-white/30 hover:border-slate-600 dark:hover:border-white/60 bg-white dark:bg-white/[0.04]"
                        )}>
                          {sortedFilteredVolunteers.length > 0 && sortedFilteredVolunteers.every(v => selectedVolunteers.has(v.id)) && (
                            <svg className="w-3 h-3 text-black stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                          {sortedFilteredVolunteers.length > 0 && !sortedFilteredVolunteers.every(v => selectedVolunteers.has(v.id)) && sortedFilteredVolunteers.some(v => selectedVolunteers.has(v.id)) && (
                            <svg className="w-3 h-3 text-black stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="flex-[2.5] min-w-[200px] pr-4 flex items-center gap-1.5 hover:text-text transition-colors text-left cursor-pointer group"
                      title="Ordenar por Nombre y Apellido"
                    >
                      <span className={cn(sortField === 'name' && "text-[#4d7cfe] font-extrabold")}>Nombre y Apellido</span>
                      <span className={cn(
                        "material-symbols-outlined text-[14px] transition-all",
                        sortField === 'name' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                      )}>
                        {sortField === 'name' ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSort('ward')}
                      className="flex-[1.5] min-w-[140px] flex items-center justify-center gap-1.5 hover:text-text transition-colors shrink-0 cursor-pointer group px-2"
                      title="Ordenar por Barrio / Rama"
                    >
                      <span className={cn(sortField === 'ward' && "text-[#4d7cfe] font-extrabold")}>Barrio / Rama</span>
                      <span className={cn(
                        "material-symbols-outlined text-[14px] transition-all",
                        sortField === 'ward' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                      )}>
                        {sortField === 'ward' ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSort('stake')}
                      className="flex-[1.5] min-w-[140px] flex items-center justify-center gap-1.5 hover:text-text transition-colors shrink-0 cursor-pointer group px-2"
                      title="Ordenar por Estaca"
                    >
                      <span className={cn(sortField === 'stake' && "text-[#4d7cfe] font-extrabold")}>Estaca</span>
                      <span className={cn(
                        "material-symbols-outlined text-[14px] transition-all",
                        sortField === 'stake' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                      )}>
                        {sortField === 'stake' ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSort('committee')}
                      className="flex-[1.8] min-w-[150px] flex items-center justify-center gap-1.5 hover:text-text transition-colors shrink-0 cursor-pointer group px-2"
                      title="Ordenar por Comité"
                    >
                      <span className={cn(sortField === 'committee' && "text-[#4d7cfe] font-extrabold")}>Comité</span>
                      <span className={cn(
                        "material-symbols-outlined text-[14px] transition-all",
                        sortField === 'committee' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                      )}>
                        {sortField === 'committee' ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSort('shifts')}
                      className="w-24 flex items-center justify-center gap-1.5 hover:text-text transition-colors shrink-0 cursor-pointer group"
                      title="Ordenar por Turnos"
                    >
                      <span className={cn(sortField === 'shifts' && "text-[#4d7cfe] font-extrabold")}>Turnos</span>
                      <span className={cn(
                        "material-symbols-outlined text-[14px] transition-all",
                        sortField === 'shifts' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                      )}>
                        {sortField === 'shifts' ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSort('reliability')}
                      className="w-28 flex items-center justify-center gap-1.5 hover:text-text transition-colors shrink-0 cursor-pointer group"
                      title="Ordenar por Confiabilidad"
                    >
                      <span className={cn(sortField === 'reliability' && "text-[#4d7cfe] font-extrabold")}>Confiabilidad</span>
                      <span className={cn(
                        "material-symbols-outlined text-[14px] transition-all",
                        sortField === 'reliability' ? "text-[#4d7cfe] opacity-100 font-extrabold" : "opacity-40 group-hover:opacity-100"
                      )}>
                        {sortField === 'reliability' ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </button>

                    <div className="w-36 text-center shrink-0">Acciones</div>
                  </div>

                  {/* Cuerpo de la Tabla */}
                  <div className="divide-y divide-white/5">
                    {(() => {
                      const seenLetters = new Set<string>();
                      return sortedFilteredVolunteers.map((vol: VolunteerType) => {
                        const firstChar = (vol.name || '').charAt(0).toUpperCase();
                        const letterKey = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
                        let anchorId: string | undefined = undefined;
                        if (!seenLetters.has(letterKey)) {
                          seenLetters.add(letterKey);
                          anchorId = `letter-${letterKey}`;
                        }
                        return (
                          <VolunteerTableRow
                            key={vol.id}
                            id={anchorId}
                            vol={vol}
                            appliedSearch={appliedSearch}
                            onEditClick={handleEditClick}
                            onResetPin={handleResetPin}
                            onArchive={handleArchive}
                            canEditProfile={canEditVolunteerPersonalInfo(vol.committee_id)}
                            canResetPin={canEditVolunteerPersonalInfo(vol.committee_id)}
                            canArchive={canArchiveVolunteer()}
                            isSelected={selectedVolunteers.has(vol.id)}
                            onToggleSelect={canSendWhatsappMessages() ? handleToggleSelect : undefined}
                            canSendCredentials={canSendWhatsappMessages()}
                            onSendCredentials={handleSingleSendCredentials}
                          />
                        );
                      });
                    })()}
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
              {sortedFilteredVolunteers.length > 0 ? (
                <div className="divide-y divide-white/5 w-full">
                  {(() => {
                    const seenLetters = new Set<string>();
                    return sortedFilteredVolunteers.map((vol: VolunteerType) => {
                      const firstChar = (vol.name || '').charAt(0).toUpperCase();
                      const letterKey = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
                      let anchorId: string | undefined = undefined;
                      if (!seenLetters.has(letterKey)) {
                        seenLetters.add(letterKey);
                        anchorId = `letter-mobile-${letterKey}`;
                      }
                      return (
                        <SwipeableMobileCard
                          key={vol.id}
                          id={anchorId}
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

                          isSelected={selectedVolunteers.has(vol.id)}
                          onToggleSelect={canSendWhatsappMessages() ? () => handleToggleSelect(vol) : undefined}
                          selectionModeActive={selectedVolunteers.size > 0}

                          badges={
                            <>
                              {vol.age != null && vol.age > 0 && vol.age < 18 && (
                                <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[9px] font-extrabold px-1.5 py-0">
                                  Menor ({vol.age}a)
                                </Badge>
                              )}
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
                      );
                    });
                  })()}
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

      {/* Unified Volunteer Profile Drawer */}
      <VolunteerProfileDrawer
        isOpen={isSheetOpen && !!selectedVolunteerId}
        onClose={() => {
          setIsSheetOpen(false);
          setSelectedVolunteerId(null);
        }}
        volunteer={selectedVolunteer}
        volunteerId={selectedVolunteerId}
        mode="coordinator"
        initialMode={drawerMode}
      />


      {/* Editor Lateral (Añadir) - Custom Fixed Drawer */}
      <div className={cn("fixed inset-0 z-[100] flex transition-all duration-300", isMobile ? "flex-col justify-end" : "justify-end", isAddSheetOpen ? "pointer-events-auto" : "pointer-events-none")}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isAddSheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsAddSheetOpen(false)}
        />

        {/* Drawer Content */}
        <div
          ref={addVolunteerDrawerRef}
          id="add-volunteer-drawer"
          className={cn(
            "relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border",
            isMobile
              ? `w-full h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] rounded-t-[40px] border-0 pb-[env(safe-area-inset-bottom)] ${isAddSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
              : `w-[450px] h-full ${isAddSheetOpen ? 'translate-x-0' : 'translate-x-full'}`
          )}
          style={{ willChange: 'transform' }}
        >
          <div className="relative z-10 flex flex-col h-full w-full">
            {isMobile && (
              <div className="w-12 h-1.5 bg-text-dim/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
            )}

            <AddVolunteerForm 
              key={addVolunteerFormVersion}
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

      {/* Modal de Resolución de Conflicto de Desarchivado */}
      <AnimatePresence>
        {unarchiveConflict.isOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setUnarchiveConflict(prev => ({ ...prev, isOpen: false }))}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-dark2 border border-border rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 text-text z-10"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-2xl shrink-0">
                  <span className="material-symbols-outlined text-[28px]">warning</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text leading-tight">
                    Conflicto al Desarchivar
                  </h3>
                  <p className="text-xs text-text-dim mt-1 font-inter leading-relaxed">
                    El número <strong className="text-text font-bold">{unarchiveConflict.activeVolunteer?.phone}</strong> pertenece al voluntario activo <strong className="text-amber-600 dark:text-amber-400 font-bold">{unarchiveConflict.activeVolunteer?.name}</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-dark3/80 dark:bg-dark3/40 border border-border/80 rounded-2xl p-4 space-y-3 text-xs font-inter">
                {/* Target (Archived) Volunteer details */}
                <div className="space-y-1 pb-3 border-b border-border/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-text-dim">Registro Archivado (A activar)</span>
                    <Badge variant="outline" className="text-[9px] bg-dark3 text-text border-border font-bold">Archivado</Badge>
                  </div>
                  <p className="font-bold text-text text-sm">{unarchiveConflict.targetVolunteer?.name}</p>
                  <p className="text-[11px] text-text-dim font-medium">
                    Comité: <span className="text-text font-bold">{unarchiveConflict.targetVolunteer?.committee || 'Sin comité'}</span>
                    {(unarchiveConflict.targetVolunteer?.ward || unarchiveConflict.targetVolunteer?.stake) && (
                      <span> · {unarchiveConflict.targetVolunteer?.ward || ''} {unarchiveConflict.targetVolunteer?.stake ? `(${unarchiveConflict.targetVolunteer.stake})` : ''}</span>
                    )}
                  </p>
                </div>

                {/* Active Volunteer details in conflict */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-amber-600 dark:text-amber-400">Registro Activo Actual (En uso)</span>
                    <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-bold">Activo</Badge>
                  </div>
                  <p className="font-bold text-amber-600 dark:text-amber-400 text-sm">{unarchiveConflict.activeVolunteer?.name}</p>
                  <p className="text-[11px] text-text-dim font-medium">
                    Comité: <span className="text-text font-bold">{unarchiveConflict.activeVolunteer?.committee || 'Sin comité'}</span>
                    {(unarchiveConflict.activeVolunteer?.ward || unarchiveConflict.activeVolunteer?.stake) && (
                      <span> · {unarchiveConflict.activeVolunteer?.ward || ''} {unarchiveConflict.activeVolunteer?.stake ? `(${unarchiveConflict.activeVolunteer.stake})` : ''}</span>
                    )}
                  </p>
                </div>
              </div>

              {!unarchiveConflict.isEditingPhone ? (
                <div className="space-y-2.5 pt-2">
                  <p className="text-xs font-bold text-text-dim">¿Cómo deseas resolver este conflicto?</p>
                  
                  {/* Option 1: Swap & Activate */}
                  <Button
                    onClick={handleSwapAndActivate}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white h-11 rounded-xl text-xs font-bold font-inter transition-all flex items-center justify-center gap-2 shadow-md active:scale-98 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                    Reemplazar: Archivar el activo actual y activar este
                  </Button>

                  {/* Option 2: Change phone */}
                  <Button
                    variant="outline"
                    onClick={() => setUnarchiveConflict(prev => ({ ...prev, isEditingPhone: true }))}
                    className="w-full bg-dark3 border-border text-text hover:bg-dark3/80 h-11 rounded-xl text-xs font-bold font-inter transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Asignar nuevo número a este registro para activar ambos
                  </Button>

                  {/* Option 3: Cancel */}
                  <Button
                    variant="ghost"
                    onClick={() => setUnarchiveConflict(prev => ({ ...prev, isOpen: false }))}
                    className="w-full text-text-dim hover:text-text h-10 text-xs font-bold font-inter cursor-pointer"
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-text">Nuevo Número de Teléfono (8 dígitos)</label>
                    <Input
                      value={unarchiveConflict.newPhoneInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                        setUnarchiveConflict(prev => ({ ...prev, newPhoneInput: val }));
                      }}
                      placeholder="Ej: 88881111"
                      className="bg-dark3 border-border text-text text-sm h-11 font-bold rounded-xl placeholder:text-text-dim"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setUnarchiveConflict(prev => ({ ...prev, isEditingPhone: false }))}
                      className="flex-1 h-10 text-xs font-bold border-border bg-dark3 text-text rounded-xl cursor-pointer"
                    >
                      Volver
                    </Button>
                    <Button
                      onClick={handleUpdatePhoneAndActivate}
                      className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white h-10 text-xs font-bold rounded-xl shadow-md cursor-pointer"
                    >
                      Guardar y Activar
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sticky Bottom Floating Bulk Actions Bar */}
      <AnimatePresence>
        {selectedVolunteers.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed left-1/2 -translate-x-1/2 z-[80] w-[92%] max-w-xl bg-white/95 dark:bg-[#141517]/95 border border-slate-200 dark:border-white/15 backdrop-blur-xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.6)] px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
            style={{
              bottom: 'max(1.25rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0 pl-1">
              <Badge className="bg-[#25D366] text-black font-black text-xs px-2.5 py-0.5 rounded-full shadow-sm">
                {selectedVolunteers.size}
              </Badge>
              <span className="font-bold text-slate-800 dark:text-white text-xs truncate hidden sm:inline">
                {selectedVolunteers.size === 1 ? 'voluntario seleccionado' : 'voluntarios seleccionados'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-text-dim dark:hover:text-white px-2.5 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              {canSendWhatsappMessages() && (
                <Button
                  type="button"
                  onClick={() => setIsBulkCredentialsModalOpen(true)}
                  className="h-9 px-4 rounded-full bg-[#25D366] hover:bg-[#1ebd5a] text-black font-extrabold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">mark_chat_read</span>
                  <span>Enviar WhatsApp</span>
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkSendCredentialsModal
        isOpen={isBulkCredentialsModalOpen}
        onClose={() => setIsBulkCredentialsModalOpen(false)}
        selectedVolunteers={selectedVolunteerItems}
        onComplete={(sent, failed) => {
          setSelectedVolunteers(new Set());
          if (refresh) refresh(true);
          showToast(`✅ Proceso finalizado: ${sent} credenciales enviadas${failed > 0 ? `, ${failed} fallidos` : ''}.`, failed > 0 ? 'info' : 'success');
        }}
      />

      <RealtimeDebugOverlay />
    </motion.div>
  );
}
