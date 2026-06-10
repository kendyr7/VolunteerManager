'use client'

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, UserMinus, Phone, UserPlus } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function ShiftsPage() {
  const [selectedDate, setSelectedDate] = useState("2026-09-14");

  // Mock de datos de asistencia
  const [attendance, setAttendance] = useState<Record<number, string>>({
    1: "confirmed",
    2: "pending",
    3: "absent"
  });

  const names = ['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'];
  const lastNames = ['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'];

  const dailyShifts = [
    {
      id: "T1",
      name: "Turno 1 (8:00 AM - 12:00 PM)",
      volunteers: Array.from({ length: 20 }).map((_, i) => ({
        id: i + 1,
        name: `${names[i % names.length]} ${lastNames[(i * 7) % lastNames.length]}`,
        phone: `8888 ${1000 + i}`
      }))
    },
    {
      id: "T2",
      name: "Turno 2 (11:00 AM - 3:00 PM)",
      volunteers: [
        { id: 21, name: "José Pérez", phone: "8888 4444" },
        { id: 22, name: "Ana Rojas", phone: "8888 5555" },
      ]
    }
  ];

  const handleMarkAttendance = (id: number, status: string) => {
    setAttendance(prev => ({ ...prev, [id]: status }));
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'confirmed': 
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">Presente</Badge>;
      case 'absent': 
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">Ausente</Badge>;
      default: 
        return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100 border-slate-200">Sin Confirmar</Badge>;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Asistencia por Día</h2>
          <p className="text-slate-500 mt-1">Gestiona la llegada de los voluntarios durante el evento.</p>
        </div>
        
        {/* Selector de Fecha */}
        <div className="w-full sm:w-[240px]">
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="input-base w-full h-10 bg-dark2 text-text font-medium border-border focus:ring-2 focus:ring-gold-faint">
              <SelectValue placeholder="Selecciona una fecha" />
            </SelectTrigger>
            <SelectContent className="bg-dark2 border-border">
              <SelectItem value="2026-09-10" className="text-text cursor-pointer focus:bg-dark3">Jueves 10 Sep</SelectItem>
              <SelectItem value="2026-09-11" className="text-text cursor-pointer focus:bg-dark3">Viernes 11 Sep</SelectItem>
              <SelectItem value="2026-09-12" className="text-text cursor-pointer focus:bg-dark3">Sábado 12 Sep</SelectItem>
              <SelectItem value="2026-09-14" className="text-text cursor-pointer focus:bg-dark3">Lunes 14 Sep (Feriado)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-6">
        {dailyShifts.map((shift) => (
          <Card key={shift.id} className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg text-slate-800 flex items-center justify-between">
                <span>{shift.name}</span>
                <Badge variant="outline" className="font-normal text-slate-500 bg-white">
                  {shift.volunteers.length} inscritos
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {shift.volunteers.map((vol) => {
                  const status = attendance[vol.id] || "pending";
                  return (
                    <div key={vol.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium">
                          {vol.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{vol.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500 font-mono">{vol.phone}</span>
                            {getStatusBadge(status)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {status === 'pending' && (
                          <>
                            <Button size="sm" onClick={() => handleMarkAttendance(vol.id, 'confirmed')} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Confirmar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleMarkAttendance(vol.id, 'absent')} className="text-red-600 border-red-200 hover:bg-red-50">
                              <XCircle className="w-4 h-4 mr-1.5" /> Ausente
                            </Button>
                          </>
                        )}
                        
                        {status !== 'pending' && (
                          <Button size="sm" variant="ghost" onClick={() => handleMarkAttendance(vol.id, 'pending')} className="text-slate-500">
                            <Clock className="w-4 h-4 mr-1.5" /> Deshacer
                          </Button>
                        )}

                        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>

                        {/* Acciones Rápidas */}
                        <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50" title="Contactar">
                          <Phone className="w-4 h-4" />
                        </Button>
                        
                        {status === 'absent' && (
                          <Button size="icon" variant="ghost" className="text-amber-600 hover:bg-amber-50" title="Solicitar Reemplazo">
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        )}
                        
                        <Button size="icon" variant="ghost" className="text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remover del turno">
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
