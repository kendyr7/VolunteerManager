'use client'

import { useState, useEffect, useMemo, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DataTableFilter } from "@/components/DataTableFilter";
import { startRegistration } from "@simplewebauthn/browser";
import Fuse from "fuse.js";

import {
  getSystemPermission,
  setSystemPermission,
  fetchSystemPermission,
  resetAllPermissionsToDefault
} from "@/lib/permissions";
import { changeUserPin } from "@/app/actions/update-pin";
import { useCoordinatorData } from "@/lib/coordinator-data-context";
import { createCommitteeAction, archiveCommitteeAction, unarchiveCommitteeAction, updateCommitteeRequirementsAction } from "@/app/actions/committee-actions";
import { getActivityLogs, ActivityLog } from "@/app/actions/activity-actions";
import { getCurrentSettingsProfileAction } from "@/app/actions/user-actions";

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

const getCommitteeStyle = (committeeName: string, isSelected: boolean) => {
  if (!isSelected) {
    return 'bg-dark3 text-text-dim border-border hover:bg-dark hover:text-text';
  }

  const comm = committeeName.toLowerCase();
  let color = {
    bgSelected: 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-blue-500/25',
  };

  if (comm.includes('seguridad')) {
    color = {
      bgSelected: 'bg-[#fe4d97] text-white border-[#fe4d97] shadow-pink-500/25',
    };
  } else if (comm.includes('guía') || comm.includes('guia')) {
    color = {
      bgSelected: 'bg-[#6dd230] text-black font-extrabold border-[#6dd230] shadow-green-500/25',
    };
  } else if (comm.includes('traducción') || comm.includes('traduccion')) {
    color = {
      bgSelected: 'bg-amber-500 text-black font-extrabold border-amber-500 shadow-amber-500/25',
    };
  } else if (comm.includes('transporte')) {
    color = {
      bgSelected: 'bg-purple-500 text-white border-purple-500 shadow-purple-500/25',
    };
  } else if (comm.includes('auxilios') || comm.includes('médico') || comm.includes('medico')) {
    color = {
      bgSelected: 'bg-teal-500 text-white border-teal-500 shadow-teal-500/25',
    };
  } else if (comm.includes('logística') || comm.includes('logistica')) {
    color = {
      bgSelected: 'bg-cyan-500 text-black font-extrabold border-cyan-500 shadow-cyan-500/25',
    };
  } else {
    const palette = [
      { bgSelected: 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/25' },
      { bgSelected: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/25' },
      { bgSelected: 'bg-rose-600 text-white border-rose-600 shadow-rose-500/25' },
      { bgSelected: 'bg-orange-500 text-black font-extrabold border-orange-500 shadow-orange-500/25' },
      { bgSelected: 'bg-sky-500 text-black font-extrabold border-sky-500 shadow-sky-500/25' }
    ];
    let hash = 0;
    for (let i = 0; i < committeeName.length; i++) {
      hash = committeeName.charCodeAt(i) + ((hash << 5) - hash);
    }
    color = palette[Math.abs(hash) % palette.length];
  }

  return `${color.bgSelected} shadow-md scale-[1.02]`;
};

export default function SettingsPage() {
  const { refresh } = useCoordinatorData();
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [committees, setCommittees] = useState<{ id: string, name: string, status?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  // Committee Management States (Admin Only)
  const [newCommitteeName, setNewCommitteeName] = useState('');
  const [isCreatingCommittee, setIsCreatingCommittee] = useState(false);
  const [showArchivedCommittees, setShowArchivedCommittees] = useState(false);
  const [archiveModal, setArchiveModal] = useState<{
    isOpen: boolean;
    committee: { id: string; name: string } | null;
  }>({ isOpen: false, committee: null });
  const [archiveInputName, setArchiveInputName] = useState('');
  const [archiveDeleteText, setArchiveDeleteText] = useState('');
  const [isArchivingCommittee, setIsArchivingCommittee] = useState(false);

  const activeCommittees = useMemo(() => committees.filter(c => c.status !== 'archived'), [committees]);
  const archivedCommittees = useMemo(() => committees.filter(c => c.status === 'archived'), [committees]);

  // Passkeys list for multi-device management
  type PasskeyEntry = {
    id: string;
    device_name: string | null;
    device_type: string | null;
    transports: string[];
    created_at: string;
    last_used_at: string | null;
    backed_up: boolean;
  };
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);

  // Form states for profile
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCommittee, setEditCommittee] = useState('');
  const [editRole, setEditRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');

  // PIN states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const toggleExpandLog = (id: string) => setExpandedLogIds(prev => ({ ...prev, [id]: !prev[id] }));

  // Committee Requirements State - NONE selected by default
  const [selectedConfigCommittees, setSelectedConfigCommittees] = useState<string[]>([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [capacities, setCapacities] = useState({ T1: 0, T2: 0, T3: 0, T4: 0 });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    const activeNames = new Set(activeCommittees.map(c => c.name));
    setSelectedConfigCommittees(prev => prev.filter(name => activeNames.has(name)));
  }, [activeCommittees]);

  type PermissionMatrixRow = {
    id: string;
    name: string;
    description: string;
    icon: string;
    coordKey: string;
    coordDefault: boolean;
    volKey?: string;
    volDefault?: boolean;
  };

  const SYSTEM_PERMISSIONS_MATRIX: PermissionMatrixRow[] = [
    {
      id: "dashboard",
      name: "Ver Dashboard y estadísticas de comité",
      description: "Permite acceder al panel principal de métricas y mapa de calor de su comité",
      icon: "space_dashboard",
      coordKey: "allow_coordinator_dashboard",
      coordDefault: true,
    },
    {
      id: "volunteers",
      name: "Ver lista de voluntarios",
      description: "Permite acceder a la nómina y directorio de voluntarios de su comité",
      icon: "group",
      coordKey: "allow_coordinator_volunteers",
      coordDefault: true,
      volKey: "allow_volunteer_view_volunteers",
      volDefault: true,
    },
    {
      id: "shift_edit",
      name: "Edición de turnos de voluntarios",
      description: "Permite asignar, modificar o cancelar turnos",
      icon: "edit_calendar",
      coordKey: "allow_coordinator_shift_edit",
      coordDefault: false,
    },
    {
      id: "whatsapp",
      name: "Envío de avisos por WhatsApp",
      description: "Permite enviar avisos y recordatorios por WhatsApp a su comité",
      icon: "send_to_mobile",
      coordKey: "allow_coordinator_whatsapp",
      coordDefault: true,
    },
    {
      id: "reports",
      name: "Ver reportes y estadísticas",
      description: "Permite acceder al panel de analíticas y descargas de reportes",
      icon: "analytics",
      coordKey: "allow_coordinator_reports",
      coordDefault: true,
    },
    {
      id: "qr_checkin",
      name: "Escanear QR y registro de asistencia",
      description: "Permite usar el escáner QR para hacer Check-in / Check-out",
      icon: "qr_code_scanner",
      coordKey: "allow_coordinator_qr",
      coordDefault: true,
    },
    {
      id: "import_data",
      name: "Importación de datos masivos",
      description: "Permite cargar hojas de cálculo Excel/CSV con nuevos registros",
      icon: "cloud_upload",
      coordKey: "allow_coordinator_import",
      coordDefault: true,
    },
    {
      id: "manage_users",
      name: "Gestión de usuarios y accesos",
      description: "Permite invitar usuarios nuevos y modificar PINs",
      icon: "shield_person",
      coordKey: "allow_coordinator_users",
      coordDefault: false,
    },
  ];

  const handleCreateCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentRole !== 'Admin') return;
    if (!newCommitteeName.trim()) return;

    setIsCreatingCommittee(true);
    const res = await createCommitteeAction(newCommitteeName);
    if (res.error) {
      showToast(res.error, "error");
    } else {
      showToast(`Comité "${newCommitteeName.trim()}" creado correctamente.`);
      setNewCommitteeName('');
      await refresh(true);
      await loadData();
    }
    setIsCreatingCommittee(false);
  };

  const handleConfirmArchiveCommittee = async () => {
    if (!archiveModal.committee || currentRole !== 'Admin') return;

    setIsArchivingCommittee(true);
    const res = await archiveCommitteeAction(
      archiveModal.committee.id,
      archiveModal.committee.name,
      archiveInputName,
      archiveDeleteText
    );

    if (res.error) {
      showToast(res.error, "error");
    } else {
      showToast(`Comité "${archiveModal.committee.name}" archivado correctamente.`);
      setArchiveModal({ isOpen: false, committee: null });
      setArchiveInputName('');
      setArchiveDeleteText('');
      await refresh(true);
      await loadData();
    }
    setIsArchivingCommittee(false);
  };

  const handleUnarchiveCommittee = async (comm: { id: string; name: string }) => {
    if (currentRole !== 'Admin') return;
    const res = await unarchiveCommitteeAction(comm.id);
    if (res.error) {
      showToast(res.error, "error");
    } else {
      showToast(`Comité "${comm.name}" desarchivado correctamente.`);
      await refresh(true);
      await loadData();
    }
  };



  const [permissionsMap, setPermissionsMap] = useState<Record<string, boolean>>({});

  const loadMatrixPermissions = useCallback(() => {
    const map: Record<string, boolean> = {};
    SYSTEM_PERMISSIONS_MATRIX.forEach(row => {
      map[row.coordKey] = getSystemPermission(row.coordKey, row.coordDefault);
      if (row.volKey) {
        map[row.volKey] = getSystemPermission(row.volKey, row.volDefault);
      }
    });
    setPermissionsMap(map);

    SYSTEM_PERMISSIONS_MATRIX.forEach(row => {
      fetchSystemPermission(row.coordKey, row.coordDefault).then(val => {
        setPermissionsMap(prev => ({ ...prev, [row.coordKey]: val }));
      });
      if (row.volKey) {
        fetchSystemPermission(row.volKey, row.volDefault!).then(val => {
          setPermissionsMap(prev => ({ ...prev, [row.volKey!]: val }));
        });
      }
    });
  }, []);

  useEffect(() => {
    loadMatrixPermissions();
    const handleStorageChange = () => {
      loadMatrixPermissions();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('permissions-changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('permissions-changed', handleStorageChange);
    };
  }, [loadMatrixPermissions]);

  const handleToggleMatrixPermission = (key: string, name: string, roleLabel: string, defaultVal = true) => {
    if (currentRole !== 'Admin') {
      showToast("Solo los administradores pueden cambiar los permisos del sistema", "error");
      return;
    }
    const currentVal = permissionsMap[key] ?? defaultVal;
    const newVal = !currentVal;
    setSystemPermission(key, newVal);
    setPermissionsMap(prev => ({ ...prev, [key]: newVal }));
    showToast(newVal ? `Permiso "${name}" HABILITADO para ${roleLabel}` : `Permiso "${name}" DESHABILITADO para ${roleLabel}`);
  };

  const handleResetPermissions = () => {
    if (currentRole !== 'Admin') return;
    resetAllPermissionsToDefault();
    loadMatrixPermissions();
    showToast("Permisos restablecidos a la configuración estándar por defecto.");
  };

  const handleToggleCommittee = (name: string) => {
    if (selectedConfigCommittees.includes(name)) {
      setSelectedConfigCommittees(prev => prev.filter(c => c !== name));
    } else {
      setSelectedConfigCommittees(prev => [...prev, name]);
    }
  };

  const [isMobile, setIsMobile] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    personal: false,
    security: false,
    shiftEdit: false,
    permissions: false,
    requirements: false,
  });
  const [settingsSearch, setSettingsSearch] = useState('');
  const [isSettingsSearchFocused, setIsSettingsSearchFocused] = useState(false);

  const searchableSettings = useMemo(() => {
    const sections = [
      {
        id: 'personal',
        title: 'Información personal',
        description: 'Nombre, teléfono, rol y comité de tu cuenta',
        keywords: 'perfil cuenta datos usuario whatsapp coordinador administrador',
        icon: 'account_circle',
      },
      {
        id: 'security',
        title: 'Seguridad y acceso',
        description: 'PIN, huella, Face ID, passkeys y dispositivos',
        keywords: 'contraseña clave biometría windows hello autenticación acceso',
        icon: 'fingerprint',
      },
      {
        id: 'permissions',
        title: 'Permisos por rol',
        description: 'Accesos y capacidades de administradores, coordinadores y voluntarios',
        keywords: 'roles políticas autorización dashboard turnos reportes whatsapp importar qr usuarios',
        icon: 'admin_panel_settings',
      },
      {
        id: 'requirements',
        title: 'Requerimientos por turno',
        description: 'Capacidad mínima y cantidad de personal por horario',
        keywords: 'cupos necesidades t1 t2 t3 t4 comités sincronizar voluntarios',
        icon: 'groups',
      },
    ];

    if (currentRole === 'Admin') {
      sections.push(
        {
          id: 'committeeMgmt',
          title: 'Gestión de comités',
          description: 'Crear, archivar y restaurar comités',
          keywords: 'nuevo agregar eliminar desarchivar activos archivados parqueo',
          icon: 'groups',
        },
        {
          id: 'activity',
          title: 'Historial de actividades',
          description: 'Auditoría de operaciones y cambios del sistema',
          keywords: 'logs registros eventos ediciones seguridad configuración reasignaciones',
          icon: 'history',
        }
      );
    }

    return sections;
  }, [currentRole]);

  const settingsSearchResults = useMemo(() => {
    const query = settingsSearch.trim();
    if (!query) return searchableSettings;

    const fuse = new Fuse(searchableSettings, {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'description', weight: 0.3 },
        { name: 'keywords', weight: 0.2 },
      ],
      threshold: 0.42,
      ignoreLocation: true,
    });

    return fuse.search(query).map(result => result.item);
  }, [searchableSettings, settingsSearch]);

  const navigateToSetting = (sectionId: string) => {
    setOpenSections(prev => ({ ...prev, [sectionId]: true }));
    setSettingsSearch('');
    setIsSettingsSearchFocused(false);
    requestAnimationFrame(() => {
      document.getElementById(`settings-${sectionId}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>('Todas');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    if (currentRole !== 'Admin') return;
    setIsLoadingLogs(true);
    const logs = await getActivityLogs(500);
    setActivityLogs(logs);
    setIsLoadingLogs(false);
  }, [currentRole]);

  useEffect(() => {
    if (currentRole === 'Admin') {
      fetchLogs();
    }
  }, [currentRole, fetchLogs]);

  const filteredLogs = useMemo(() => {
    return activityLogs.filter(log => {
      const matchesAction = selectedActionFilter === 'Todas' || log.action_type === selectedActionFilter;
      const q = logSearchQuery.toLowerCase().trim();
      const matchesQuery = !q ||
        log.user_name.toLowerCase().includes(q) ||
        log.description.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q));
      return matchesAction && matchesQuery;
    });
  }, [activityLogs, selectedActionFilter, logSearchQuery]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isSectionOpen = (id: string) => {
    if (!isMobile) return true; // Always expanded on desktop
    return !!openSections[id];
  };

  // Toast State
  const [toast, setToast] = useState({ message: '', type: 'success' as 'success' | 'error', isVisible: false });
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  const loadData = async () => {
    const supabase = createClient();

    // 1. Get Committees
    const { data: comms } = await supabase.from('committees').select('*');
    if (comms) setCommittees(comms);

    // Resolve the current user from the signed server session. Never infer identity
    // from localStorage or fall back to the first profile in the database.
    const profileResult = await getCurrentSettingsProfileAction();
    if (!profileResult.success || !profileResult.user) {
      showToast(profileResult.error || "No se pudo cargar el perfil actual", "error");
      setLoading(false);
      return;
    }

    const role = profileResult.role as 'Admin' | 'Editor' | 'Lector';
    const user: any = profileResult.user;
    setCurrentRole(role);

    if (user) {
      const fullName = role === 'Lector'
        ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
        : (user.full_name || `${user.first_name || ''} ${user.last_name || ''}`).trim();

      setUserProfile(user);
      setEditName(fullName || 'Coordinador');
      setEditPhone(user.phone || '');
      setEditRole(role);
      const userComm = user.committees?.name || '';
      setEditCommittee(userComm);
      if (user.phone) localStorage.setItem('volunteer_phone', user.phone);

      // Initial committee for config
      if (role === 'Editor') {
        setSelectedConfigCommittees([userComm]);
      } else if (role === 'Admin') {
        setSelectedConfigCommittees([]); // Default: none selected
      }

      // Check and load passkeys list
      await loadPasskeys(user.id, supabase);
    }
    setLoading(false);
  };

  // Load passkeys for the current user via the API
  const loadPasskeys = async (userId?: string, supabaseClient?: any) => {
    try {
      const resp = await fetch('/api/webauthn/list');
      if (!resp.ok) return;
      const data = await resp.json();
      const list = data.passkeys || [];
      setPasskeys(list);
      setHasPasskey(list.length > 0);
    } catch (e) {
      // silently fail — not critical
    }
  };

  // Helper to load stored capacities for the primary selected committee
  const loadStoredCapacities = (primary: string): { T1: number; T2: number; T3: number; T4: number } | null => {
    try {
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        const allReqs = JSON.parse(stored);
        if (allReqs && allReqs[primary]) return allReqs[primary];
      }
    } catch (e) {
      console.error("Error loading committee requirements:", e);
    }
    return null;
  };

  // Handle sync toggle: ON resets to 0, OFF restores stored per-committee values
  const handleToggleSync = () => {
    const enabling = !isSyncEnabled;
    setIsSyncEnabled(enabling);
    if (enabling) {
      // Sync mode ON: start from 0
      setCapacities({ T1: 0, T2: 0, T3: 0, T4: 0 });
    } else {
      // Sync mode OFF: restore last saved values for selected committee
      if (selectedConfigCommittees.length > 0) {
        const stored = loadStoredCapacities(selectedConfigCommittees[0]);
        setCapacities(stored ?? { T1: 4, T2: 4, T3: 4, T4: 4 });
      }
    }
  };

  useEffect(() => {
    if (isSyncEnabled) {
      setCapacities({ T1: 0, T2: 0, T3: 0, T4: 0 });
      return;
    }
    if (selectedConfigCommittees.length === 1) {
      // Exactly one committee — load its stored values
      const stored = loadStoredCapacities(selectedConfigCommittees[0]);
      setCapacities(stored ?? { T1: 4, T2: 4, T3: 4, T4: 4 });
    } else {
      // 0 or 2+ committees — show neutral zeros
      setCapacities({ T1: 0, T2: 0, T3: 0, T4: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigCommittees.join(','), isSyncEnabled]);

  const handleSaveRequirements = async () => {
    if (selectedConfigCommittees.length === 0) {
      showToast("Selecciona al menos un comité primero para guardar los requerimientos", "error");
      return;
    }
    setIsSavingConfig(true);

    // 1. Persist to localStorage (client-side fallback)
    const stored = localStorage.getItem("committee_requirements");
    let allReqs: any = {};
    if (stored) {
      try { allReqs = JSON.parse(stored); } catch (e) { }
    }
    selectedConfigCommittees.forEach(comm => {
      allReqs[comm] = capacities;
    });
    localStorage.setItem("committee_requirements", JSON.stringify(allReqs));

    // 2. Persist to Supabase via Server Action and CommitteeMutationService
    const res = await updateCommitteeRequirementsAction(selectedConfigCommittees, capacities);
    if (!res.success) {
      console.warn('updateCommitteeRequirementsAction warning:', res.error);
    }

    setIsSavingConfig(false);
    showToast("Requerimientos guardados correctamente");
  };

  const updateCapacity = (id: 'T1' | 'T2' | 'T3' | 'T4', delta: number) => {
    if (selectedConfigCommittees.length === 0) {
      showToast("Selecciona al menos un comité primero para modificar los requerimientos", "error");
      return;
    }
    setCapacities(prev => {
      const newVal = Math.max(0, (prev as any)[id] + delta);
      if (isSyncEnabled) {
        return { T1: newVal, T2: newVal, T3: newVal, T4: newVal };
      }
      return { ...prev, [id]: newVal };
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegisterPasskey = async () => {
    if (!userProfile) return;
    setIsRegisteringPasskey(true);

    try {
      const resp = await fetch('/api/webauthn/register/generate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userProfile.id,
          userType: currentRole === 'Lector' ? 'volunteer' : 'profile',
          phone: editPhone
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Error al generar opciones de registro');
      }

      const options = await resp.json();
      const asseResp = await startRegistration(options);

      const verifyResp = await fetch('/api/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asseResp)
      });

      const verifyData = await verifyResp.json();

      if (verifyData.verified) {
        await loadPasskeys();
        showToast(`Dispositivo "${verifyData.deviceName || 'nuevo'}" registrado correctamente`);
      } else {
        throw new Error("No se pudo verificar el dispositivo");
      }
    } catch (err: any) {
      if (err.name === 'InvalidStateError') {
        showToast("Este dispositivo ya está registrado.", "error");
      } else if (err.name === 'NotAllowedError') {
        // User cancelled — silent
      } else {
        showToast(err.message || "Registro cancelado o dispositivo no compatible.", "error");
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    setIsRegisteringPasskey(true);
    try {
      const resp = await fetch('/api/webauthn/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkeyId })
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Error al desvincular');
      }
      await loadPasskeys();
      if (passkeys.length <= 1) {
        localStorage.setItem("preferred_auth_method", "pin");
      }
      showToast("Dispositivo desvinculado correctamente");
    } catch (err: any) {
      showToast(err.message || "Error al desvincular dispositivo", "error");
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPin(true);

    if (currentPin.length !== 4) {
      showToast("El PIN actual debe tener exactamente 4 dígitos", "error");
      setIsChangingPin(false);
      return;
    }

    if (newPin.length !== 4) {
      showToast("El nuevo PIN debe tener exactamente 4 dígitos", "error");
      setIsChangingPin(false);
      return;
    }

    const res = await changeUserPin(currentPin, newPin, editPhone);
    if (res.success) {
      showToast("PIN actualizado correctamente");
      setCurrentPin('');
      setNewPin('');
    } else {
      showToast(res.error || "Error al actualizar el PIN", "error");
    }
    setIsChangingPin(false);
  };

  // Permissions Data
  const ALL_PERMISSIONS = ['Ver voluntarios', 'Editar turnos', 'Enviar mensajes', 'Ver reportes', 'Importar datos', 'Configurar ajustes'];
  const ROLE_PERMISSIONS: Record<string, string[]> = useMemo(() => {
    const coordShiftOn = permissionsMap["allow_coordinator_shift_edit"] ?? false;
    return {
      'Admin': ALL_PERMISSIONS,
      'Editor': coordShiftOn
        ? ['Ver voluntarios', 'Editar turnos', 'Enviar mensajes', 'Ver reportes']
        : ['Ver voluntarios', 'Enviar mensajes', 'Ver reportes'],
      'Lector': ['Ver voluntarios']
    };
  }, [permissionsMap]);

  if (loading) return null;

  return (
    <div className="w-full mx-auto pb-32 md:pb-12 flex flex-col min-h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)]">
      {/* Sticky Header matching users design */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0 border-b border-border/40">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Ajustes
          </h1>
        </div>
        <form
          className="relative flex w-full min-w-0 items-center"
          onSubmit={(event) => {
            event.preventDefault();
            if (settingsSearchResults[0]) navigateToSetting(settingsSearchResults[0].id);
          }}
          onFocus={() => setIsSettingsSearchFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsSettingsSearchFocused(false);
            }
          }}
        >
          <div className="pointer-events-none absolute inset-y-0 left-4 z-10 flex items-center">
            <span className="material-symbols-outlined text-[20px] text-black/40 dark:text-white/70">search</span>
          </div>
          <input
            type="text"
            value={settingsSearch}
            onChange={(event) => setSettingsSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSettingsSearch('');
                setIsSettingsSearchFocused(false);
                event.currentTarget.blur();
              }
            }}
            placeholder="Buscar ajustes: PIN, permisos, comités..."
            aria-label="Buscar en ajustes"
            aria-expanded={isSettingsSearchFocused}
            aria-controls="settings-search-results"
            autoComplete="off"
            className="h-[48px] w-full rounded-full border border-black/10 bg-black/5 py-3.5 pl-12 pr-32 text-[13px] font-bold font-inter text-black outline-none transition-all placeholder:text-black/50 focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-[#fff6] dark:text-white dark:placeholder:text-white/70 dark:focus:ring-white/30"
          />
          <div className="absolute inset-y-0 right-1.5 z-10 flex items-center">
            {settingsSearch ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setSettingsSearch('')}
                className="flex h-9 cursor-pointer items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/20 px-3.5 text-xs font-bold font-inter text-rose-400 transition-all hover:bg-rose-500/30 active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
                <span>Limpiar</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled
                className="flex h-9 items-center gap-1 rounded-full bg-[#4d7cfe] px-4 text-xs font-bold font-inter text-white opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]">search</span>
                <span>Buscar</span>
              </button>
            )}
          </div>

          {isSettingsSearchFocused && settingsSearch.trim() && (
            <div
              id="settings-search-results"
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-border bg-dark2 shadow-lg"
            >
              {settingsSearchResults.length > 0 ? (
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {settingsSearchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => navigateToSetting(result.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-dark3 focus-visible:bg-dark3 focus-visible:outline-none"
                    >
                      <span className="material-symbols-outlined text-[19px] text-[#4d7cfe]">{result.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-text">{result.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-inter text-text-dim">{result.description}</span>
                      </span>
                      <span className="material-symbols-outlined text-[17px] text-text-dim">arrow_downward</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-4 text-xs text-text-dim">
                  <span className="material-symbols-outlined text-[18px]">search_off</span>
                  No encontramos un ajuste relacionado.
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full pb-20 px-0 sm:px-6 lg:px-8 pt-2"
      >
        {/* Full-width edge-to-edge settings container separated only by single border lines */}
        <motion.div variants={itemVariants} className="w-full bg-dark2 border-y sm:border border-border rounded-none sm:rounded-2xl overflow-hidden divide-y divide-border shadow-lg">

          {/* 1. Información Personal */}
          <div id="settings-personal" className="w-full scroll-mt-44 transition-all">
            <button
              type="button"
              onClick={() => isMobile && toggleSection('personal')}
              className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors ${isMobile ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
                } ${isSectionOpen('personal') ? 'bg-black/[0.03] dark:bg-white/[0.02]' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">account_circle</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Información personal</h3>
                  <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">Datos registrados de tu cuenta</p>
                </div>
              </div>

              {isMobile && (
                <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-dim shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {isSectionOpen('personal') ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              )}
            </button>

            {isSectionOpen('personal') && (
              <div className="p-4 sm:p-6 space-y-5 border-t border-border bg-black/[0.02] dark:bg-black/20">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text">Nombre completo</label>
                      <input
                        readOnly
                        value={editName}
                        aria-readonly="true"
                        className="w-full h-10 px-3 rounded-xl border border-border bg-dark text-xs font-inter font-bold text-text-dim outline-none cursor-default"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text">Teléfono WhatsApp</label>
                      <input
                        readOnly
                        value={editPhone}
                        aria-readonly="true"
                        className="w-full h-10 px-3 rounded-xl border border-border bg-dark text-xs font-inter font-bold text-text-dim outline-none cursor-default"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-text">Rol en la plataforma</label>
                      <div className="w-full h-10 px-3.5 rounded-xl border border-border bg-dark3 flex items-center justify-between text-xs font-inter font-bold">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-[#4d7cfe]">
                            {editRole === 'Admin' ? 'admin_panel_settings' : editRole === 'Editor' ? 'manage_accounts' : 'visibility'}
                          </span>
                          <span className="text-text">
                            {editRole === 'Admin' ? 'Administrador (Acceso total)' : editRole === 'Editor' ? `Coordinador de Comité (${editCommittee || 'Sin comité'})` : 'Voluntario (Lectura)'}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-dim font-medium uppercase tracking-wider">Asignado por Administrador</span>
                      </div>
                      <p className="text-[10px] text-text-dim">
                        Para cambiar roles o permisos de los usuarios de la plataforma, dirígete a <a href="/users" className="text-[#4d7cfe] font-bold hover:underline">Gestión de Usuarios</a>.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* 2. Huellas Digitales (Biometría / Face ID) */}
          <div id="settings-security" className="w-full scroll-mt-44 transition-all">
            <button
              type="button"
              onClick={() => isMobile && toggleSection('security')}
              className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors ${isMobile ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
                } ${isSectionOpen('security') ? 'bg-black/[0.03] dark:bg-white/[0.02]' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">fingerprint</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Seguridad y Acceso</h3>
                  <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">Cambio de PIN y autenticación biométrica</p>
                </div>
              </div>

              {isMobile && (
                <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-dim shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {isSectionOpen('security') ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              )}
            </button>

            {isSectionOpen('security') && (
              <div className="p-4 sm:p-6 border-t border-border bg-black/[0.02] dark:bg-black/20 space-y-6">

                {/* Passkeys / Biometrics Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs font-bold text-text">Dispositivos de acceso biométrico</p>
                      <p className="text-[10px] font-inter text-text-dim mt-0.5">
                        Huella, Face ID, Windows Hello — cada dispositivo se registra por separado
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleRegisterPasskey}
                      disabled={isRegisteringPasskey}
                      className="font-bold px-4 h-8 transition-all active:scale-[0.97] rounded-full text-[11px] shrink-0 bg-dark3 hover:bg-dark text-text border border-border flex items-center gap-1.5 ml-3"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>
                      {isRegisteringPasskey ? 'Registrando...' : 'Añadir'}
                    </Button>
                  </div>

                  {/* Passkeys list */}
                  {passkeys.length === 0 ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border text-text-dim">
                      <span className="material-symbols-outlined text-[20px]">fingerprint</span>
                      <p className="text-xs font-inter">Ningún dispositivo biométrico registrado aún.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                      {passkeys.map((pk) => {
                        const transports: string[] = pk.transports || [];
                        const isInternal = transports.includes('internal');
                        const isSynced = pk.backed_up;
                        const icon = isInternal ? 'fingerprint' : transports.includes('usb') ? 'usb' : 'key';
                        const deviceLabel = pk.device_name || (isInternal ? 'Biometría del dispositivo' : 'Llave de seguridad');
                        const addedDate = new Date(pk.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                        const lastUsed = pk.last_used_at
                          ? new Date(pk.last_used_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                          : null;

                        return (
                          <div key={pk.id} className="flex items-center gap-3 px-4 py-3 bg-dark2 hover:bg-dark3 transition-colors">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[17px]">{icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-text truncate">{deviceLabel}</p>
                              <p className="text-[10px] font-inter text-text-dim mt-0.5">
                                Agregado {addedDate}
                                {lastUsed && <span> · Último uso {lastUsed}</span>}
                                {isSynced && <span> · <span className="text-[#4d7cfe]">Sincronizado</span></span>}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeletePasskey(pk.id)}
                              disabled={isRegisteringPasskey}
                              className="w-7 h-7 rounded-full hover:bg-rose-500/10 text-text-dim hover:text-rose-500 flex items-center justify-center transition-colors shrink-0"
                              title="Desvincular este dispositivo"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Change PIN Section */}
                <div className="pt-2 border-t border-border">
                  <h4 className="font-bold text-text text-xs mb-4">Cambiar PIN de Acceso</h4>
                  <form onSubmit={handleChangePin} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text">PIN Actual</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={currentPin}
                          onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full h-10 px-3 rounded-xl border border-border bg-dark3 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-xs font-inter font-bold outline-none transition-all"
                          placeholder="••••"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text">Nuevo PIN</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={newPin}
                          onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full h-10 px-3 rounded-xl border border-border bg-dark3 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-xs font-inter font-bold outline-none transition-all"
                          placeholder="••••"
                          required
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={isChangingPin || !currentPin || !newPin} className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold px-6 h-9 shadow-lg shadow-blue-500/10 active:scale-[0.97] transition-all rounded-full text-xs">
                        {isChangingPin ? 'Cambiando...' : 'Cambiar PIN'}
                      </Button>
                    </div>
                  </form>
                </div>

              </div>
            )}
          </div>

          {/* 3. Permisos Por Rol */}
          <div id="settings-permissions" className="w-full scroll-mt-44 transition-all">
            <button
              type="button"
              onClick={() => isMobile && toggleSection('permissions')}
              className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors ${isMobile ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
                } ${isSectionOpen('permissions') ? 'bg-black/[0.03] dark:bg-white/[0.02]' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Permisos Por Rol</h3>
                  <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">Matriz de capacidades y políticas globales de acceso</p>
                </div>
              </div>

              {isMobile && (
                <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-dim shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {isSectionOpen('permissions') ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              )}
            </button>

            {isSectionOpen('permissions') && (
              <div className="p-4 sm:p-5 space-y-4 border-t border-border bg-black/[0.02] dark:bg-black/20">

                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                    <p className="text-[10px] text-text-dim">
                      Haz clic en los interruptores para activar o desactivar permisos globales por rol.
                    </p>
                    {currentRole === 'Admin' ? (
                      <Button
                        type="button"
                        onClick={handleResetPermissions}
                        variant="outline"
                        className="h-7 px-3 text-[10px] font-bold text-text-dim hover:text-text border-border bg-dark2 rounded-full flex items-center gap-1 transition-all active:scale-95 shrink-0 self-start sm:self-auto"
                        title="Restablecer todos los permisos a la configuración estándar por defecto"
                      >
                        <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                        <span>Restablecer por Defecto</span>
                      </Button>
                    ) : null}
                  </div>

                  {/* Mobile Card View (block sm:hidden) */}
                  <div className="block sm:hidden space-y-2.5">
                    {SYSTEM_PERMISSIONS_MATRIX.map((row) => {
                      const coordOn = permissionsMap[row.coordKey] ?? row.coordDefault;
                      const volOn = row.volKey ? (permissionsMap[row.volKey] ?? row.volDefault) : false;

                      return (
                        <div key={row.id} className="p-3.5 rounded-xl border border-border bg-dark3 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-[#4d7cfe]/10 text-[#4d7cfe] border border-[#4d7cfe]/20 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="material-symbols-outlined text-[16px]">{row.icon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-text text-xs leading-tight">{row.name}</p>
                              <p className="text-[10px] text-text-dim font-normal mt-0.5">{row.description}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-border/50 text-center">
                            {/* Admin */}
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider">Admin</span>
                              <div
                                className="w-9 h-5 rounded-full p-[2px] bg-emerald-500 flex items-center shrink-0 opacity-80 cursor-not-allowed"
                                title="Administradores tienen acceso total por defecto"
                              >
                                <span className="w-4 h-4 rounded-full bg-white shadow-sm block shrink-0 translate-x-4" />
                              </div>
                            </div>

                            {/* Coordinador */}
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider">Coordinador</span>
                              <button
                                type="button"
                                disabled={currentRole !== 'Admin'}
                                onClick={() => handleToggleMatrixPermission(row.coordKey, row.name, "Coordinadores", row.coordDefault)}
                                className={`w-9 h-5 rounded-full p-[2px] transition-colors flex items-center shrink-0 ${coordOn ? 'bg-emerald-500' : 'bg-orange-500'
                                  } ${currentRole !== 'Admin' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                                title={coordOn ? "Permiso Habilitado" : "Permiso Deshabilitado"}
                              >
                                <motion.span
                                  initial={false}
                                  animate={{ x: coordOn ? 16 : 0 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                  className="w-4 h-4 rounded-full bg-white shadow-sm block shrink-0"
                                />
                              </button>
                            </div>

                            {/* Voluntario */}
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider">Voluntario</span>
                              {row.volKey ? (
                                <button
                                  type="button"
                                  disabled={currentRole !== 'Admin'}
                                  onClick={() => handleToggleMatrixPermission(row.volKey!, row.name, "Voluntarios", row.volDefault!)}
                                  className={`w-9 h-5 rounded-full p-[2px] transition-colors flex items-center shrink-0 ${volOn ? 'bg-emerald-500' : 'bg-orange-500'
                                    } ${currentRole !== 'Admin' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                                  title={volOn ? "Permiso Habilitado" : "Permiso Deshabilitado"}
                                >
                                  <motion.span
                                    initial={false}
                                    animate={{ x: volOn ? 16 : 0 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    className="w-4 h-4 rounded-full bg-white shadow-sm block shrink-0"
                                  />
                                </button>
                              ) : (
                                <div
                                  className="w-9 h-5 rounded-full p-[2px] bg-orange-500/30 border border-orange-500/20 flex items-center shrink-0 opacity-50 cursor-not-allowed"
                                  title="No disponible para Voluntarios"
                                >
                                  <span className="w-4 h-4 rounded-full bg-white/70 shadow-sm block shrink-0 translate-x-0" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table View (hidden sm:block) */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-dark3">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-dark2 text-[10px] font-bold text-text-dim uppercase tracking-wider">
                          <th className="py-3 px-4 min-w-[200px]">Módulo / Función</th>
                          <th className="py-3 px-3 text-center w-28">Admin</th>
                          <th className="py-3 px-3 text-center w-32">Coordinador</th>
                          <th className="py-3 px-3 text-center w-32">Voluntario</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-[11px] font-medium text-text">
                        {SYSTEM_PERMISSIONS_MATRIX.map((row) => {
                          const coordOn = permissionsMap[row.coordKey] ?? row.coordDefault;
                          const volOn = row.volKey ? (permissionsMap[row.volKey] ?? row.volDefault) : false;

                          return (
                            <tr key={row.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-start gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-[#4d7cfe]/10 text-[#4d7cfe] border border-[#4d7cfe]/20 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-[16px]">{row.icon}</span>
                                  </div>
                                  <div>
                                    <p className="font-bold text-text text-xs">{row.name}</p>
                                    <p className="text-[10px] text-text-dim font-normal">{row.description}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Admin Column */}
                              <td className="py-3 px-3 text-center">
                                <div className="flex items-center justify-center">
                                  <div
                                    className="w-9 h-5 rounded-full p-[2px] bg-emerald-500 flex items-center shrink-0 opacity-80 cursor-not-allowed"
                                    title="Administradores tienen acceso total por defecto"
                                  >
                                    <span className="w-4 h-4 rounded-full bg-white shadow-sm block shrink-0 translate-x-4" />
                                  </div>
                                </div>
                              </td>

                              {/* Coordinator Column */}
                              <td className="py-3 px-3 text-center">
                                <div className="flex items-center justify-center">
                                  <button
                                    type="button"
                                    disabled={currentRole !== 'Admin'}
                                    onClick={() => handleToggleMatrixPermission(row.coordKey, row.name, "Coordinadores", row.coordDefault)}
                                    className={`w-9 h-5 rounded-full p-[2px] transition-colors flex items-center shrink-0 ${coordOn ? 'bg-emerald-500' : 'bg-orange-500'
                                      } ${currentRole !== 'Admin' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                                    title={coordOn ? "Permiso Habilitado" : "Permiso Deshabilitado"}
                                  >
                                    <motion.span
                                      initial={false}
                                      animate={{ x: coordOn ? 16 : 0 }}
                                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                      className="w-4 h-4 rounded-full bg-white shadow-sm block shrink-0"
                                    />
                                  </button>
                                </div>
                              </td>

                              {/* Volunteer Column */}
                              <td className="py-3 px-3 text-center">
                                <div className="flex items-center justify-center">
                                  {row.volKey ? (
                                    <button
                                      type="button"
                                      disabled={currentRole !== 'Admin'}
                                      onClick={() => handleToggleMatrixPermission(row.volKey!, row.name, "Voluntarios", row.volDefault!)}
                                      className={`w-9 h-5 rounded-full p-[2px] transition-colors flex items-center shrink-0 ${volOn ? 'bg-emerald-500' : 'bg-orange-500'
                                        } ${currentRole !== 'Admin' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                                      title={volOn ? "Permiso Habilitado" : "Permiso Deshabilitado"}
                                    >
                                      <motion.span
                                        initial={false}
                                        animate={{ x: volOn ? 16 : 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        className="w-4 h-4 rounded-full bg-white shadow-sm block shrink-0"
                                      />
                                    </button>
                                  ) : (
                                    <div
                                      className="w-9 h-5 rounded-full p-[2px] bg-orange-500/30 border border-orange-500/20 flex items-center shrink-0 opacity-50 cursor-not-allowed"
                                      title="No disponible para Voluntarios"
                                    >
                                      <span className="w-4 h-4 rounded-full bg-white/70 shadow-sm block shrink-0 translate-x-0" />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* 4. Requerimientos por Turno (Role-based) */}
          {(currentRole === 'Admin' || currentRole === 'Editor') && (
            <div id="settings-requirements" className="w-full scroll-mt-44 transition-all">
              <button
                type="button"
                onClick={() => isMobile && toggleSection('requirements')}
                className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors ${isMobile ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
                  } ${isSectionOpen('requirements') ? 'bg-black/[0.03] dark:bg-white/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">groups</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Requerimientos por turno</h3>
                    <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">Capacidad mínima de personal por horario</p>
                  </div>
                </div>

                {isMobile && (
                  <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-dim shrink-0">
                    <span className="material-symbols-outlined text-[18px]">
                      {isSectionOpen('requirements') ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                )}
              </button>

              {isSectionOpen('requirements') && (
                <div className="p-4 sm:p-6 space-y-5 border-t border-border bg-black/[0.02] dark:bg-black/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs font-inter text-text-dim">
                      Ajusta la cantidad mínima de voluntarios requeridos por turno.
                    </p>

                    {/* Sync Button */}
                    <button
                      onClick={handleToggleSync}
                      title={isSyncEnabled ? "Sincronización activada" : "Sincronización desactivada"}
                      className={`flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-bold transition-all shrink-0 self-start sm:self-auto ${isSyncEnabled
                          ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-blue-500/20'
                          : 'bg-dark3 border-border text-text-dim hover:bg-dark hover:text-text'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">link</span>
                      <span className="text-[11px]">{isSyncEnabled ? 'Sincronizado' : 'Sincronizar'}</span>
                    </button>
                  </div>

                  {/* Multi-select Committee Chips Bar (Max 2 Rows) */}
                  {currentRole === 'Admin' && activeCommittees.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">
                          Comités Seleccionados ({selectedConfigCommittees.length}):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedConfigCommittees.length === activeCommittees.length) {
                              setSelectedConfigCommittees([]);
                            } else {
                              setSelectedConfigCommittees(activeCommittees.map(c => c.name));
                            }
                          }}
                          className="text-[11px] font-bold text-[#4d7cfe] hover:underline"
                        >
                          {selectedConfigCommittees.length === activeCommittees.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                        </button>
                      </div>

                      {/* Dynamic grid to guarantee MAX 2 ROWS */}
                      <div
                        className="grid gap-2 pt-0.5 w-full"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(2, Math.ceil(activeCommittees.length / 2))}, minmax(0, 1fr))`
                        }}
                      >
                        {activeCommittees.map((comm) => {
                          const isSelected = selectedConfigCommittees.includes(comm.name);
                          const style = getCommitteeStyle(comm.name, isSelected);
                          return (
                            <button
                              key={comm.id}
                              type="button"
                              onClick={() => handleToggleCommittee(comm.name)}
                              className={`w-full h-9 flex items-center justify-center text-center px-2 rounded-full text-xs font-bold transition-all border truncate ${style}`}
                            >
                              <span className="truncate">{comm.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <Badge className="bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/30 font-inter font-bold text-xs uppercase tracking-wider px-3 py-1 rounded-lg">
                        Comité: {selectedConfigCommittees[0] || 'Ninguno seleccionado'}
                      </Badge>
                    </div>
                  )}

                  {/* Warning banner when no committee is selected */}
                  {selectedConfigCommittees.length === 0 && currentRole === 'Admin' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-500 dark:text-amber-400 font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-[15px]">info</span>
                      Selecciona al menos un comité arriba para ver y modificar sus requerimientos por turno.
                    </div>
                  )}

                  {/* Shift List: ERD Database Schema Relation Lines (0 Pixel Resize) */}
                  <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-dark3/40 relative">
                    {([
                      { id: 'T1', label: 'Turno 1', time: '8:00 AM - 12:00 PM' },
                      { id: 'T2', label: 'Turno 2', time: '11:00 AM - 3:00 PM' },
                      { id: 'T3', label: 'Turno 3', time: '2:00 PM - 6:00 PM' },
                      { id: 'T4', label: 'Turno 4', time: '5:00 PM - 10:00 PM' }
                    ] as const).map(({ id, label, time }) => (
                      <div key={id} className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors relative min-h-[57px]">
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <span className="text-xs font-extrabold text-text">{label}</span>
                          <span className="text-[10px] font-inter font-medium text-text-dim uppercase">{time}</span>
                        </div>

                        {!isSyncEnabled && (
                          /* Independent counter control */
                          <div className="flex items-center gap-3 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCapacity(id, -1)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark3 border border-border text-text hover:bg-dark transition-all active:scale-90 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[16px] font-bold">remove</span>
                            </button>
                            <span className="text-base sm:text-lg font-extrabold text-text tabular-nums min-w-[24px] text-center font-inter">
                              {(capacities as any)[id]}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCapacity(id, 1)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark3 border border-border text-text hover:bg-dark transition-all active:scale-90 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[16px] font-bold">add</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* ERD Database Relationship Lines & Single Synchronized Counter Overlay */}
                    {isSyncEnabled && (
                      <>
                        <svg
                          className="absolute left-[130px] sm:left-[145px] right-[130px] sm:right-[145px] top-0 bottom-0 w-auto h-full pointer-events-none z-0 text-text-dim/40"
                          viewBox="0 0 100 228"
                          preserveAspectRatio="none"
                        >
                          {/* ERD Relationship Bezier curves from each row to center target */}
                          <path d="M 0 28 C 50 28, 50 114, 96 114" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                          <path d="M 0 85 C 50 85, 50 114, 96 114" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                          <path d="M 0 142 C 50 142, 50 114, 96 114" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                          <path d="M 0 200 C 50 200, 50 114, 96 114" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />

                          {/* Row Entity Connection Dots */}
                          <circle cx="2" cy="28" r="2.5" fill="currentColor" />
                          <circle cx="2" cy="85" r="2.5" fill="currentColor" />
                          <circle cx="2" cy="142" r="2.5" fill="currentColor" />
                          <circle cx="2" cy="200" r="2.5" fill="currentColor" />

                          {/* Target Relation Node */}
                          <circle cx="96" cy="114" r="3.5" className="fill-dark2" stroke="currentColor" strokeWidth="1.5" />
                        </svg>

                        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-3 shrink-0 z-10">
                          <button
                            type="button"
                            onClick={() => updateCapacity('T1', -1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark3 border border-border text-text hover:bg-dark transition-all active:scale-90 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px] font-bold">remove</span>
                          </button>
                          <span className="text-base sm:text-lg font-extrabold text-text tabular-nums min-w-[24px] text-center font-inter">
                            {capacities.T1}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCapacity('T1', 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark3 border border-border text-text hover:bg-dark transition-all active:scale-90 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px] font-bold">add</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-[10px] sm:text-xs text-text-dim max-w-md font-inter">
                      Determina los umbrales de alerta (Déficit / Crítico) en los tableros globales.
                    </p>
                    <div className="flex justify-end w-full sm:w-auto">
                      <Button
                        onClick={handleSaveRequirements}
                        disabled={isSavingConfig}
                        className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold px-6 h-9 shadow-lg active:scale-[0.97] transition-all rounded-full text-xs"
                      >
                        {isSavingConfig ? 'Guardando...' : 'Guardar Requerimientos'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. Gestión de Comités (Admin Only) */}
          {currentRole === 'Admin' && (
            <div id="settings-committeeMgmt" className="w-full scroll-mt-44 transition-all">
              <button
                type="button"
                onClick={() => isMobile && toggleSection('committeeMgmt')}
                className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors ${isMobile ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
                  } ${isSectionOpen('committeeMgmt') ? 'bg-black/[0.03] dark:bg-white/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">groups</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Gestión de Comités</h3>
                    <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">
                      Crear nuevos comités y administrar comités existentes
                    </p>
                  </div>
                </div>

                {isMobile && (
                  <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-dim shrink-0">
                    <span className="material-symbols-outlined text-[18px]">
                      {isSectionOpen('committeeMgmt') ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                )}
              </button>

              {isSectionOpen('committeeMgmt') && (
                <div className="p-4 sm:p-6 space-y-6 border-t border-border bg-black/[0.02] dark:bg-black/20">
                  {/* Formulario para crear nuevo comité */}
                  <form onSubmit={handleCreateCommittee} className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex-1 w-full min-w-0">
                      <Input
                        type="text"
                        placeholder="Nombre del nuevo comité (ej. Alimentos, Logística)..."
                        value={newCommitteeName}
                        onChange={(e) => setNewCommitteeName(e.target.value)}
                        className="w-full h-11 sm:h-10 min-h-[44px] px-4 py-2.5 rounded-xl border border-border bg-dark3 text-text placeholder:text-text-dim text-sm sm:text-xs font-inter font-bold outline-none focus:ring-1 focus:ring-[#4d7cfe] focus:border-[#4d7cfe] transition-all"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isCreatingCommittee || !newCommitteeName.trim()}
                      className="w-full sm:w-auto h-10 px-6 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold rounded-full text-xs flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-blue-500/10 active:scale-[0.97] transition-all disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      <span>{isCreatingCommittee ? 'Creando...' : 'Agregar Comité'}</span>
                    </Button>
                  </form>

                  {/* Lista de comités activos / archivados */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-text-dim font-inter">Comités registrados</span>

                      <div className="flex bg-dark3 rounded-full p-1 border border-border shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowArchivedCommittees(false)}
                          className={cn(
                            "px-3 py-1 rounded-full text-[11px] transition-all flex items-center gap-1 font-inter font-bold cursor-pointer",
                            !showArchivedCommittees
                              ? "bg-dark2 text-text shadow-sm font-extrabold"
                              : "text-text-dim hover:text-text"
                          )}
                        >
                          Activos ({activeCommittees.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowArchivedCommittees(true)}
                          className={cn(
                            "px-3 py-1 rounded-full text-[11px] transition-all flex items-center gap-1 font-inter font-bold cursor-pointer",
                            showArchivedCommittees
                              ? "bg-dark2 text-text shadow-sm font-extrabold"
                              : "text-text-dim hover:text-text"
                          )}
                        >
                          Archivados ({archivedCommittees.length})
                        </button>
                      </div>
                    </div>

                    {!showArchivedCommittees ? (
                      /* Activos */
                      activeCommittees.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-0.5 w-full">
                          {activeCommittees.map((comm: any) => (
                            <div
                              key={comm.id}
                              className="w-full min-h-[38px] h-auto flex items-center justify-between pl-3.5 pr-2 py-1.5 rounded-full text-xs font-bold transition-all border border-border bg-dark3/90 hover:bg-dark3 text-text shadow-sm"
                            >
                              <span className="font-inter pr-2 break-words leading-tight">{comm.name}</span>
                              <button
                                type="button"
                                title={`Archivar ${comm.name}`}
                                onClick={() => {
                                  setArchiveModal({ isOpen: true, committee: comm });
                                  setArchiveInputName('');
                                  setArchiveDeleteText('');
                                }}
                                className="p-1 text-text-dim hover:text-rose-400 flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-90 my-auto"
                              >
                                <span className="material-symbols-outlined text-[15px]">archive</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-dim py-3 text-center">No hay comités activos registrados.</p>
                      )
                    ) : (
                      /* Archivados */
                      archivedCommittees.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-0.5 w-full">
                          {archivedCommittees.map((comm: any) => (
                            <div
                              key={comm.id}
                              className="w-full min-h-[38px] h-auto flex items-center justify-between pl-3.5 pr-2 py-1.5 rounded-full text-xs font-bold transition-all border border-border/60 bg-dark3/40 text-text-dim opacity-75"
                            >
                              <span className="font-inter pr-2 break-words leading-tight">{comm.name}</span>
                              <button
                                type="button"
                                title={`Desarchivar ${comm.name}`}
                                onClick={() => handleUnarchiveCommittee(comm)}
                                className="p-1 text-text-dim hover:text-emerald-400 flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-90 my-auto"
                              >
                                <span className="material-symbols-outlined text-[15px]">unarchive</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-dim py-3 text-center">No hay comités archivados.</p>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Historial de Actividades (Solo Admins) */}
          {currentRole === 'Admin' && (
            <div id="settings-activity" className="w-full scroll-mt-44 transition-all border-t border-border mt-2 pt-2">
              <div
                onClick={() => isMobile && toggleSection('activity')}
                className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors ${isMobile ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
                  } ${isSectionOpen('activity') ? 'bg-black/[0.03] dark:bg-white/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">history</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Historial de Actividades</h3>
                      <Badge className="bg-[#4d7cfe]/20 text-[#4d7cfe] border-[#4d7cfe]/30 text-[9px] font-extrabold px-1.5 py-0 h-4">
                        Solo Admins
                      </Badge>
                    </div>
                    <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">
                      Registro de operaciones, cambios de datos, reasignaciones y permisos
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchLogs();
                    }}
                    title="Actualizar registro"
                    className="p-1.5 rounded-full hover:bg-white/10 text-text-dim hover:text-text transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <span className={cn("material-symbols-outlined text-[17px]", isLoadingLogs && "animate-spin")}>
                      refresh
                    </span>
                  </button>
                  {isMobile && (
                    <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-dim shrink-0">
                      <span className="material-symbols-outlined text-[18px]">
                        {isSectionOpen('activity') ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {isSectionOpen('activity') && (
                <div className="p-4 sm:p-6 border-t border-border bg-black/[0.02] dark:bg-black/20 space-y-4">
                  {/* Controles de Filtro y Búsqueda */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                      {['Todas', 'Creación', 'Edición', 'Reasignación', 'Deshacer', 'Seguridad', 'Configuración', 'Eliminación'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSelectedActionFilter(type)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] font-inter font-bold transition-all shrink-0 cursor-pointer border",
                            selectedActionFilter === type
                              ? "bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-sm"
                              : "bg-dark3/60 border-border text-text-dim hover:text-text hover:bg-dark3"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-[180px]">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim text-[16px]">
                        search
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar por usuario o detalle..."
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        className="w-full h-8 pl-8 pr-3 bg-dark3 border border-border rounded-full text-[11px] font-inter text-text placeholder:text-text-dim outline-none focus:border-[#4d7cfe]"
                      />
                    </div>
                  </div>

                  {/* Lista de Registros */}
                  {isLoadingLogs ? (
                    <div className="py-8 text-center text-text-dim space-y-2">
                      <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                      <p className="text-xs font-inter">Cargando historial de actividades...</p>
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <div className="py-8 text-center text-text-dim space-y-2 border border-dashed border-border rounded-xl">
                      <span className="material-symbols-outlined text-[28px]">manage_search</span>
                      <p className="text-xs font-inter font-bold">No se encontraron registros de actividades.</p>
                      <p className="text-[10px] text-text-dim">Las operaciones importantes quedarán registradas aquí.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
                      {filteredLogs.map((log) => {
                        const dateStr = new Date(log.created_at).toLocaleString('es-NI', {
                          timeZone: 'America/Managua',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        });

                        let badgeColor = 'bg-[#4d7cfe]/10 text-[#3b66e0] dark:text-[#4d7cfe] border-[#4d7cfe]/30';
                        let iconName = 'notes';

                        if (log.action_type === 'Creación') {
                          badgeColor = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
                          iconName = 'add_circle';
                        } else if (log.action_type === 'Edición') {
                          badgeColor = 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30';
                          iconName = 'edit_note';
                        } else if (log.action_type === 'Reasignación') {
                          badgeColor = 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30';
                          iconName = 'sync_alt';
                        } else if (log.action_type === 'Deshacer') {
                          badgeColor = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
                          iconName = 'undo';
                        } else if (log.action_type === 'Seguridad') {
                          badgeColor = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
                          iconName = 'key';
                        } else if (log.action_type === 'Configuración') {
                          badgeColor = 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30';
                          iconName = 'settings';
                        } else if (log.action_type === 'Eliminación') {
                          badgeColor = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30';
                          iconName = 'delete';
                        }

                        let parsedImportDetails: any = null;
                        let parsedEditChanges: any[] | null = null;
                        if (log.details) {
                          try {
                            if (log.details.trim().startsWith('{')) {
                              const parsedJSON = JSON.parse(log.details);
                              parsedImportDetails = parsedJSON;
                              if (Array.isArray(parsedJSON.changes)) {
                                parsedEditChanges = parsedJSON.changes;
                              }
                            }
                          } catch (e) {
                            parsedImportDetails = null;
                            parsedEditChanges = null;
                          }
                        }

                        const isImportBatch = parsedImportDetails?.type === 'import_batch';
                        const isExpanded = !!expandedLogIds[log.id];

                        return (
                          <div
                            key={log.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-dark2 hover:bg-slate-50/80 dark:hover:bg-dark3 transition-colors flex flex-col gap-2 text-xs shadow-sm"
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border mt-0.5", badgeColor)}>
                                <span className="material-symbols-outlined text-[16px]">{iconName}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-bold text-slate-900 dark:text-text">{log.description}</span>
                                  <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider", badgeColor)}>
                                    {log.action_type}
                                  </span>
                                </div>

                                {parsedEditChanges && parsedEditChanges.length > 0 ? (
                                  <div className="mt-1.5 p-2.5 rounded-lg bg-slate-100 dark:bg-dark3/80 border border-slate-200 dark:border-border/60 space-y-1">
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-text-dim block mb-1">
                                      Modificaciones:
                                    </span>
                                    {parsedEditChanges.map((c: any, idx: number) => (
                                      <div key={idx} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-200/50 dark:border-white/5 last:border-0 gap-2">
                                        <span className="font-semibold text-slate-700 dark:text-text-dim">{c.label || c.field}</span>
                                        <div className="flex items-center gap-1.5 text-[10px]">
                                          <span className="text-slate-400 line-through">{String(c.oldValue ?? 'Sin datos')}</span>
                                          <span className="text-slate-400">➔</span>
                                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{String(c.newValue ?? 'Sin datos')}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : log.details && !isImportBatch ? (
                                  <p className="text-[11px] font-inter text-slate-600 dark:text-text-dim leading-relaxed">
                                    {log.details}
                                  </p>
                                ) : null}

                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500 dark:text-text-dim font-inter">
                                  <span className="font-semibold text-slate-700 dark:text-text/80">👤 {log.user_name} ({log.user_role})</span>
                                  <span>&bull;</span>
                                  <span>🕒 {dateStr}</span>
                                </div>
                              </div>

                              {isImportBatch && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandLog(log.id)}
                                  className="px-3 py-1.5 rounded-lg bg-[#4d7cfe]/10 hover:bg-[#4d7cfe]/20 text-[#3b66e0] dark:text-[#4d7cfe] text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer border border-[#4d7cfe]/30"
                                >
                                  <span>{isExpanded ? 'Ocultar lista' : `Ver ${parsedImportDetails.totalCount} usuarios`}</span>
                                  <span className="material-symbols-outlined text-[16px]">
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                  </span>
                                </button>
                              )}
                            </div>

                            {/* Tarjeta Expandible Audit-Grade para Importaciones (Modo Claro y Oscuro) */}
                            {isImportBatch && isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-border/80 bg-slate-100/70 dark:bg-black/30 p-3.5 rounded-xl space-y-3 animate-in fade-in duration-200">
                                {/* Encabezado de Auditoría */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-white/10">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                                      <span className="material-symbols-outlined text-[14px]">how_to_reg</span>
                                    </div>
                                    <div>
                                      <h4 className="text-[11px] font-bold text-slate-900 dark:text-text">
                                        Nómina de Importación Masiva Auditada
                                      </h4>
                                      <p className="text-[10px] text-slate-500 dark:text-text-dim">
                                        Ejecutado por <strong className="text-slate-800 dark:text-text font-bold">{parsedImportDetails.importedBy || log.user_name}</strong>
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold">
                                      {parsedImportDetails.totalCount} voluntarios
                                    </span>
                                  </div>
                                </div>

                                {/* Tabla de Auditoría Ordenada Alfabéticamente */}
                                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-dark2/90 shadow-sm">
                                  <div className="max-h-64 overflow-y-auto scrollbar-thin">
                                    <table className="w-full text-[11px] text-left border-collapse">
                                      <thead className="bg-slate-100 dark:bg-dark3 sticky top-0 z-10 text-[9px] font-bold text-slate-600 dark:text-text-dim uppercase tracking-wider border-b border-slate-200 dark:border-border">
                                        <tr>
                                          <th className="px-3 py-2 text-center w-10 text-slate-600 dark:text-text-dim">#</th>
                                          <th className="px-3 py-2 text-slate-600 dark:text-text-dim">Voluntario</th>
                                          <th className="px-3 py-2 w-32 font-mono text-slate-600 dark:text-text-dim">Teléfono</th>
                                          <th className="px-3 py-2 w-36 text-slate-600 dark:text-text-dim">Comité</th>
                                          <th className="px-3 py-2 text-center w-24 text-slate-600 dark:text-text-dim">PIN</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-inter">
                                        {[...(parsedImportDetails.importedUsers || [])]
                                          .sort((a, b) => {
                                            const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim();
                                            const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim();
                                            return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
                                          })
                                          .map((u: any, idx: number) => {
                                            const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Voluntario';
                                            return (
                                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
                                                <td className="px-3 py-1.5 text-center font-mono text-[10px] text-slate-400 dark:text-text-dim">
                                                  {idx + 1}
                                                </td>
                                                <td className="px-3 py-1.5 font-bold text-slate-900 dark:text-text">
                                                  {fullName}
                                                </td>
                                                <td className="px-3 py-1.5 font-mono text-slate-600 dark:text-text-dim text-[10px]">
                                                  {u.phone}
                                                </td>
                                                <td className="px-3 py-1.5">
                                                  {u.committee ? (
                                                    <span className="inline-block px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 text-[9px] font-bold">
                                                      {u.committee}
                                                    </span>
                                                  ) : (
                                                    <span className="text-slate-400 dark:text-text-dim text-[10px]">—</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-1.5 text-center">
                                                  {u.pin ? (
                                                    <span className="inline-block px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 font-mono text-[10px] font-bold">
                                                      {u.pin}
                                                    </span>
                                                  ) : (
                                                    <span className="text-slate-400 dark:text-text-dim text-[10px]">—</span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </motion.div>

        {/* Modal de Confirmación Doble para Archivar Comité */}
        {archiveModal.isOpen && archiveModal.committee && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-dark2 border border-border rounded-2xl p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">warning</span>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text">Archivar Comité</h3>
                  <p className="text-xs text-text-dim mt-1">
                    ¿Estás seguro de archivar el comité <strong className="text-text">{archiveModal.committee.name}</strong>?
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 font-bold space-y-1">
                <p className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  <strong>Nota de seguridad:</strong>
                </p>
                <p className="text-[11px] text-amber-300 font-normal">
                  Los voluntarios y coordinadores asignados a este comité serán desvinculados y quedarán marcados como "Sin comité / N/A".
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-text-dim">
                    1. Escribe el nombre exacto del comité: <span className="text-rose-400 font-extrabold">{archiveModal.committee.name}</span>
                  </label>
                  <input
                    type="text"
                    placeholder={archiveModal.committee.name}
                    value={archiveInputName}
                    onChange={(e) => setArchiveInputName(e.target.value)}
                    className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-border bg-dark3 text-text text-xs font-inter font-bold outline-none focus:border-rose-500 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-text-dim">
                    2. Escribe la palabra <span className="text-rose-400 font-extrabold">delete</span> para confirmar:
                  </label>
                  <input
                    type="text"
                    placeholder="delete"
                    value={archiveDeleteText}
                    onChange={(e) => setArchiveDeleteText(e.target.value)}
                    className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-border bg-dark3 text-text text-xs font-inter font-bold outline-none focus:border-rose-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setArchiveModal({ isOpen: false, committee: null })}
                  className="h-9 px-4 rounded-full text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmArchiveCommittee}
                  disabled={
                    archiveInputName.trim() !== archiveModal.committee.name.trim() ||
                    archiveDeleteText.trim().toLowerCase() !== 'delete' ||
                    isArchivingCommittee
                  }
                  className="h-9 px-5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold rounded-full text-xs"
                >
                  {isArchivingCommittee ? 'Archivando...' : 'Confirmar y Archivar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        />
      </motion.div>
    </div>
  );
}
