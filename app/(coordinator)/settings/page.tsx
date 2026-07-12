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

  // Committee Requirements State
  const [selectedConfigCommittees, setSelectedConfigCommittees] = useState<string[]>([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [capacities, setCapacities] = useState({ T1: 0, T2: 0, T3: 0, T4: 0 });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

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
        setSelectedConfigCommittees(['Seguridad']); // Default for admin
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

  useEffect(() => {
    // Load requirements when primary committee selection changes
    if (selectedConfigCommittees.length > 0) {
      const primary = selectedConfigCommittees[0];
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        try {
          const allReqs = JSON.parse(stored);
          if (allReqs[primary]) {
            setCapacities(allReqs[primary]);
          } else {
            setCapacities({ T1: 4, T2: 4, T3: 4, T4: 4 }); // Default
          }
        } catch (e) { console.error(e); }
      }
    }
  }, [selectedConfigCommittees[0]]);

  const handleSaveRequirements = async () => {
    setIsSavingConfig(true);
    const stored = localStorage.getItem("committee_requirements");
    let allReqs: any = {};
    if (stored) {
      try { allReqs = JSON.parse(stored); } catch (e) {}
    }
    selectedConfigCommittees.forEach(comm => {
      allReqs[comm] = capacities;
    });
    localStorage.setItem("committee_requirements", JSON.stringify(allReqs));
    
    // Simulate short delay for premium feel
    setTimeout(() => {
      setIsSavingConfig(false);
      showToast("Requerimientos guardados");
    }, 600);
  };

  const updateCapacity = (id: 'T1' | 'T2' | 'T3' | 'T4', delta: number) => {
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
        className="max-w-4xl w-full mx-auto space-y-6 lg:space-y-10 pb-20 px-4 sm:px-6 lg:px-8 pt-4"
      >


      {/* Profile Card */}
      <motion.div variants={itemVariants} className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-dark3">
          <div>
            <h3 className="font-bold text-text tracking-tight leading-none mb-2">Información Personal</h3>
            <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Datos registrados de tu cuenta.</p>
          </div>
        </div>
        
        <form onSubmit={handleUpdateProfile} className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-2">
              <label className="block mb-2 text-xs font-normal text-text">Nombre completo</label>
              <input 
                readOnly={currentRole === 'Lector'}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className={`w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all ${
                  currentRole === 'Lector' 
                    ? 'border-white/5 bg-dark/50 text-text-dim cursor-not-allowed' 
                    : 'border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]'
                }`}
              />
            </div>
            <div className="space-y-2">
              <label className="block mb-2 text-xs font-normal text-text">Teléfono WhatsApp</label>
              <input 
                readOnly={currentRole === 'Lector'}
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className={`w-full h-10 px-3 rounded-sm border text-sm font-inter font-bold outline-none transition-all ${
                  currentRole === 'Lector' 
                    ? 'border-white/5 bg-dark/50 text-text-dim cursor-not-allowed' 
                    : 'border-border bg-dark2 text-text focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]'
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <label className="block mb-2 text-xs font-normal text-text">Rol en la plataforma</label>
              {currentRole === 'Admin' ? (
                <Select value={editRole} onValueChange={(v) => setEditRole(v as 'Admin' | 'Editor' | 'Lector')}>
                  <SelectTrigger className="w-full h-10 px-3 border text-text font-inter font-bold flex items-center justify-between bg-dark2 border-border rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-dark2 border-border text-text font-inter font-bold">
                    <SelectItem value="Admin">Admin (Acceso total)</SelectItem>
                    <SelectItem value="Editor">Editor (Coordinador de comité)</SelectItem>
                    <SelectItem value="Lector">Lector (Solo lectura)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {editRole}
                </div>
              )}
            </div>

            {editRole === 'Editor' && (
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Comité Asignado</label>
                {currentRole === 'Admin' ? (
                  <Select value={editCommittee} onValueChange={(v) => v && setEditCommittee(v)}>
                    <SelectTrigger className="w-full h-10 px-3 border text-text font-inter font-bold flex items-center justify-between bg-dark2 border-border rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-dark2 border-border text-text font-inter font-bold">
                      {committees.map(c => (
                        <SelectItem key={c.id} value={c.name} className="focus:bg-dark3 focus:text-text">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                    {editCommittee || 'Sin comité'}
                  </div>
                )}
              </div>
            )}
          </div>

          {currentRole !== 'Lector' && (
            <div className="pt-6 md:pt-8 border-t border-white/5 flex justify-end">
              <Button type="submit" disabled={isUpdating} className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold px-8 h-10 shadow-lg shadow-blue-500/15 transition-all active:scale-[0.97] rounded-full text-xs">
                {isUpdating ? 'Actualizando...' : 'Guardar Cambios'}
              </Button>
            </div>
          )}
        </form>
      </motion.div>

      {/* Seguridad & Autenticación (Solo móvil/tablet por ahora) */}
      <motion.div variants={itemVariants} className="lg:hidden bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden mb-8">
        <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-dark3">
          <div>
            <h3 className="font-bold text-text tracking-tight leading-none mb-2">Seguridad y Acceso</h3>
            <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Gestiona métodos de inicio de sesión.</p>
          </div>
        </div>
        
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <p className="text-sm font-bold text-text mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4d7cfe] text-[20px] shrink-0">fingerprint</span>
                Inicio de Sesión Biométrico
              </p>
              <p className="text-xs text-text-dim leading-relaxed max-w-xl font-inter font-bold">
                Vincula este dispositivo para iniciar sesión usando tu huella dactilar, Face ID o método de bloqueo seguro del sistema sin necesidad de introducir un PIN.
              </p>
            </div>
            
            {hasPasskey ? (
              <Button 
                type="button" 
                onClick={handleDeletePasskey}
                disabled={isRegisteringPasskey} 
                className="font-bold px-6 h-10 transition-all active:scale-[0.97] rounded-full text-xs shrink-0 w-full md:w-auto bg-red/10 text-red hover:bg-red/20 border border-red/20"
              >
                {isRegisteringPasskey ? 'Desvinculando...' : 'Desvincular Dispositivo'}
              </Button>
            ) : (
              <Button 
                type="button" 
                onClick={handleRegisterPasskey}
                disabled={isRegisteringPasskey} 
                className="font-bold px-6 h-10 transition-all active:scale-[0.97] rounded-full text-xs shrink-0 w-full md:w-auto bg-white/10 hover:bg-white/20 text-white"
              >
                {isRegisteringPasskey ? 'Registrando...' : 'Vincular Dispositivo'}
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Permissions Section (Toggles) */}
      <motion.div variants={itemVariants} className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-white/5 bg-dark3">
          <h3 className="font-bold text-text tracking-tight leading-none mb-2">Permisos</h3>
          <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Funcionalidades habilitadas para el rol de {editRole}.</p>
        </div>
        <div className="p-4 md:p-8">
          <div className="divide-y divide-white/5 border border-white/5 rounded-2xl overflow-hidden bg-dark3">
            {ALL_PERMISSIONS.map(perm => {
              const isOn = ROLE_PERMISSIONS[editRole].includes(perm);
              const isLocked = currentRole !== 'Admin';
              
              return (
                <div key={perm} className="flex items-center justify-between p-4 md:p-5 bg-dark2/50 hover:bg-dark2 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      isOn ? 'bg-[#4d7cfe]/10 text-[#4d7cfe]' : 'bg-white/5 text-text-dim'
                    }`}>
                      <span className="material-symbols-outlined text-[20px] md:text-[22px]">
                        {perm === 'Ver voluntarios' ? 'group' :
                         perm === 'Editar turnos' ? 'edit_calendar' :
                         perm === 'Enviar mensajes' ? 'send_to_mobile' :
                         perm === 'Ver reportes' ? 'analytics' :
                         perm === 'Importar datos' ? 'upload_file' : 'settings_suggest'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs md:text-sm font-bold text-text">{perm}</p>
                      <p className="text-[10px] md:text-xs text-text-dim font-medium">{isOn ? 'Habilitado' : 'Restringido'}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isLocked}
                    className={`w-10 h-6 rounded-full transition-all relative flex-shrink-0 ${
                      isOn ? 'bg-[#4d7cfe]' : 'bg-white/10'
                    } ${isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                  >
                    <motion.span 
                      initial={false}
                      animate={{ x: isOn ? 20 : 4 }}
                      style={{ left: 0 }}
                      className="absolute top-[4px] w-4 h-4 rounded-full bg-white shadow-md" 
                    />
                  </button>
                </div>
              );
            })}
          </div>
          
          {currentRole === 'Admin' && (
            <div className="mt-6 md:mt-8 flex justify-end">
              <p className="text-[10px] md:text-[11px] text-text-dim italic">Como Administrador, gestionas los permisos globales del sistema.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Committee Requirements Section (Role-based) */}
      {(currentRole === 'Admin' || currentRole === 'Editor') && (
        <motion.div variants={itemVariants} className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden mb-8">
          <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-dark3">
            <div>
              <h3 className="font-bold text-text tracking-tight leading-none mb-2">Requerimientos por Turno</h3>
              <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Define el personal mínimo necesario para cada horario.</p>
            </div>
            
            {currentRole === 'Admin' ? (
              <div className="w-full md:max-w-sm">
                <DataTableFilter
                  title={selectedConfigCommittees.length === 1 ? selectedConfigCommittees[0] : "Comités seleccionados"}
                  options={committees.map(c => c.name)}
                  value={selectedConfigCommittees}
                  dropdownLabel="Comités disponibles"
                  hideClearButton
                  hideCountBadge={selectedConfigCommittees.length === 1}
                  isCommitteeFilter
                  className="bg-dark border-white/10 justify-between w-full min-w-[200px] font-inter font-bold text-sm"
                  onChange={(vals) => {
                    if (vals.length > 0) {
                      setSelectedConfigCommittees(vals);
                    }
                  }}
                />
              </div>
            ) : (
              <Badge className="bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20 font-inter font-bold uppercase tracking-widest px-3 py-1">
                Comité: {selectedConfigCommittees[0]}
              </Badge>
            )}
          </div>

          <div className="p-4 md:p-8">
            <div className="relative grid grid-cols-2 gap-3 md:gap-6">
              {([
                { id: 'T1', label: 'Turno 1', time: '8:00 AM - 12:00 PM' },
                { id: 'T2', label: 'Turno 2', time: '11:00 AM - 3:00 PM' },
                { id: 'T3', label: 'Turno 3', time: '2:00 PM - 6:00 PM' },
                { id: 'T4', label: 'Turno 4', time: '5:00 PM - 10:00 PM' }
              ] as const).map(({ id, label, time }) => (
                <div key={id} className="p-5 rounded-2xl border border-white/5 bg-dark3 space-y-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-text">{label}</span>
                    <span className="text-[10px] font-inter font-bold text-text-dim uppercase">{time}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <button 
                      type="button"
                      onClick={() => updateCapacity(id, -1)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-dark2 border border-white/10 text-text-dim hover:text-text hover:border-white/20 transition-all active:scale-90 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[20px]">remove</span>
                    </button>
                    <span className="text-3xl font-bold text-text tabular-nums font-inter">{(capacities as any)[id]}</span>
                    <button 
                      type="button"
                      onClick={() => updateCapacity(id, 1)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-dark2 border border-white/10 text-text-dim hover:text-text hover:border-white/20 transition-all active:scale-90 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Sync Button (Centered in the 2x2 grid, visible on all screens) */}
              <div className="flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-dark2 rounded-full p-1.5 md:p-2 shadow-md border border-white/5 z-10">
                <button
                  onClick={() => setIsSyncEnabled(!isSyncEnabled)}
                  title={isSyncEnabled ? "Sincronización activada" : "Sincronización desactivada"}
                  className={`flex items-center justify-center w-10 h-10 rounded-full transition-all shadow-sm ${
                    isSyncEnabled 
                      ? 'bg-[#4d7cfe] text-white shadow-blue-500/20' 
                      : 'bg-dark3 text-text-dim hover:bg-white/5 hover:text-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">link</span>
                </button>
              </div>
            </div>

            <div className="mt-6 md:mt-10 pt-6 md:pt-8 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-[10px] md:text-[11px] text-text-dim max-w-md">
                Estos valores determinan los estados de alerta (Déficit/Crítico) en los tableros de gestión global.
              </p>
              <div className="flex justify-end w-full sm:w-auto">
                <Button 
                  onClick={handleSaveRequirements} 
                  disabled={isSavingConfig}
                  className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold px-8 h-10 shadow-lg shadow-blue-500/15 transition-all active:scale-[0.97] rounded-full text-xs"
                >
                  {isSavingConfig ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
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
