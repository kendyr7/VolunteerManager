'use client'

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateWaMeLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

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
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Invite Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<Role>('Editor');
  const [newCommittee, setNewCommittee] = useState<string>(COMMITTEES[0]);
  const [generatedInvite, setGeneratedInvite] = useState<PlatformUser | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*, committees(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error loading users:", error);
    } else if (data) {
      setUsers(data.map(p => ({
        id: p.id,
        name: p.full_name,
        phone: p.phone || '',
        role: p.role as Role,
        committee: p.committees?.name,
        status: p.pin ? 'active' : 'pending',
        pin: p.pin || ''
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
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
      loadUsers();
    }
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
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-slate-200/60">
        <div className="space-y-1.5">
          <p className="text-base font-medium text-slate-500">Administra el equipo de gestión y sus niveles de privilegio.</p>
        </div>
        <Button 
          onClick={() => setIsInviteOpen(true)}
          className="bg-[#0084d1] hover:bg-[#006eb3] text-white rounded-sm shadow-lg shadow-blue-500/10 h-10 px-5 font-bold transition-all active:scale-[0.97]"
        >
          <span className="material-symbols-outlined text-[18px] mr-2">person_add</span>
          Invitar Usuario
        </Button>
      </motion.div>

      {isInviteOpen && (

        <div className="bg-white border border-slate-200 rounded-sm shadow-sm animate-in fade-in slide-in-from-top-4 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#0084d1]">verified_user</span>
              <h3 className="text-lg font-bold text-slate-800 tracking-tight">Nueva Invitación</h3>
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
                    <SelectTrigger className="w-full h-10 bg-white border-slate-200 text-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800">
                      <SelectItem value="Admin">Admin (Acceso total)</SelectItem>
                      <SelectItem value="Editor">Editor (Coordinador de comité)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newRole === 'Editor' && (
                  <div className="space-y-2 animate-in fade-in zoom-in-95">
                    <label className="text-xs font-semibold text-slate-700">Comité Asignado</label>
                    <Select value={newCommittee} onValueChange={(v) => v && setNewCommittee(v)}>
                      <SelectTrigger className="w-full h-10 bg-white border-slate-200 text-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 text-slate-800">
                        {COMMITTEES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <Button type="submit" className="bg-[#0084d1] hover:bg-[#006eb3] text-white font-semibold shadow-sm">
                  Generar Enlace
                </Button>
              </div>
            </form>
          ) : (
            <div className="p-8 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-2">
                <span className="material-symbols-outlined text-[24px]">check_circle</span>
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-800">Enlace Generado Exitosamente</h4>
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
                  {copied ? <span className="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span> : <span className="material-symbols-outlined text-[16px] text-slate-400">content_copy</span>}
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
          <div className="relative w-full max-w-xs">
            <span className="material-symbols-outlined text-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input 
              placeholder="Buscar usuarios..." 
              className="w-full h-9 pl-9 pr-4 rounded-sm bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2">
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
                <th className="px-5 py-3 text-right">Acciones</th>
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
                users.map(user => (
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
                        user.role === 'Admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-[#0084d1] border-blue-200'
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
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-accent text-[11px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold" title="No ha ingresado su PIN">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                      <span className="material-symbols-outlined text-[18px]">more_vert</span>
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
