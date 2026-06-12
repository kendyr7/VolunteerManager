'use client'

import { useState, useEffect, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Phone, MoreHorizontal, UserPlus, Mail, Briefcase, MapPin, GraduationCap, Heart, Calendar } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { DataTableFilter } from "@/components/DataTableFilter";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Toast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch } from "@/lib/search-context";

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
  committee: string;
  committee_id?: string;
  status?: string;
  age?: number;
};

const getCommitteeColor = (committee: string) => {
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción')) return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-600 border-purple-500/20';
  if (comm.includes('auxilios')) return 'bg-teal-500/15 text-teal-600 border-teal-500/20';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

export default function VolunteersPage() {
  const supabase = createClient();
  const { searchTerm } = useSearch();
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  
  const [volunteers, setVolunteers] = useState<VolunteerType[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [globalShifts, setGlobalShifts] = useState<Record<string, Record<string, string[]>>>({});
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

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

  // Form states
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStake, setNewStake] = useState('');
  const [newWard, setNewWard] = useState('');
  const [newCommitteeId, setNewCommitteeId] = useState('');
  
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [volunteerToArchive, setVolunteerToArchive] = useState<VolunteerType | null>(null);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);

  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('');

  const handleResetPin = async (vol: VolunteerType) => {
    setConfirmModal({
      isOpen: true,
      title: 'Resetear PIN',
      message: `¿Estás seguro de que deseas resetear el PIN de ${vol.name}? Se establecerá el PIN temporal '1234'.`,
      confirmText: 'Resetear PIN',
      type: 'primary',
      onConfirm: async () => {
        const { error } = await supabase
          .from('volunteers')
          .update({ pin_hash: '1234' }) 
          .eq('id', vol.id);

        if (error) {
          console.error("Error resetting PIN:", error);
          showToast("Error al resetear el PIN", "error");
        } else {
          showToast(`PIN de ${vol.name} reseteado a '1234'`, "success");
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleArchiveVolunteer = async () => {
    if (!volunteerToArchive) return;
    
    const newStatus = volunteerToArchive.status === 'archived' ? 'active' : 'archived';
    
    const { error } = await supabase
      .from('volunteers')
      .update({ status: newStatus })
      .eq('id', volunteerToArchive.id);

    if (error) {
      console.error("Error updating status:", error);
      showToast(`Error al ${newStatus === 'archived' ? 'archivar' : 'desarchivar'}`, "error");
    } else {
      showToast(`Voluntario ${newStatus === 'archived' ? 'archivado' : 'desarchivado'}`);
      await loadData();
    }
    
    setIsArchiveModalOpen(false);
    setVolunteerToArchive(null);
  };

  // Días reales del evento (Sep 10-26, sin domingos)
  const EVENT_DAYS = getActiveEventDays().map(date => ({
    key: formatDateShort(date),                   // clave única: 'jue 10'
    label: formatDateShort(date).split(' ')[0],    // solo el día: 'jue'
    dateNum: formatDateShort(date).split(' ')[1],  // solo el número: '10'
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(buildEmptyShifts);

  const loadData = async () => {
    // 1. Fetch current user role and committee for strict isolation
    const role = localStorage.getItem('mock_role') || 'Admin';
    const committee = localStorage.getItem('mock_committee') || '';

    // 2. Fetch volunteers with server-side filtering for Editors
    let query = supabase.from('volunteers').select('*, committees(name)');
    
    if (role === 'Editor' && committee) {
      // Find committee ID first
      const { data: commObj } = await supabase
        .from('committees')
        .select('id')
        .eq('name', committee)
        .maybeSingle();
      
      if (commObj) {
        query = query.eq('committee_id', commObj.id);
      }
    }

    const { data: volsData, error: volsError } = await query;
    
    if (volsError) {
      console.error("Error loading volunteers:", volsError);
    }

    // Fetch committees
    const { data: commsData, error: commsError } = await supabase
      .from('committees')
      .select('id, name');
    
    if (commsError) {
      console.error("Error loading committees:", commsError);
    } else if (commsData) {
      setCommitteesList(commsData);
    }

    // Fetch shifts
    const { data: shiftsData, error: shiftsError } = await supabase
      .from('shifts')
      .select('*');
    
    const sCounts: Record<string, number> = {};
    const gShifts: Record<string, Record<string, string[]>> = {};

    if (shiftsData) {
      shiftsData.forEach(s => {
        if (s.volunteer_id) {
          sCounts[s.volunteer_id] = (sCounts[s.volunteer_id] || 0) + 1;
          
          if (!gShifts[s.volunteer_id]) {
            gShifts[s.volunteer_id] = Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
          }
          if (!gShifts[s.volunteer_id][s.day_key]) {
            gShifts[s.volunteer_id][s.day_key] = [];
          }
          if (!gShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
            gShifts[s.volunteer_id][s.day_key].push(s.shift_key);
          }
        }
      });
    }

    setGlobalShifts(gShifts);

    if (volsData) {
      const mapped = volsData.map((v: any) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        stake: v.stake || '',
        ward: v.neighborhood || '',
        phone: v.phone || '',
        shifts: sCounts[v.id] || 0,
        reliability: v.reliability_score || 100,
        committee: v.committees?.name || 'Sin comité',
        committee_id: v.committee_id,
        status: v.status || 'active',
        age: v.age
      }));
      setVolunteers(mapped);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee) setCurrentCommittee(committee);

    loadData().then(() => setLoading(false));
  }, []);

  const toggleShift = (day: string, turno: string) => {
    if (!isEditingShifts) return;
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

  const handleSaveShifts = async () => {
    setIsEditingShifts(false);
    if (!editingVolunteer) return;

    // Delete existing shifts for this volunteer
    const { error: delErr } = await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', editingVolunteer.id);

    if (delErr) {
      console.error("Error deleting shifts:", delErr);
      return;
    }

    // Insert new shift rows
    const insertRows = [];
    for (const [dayKey, shiftKeys] of Object.entries(shiftsByDay)) {
      for (const shiftKey of shiftKeys) {
        insertRows.push({
          volunteer_id: editingVolunteer.id,
          day_key: dayKey,
          shift_key: shiftKey
        });
      }
    }

    if (insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from('shifts')
        .insert(insertRows);

      if (insErr) {
        console.error("Error inserting shifts:", insErr);
        showToast("Error al guardar turnos", "error");
        return;
      }
    }

    setSaved(true);
    showToast("Turnos actualizados");
    setTimeout(() => setSaved(false), 2500);
    await loadData();
  };

  const handleAddVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = newName.trim().split(/\s+/);
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || '';

    const { error } = await supabase
      .from('volunteers')
      .insert([
        {
          first_name,
          last_name,
          phone: newPhone,
          committee_id: newCommitteeId || null,
        }
      ]);

    if (error) {
      console.error("Error adding volunteer:", error);
      showToast("Error al añadir voluntario", "error");
      return;
    }

    showToast("Voluntario añadido");

    setNewName('');
    setNewPhone('');
    setNewStake('');
    setNewWard('');
    setNewCommitteeId('');
    setIsAddSheetOpen(false);
    
    await loadData();
  };

  const stakes: string[] = [];
  const wards: string[] = [];
  const committees = committeesList.map(c => c.name);

  const roleFilteredVolunteers = volunteers.filter(v => {
    if (currentRole === 'Admin') return true;
    if (currentRole === 'Editor') return v.committee === currentCommittee;
    if (currentRole === 'Lector') return false; // Lector doesn't see directory
    return false;
  });
  const filteredVolunteers = useMemo(() => {
    return volunteers.filter(v => {
      // 1. Role-based isolation: Editors only see their committee
      if (currentRole === 'Editor' && v.committee !== currentCommittee) return false;
      if (currentRole === 'Lector') return false;

      // 2. Filter by archived status
      const matchesStatus = showArchived ? v.status === 'archived' : v.status !== 'archived';
      if (!matchesStatus) return false;

      // 3. User search and dynamic filters
      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            v.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            v.ward.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

      return matchesSearch && matchesCommittee && matchesStake && matchesWard;
    });
  }, [volunteers, searchTerm, selectedCommittees, selectedStakes, selectedWards, showArchived, currentRole, currentCommittee]);

  const handleEditClick = (vol: VolunteerType) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);
    
    const volShifts = globalShifts[vol.id] || Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
    setShiftsByDay(volShifts);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4d7cfe]"></div>
      </div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-6xl mx-auto pb-12"
    >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-slate-200/60">
        <div className="space-y-1.5">
          <p className="text-base font-medium text-slate-400">Gestiona los miembros del equipo y visualiza su desempeño.</p>
        </div>
        <Button 
          onClick={() => setIsAddSheetOpen(true)}
          className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm shadow-lg shadow-blue-500/10 h-10 px-5 font-bold transition-all active:scale-[0.97]"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Añadir Voluntario
        </Button>
      </motion.div>

      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={cn(
                "flex items-center gap-2 px-4 h-10 rounded-sm text-sm font-bold transition-all active:scale-[0.97] border",
                showArchived 
                  ? "bg-[#fe4d97]/10 text-[#fe4d97] border-[#fe4d97]/20" 
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
              )}
            >
              <span className="material-symbols-outlined text-[20px]">{showArchived ? 'inventory_2' : 'archive'}</span>
              {showArchived ? 'Ver Activos' : 'Ver Archivados'}
            </button>

            <div className="w-px h-6 bg-slate-200 mx-2 hidden sm:block" />

            {currentRole === 'Admin' && (
              <DataTableFilter
                title="Comité"
                options={committees}
                value={selectedCommittees}
                onChange={setSelectedCommittees}
              />
            )}
            <DataTableFilter
              title="Estaca"
              options={stakes}
              value={selectedStakes}
              onChange={setSelectedStakes}
            />
            <DataTableFilter
              title="Barrio"
              options={wards}
              value={selectedWards}
              onChange={setSelectedWards}
            />
            {(selectedCommittees.length > 0 || selectedStakes.length > 0 || selectedWards.length > 0) && (
              <Button 
                variant="ghost" 
                onClick={() => {
                  setSelectedCommittees([]);
                  setSelectedStakes([]);
                  setSelectedWards([]);
                }}
                className="h-10 px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-sm"
              >
                Limpiar todo
              </Button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto bg-white">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-medium text-slate-500 pl-8">Nombre y Apellido</TableHead>
                <TableHead className="font-medium text-slate-500 text-center">Barrio</TableHead>
                <TableHead className="font-medium text-slate-500 text-center">Estaca</TableHead>
                <TableHead className="font-medium text-slate-500 text-center">Comité</TableHead>
                <TableHead className="font-medium text-slate-500 text-center">Turnos</TableHead>
                <TableHead className="font-medium text-slate-500 text-center">Confiabilidad</TableHead>
                <TableHead className="font-medium text-slate-500 text-center">Contacto</TableHead>
                <TableHead className="font-medium text-slate-500 text-center w-12 pr-8">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredVolunteers.length > 0 ? (
                  filteredVolunteers.map((vol) => (
                    <motion.tr 
                      key={vol.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <TableCell className="font-bold text-slate-800 pl-8">{vol.name}</TableCell>
                      <TableCell className="text-slate-800 text-center">{vol.ward}</TableCell>
                      <TableCell className="text-slate-500 text-center">{vol.stake}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn("font-bold px-2.5 py-0.5", getCommitteeColor(vol.committee))}>
                          {vol.committee}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-800 border-slate-200 font-medium">
                          {vol.shifts} {vol.shifts === 1 ? 'turno' : 'turnos'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {vol.shifts === 0 ? (
                          <span className="text-sm text-slate-500">N/A</span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${vol.reliability >= 80 ? 'bg-accent' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'}`} />
                            <span className="text-sm font-bold text-slate-700 tabular-nums">{vol.reliability}%</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#4d7cfe] hover:bg-slate-100 hover:text-[#4d7cfe] transition-all active:scale-90" title="WhatsApp">
                            <span className="material-symbols-outlined text-[20px]">message</span>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#4d7cfe] hover:bg-slate-100 hover:text-[#4d7cfe] transition-all active:scale-90" title="Llamar">
                            <span className="material-symbols-outlined text-[20px]">call</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center pr-8">
                        <DropdownMenu>
                          <DropdownMenuTrigger 
                            render={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-0 transition-all active:scale-90">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-800 min-w-[140px] p-1 rounded-sm shadow-md">
                            <DropdownMenuItem className="cursor-pointer hover:bg-slate-100 rounded-sm focus:bg-slate-100 focus:text-slate-800 transition-colors flex items-center gap-2" onClick={() => handleEditClick(vol)}>
                              Editar Perfil
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer hover:bg-slate-100 rounded-sm focus:bg-slate-100 focus:text-slate-800 transition-colors flex items-center gap-2" onClick={() => handleResetPin(vol)}>
                              <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                              Resetear PIN
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="cursor-pointer text-red hover:bg-red-50 hover:text-red rounded-sm focus:bg-red-50 focus:text-red transition-colors flex items-center gap-2"
                              onClick={() => {
                                setVolunteerToArchive(vol);
                                setIsArchiveModalOpen(true);
                              }}
                            >
                              <span className="material-symbols-outlined text-[18px]">{vol.status === 'archived' ? 'unarchive' : 'archive'}</span>
                              {vol.status === 'archived' ? 'Desarchivar' : 'Archivar'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                      No se encontraron voluntarios con esos términos.
                    </TableCell>
                  </TableRow>
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {/* Editor Lateral */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="right"
          style={{ width: '620px', maxWidth: '95vw' }}
          className="bg-white text-slate-800 border-l border-slate-200 p-0 overflow-y-auto"
        >
          {editingVolunteer && (
            <div className="p-0 space-y-0">
              {/* Identity Header (High End) */}
              <div className="bg-slate-900 px-8 py-10 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-[#4d7cfe] rounded-2xl flex items-center justify-center shadow-lg shadow-[#4d7cfe]/30">
                      <span className="material-symbols-outlined text-[24px]">person</span>
                    </div>
                  </div>
                  <h2 className="tracking-tight text-white mb-2">{editingVolunteer.name}</h2>
                  <div className="flex items-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-slate-400">corporate_fare</span>
                      <span className="text-sm font-medium text-slate-300">{editingVolunteer.committee}</span>
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-slate-400">call</span>
                      <span className="text-sm font-medium text-slate-300">{editingVolunteer.phone}</span>
                    </div>
                  </div>
                </div>
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#4d7cfe]/10 rounded-full blur-[80px] -mr-32 -mt-32" />
              </div>

              <div className="p-8 space-y-10">
                {/* Metadata Grid */}
                <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border border-slate-200 rounded-3xl">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Barrio</p>
                    <span className="text-sm font-bold text-slate-800 truncate block" title={editingVolunteer.ward}>{editingVolunteer.ward || '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estaca</p>
                    <span className="text-sm font-bold text-slate-800 truncate block" title={editingVolunteer.stake}>{editingVolunteer.stake || '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edad</p>
                    <span className="text-sm font-bold text-slate-800">{editingVolunteer.age ? `${editingVolunteer.age} años` : '—'}</span>
                  </div>
                </div>

                {/* Resumen de Turnos Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-900 leading-none">Cronograma de Servicio</h3>
                      <p className="text-sm font-medium text-slate-400">Gestión de disponibilidad y asignaciones.</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {saved && <span className="text-[11px] text-accent font-bold animate-pulse">✓ Guardado</span>}
                      {isEditingShifts ? (
                        <Button onClick={handleSaveShifts} className="h-10 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl shadow-lg shadow-blue-500/15 font-bold transition-all active:scale-[0.97]">
                          Confirmar Cambios
                        </Button>
                      ) : (
                        <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} variant="outline" className="h-10 border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold transition-all active:scale-[0.97]">
                          Ajustar Turnos
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Stats Bento */}
                  {(() => {
                    const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                    const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
                    return (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none mb-1">{totalTurnos}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Turnos</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none mb-1">{diasCubiertos}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Días</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm border-b-2 border-b-accent">
                          <p className="text-2xl font-bold text-accent tabular-nums leading-none mb-1">{editingVolunteer.reliability}%</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Confiab.</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Timeline with Shells */}
                  <div className="space-y-4">
                    {EVENT_DAYS.map((d, idx) => {
                      const dayShifts = shiftsByDay[d.key] || [];
                      const hasShifts = dayShifts.length > 0;
                      
                      return (
                        <motion.div 
                          key={d.key}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + idx * 0.03 }}
                          className={`group border rounded-3xl overflow-hidden transition-all duration-300 ${
                            hasShifts || isEditingShifts 
                              ? 'border-slate-200 bg-white shadow-sm' 
                              : 'border-slate-100 bg-slate-50/50 opacity-40 grayscale-[0.5]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-stretch">
                            {/* Date Panel */}
                            <div className={`shrink-0 sm:w-20 flex sm:flex-col items-center justify-center py-4 px-4 border-b sm:border-b-0 sm:border-r transition-colors ${
                              hasShifts ? 'bg-[#4d7cfe]/5 border-[#4d7cfe]/10' : 'bg-slate-50 border-slate-100'
                            }`}>
                              <p className={`text-[10px] font-bold uppercase tracking-widest leading-none mb-1 ${hasShifts ? 'text-[#4d7cfe]' : 'text-slate-400'}`}>
                                {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                              </p>
                              <p className="text-2xl font-bold text-slate-900 leading-tight">{d.dateNum}</p>
                            </div>

                            {/* Shifts Grid (The Shells) */}
                            <div className="flex-1 p-4 grid grid-cols-4 gap-2">
                              {['T1', 'T2', 'T3', 'T4'].map((t) => {
                                const active = dayShifts.includes(t);
                                const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];
                                
                                return (
                                  <button
                                    key={t}
                                    disabled={!isEditingShifts}
                                    onClick={() => toggleShift(d.key, t)}
                                    className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all ${
                                      active 
                                        ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-md shadow-blue-500/20' 
                                        : 'bg-white border-slate-100 text-slate-300 hover:border-slate-300'
                                    } ${
                                      isEditingShifts ? 'cursor-pointer active:scale-[0.92]' : 'cursor-default'
                                    }`}
                                  >
                                    <span className="text-xs font-bold">{t}</span>
                                    <span className={`text-[8px] font-bold uppercase tracking-tighter mt-0.5 ${active ? 'text-white/80' : 'text-slate-300'}`}>
                                      {shiftInfo?.time.split(' - ')[0]}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Editor Lateral (Añadir) */}
      <Sheet open={isAddSheetOpen} onOpenChange={setIsAddSheetOpen}>
        <SheetContent
          side="right"
          style={{ width: '500px', maxWidth: '95vw' }}
          className="bg-white text-slate-800 border-l border-slate-200 overflow-hidden"
        >
          <SheetHeader>
            <SheetTitle className="text-xl font-bold text-slate-800">Añadir Voluntario</SheetTitle>
          </SheetHeader>
          <form 
            id="add-volunteer-form"
            onSubmit={handleAddVolunteer}
            className="flex-1 overflow-y-auto px-6 space-y-6 pb-24"
          >
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-800">Nombre y Apellido</label>
              <Input 
                required 
                minLength={3} 
                className="h-10 bg-slate-50 border-slate-200 focus:ring-gold-faint" 
                placeholder="Ej. Juan Pérez" 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">Asegúrate de incluir ambos apellidos si es posible.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-800">Celular</label>
              <Input 
                required 
                type="tel" 
                pattern="[0-9]{8}" 
                maxLength={8}
                onKeyPress={(e) => {
                  if (!/[0-9]/.test(e.key)) e.preventDefault();
                }}
                className="h-10 bg-slate-50 border-slate-200 focus:ring-gold-faint" 
                placeholder="Ej. 88888888" 
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">Solo 8 dígitos, sin código de país o espacios.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-800">Estaca</label>
              <Input 
                required 
                className="h-10 bg-slate-50 border-slate-200 focus:ring-gold-faint" 
                placeholder="Ej. Managua Sur" 
                value={newStake}
                onChange={(e) => setNewStake(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-800">Barrio</label>
              <Input 
                required 
                className="h-10 bg-slate-50 border-slate-200 focus:ring-gold-faint" 
                placeholder="Ej. Barrio 1" 
                value={newWard}
                onChange={(e) => setNewWard(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-800">Comité</label>
              <Select required onValueChange={(val) => setNewCommitteeId(val || '')} value={newCommitteeId}>
                <SelectTrigger className="h-10 bg-slate-50 border-slate-200 focus:ring-gold-faint">
                  <SelectValue placeholder="Selecciona un comité" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800">
                  {committeesList.map((com) => (
                    <SelectItem 
                      key={com.id} 
                      value={com.id} 
                      className="cursor-pointer rounded-sm hover:bg-slate-50 focus:bg-slate-50 focus:text-[#4d7cfe] data-[state=checked]:bg-[#4d7cfe]/10 data-[state=checked]:text-[#4d7cfe] transition-colors"
                    >
                      {com.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>

          {/* Footer fijo en la parte inferior */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100" onClick={() => setIsAddSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="add-volunteer-form" className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white">
              Guardar Voluntario
            </Button>
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
    </motion.div>
  );
}
