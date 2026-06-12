'use client'

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { generateWaMeLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch } from "@/lib/search-context";
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

const COMMITTEES = ['Historia', 'Seguridad', 'Guía', 'Traducción', 'Transporte', 'Primeros Auxilios'];
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

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { searchTerm } = useSearch();

  // Toast State
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

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-6xl mx-auto space-y-10 pb-12"
    >


      {isInviteOpen && (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm animate-in fade-in slide-in-from-top-4 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#4d7cfe]">verified_user</span>
              <h3 className="font-bold text-slate-800 tracking-tight">Nueva Invitación</h3>
            </div>
            <button onClick={resetInviteForm} className="text-slate-400 hover:text-slate-600 transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {!generatedInvite ? (
            <form onSubmit={handleInvite} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Nombre completo</label>
                  <input 
                    required 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full h-10 px-3 rounded-sm border border-slate-200 bg-white text-sm text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Teléfono WhatsApp</label>
                  <input 
                    required 
                    pattern="[0-9]{8}"
                    value={newPhone} 
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="Ej. 88881111"
                    className="w-full h-10 px-3 rounded-sm border border-slate-200 bg-white text-sm text-slate-800 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Rol en la plataforma</label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                      <SelectTrigger className="w-full h-10 bg-white border-slate-200 text-slate-800 flex items-center justify-between">
                        <SelectValue />
                      </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800">
                      <SelectItem value="Admin">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">admin_panel_settings</span>
                          <span>Admin</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="Editor">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">manage_accounts</span>
                          <span>Editor</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newRole === 'Editor' && (
                  <div className="space-y-2 animate-in fade-in zoom-in-95">
                    <label className="text-xs font-semibold text-slate-700">Comité Asignado</label>
                    <DataTableFilter
                      title={newCommittee || "Selecciona un comité"}
                      options={committeesList.map(c => c.name)}
                      value={newCommittee ? [newCommittee] : []}
                      dropdownLabel="Comités disponibles"
                      hideClearButton
                      hideCountBadge
                      isCommitteeFilter
                      className="w-full bg-white justify-between h-10 border-slate-200"
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
                <Button type="button" variant="ghost" onClick={resetInviteForm} className="text-slate-500 hover:text-slate-800">
                  Cancelar
                </Button>
                <Button type="submit" className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold shadow-sm">
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
                <h4 className="font-bold text-slate-800">Enlace Generado Exitosamente</h4>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Envía este enlace único a <span className="font-semibold text-slate-800">{generatedInvite.name}</span>. Al ingresar, validará su número y creará su PIN de acceso de 4 dígitos.
                </p>
              </div>

              <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-sm p-3 flex items-center justify-between gap-3 mt-4">
                <code className="text-xs text-slate-800 font-mono truncate">{generatedInvite.inviteLink}</code>
                <button 
                  onClick={() => copyToClipboard(generatedInvite.inviteLink!)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 transition-colors shadow-sm"
                >
                  {copied ? <span className="material-symbols-outlined text-[16px] text-accent">check_circle</span> : <span className="material-symbols-outlined text-[16px] text-slate-400">content_copy</span>}
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
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
          <Button 
            onClick={() => setIsInviteOpen(true)}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm shadow-lg shadow-blue-500/10 h-10 px-5 font-bold transition-all active:scale-[0.97]"
          >
            <span className="material-symbols-outlined text-[18px] mr-2">person_add</span>
            Invitar Usuario
          </Button>
          <div className="flex gap-2 ml-auto">
            <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 font-medium">
              {users.length} usuarios
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Usuario</th>
                <th className="px-5 py-3">Teléfono</th>
                <th className="px-5 py-3">Rol y Acceso</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No se encontraron usuarios.
                  </td>
                </tr>
              ) : (
                users
                  .filter(u => !searchTerm || u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.phone.includes(searchTerm))
                  .map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-800">{user.name}</p>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                    {user.phone}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`font-bold border ${
                        user.role === 'Admin' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20'
                      }`}>
                        {user.role}
                      </Badge>
                      {user.committee && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                          <span className="material-symbols-outlined text-[16px] text-slate-400">corporate_fare</span>
                          {user.committee}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {user.status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 border border-accent/20 text-accent text-[11px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold" title="No ha ingresado su PIN">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                            <span className="material-symbols-outlined text-[18px]">more_vert</span>
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-800 min-w-[140px] p-1 rounded-sm shadow-md">
                        <DropdownMenuItem className="cursor-pointer hover:bg-slate-100 rounded-sm focus:bg-slate-100 focus:text-slate-800 transition-colors flex items-center gap-2" onClick={() => handleEditClick(user)}>
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                          Editar Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer hover:bg-slate-100 rounded-sm focus:bg-slate-100 focus:text-slate-800 transition-colors flex items-center gap-2" onClick={() => handleResetPin(user)}>
                          <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                          Resetear PIN
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-red hover:bg-red-50 hover:text-red rounded-sm focus:bg-red-50 focus:text-red transition-colors flex items-center gap-2" onClick={() => handleDeleteUser(user)}>
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
      </div>

      {/* Sheet de Edición */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent
          side="right"
          style={{ width: '450px', maxWidth: '95vw' }}
          className="bg-white text-slate-800 border-l border-slate-200 p-0 overflow-y-auto"
        >
          <div className="p-7 space-y-7">
            <div>
              <h2 className="font-bold text-slate-800 tracking-tight leading-none mb-2">Editar Perfil</h2>
              <p className="text-sm text-slate-500">Modifica los datos de acceso y el rol del usuario en la plataforma.</p>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Nombre completo</label>
                  <input 
                    required 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)}
                    className="w-full h-10 px-3 rounded-sm border border-slate-200 bg-white text-sm text-slate-800 focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Teléfono WhatsApp</label>
                  <input 
                    required 
                    pattern="[0-9]{8}"
                    value={newPhone} 
                    onChange={e => setNewPhone(e.target.value)}
                    className="w-full h-10 px-3 rounded-sm border border-slate-200 bg-white text-sm text-slate-800 font-mono focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe] outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Rol en la plataforma</label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                      <SelectTrigger className="w-full h-10 bg-white border-slate-200 text-slate-800 flex items-center justify-between">
                        <SelectValue />
                      </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800">
                      <SelectItem value="Admin">Admin (Acceso total)</SelectItem>
                      <SelectItem value="Editor">Editor (Coordinador de comité)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newRole === 'Editor' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700">Comité Asignado</label>
                    <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                      <SelectTrigger className="w-full h-10 bg-white border-slate-200 text-slate-800 flex items-center justify-between">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 text-slate-800">
                        {committeesList.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">PIN de Acceso Actual</label>
                  <div className="flex gap-2">
                    <input 
                      readOnly
                      type="password"
                      value={editingUser?.pin ? '****' : ''} 
                      className="flex-1 h-10 px-3 rounded-sm border border-slate-200 bg-slate-50 text-sm text-slate-500 font-mono outline-none"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => handleResetPin(editingUser!)}
                      className="h-10 text-[#4d7cfe] border-[#4d7cfe] hover:bg-[#4d7cfe]/10"
                    >
                      <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 italic">El PIN por defecto tras un reseteo es '1234'.</p>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 text-sm text-red bg-red-50 border border-red-200 rounded-sm">
                  {errorMsg}
                </div>
              )}

              <div className="pt-8 border-t border-slate-100 flex items-center justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsEditSheetOpen(false)} className="text-slate-500 hover:text-slate-800">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isUpdating} className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold shadow-sm px-6">
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
