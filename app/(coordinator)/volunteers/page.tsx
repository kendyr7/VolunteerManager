'use client'

import { useState } from "react";
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

// Interfaz para tipo
type VolunteerType = {
  id: number;
  name: string;
  stake: string;
  ward: string;
  phone: string;
  shifts: number;
  reliability: number;
  committee: string;
};

export default function VolunteersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [saved, setSaved] = useState(false);

  // Días reales del evento (Sep 10-26, sin domingos)
  const EVENT_DAYS = getActiveEventDays().map(date => ({
    key: formatDateShort(date),                   // clave única: 'jue 10'
    label: formatDateShort(date).split(' ')[0],    // solo el día: 'jue'
    dateNum: formatDateShort(date).split(' ')[1],  // solo el número: '10'
  }));

  // Estado de turnos por día
  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(buildEmptyShifts);

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

  const handleSaveShifts = () => {
    setIsEditingShifts(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const names = ['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'];
  const lastNames = ['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'];
  const stakes = ['Managua Sur', 'Managua Este', 'Managua Norte', 'Bello Horizonte', 'Las Colinas'];
  const wards = ['Barrio 1', 'Barrio 2', 'Barrio 3', 'Barrio 4', 'Barrio 5'];
  const committees = ['Historia', 'Seguridad', 'Guía', 'Traducción', 'Transporte', 'Primeros Auxilios'];

  const volunteers: VolunteerType[] = Array.from({ length: 82 }).map((_, i) => ({
    id: i + 1,
    name: `${names[i % names.length]} ${lastNames[(i * 7) % lastNames.length]}`,
    stake: stakes[i % stakes.length],
    ward: wards[(i * 3) % wards.length],
    phone: `8888 ${1000 + i}`,
    shifts: i % 5 === 0 ? 0 : (i % 3) + 1,
    reliability: i % 7 === 0 ? 50 : 100,
    committee: committees[i % committees.length]
  }));

  const filteredVolunteers = volunteers.filter(v => {
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
    // Inicializar turnos con todas las fechas reales del evento
    const initial = buildEmptyShifts();
    // Simular algunos turnos según el número de shifts del voluntario
    const keys = Object.keys(initial);
    if (vol.shifts > 0 && keys[0]) initial[keys[0]] = ['T4'];
    if (vol.shifts > 1 && keys[1]) initial[keys[1]] = ['T2', 'T4'];
    if (vol.shifts > 2 && keys[2]) initial[keys[2]] = ['T3'];
    setShiftsByDay(initial);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-display-md text-text tracking-tight">Directorio de Voluntarios</h2>
            <Badge variant="secondary" className="bg-dark3 text-text font-medium text-sm rounded-full px-2.5">
              {filteredVolunteers.length} {filteredVolunteers.length === 1 ? 'voluntario' : 'voluntarios'}
            </Badge>
          </div>
          <p className="text-body-md text-muted">Gestiona los miembros de tu comité y visualiza su información clave.</p>
        </div>
        <Button 
          onClick={() => setIsAddSheetOpen(true)}
          className="btn-base bg-primary-cta hover:bg-primary-active text-canvas rounded-xl shadow-sm h-10 px-4"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Añadir Voluntario
        </Button>
      </div>

      <div className="card-premium overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-5 border-b border-border bg-dark2 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <Input 
              placeholder="Buscar por nombre, estaca o barrio..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-dark input-base text-text border-border focus:ring-2 focus:ring-gold-faint"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DataTableFilter
              title="Comité"
              options={committees}
              value={selectedCommittees}
              onChange={setSelectedCommittees}
            />
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
                className="h-10 px-3 text-muted hover:text-text hover:bg-dark3 rounded-xl"
              >
                Limpiar todo
              </Button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto bg-dark">
          <Table>
            <TableHeader className="bg-dark2 border-b border-border">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-medium text-muted pl-8">Nombre y Apellido</TableHead>
                <TableHead className="font-medium text-muted text-center">Barrio</TableHead>
                <TableHead className="font-medium text-muted text-center">Estaca</TableHead>
                <TableHead className="font-medium text-muted text-center">Comité</TableHead>
                <TableHead className="font-medium text-muted text-center">Turnos</TableHead>
                <TableHead className="font-medium text-muted text-center">Confiabilidad</TableHead>
                <TableHead className="font-medium text-muted text-center">Contacto</TableHead>
                <TableHead className="font-medium text-muted text-center w-12 pr-8">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVolunteers.length > 0 ? (
                filteredVolunteers.map((vol) => (
                  <TableRow key={vol.id} className="border-border hover:bg-dark3 transition-colors">
                    <TableCell className="font-medium text-text pl-8">{vol.name}</TableCell>
                    <TableCell className="text-text text-center">{vol.ward}</TableCell>
                    <TableCell className="text-muted text-center">{vol.stake}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-dark text-muted border-border font-medium">
                        {vol.committee}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="bg-dark3 text-text border-border font-medium">
                        {vol.shifts} {vol.shifts === 1 ? 'turno' : 'turnos'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {vol.shifts === 0 ? (
                        <span className="text-sm text-muted">N/A</span>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${vol.reliability >= 80 ? 'bg-success' : 'bg-warning'}`} />
                          <span className="text-sm font-medium text-text">{vol.reliability}%</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gold hover:bg-dark3 hover:text-gold" title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gold hover:bg-dark3 hover:text-gold" title="Llamar">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-center pr-8">
                      <DropdownMenu>
                        <DropdownMenuTrigger 
                          render={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted hover:bg-dark3 hover:text-text focus-visible:ring-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="bg-dark border-border text-text min-w-[140px] p-1 rounded-xl shadow-md">
                          <DropdownMenuItem className="cursor-pointer hover:bg-dark3 rounded-lg focus:bg-dark3 focus:text-text" onClick={() => handleEditClick(vol)}>
                            Editar Perfil
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-error hover:bg-error/10 hover:text-error rounded-lg focus:bg-error/10 focus:text-error">
                            Archivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted">
                    No se encontraron voluntarios con esos términos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Editor Lateral */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="right"
          style={{ width: '620px', maxWidth: '95vw' }}
          className="bg-dark text-text border-l border-border p-0 overflow-y-auto"
        >
          {editingVolunteer && (
            <div className="p-7 space-y-7">
              {/* Profile Header */}
              <div className="flex flex-col justify-center bg-dark2 p-5 rounded-2xl border border-border">
                <h3 className="text-2xl font-bold text-text tracking-tight leading-tight mb-3">
                  {editingVolunteer.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary-cta text-canvas border-none text-[10px] px-2 uppercase font-bold tracking-wide">
                    Voluntario
                  </Badge>
                  <Badge variant="outline" className="text-muted border-border text-[10px] px-2 font-medium bg-dark">
                    Comité: {editingVolunteer.committee}
                  </Badge>
                </div>
              </div>

              {/* Datos de Perfil — 4 columnas aprovechando el ancho */}
              <div>
                <h4 className="text-xs font-bold text-primary-cta uppercase tracking-widest mb-4">Datos de Perfil</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Phone className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Celular</span>
                    </div>
                    <p className="text-sm font-semibold text-text">{editingVolunteer.phone}</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Calendar className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Edad</span>
                    </div>
                    <p className="text-sm font-semibold text-text">27</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Barrio</span>
                    </div>
                    <p className="text-sm font-semibold text-text">{editingVolunteer.ward}</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Estaca</span>
                    </div>
                    <p className="text-sm font-semibold text-text">{editingVolunteer.stake}</p>
                  </div>
                </div>
              </div>

              <div className="h-[1px] w-full bg-border" />

              {/* Resumen de Turnos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <h4 className="text-xs font-bold text-primary-cta uppercase tracking-widest">Resumen de Turnos</h4>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-sky-600 border border-sky-500" />
                        <span className="text-[10px] text-muted">Seleccionado</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded bg-dark border border-border" />
                        <span className="text-[10px] text-muted">Sin asignar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {saved && (
                      <span className="text-[10px] text-success font-semibold animate-pulse">✓ Guardado</span>
                    )}
                    {isEditingShifts ? (
                      <Button onClick={handleSaveShifts} className="h-8 bg-success hover:bg-success/80 text-canvas text-xs px-3 rounded-lg shrink-0">
                        Guardar
                      </Button>
                    ) : (
                      <Button onClick={() => { setIsEditingShifts(true); setSaved(false); }} className="h-8 bg-primary-cta hover:bg-primary-active text-canvas text-xs px-3 rounded-lg shrink-0">
                        Editar Turnos
                      </Button>
                    )}
                  </div>
                </div>
                {isEditingShifts && (
                  <p className="text-[11px] text-muted mb-4">Toca un turno para activarlo o desactivarlo.</p>
                )}

                {/* Stats rápidas */}
                {(() => {
                  const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
                  const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
                  return (
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="bg-dark2 border border-border rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-text">{totalTurnos}</p>
                        <p className="text-[10px] text-muted uppercase tracking-wide mt-0.5">Turnos</p>
                      </div>
                      <div className="bg-dark2 border border-border rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-text">{diasCubiertos}</p>
                        <p className="text-[10px] text-muted uppercase tracking-wide mt-0.5">Días</p>
                      </div>
                      <div className="bg-dark2 border border-border rounded-xl p-3 text-center">
                        <p className={`text-2xl font-bold ${editingVolunteer.reliability >= 80 ? 'text-success' : 'text-warning'}`}>
                          {editingVolunteer.reliability}%
                        </p>
                        <p className="text-[10px] text-muted uppercase tracking-wide mt-0.5">Confiab.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline por día */}
                <div className="space-y-2.5">
                  {(isEditingShifts ? EVENT_DAYS : EVENT_DAYS.filter(d => (shiftsByDay[d.key]?.length ?? 0) > 0)).map((d) => (
                    <div key={d.key} className={`flex items-center gap-4 border rounded-xl px-5 py-3 transition-colors ${
                      isEditingShifts ? 'bg-dark3 border-primary-cta/20' : 'bg-dark2 border-border'
                    }`}>
                      <div className="shrink-0 w-16 text-center">
                        <p className="text-xs font-bold text-text capitalize">{d.label}</p>
                        <p className="text-[10px] text-muted">{d.dateNum} Sep</p>
                      </div>
                      <div className="w-px h-8 bg-border shrink-0" />
                      <div className="flex items-center justify-between gap-2 flex-1">
                        {['T1', 'T2', 'T3', 'T4'].map((t) => {
                          const active = (shiftsByDay[d.key] ?? []).includes(t);
                          return (
                            <button
                              key={t}
                              onClick={() => toggleShift(d.key, t)}
                              className={`flex-1 inline-flex items-center justify-center rounded-lg text-xs font-bold py-2 border transition-all ${
                                active
                                  ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                                  : 'bg-dark border-border text-muted'
                              } ${
                                isEditingShifts
                                  ? 'cursor-pointer hover:scale-105 hover:border-sky-400'
                                  : 'cursor-default'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                      <div className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                        (shiftsByDay[d.key]?.length ?? 0) > 0 ? 'bg-success' : 'bg-border'
                      }`} />
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
          className="bg-dark text-text border-l border-border overflow-hidden"
        >
          <SheetHeader>
            <SheetTitle className="text-xl font-bold text-text">Añadir Voluntario</SheetTitle>
          </SheetHeader>
          <form 
            id="add-volunteer-form"
            onSubmit={(e) => {
              e.preventDefault();
              setIsAddSheetOpen(false);
            }}
            className="flex-1 overflow-y-auto px-6 space-y-6 pb-24"
          >
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">Nombre y Apellido</label>
              <Input required minLength={3} className="h-10 bg-dark2 border-border focus:ring-gold-faint" placeholder="Ej. Juan Pérez" />
              <p className="text-[11px] text-muted">Asegúrate de incluir ambos apellidos si es posible.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">Celular</label>
              <Input 
                required 
                type="tel" 
                pattern="[0-9]{8}" 
                maxLength={8}
                onKeyPress={(e) => {
                  if (!/[0-9]/.test(e.key)) e.preventDefault();
                }}
                className="h-10 bg-dark2 border-border focus:ring-gold-faint" 
                placeholder="Ej. 88888888" 
              />
              <p className="text-[11px] text-muted">Solo 8 dígitos, sin código de país o espacios.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">Estaca</label>
              <Input required className="h-10 bg-dark2 border-border focus:ring-gold-faint" placeholder="Ej. Managua Sur" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">Barrio</label>
              <Input required className="h-10 bg-dark2 border-border focus:ring-gold-faint" placeholder="Ej. Barrio 1" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">Comité</label>
              <Select required>
                <SelectTrigger className="h-10 bg-dark2 border-border focus:ring-gold-faint">
                  <SelectValue placeholder="Selecciona un comité" />
                </SelectTrigger>
                <SelectContent className="bg-dark border-border text-text">
                  {committees.map((com) => (
                    <SelectItem 
                      key={com} 
                      value={com} 
                      className="cursor-pointer rounded-lg hover:bg-slate-50 focus:bg-slate-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 transition-colors"
                    >
                      {com}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>

          {/* Footer fijo en la parte inferior */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} className="bg-dark border-t border-border px-6 py-4 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="border-border text-muted hover:text-text hover:bg-dark3" onClick={() => setIsAddSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="add-volunteer-form" className="bg-primary-cta hover:bg-primary-active text-white">
              Guardar Voluntario
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
