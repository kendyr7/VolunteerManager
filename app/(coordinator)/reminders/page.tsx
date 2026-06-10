'use client'

import { useState } from "react";
import { generateReminderMessage, generateWaMeLink } from "@/lib/whatsapp";
import { Send, Copy, CalendarClock, MessageCircle, ChevronDown, CheckCircle2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function RemindersPage() {
  const [selectedShift, setSelectedShift] = useState<string>("T1-14SEP");

  // Mock de voluntarios inscritos generado dinámicamente según la petición de volumen
  const names = ['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'];
  const lastNames = ['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'];

  const enrolledVolunteers = Array.from({ length: 20 }).map((_, i) => ({
    name: `${names[i % names.length]} ${lastNames[(i * 7) % lastNames.length]}`,
    phone: `8888 ${1000 + i}`,
    area: i % 2 === 0 ? "Recepción" : "Salones",
    confirmed: i % 3 === 0,
  }));

  const shiftInfo = {
    dateStr: "Lunes 14 de Septiembre",
    shiftName: "Turno 1",
    timeStr: "8:00 AM - 12:00 PM",
    committeeName: "Historia",
    isHoliday: true // 14 de Sep es feriado
  };

  const previewMessage = generateReminderMessage(
    "[Nombre]", 
    shiftInfo.dateStr, 
    shiftInfo.shiftName, 
    shiftInfo.timeStr, 
    shiftInfo.committeeName, 
    shiftInfo.isHoliday
  );

  const handleCopyNumbers = () => {
    const numbers = enrolledVolunteers.map(v => v.phone).join(", ");
    navigator.clipboard.writeText(numbers);
    alert("Números copiados al portapapeles");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-display-md text-text tracking-tight mb-1">Recordatorios por WhatsApp</h2>
        <p className="text-body-md text-muted">Envía notificaciones de asistencia a los voluntarios de un turno.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selector y Preview */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card-premium overflow-hidden">
            <div className="p-5 border-b border-border bg-dark2">
              <h3 className="text-title-md text-text flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-gold" />
                Seleccionar Turno
              </h3>
            </div>
            <div className="p-5 bg-dark">
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger className="input-base w-full h-12 bg-dark2 text-text font-medium border-border focus:ring-2 focus:ring-gold-faint">
                  <SelectValue placeholder="Selecciona un turno" />
                </SelectTrigger>
                <SelectContent className="bg-dark2 border-border">
                  <SelectItem value="T1-14SEP" className="text-text cursor-pointer focus:bg-dark3">14 Sep - Turno 1 (8AM-12PM)</SelectItem>
                  <SelectItem value="T2-14SEP" className="text-text cursor-pointer focus:bg-dark3">14 Sep - Turno 2 (11AM-3PM)</SelectItem>
                  <SelectItem value="T1-15SEP" className="text-text cursor-pointer focus:bg-dark3">15 Sep - Turno 1 (8AM-12PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="card-premium overflow-hidden border-gold-light/30">
            <div className="p-5 border-b border-gold-faint bg-[#f0f9ff]">
              <h3 className="text-body-md font-semibold text-gold flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Vista Previa del Mensaje
              </h3>
            </div>
            <div className="p-5 bg-dark2">
              <div className="bg-[#e1f5fe] p-4 rounded-2xl rounded-tl-none border border-gold-faint shadow-sm whitespace-pre-wrap text-sm text-text relative leading-relaxed">
                {previewMessage}
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Envío */}
        <div className="lg:col-span-2">
          <div className="card-premium h-full flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border bg-dark2 flex items-center justify-between">
              <div>
                <h3 className="text-title-md text-text">Voluntarios Inscritos</h3>
                <p className="text-body-sm text-muted mt-1">
                  {enrolledVolunteers.length} voluntarios en este turno.
                </p>
              </div>
              {shiftInfo.isHoliday && (
                <span className="px-3 py-1 bg-red-faint text-red text-xs font-bold uppercase tracking-wider rounded-full border border-red/20">
                  Día Feriado
                </span>
              )}
            </div>
            
            <div className="p-6 bg-dark flex-1">
              <div className="space-y-3">
                {enrolledVolunteers.map((vol, i) => {
                  const msg = generateReminderMessage(
                    vol.name, 
                    shiftInfo.dateStr, 
                    shiftInfo.shiftName, 
                    shiftInfo.timeStr, 
                    shiftInfo.committeeName, 
                    shiftInfo.isHoliday
                  );
                  const link = generateWaMeLink(vol.phone, msg);
                  
                  return (
                    <div key={i} className="flex items-center justify-between p-4 bg-dark2 rounded-xl border border-border shadow-sm hover:border-mid transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${vol.confirmed ? 'bg-[#e8f5e9] text-[#2e7d32]' : 'bg-dark3 text-muted'}`}>
                          {vol.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-text flex items-center gap-2">
                            {vol.name}
                            {vol.confirmed && <CheckCircle2 className="w-4 h-4 text-accent" />}
                          </p>
                          <p className="text-xs text-muted font-mono mt-0.5">{vol.phone} • {vol.area}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}
                        className="btn-base btn-sm bg-[#25D366] hover:bg-[#1ebd5a] text-white shadow-sm flex-shrink-0"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Enviar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-6 border-t border-border bg-dark2">
              <button 
                onClick={handleCopyNumbers}
                className="btn-base btn-secondary w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar números para Grupo de WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
