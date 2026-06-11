'use client'

import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MessageCircle, Phone, MoreHorizontal, UserPlus, Mail, Briefcase, MapPin, GraduationCap, Heart, Calendar } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { DataTableFilter } from "@/components/DataTableFilter";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

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
};

export default function VolunteersPage() {
  const supabase = createClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  
  const [volunteers, setVolunteers] = useState<VolunteerType[]>([]);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);
  const [globalShifts, setGlobalShifts] = useState<Record<string, Record<string, string[]>>>({});
  const [loading, setLoading] = useState(true);

  // Form states
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStake, setNewStake] = useState('');
  const [newWard, setNewWard] = useState('');
  const [newCommitteeId, setNewCommitteeId] = useState('');
  
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);

  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('');

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
    // Fetch volunteers
    const { data: volsData, error: volsError } = await supabase
      .from('volunteers')
      .select('*, committees(name)');
    
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
        stake: '',
        ward: '',
        phone: v.phone || '',
        shifts: sCounts[v.id] || 0,
        reliability: 100,
        committee: v.committees?.name || 'Sin comité',
        committee_id: v.committee_id
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
        return;
      }
    }

    setSaved(true);
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
      alert("Error al añadir voluntario: " + error.message);
      return;
    }

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

  const filteredVolunteers = roleFilteredVolunteers.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          v.stake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          v.ward.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(v.committee);
    const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(v.stake);
    const matchesWard = selectedWards.length === 0 || selectedWards.includes(v.ward);

    return matchesSearch && matchesCommittee && matchesStake && matchesWard;
  });

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0084d1]"></div>
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
          <div className="flex items-center gap-3">
            <h1 className="text-4xl tracking-tight text-slate-900 leading-none">
              Voluntarios
            </h1>
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold border-none text-[10px] px-2.5 h-5 shadow-sm">
              {filteredVolunteers.length} registrados
            </Badge>
          </div>
          <p className="text-base font-medium text-slate-400">Gestiona los miembros del equipo y visualiza su desempeño.</p>
        </div>
        <Button 
          onClick={() => setIsAddSheetOpen(true)}
          className="bg-[#0084d1] hover:bg-[#006eb3] text-white rounded-xl shadow-lg shadow-blue-500/10 h-10 px-5 font-bold transition-all active:scale-[0.97]"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Añadir Voluntario
        </Button>
      </motion.div>

      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <Input 
              placeholder="Buscar por nombre, estaca o barrio..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-white input-base text-slate-800 border-slate-200 focus:ring-2 focus:ring-gold-faint"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
                className="h-10 px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
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
                        <Badge variant="outline" className="bg-white text-slate-500 border-slate-200 font-medium">
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
                            <div className={`w-1.5 h-1.5 rounded-full ${vol.reliability >= 80 ? 'bg-emerald-500' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'}`} />
                            <span className="text-sm font-bold text-slate-700 tabular-nums">{vol.reliability}%</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#0084d1] hover:bg-slate-100 hover:text-[#0084d1] transition-all active:scale-90" title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#0084d1] hover:bg-slate-100 hover:text-[#0084d1] transition-all active:scale-90" title="Llamar">
                            <Phone className="h-4 w-4" />
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
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-800 min-w-[140px] p-1 rounded-xl shadow-md">
                            <DropdownMenuItem className="cursor-pointer hover:bg-slate-100 rounded-lg focus:bg-slate-100 focus:text-slate-800 transition-colors" onClick={() => handleEditClick(vol)}>
                              Editar Perfil
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg focus:bg-red-50 focus:text-red-700 transition-colors">
                              Archivar
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
            <div className="p-7 space-y-7">
              {/* Profile Card */}
              <div className="flex flex-col bg-slate-50 p-6 rounded-2xl border border-slate-200 gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight leading-tight mb-3">
                      {editingVolunteer.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#0084d1] text-white border-none text-[10px] px-2 uppercase font-bold tracking-wide">
                        Voluntario
                      </Badge>
                      <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px] px-2 font-medium bg-white">
                        Comité: {editingVolunteer.committee}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="h-[1px] w-full bg-slate-200/60" />

                {/* Datos de Perfil */}
                <div>
                  <h4 className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest mb-4">Datos Personales</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Celular</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{editingVolunteer.phone}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Edad</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">27</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Barrio</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{editingVolunteer.ward}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Estaca</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{editingVolunteer.stake}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen de Turnos */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <h4 className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest">Resumen de Turnos</h4>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-[#0084d1] border border-[#006eb3]" />
                        <span className="text-[10px] text-slate-500 font-bold">Seleccionado</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-slate-100 border border-slate-200" />
                        <span className="text-[10px] text-slate-500 font-bold">Sin asignar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {saved && (
                      <span className="text-[11px] text-teal-600 font-bold animate-pulse shrink-0">✓ Guardado</span>
                    )}
                    {isEditingShifts ? (
                      <Button onClick={handleSaveShifts} className="h-9 w-full sm:w-auto bg-[#0084d1] hover:bg-[#006eb3] text-white text-xs px-5 rounded-xl font-bold shadow-sm">
                        Guardar Cambios
                      </Button>
                    ) : (
                      <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} className="h-9 w-full sm:w-auto bg-[#0084d1] hover:bg-[#006eb3] text-white text-xs px-5 rounded-xl font-bold shadow-sm">
                        Editar Turnos
                      </Button>
                    )}
                  </div>
                </div>
                {isEditingShifts && (
                  <p className="text-[11px] text-slate-500 font-medium mb-5">Toca un turno para activarlo o desactivarlo. Asegúrate de guardar tus cambios.</p>
                )}

                {/* Stats rápidas */}
                {(() => {
                  const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                  const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
                  return (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-slate-800 tabular-nums">{totalTurnos}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Turnos</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-slate-800 tabular-nums">{diasCubiertos}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Días</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                        <p className={`text-3xl font-bold tabular-nums ${editingVolunteer.reliability >= 80 ? 'text-teal-600' : 'text-amber-500'}`}>
                          {editingVolunteer.reliability}%
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Confiab.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline por día */}
                <div className="space-y-3">
                  {(isEditingShifts ? EVENT_DAYS : EVENT_DAYS.filter(d => (shiftsByDay[d.key]?.length ?? 0) > 0)).map((d) => (
                    <div key={d.key} className={`flex flex-col sm:flex-row sm:items-stretch border rounded-xl overflow-hidden transition-colors shadow-sm ${
                      isEditingShifts ? 'border-slate-200 hover:border-[#0084d1]/40 bg-white' : 'border-slate-200 bg-white opacity-80'
                    }`}>
                      {/* Left: white date panel */}
                      <div className="shrink-0 sm:w-20 flex sm:flex-col items-center justify-center bg-white py-3 px-4 border-b sm:border-b-0 sm:border-r border-slate-200 gap-2 sm:gap-0">
                        <p className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest leading-none">
                          {d.label.charAt(0).toUpperCase() + d.label.slice(1, 3)}
                        </p>
                        <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight sm:mt-0.5">{d.dateNum}</p>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none hidden sm:block">Sept</p>
                      </div>

                      {/* Right: shift buttons */}
                      <div className="flex items-center justify-between gap-2 flex-1 px-4 py-4 bg-slate-50">
                        {['T1', 'T2', 'T3', 'T4'].map((t) => {
                          const active = (shiftsByDay[d.key] ?? []).includes(t);
                          const shiftInfo = SHIFT_TIMES[parseInt(t[1]) - 1];
                          return (
                            <button
                              key={t}
                              onClick={() => toggleShift(d.key, t)}
                              className={`flex-1 inline-flex flex-col items-center justify-center rounded-xl py-2 px-1 border transition-all ${
                                active
                                  ? 'bg-[#0084d1] border-[#006eb3] text-white shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                              } ${
                                isEditingShifts
                                  ? 'cursor-pointer hover:scale-[1.02] active:scale-95'
                                  : 'cursor-default'
                              }`}
                            >
                              <span className="text-sm font-bold">{t}</span>
                              <span className={`text-[8px] font-bold tracking-tight mt-0.5 whitespace-nowrap ${active ? 'text-white/80' : 'text-slate-400'}`}>
                                {shiftInfo?.time}
                              </span>
                            </button>
                          );
                        })}
                        <div className={`shrink-0 w-2 h-2 rounded-full ml-1 ${
                          (shiftsByDay[d.key]?.length ?? 0) > 0 ? 'bg-teal-400' : 'bg-transparent'
                        }`} />
                      </div>
                    </div>
                  ))}
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
                      className="cursor-pointer rounded-lg hover:bg-slate-50 focus:bg-slate-50 focus:text-[#0084d1] data-[state=checked]:bg-[#0084d1]/10 data-[state=checked]:text-[#0084d1] transition-colors"
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
            <Button type="submit" form="add-volunteer-form" className="bg-[#0084d1] hover:bg-[#006eb3] text-white">
              Guardar Voluntario
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
