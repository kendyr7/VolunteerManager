'use client'

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { DataTableFilter } from "@/components/DataTableFilter";

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

  // Form states for profile
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCommittee, setEditCommittee] = useState('');

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
      const userComm = user.committees?.name || '';
      setEditCommittee(userComm);
      
      // Initial committee for config
      if (role === 'Editor') {
        setSelectedConfigCommittees([userComm]);
      } else if (role === 'Admin') {
        setSelectedConfigCommittees(['Seguridad']); // Default for admin
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
        committee_id: committeeId
      })
      .eq('id', userProfile.id);

    if (error) {
      showToast("Error al actualizar perfil", "error");
    } else {
      showToast("Perfil actualizado");
      localStorage.setItem('volunteer_phone', editPhone);
      if (currentRole === 'Admin') localStorage.setItem('mock_committee', editCommittee);
      await loadData();
    }
    setIsUpdating(false);
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
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto space-y-10 pb-20"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="pb-6 border-b border-slate-200/60">
        <h1 className="tracking-tight text-slate-900 leading-none mb-2">Ajustes</h1>
        <p className="text-base font-medium text-slate-500">Administra tu información y revisa tus privilegios de acceso.</p>
      </motion.div>

      {/* Profile Card */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-900 tracking-tight leading-none mb-2">Información Personal</h3>
            <p className="text-sm font-medium text-slate-400">Datos registrados de tu cuenta.</p>
          </div>
          <Badge className="bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20 font-bold uppercase tracking-widest px-3 py-1">
            {currentRole}
          </Badge>
        </div>
        
        <form onSubmit={handleUpdateProfile} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nombre Completo</label>
              <input 
                readOnly={currentRole === 'Lector'}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className={`w-full h-10 px-3 rounded-sm border transition-all outline-none ${
                  currentRole === 'Lector' 
                    ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-white border-slate-200 text-slate-900 focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]'
                }`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Teléfono WhatsApp</label>
              <input 
                readOnly={currentRole === 'Lector'}
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className={`w-full h-10 px-3 rounded-sm border transition-all outline-none font-mono ${
                  currentRole === 'Lector' 
                    ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-white border-slate-200 text-slate-900 focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]'
                }`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Comité Asignado</label>
              {currentRole === 'Admin' ? (
                <Select value={editCommittee} onValueChange={(v) => v && setEditCommittee(v)}>
                  <SelectTrigger className="w-full h-10 bg-white border-slate-200 text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {committees.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 px-3 flex items-center bg-slate-50 border border-slate-100 rounded-sm text-slate-400 font-medium">
                  {editCommittee || 'Sin comité'}
                </div>
              )}
            </div>
          </div>

          {currentRole !== 'Lector' && (
            <div className="pt-8 border-t border-slate-100 flex justify-end">
              <Button type="submit" disabled={isUpdating} className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold px-8 h-10 shadow-lg shadow-blue-500/15 transition-all active:scale-[0.97]">
                {isUpdating ? 'Actualizando...' : 'Guardar Cambios'}
              </Button>
            </div>
          )}
        </form>
      </motion.div>

      {/* Permissions Section (Toggles) */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-900 tracking-tight leading-none mb-2">Configuración de Privilegios</h3>
          <p className="text-sm font-medium text-slate-400">Funcionalidades habilitadas para el rol de {currentRole}.</p>
        </div>
        <div className="p-8">
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/30">
            {ALL_PERMISSIONS.map(perm => {
              const isOn = ROLE_PERMISSIONS[currentRole].includes(perm);
              const isLocked = currentRole !== 'Admin';
              
              return (
                <div key={perm} className="flex items-center justify-between p-5 bg-white/50 hover:bg-white transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      isOn ? 'bg-[#4d7cfe]/10 text-[#4d7cfe]' : 'bg-slate-100 text-slate-300'
                    }`}>
                      <span className="material-symbols-outlined text-[22px]">
                        {perm === 'Ver voluntarios' ? 'group' :
                         perm === 'Editar turnos' ? 'edit_calendar' :
                         perm === 'Enviar mensajes' ? 'send_to_mobile' :
                         perm === 'Ver reportes' ? 'analytics' :
                         perm === 'Importar datos' ? 'upload_file' : 'settings_suggest'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{perm}</p>
                      <p className="text-xs text-slate-400 font-medium">{isOn ? 'Habilitado' : 'Restringido'}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isLocked}
                    className={`w-10 h-6 rounded-full transition-all relative flex-shrink-0 ${
                      isOn ? 'bg-[#4d7cfe]' : 'bg-slate-300'
                    } ${isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-105'}`}
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
            <div className="mt-8 flex justify-end">
              <p className="text-[11px] text-slate-400 italic">Como Administrador, gestionas los permisos globales del sistema.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Committee Requirements Section (Role-based) */}
      {(currentRole === 'Admin' || currentRole === 'Editor') && (
        <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-900 tracking-tight leading-none mb-2">Requerimientos por Turno</h3>
              <p className="text-sm font-medium text-slate-400">Define el personal mínimo necesario para cada horario.</p>
            </div>
            
            {currentRole === 'Admin' ? (
              <div className="max-w-sm">
                <DataTableFilter
                  title={selectedConfigCommittees.length === 1 ? selectedConfigCommittees[0] : "Comités seleccionados"}
                  options={committees.map(c => c.name)}
                  value={selectedConfigCommittees}
                  dropdownLabel="Comités disponibles"
                  hideClearButton
                  hideCountBadge={selectedConfigCommittees.length === 1}
                  isCommitteeFilter
                  className="bg-white border-slate-200 justify-between min-w-[200px]"
                  onChange={(vals) => {
                    if (vals.length > 0) {
                      setSelectedConfigCommittees(vals);
                    }
                  }}
                />
              </div>
            ) : (
              <Badge className="bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20 font-bold uppercase tracking-widest px-3 py-1">
                Comité: {selectedConfigCommittees[0]}
              </Badge>
            )}
          </div>

          <div className="p-8">
            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-6">
              {([
                { id: 'T1', label: 'Turno 1', time: '8:00 AM' },
                { id: 'T2', label: 'Turno 2', time: '11:00 AM' },
                { id: 'T3', label: 'Turno 3', time: '2:00 PM' },
                { id: 'T4', label: 'Turno 4', time: '5:00 PM' }
              ] as const).map(({ id, label, time }) => (
                <div key={id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{label}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{time}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <button 
                      type="button"
                      onClick={() => updateCapacity(id, -1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-800 hover:border-slate-300 transition-all active:scale-90 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[18px]">remove</span>
                    </button>
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">{(capacities as any)[id]}</span>
                    <button 
                      type="button"
                      onClick={() => updateCapacity(id, 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-800 hover:border-slate-300 transition-all active:scale-90 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Sync Button (Centered in the 2x2 grid, visible only on sm screens and larger) */}
              <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-white rounded-full p-2 shadow-sm border border-slate-100 z-10">
                <button
                  onClick={() => setIsSyncEnabled(!isSyncEnabled)}
                  title={isSyncEnabled ? "Sincronización activada" : "Sincronización desactivada"}
                  className={`flex items-center justify-center w-10 h-10 rounded-full transition-all shadow-md ${
                    isSyncEnabled 
                      ? 'bg-[#4d7cfe] text-white shadow-blue-500/20' 
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">link</span>
                </button>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 italic max-w-md">
                Estos valores determinan los estados de alerta (Déficit/Crítico) en los tableros de gestión global.
              </p>
              <Button 
                onClick={handleSaveRequirements} 
                disabled={isSavingConfig}
                className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold px-8 h-10 shadow-lg shadow-blue-500/15 transition-all active:scale-[0.97]"
              >
                {isSavingConfig ? 'Guardando...' : 'Guardar Requerimientos'}
              </Button>
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
  );
}
