'use client'

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, UserMinus, UserPlus, Send, RefreshCw, X } from "lucide-react";
import { generateWaMeLink } from "@/lib/whatsapp";

// Mocks basados en PRD
const absentVolunteers = [
  { id: 1, name: "María González", committee: "Historia", shift: "Turno 1 (8AM-12PM)", phone: "8888 1111", status: "absent" },
  { id: 2, name: "José Pérez", committee: "Seguridad", shift: "Turno 1 (8AM-12PM)", phone: "8888 4444", status: "pending" },
];

const suggestedReplacements = [
  { id: 101, name: "Pedro Ruiz", phone: "8888 5555", isPresentToday: true, currentShift: "Turno 2" },
  { id: 102, name: "Laura Sánchez", phone: "8888 6666", isPresentToday: false, currentShift: null },
];

export default function ReplacementsPage() {
  const [selectedAbsent, setSelectedAbsent] = useState<number | null>(null);
  const [replaced, setReplaced] = useState<number[]>([]);

  const handleSelectToReplace = (id: number) => {
    setSelectedAbsent(id);
  };

  const handleConfirmReplacement = (absentId: number, replacementName: string, replacementPhone: string, shift: string) => {
    // Generar mensaje pre-llenado
    const message = `Hola ${replacementName}, necesitamos tu ayuda urgente. Un voluntario se ausentó en el ${shift}. ¿Podrías cubrir este espacio?\n\nPor favor acércate al punto de control. ¡Gracias!`;
    const link = generateWaMeLink(replacementPhone, message);
    
    // Simular el reemplazo
    setReplaced([...replaced, absentId]);
    setSelectedAbsent(null);
    
    // Abrir WhatsApp en nueva pestaña
    window.open(link, '_blank');
  };

  const activeAbsents = absentVolunteers.filter(v => !replaced.includes(v.id));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Gestión de Crisis</h2>
        <p className="text-slate-500 mt-1">Soluciona rápidamente las ausencias buscando reemplazos sugeridos.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel Izquierdo: Lista de Ausentes */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-800">Alertas Actuales</h3>
          {activeAbsents.length === 0 ? (
            <Card className="border-0 shadow-sm bg-emerald-50 border-emerald-200">
              <CardContent className="p-8 text-center text-emerald-700">
                <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                No hay crisis activas. Todos los turnos están cubiertos.
              </CardContent>
            </Card>
          ) : (
            activeAbsents.map(vol => (
              <Card 
                key={vol.id} 
                className={`border-0 shadow-sm transition-all ${selectedAbsent === vol.id ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-800">{vol.name}</h4>
                        {vol.status === 'absent' ? (
                          <Badge variant="destructive" className="h-5 text-[10px]">Ausente</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none h-5 text-[10px]">Retrasado</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{vol.committee} • {vol.shift}</p>
                      <p className="text-xs text-slate-500 font-mono mt-1">Tel: {vol.phone}</p>
                    </div>

                    <div className="flex sm:flex-col gap-2 justify-end">
                      <Button size="sm" variant="outline" className="text-[#0084d1] hover:bg-blue-50">
                        <Send className="w-3.5 h-3.5 mr-2" /> Contactar
                      </Button>
                      <Button size="sm" onClick={() => handleSelectToReplace(vol.id)} className="bg-[#0084d1] hover:bg-[#006eb3] text-white shadow-sm">
                        <RefreshCw className="w-3.5 h-3.5 mr-2" /> Reemplazar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Panel Derecho: Sugerencias de Reemplazo */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-800">Candidatos Sugeridos</h3>
          
          {!selectedAbsent ? (
            <Card className="border-0 shadow-sm border-dashed border-2 border-slate-200 bg-slate-50">
              <CardContent className="p-12 text-center text-slate-500 flex flex-col items-center">
                <UserPlus className="h-10 w-10 text-slate-300 mb-3" />
                <p>Selecciona a un voluntario ausente para ver sugerencias de reemplazo.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm border-t-4 border-t-blue-500">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-blue-800 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Buscando para: {absentVolunteers.find(v => v.id === selectedAbsent)?.shift}
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedAbsent(null)} className="h-6 w-6">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  Voluntarios del mismo comité disponibles en este horario.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {suggestedReplacements.map(rep => (
                    <div key={rep.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-slate-800">{rep.name}</h4>
                          {rep.isPresentToday && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-none h-5 text-[10px] uppercase tracking-wider">
                              Ya está en el Templo
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {rep.isPresentToday ? `Su turno hoy es: ${rep.currentShift}` : "No tiene turnos hoy"}
                        </p>
                      </div>
                      
                      <Button 
                        size="sm" 
                        onClick={() => handleConfirmReplacement(
                          selectedAbsent, 
                          rep.name, 
                          rep.phone, 
                          absentVolunteers.find(v => v.id === selectedAbsent)?.shift || ""
                        )}
                        className="bg-[#25D366] hover:bg-[#1ebd5a] text-white shadow-sm shrink-0"
                      >
                        <Send className="w-3.5 h-3.5 mr-2" /> Notificar y Asignar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Dummy component for shield since I missed importing it
function ShieldCheck(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>;
}
