'use client'

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { DataTableFilter } from "@/components/DataTableFilter";
import { startRegistration } from "@simplewebauthn/browser";

import { isCoordinatorShiftEditAllowed, setCoordinatorShiftEditAllowed } from "@/lib/permissions";
import { changeUserPin } from "@/app/actions/update-pin";

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
    return 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white/70';
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
  }

  return `${color.bgSelected} shadow-md scale-[1.02]`;
};

export default function SettingsPage() {
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [committees, setCommittees] = useState<{ id: string, name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  // Form states for profile
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCommittee, setEditCommittee] = useState('');
  const [editRole, setEditRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');

  // PIN states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // Committee Requirements State - NONE selected by default
  const [selectedConfigCommittees, setSelectedConfigCommittees] = useState<string[]>([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [capacities, setCapacities] = useState({ T1: 0, T2: 0, T3: 0, T4: 0 });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Shift edit permission state for coordinators
  const [allowCoordinatorShiftEdit, setAllowCoordinatorShiftEdit] = useState<boolean>(false);

  useEffect(() => {
    setAllowCoordinatorShiftEdit(isCoordinatorShiftEditAllowed());
  }, []);

  const handleToggleCoordinatorShiftEdit = (allowed: boolean) => {
    if (currentRole !== 'Admin') {
      showToast("Solo los administradores pueden cambiar este permiso", "error");
      return;
    }
    setCoordinatorShiftEditAllowed(allowed);
    setAllowCoordinatorShiftEdit(allowed);
    showToast(allowed ? "Permiso de edición de turnos HABILITADO para Coordinadores" : "Permiso de edición de turnos DESHABILITADO para Coordinadores");
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

    // 2. Get session info
    const role = (localStorage.getItem('mock_role') || 'Admin') as any;
    const phone = localStorage.getItem('volunteer_phone') || '';
    setCurrentRole(role);

    // 3. Fetch current user details
    const table = role === 'Lector' ? 'volunteers' : 'profiles';

    const { data: user } = await supabase
      .from(table)
      .select('*, committees(name)')
      .eq('phone', phone)
      .maybeSingle();

    if (user) {
      const fullName = role === 'Lector' ? `${user.first_name} ${user.last_name}` : user.full_name;
      setUserProfile(user);
      setEditName(fullName);
      setEditPhone(user.phone);
      setEditRole(role);
      const userComm = user.committees?.name || '';
      setEditCommittee(userComm);

      // Initial committee for config
      if (role === 'Editor') {
        setSelectedConfigCommittees([userComm]);
      } else if (role === 'Admin') {
        setSelectedConfigCommittees([]); // Default: none selected
      }



      // Check if user has passkeys
      const { data: passkeys } = await supabase
        .from('passkeys')
        .select('id')
        .eq('user_id', user.id);

      if (passkeys && passkeys.length > 0) {
        setHasPasskey(true);
      }
    }
    setLoading(false);
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

    // 2. Persist to Supabase committee_shift_requirements
    const supabaseClient = createClient();
    const shiftKeys: Array<'T1' | 'T2' | 'T3' | 'T4'> = ['T1', 'T2', 'T3', 'T4'];
    for (const commName of selectedConfigCommittees) {
      const commObj = committees.find(c => c.name === commName);
      if (!commObj) continue;
      const rows = shiftKeys.map(sk => ({
        committee_id: commObj.id,
        shift_key: sk,
        required: capacities[sk],
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabaseClient
        .from('committee_shift_requirements')
        .upsert(rows, { onConflict: 'committee_id,shift_key' });
      if (error) {
        // Table may not exist yet — silently fall back to localStorage only
        console.warn('committee_shift_requirements upsert skipped:', error.message);
      }
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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentRole === 'Lector') return;

    setIsUpdating(true);
    const supabase = createClient();

    let committeeId = userProfile.committee_id;
    if (currentRole === 'Admin' && editCommittee) {
      const match = committees.find(c => c.name === editCommittee);
      if (match) committeeId = match.id;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editName,
        phone: editPhone,
        role: editRole,
        committee_id: committeeId
      })
      .eq('id', userProfile.id);

    if (error) {
      showToast("Error al actualizar perfil", "error");
    } else {
      showToast("Perfil actualizado");
      localStorage.setItem('volunteer_phone', editPhone);
      localStorage.setItem('mock_role', editRole);
      if (editRole === 'Admin' || editRole === 'Editor') localStorage.setItem('mock_committee', editCommittee);
      setCurrentRole(editRole);
      await loadData();
    }
    setIsUpdating(false);
  };

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
        throw new Error('Error al generar opciones de registro');
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
        setHasPasskey(true);
        showToast("Huella registrada correctamente");
      } else {
        throw new Error("No se pudo verificar la huella");
      }
    } catch (err: any) {
      showToast("Registro cancelado o dispositivo no compatible.", "error");
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!userProfile) return;
    setIsRegisteringPasskey(true);
    try {
      const resp = await fetch('/api/webauthn/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userProfile.id })
      });
      if (!resp.ok) throw new Error('Error al desvincular huella');
      setHasPasskey(false);
      localStorage.setItem("preferred_auth_method", "pin"); // Reset auth method to pin
      showToast("Huella desvinculada correctamente");
    } catch (err: any) {
      showToast("Error al desvincular huella", "error");
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPin(true);
    
    if (newPin.length < 4 || newPin.length > 6) {
      showToast("El nuevo PIN debe tener entre 4 y 6 dígitos", "error");
      setIsChangingPin(false);
      return;
    }
    
    const res = await changeUserPin(currentPin, newPin);
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
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    'Admin': ALL_PERMISSIONS,
    'Editor': ['Ver voluntarios', 'Editar turnos', 'Enviar mensajes', 'Ver reportes'],
    'Lector': ['Ver voluntarios']
  };

  if (loading) return null;

  return (
    <div className="w-full mx-auto pb-32 md:pb-12 flex flex-col min-h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)]">
      {/* Sticky Header matching users design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Ajustes
          </h1>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full pb-20 px-0 sm:px-6 lg:px-8 pt-2"
      >
        {/* Full-width edge-to-edge settings container separated only by single border lines */}
        <motion.div variants={itemVariants} className="w-full bg-dark2 border-y sm:border border-white/10 rounded-none sm:rounded-2xl overflow-hidden divide-y divide-white/10 shadow-lg">

          {/* 1. Información Personal */}
          <div className="w-full transition-all">
            <button
              type="button"
              onClick={() => isMobile && toggleSection('personal')}
              className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left ${isMobile ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'
                } ${isSectionOpen('personal') ? 'bg-white/[0.02]' : ''}`}
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
                <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/70 shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {isSectionOpen('personal') ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              )}
            </button>

            {isSectionOpen('personal') && (
              <div className="p-4 sm:p-6 space-y-5 border-t border-white/5 bg-black/10">
                <form onSubmit={handleUpdateProfile} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text">Nombre completo</label>
                      <input
                        readOnly={currentRole === 'Lector'}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-inter font-bold outline-none transition-all ${currentRole === 'Lector'
                          ? 'border-white/5 bg-dark/50 text-text-dim cursor-not-allowed'
                          : 'border-white/15 bg-white/5 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]'
                          }`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text">Teléfono WhatsApp</label>
                      <input
                        readOnly={currentRole === 'Lector'}
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-inter font-bold outline-none transition-all ${currentRole === 'Lector'
                          ? 'border-white/5 bg-dark/50 text-text-dim cursor-not-allowed'
                          : 'border-white/15 bg-white/5 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]'
                          }`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text">Rol en la plataforma</label>
                      {currentRole === 'Admin' ? (
                        <Select value={editRole} onValueChange={(v) => setEditRole(v as 'Admin' | 'Editor' | 'Lector')}>
                          <SelectTrigger className="w-full h-10 px-3 border text-text text-xs font-inter font-bold flex items-center justify-between bg-white/5 border-white/15 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0f172a] border-white/20 text-text text-xs font-inter font-bold z-[120]">
                            <SelectItem value="Admin">Admin (Acceso total)</SelectItem>
                            <SelectItem value="Editor">Editor (Coordinador de comité)</SelectItem>
                            <SelectItem value="Lector">Lector (Solo lectura)</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="w-full h-10 px-3 rounded-xl border border-white/5 bg-dark/50 text-text-dim text-xs font-inter font-bold flex items-center cursor-not-allowed">
                          {editRole}
                        </div>
                      )}
                    </div>

                    {editRole === 'Editor' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text">Comité Asignado</label>
                        {currentRole === 'Admin' ? (
                          <Select value={editCommittee} onValueChange={(v) => v && setEditCommittee(v)}>
                            <SelectTrigger className="w-full h-10 px-3 border text-text text-xs font-inter font-bold flex items-center justify-between bg-white/5 border-white/15 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0f172a] border-white/20 text-text text-xs font-inter font-bold z-[120]">
                              {committees.map(c => (
                                <SelectItem key={c.id} value={c.name} className="focus:bg-white/10 focus:text-text">{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="w-full h-10 px-3 rounded-xl border border-white/5 bg-dark/50 text-text-dim text-xs font-inter font-bold flex items-center cursor-not-allowed">
                            {editCommittee || 'Sin comité'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {currentRole !== 'Lector' && (
                    <div className="pt-2 flex justify-end">
                      <Button type="submit" disabled={isUpdating} className="bg-white hover:bg-white/90 text-black font-bold px-6 h-9 shadow-lg active:scale-[0.97] transition-all rounded-full text-xs">
                        {isUpdating ? 'Actualizando...' : 'Guardar Cambios de Perfil'}
                      </Button>
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>

          {/* 2. Huellas Digitales (Biometría / Face ID) */}
          <div className="w-full transition-all">
            <button
              type="button"
              onClick={() => isMobile && toggleSection('security')}
              className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left ${isMobile ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'
                } ${isSectionOpen('security') ? 'bg-white/[0.02]' : ''}`}
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
                <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/70 shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {isSectionOpen('security') ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              )}
            </button>

            {isSectionOpen('security') && (
              <div className="p-4 sm:p-6 border-t border-white/5 bg-black/10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-text-dim font-inter leading-relaxed max-w-xl">
                      Vincula este dispositivo para iniciar sesión rápidamente mediante tu huella dactilar o reconocimiento facial.
                    </p>
                  </div>

                  {hasPasskey ? (
                    <Button
                      type="button"
                      onClick={handleDeletePasskey}
                      disabled={isRegisteringPasskey}
                      className="font-bold px-5 h-9 transition-all active:scale-[0.97] rounded-full text-xs shrink-0 w-full md:w-auto bg-red/10 text-red hover:bg-red/20 border border-red/20"
                    >
                      {isRegisteringPasskey ? 'Desvinculando...' : 'Desvincular Dispositivo'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleRegisterPasskey}
                      disabled={isRegisteringPasskey}
                      className="font-bold px-5 h-9 transition-all active:scale-[0.97] rounded-full text-xs shrink-0 w-full md:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15"
                    >
                      {isRegisteringPasskey ? 'Registrando...' : 'Vincular Dispositivo'}
                    </Button>
                  )}
                </div>

                {/* Change PIN Section */}
                <div className="mt-8 pt-6 border-t border-white/5">
                  <h4 className="font-bold text-text text-xs mb-4">Cambiar PIN de Acceso</h4>
                  <form onSubmit={handleChangePin} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text">PIN Actual</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={currentPin}
                          onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                          className="w-full h-10 px-3 rounded-xl border border-white/15 bg-white/5 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-xs font-inter font-bold outline-none transition-all"
                          placeholder="••••"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text">Nuevo PIN</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={newPin}
                          onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                          className="w-full h-10 px-3 rounded-xl border border-white/15 bg-white/5 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] text-xs font-inter font-bold outline-none transition-all"
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

          {/* 3. Permisos (Incluye Edición de Turnos e información del rol) */}
          <div className="w-full transition-all">
            <button
              type="button"
              onClick={() => isMobile && toggleSection('permissions')}
              className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left ${isMobile ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'
                } ${isSectionOpen('permissions') ? 'bg-white/[0.02]' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text text-xs tracking-tight leading-none truncate">Permisos</h3>
                  <p className="text-[10px] font-inter font-medium text-text-dim mt-1 truncate">Gestión de accesos y edición de turnos para coordinadores</p>
                </div>
              </div>

              {isMobile && (
                <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/70 shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {isSectionOpen('permissions') ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              )}
            </button>

            {isSectionOpen('permissions') && (
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-0 border-t border-white/5 bg-black/10">

                {/* Permiso Especial: Edición de Turnos para Coordinadores */}
                <div className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-text">Coordinadores editan turnos</p>
                      <p className="text-[10px] text-text-dim font-medium">Por defecto solo administradores pueden modificar asignaciones</p>
                      {currentRole !== 'Admin' && (
                        <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1 pt-0.5">
                          <span className="material-symbols-outlined text-[12px]">lock</span>
                          Solo Administradores pueden modificar este permiso
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={currentRole !== 'Admin'}
                    onClick={() => handleToggleCoordinatorShiftEdit(!allowCoordinatorShiftEdit)}
                    className={`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${allowCoordinatorShiftEdit ? 'bg-emerald-500' : 'bg-white/10'
                      } ${currentRole !== 'Admin' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                  >
                    <motion.span
                      initial={false}
                      animate={{ x: allowCoordinatorShiftEdit ? 18 : 3 }}
                      style={{ left: 0 }}
                      className="absolute top-[2.5px] w-3.5 h-3.5 rounded-full bg-white shadow-md"
                    />
                  </button>
                </div>

                {/* Lista de Permisos por Rol — borderless rows */}
                <div className="divide-y divide-white/5">
                  {ALL_PERMISSIONS.map(perm => {
                    const isOn = ROLE_PERMISSIONS[editRole].includes(perm);
                    const isLocked = currentRole !== 'Admin';

                    return (
                      <div key={perm} className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isOn ? 'bg-[#4d7cfe]/15 text-[#4d7cfe]' : 'bg-white/5 text-text-dim'
                            }`}>
                            <span className="material-symbols-outlined text-[18px]">
                              {perm === 'Ver voluntarios' ? 'group' :
                                perm === 'Editar turnos' ? 'edit_calendar' :
                                  perm === 'Enviar mensajes' ? 'send_to_mobile' :
                                    perm === 'Ver reportes' ? 'analytics' :
                                      perm === 'Importar datos' ? 'upload_file' : 'settings_suggest'}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-text">{perm}</p>
                            <p className="text-[10px] text-text-dim font-medium">{isOn ? 'Habilitado' : 'Restringido'}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isLocked}
                          className={`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${isOn ? 'bg-[#4d7cfe]' : 'bg-white/10'
                            } ${isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                        >
                          <motion.span
                            initial={false}
                            animate={{ x: isOn ? 18 : 3 }}
                            style={{ left: 0 }}
                            className="absolute top-[2.5px] w-3.5 h-3.5 rounded-full bg-white shadow-md"
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </div>

          {/* 4. Requerimientos por Turno (Role-based) */}
          {(currentRole === 'Admin' || currentRole === 'Editor') && (
            <div className="w-full transition-all">
              <button
                type="button"
                onClick={() => isMobile && toggleSection('requirements')}
                className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left ${isMobile ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'
                  } ${isSectionOpen('requirements') ? 'bg-white/[0.02]' : ''}`}
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
                  <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/70 shrink-0">
                    <span className="material-symbols-outlined text-[18px]">
                      {isSectionOpen('requirements') ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                )}
              </button>

              {isSectionOpen('requirements') && (
                <div className="p-4 sm:p-6 space-y-5 border-t border-white/5 bg-black/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs font-inter text-text-dim">
                      Ajusta la cantidad mínima de voluntarios requeridos por turno.
                    </p>
                    
                    {/* Sync Button */}
                    <button
                      onClick={handleToggleSync}
                      title={isSyncEnabled ? "Sincronización activada" : "Sincronización desactivada"}
                      className={`flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-bold transition-all shrink-0 self-start sm:self-auto ${
                        isSyncEnabled 
                          ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-blue-500/20' 
                          : 'bg-white/5 border-white/15 text-text-dim hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">link</span>
                      <span className="text-[11px]">{isSyncEnabled ? 'Sincronizado' : 'Sincronizar'}</span>
                    </button>
                  </div>

                  {/* Multi-select Committee Chips Bar (Max 2 Rows) */}
                  {currentRole === 'Admin' && committees.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">
                          Comités Seleccionados ({selectedConfigCommittees.length}):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedConfigCommittees.length === committees.length) {
                              setSelectedConfigCommittees([]);
                            } else {
                              setSelectedConfigCommittees(committees.map(c => c.name));
                            }
                          }}
                          className="text-[11px] font-bold text-[#4d7cfe] hover:underline"
                        >
                          {selectedConfigCommittees.length === committees.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                        </button>
                      </div>
                      
                      {/* Dynamic grid to guarantee MAX 2 ROWS */}
                      <div 
                        className="grid gap-2 pt-0.5 w-full"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(2, Math.ceil(committees.length / 2))}, minmax(0, 1fr))`
                        }}
                      >
                        {committees.map((comm) => {
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
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-400 font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-[15px]">info</span>
                      Selecciona al menos un comité arriba para ver y modificar sus requerimientos por turno.
                    </div>
                  )}

                  {/* Shift List: ERD Database Schema Relation Lines (0 Pixel Resize) */}
                  <div className="divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden bg-black/20 relative">
                    {([
                      { id: 'T1', label: 'Turno 1', time: '8:00 AM - 12:00 PM' },
                      { id: 'T2', label: 'Turno 2', time: '11:00 AM - 3:00 PM' },
                      { id: 'T3', label: 'Turno 3', time: '2:00 PM - 6:00 PM' },
                      { id: 'T4', label: 'Turno 4', time: '5:00 PM - 10:00 PM' }
                    ] as const).map(({ id, label, time }) => (
                      <div key={id} className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors relative min-h-[57px]">
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
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e293b] border border-white/15 text-white hover:bg-[#334155] transition-all active:scale-90 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[16px] text-white font-bold">remove</span>
                            </button>
                            <span className="text-base sm:text-lg font-extrabold text-text tabular-nums min-w-[24px] text-center font-inter">
                              {(capacities as any)[id]}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCapacity(id, 1)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e293b] border border-white/15 text-white hover:bg-[#334155] transition-all active:scale-90 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[16px] text-white font-bold">add</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* ERD Database Relationship Lines & Single Synchronized Counter Overlay */}
                    {isSyncEnabled && (
                      <>
                        <svg 
                          className="absolute left-[130px] sm:left-[145px] right-[130px] sm:right-[145px] top-0 bottom-0 w-auto h-full pointer-events-none z-0 text-white/30" 
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
                          <circle cx="96" cy="114" r="3.5" fill="#0f172a" stroke="currentColor" strokeWidth="1.5" />
                        </svg>

                        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-3 shrink-0 z-10">
                          <button
                            type="button"
                            onClick={() => updateCapacity('T1', -1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e293b] border border-white/15 text-white hover:bg-[#334155] transition-all active:scale-90 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px] text-white font-bold">remove</span>
                          </button>
                          <span className="text-base sm:text-lg font-extrabold text-text tabular-nums min-w-[24px] text-center font-inter">
                            {capacities.T1}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCapacity('T1', 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e293b] border border-white/15 text-white hover:bg-[#334155] transition-all active:scale-90 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px] text-white font-bold">add</span>
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
                        className="bg-white hover:bg-white/90 text-black font-bold px-6 h-9 shadow-lg active:scale-[0.97] transition-all rounded-full text-xs"
                      >
                        {isSavingConfig ? 'Guardando...' : 'Guardar Requerimientos'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </motion.div>

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
