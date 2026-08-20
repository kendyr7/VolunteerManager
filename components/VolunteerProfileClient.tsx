'use client'

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";

import { Badge } from "@/components/ui/badge";
import { SHIFT_TIMES, getOfficialShiftTime } from "@/lib/dates";
import type { VolunteerScheduleShift } from "@/lib/types/volunteer-schedule";

interface VolunteerProfileClientProps {
  volunteer: any;
  initialHasPasskey: boolean;
  initialShifts?: VolunteerScheduleShift[];
}

export function VolunteerProfileClient({
  volunteer,
  initialHasPasskey,
  initialShifts = []
}: VolunteerProfileClientProps) {
  const [hasPasskey, setHasPasskey] = useState(initialHasPasskey);
  const [isRegistering, setIsRegistering] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  const handleRegisterPasskey = async () => {
    setIsRegistering(true);
    try {
      const resp = await fetch('/api/webauthn/register/generate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: volunteer.id,
          userType: 'volunteer',
          phone: volunteer.phone
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
      setIsRegistering(false);
    }
  };

  const handleDeletePasskey = async () => {
    setIsRegistering(true);
    try {
      const resp = await fetch('/api/webauthn/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: volunteer.id })
      });

      if (resp.ok) {
        setHasPasskey(false);
        showToast("Huella dactilar eliminada.");
      } else {
        throw new Error("Error al eliminar la huella.");
      }
    } catch (err: any) {
      showToast("No se pudo eliminar la huella.", "error");
    } finally {
      setIsRegistering(false);
    }
  };

  const score = volunteer.reliability_score ?? 100;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="w-full mx-auto pb-32 md:pb-12 flex flex-col min-h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)]">
      
      {/* Sticky Header matching admin design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0 border-b border-white/10 mb-4">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Mi Perfil
          </h1>
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto space-y-6 lg:space-y-10 pb-20 px-4 sm:px-6 lg:px-8 pt-4">
        
        {/* Personal Info Card */}
        <div className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-dark3">
            <div>
              <h3 className="font-bold text-text tracking-tight leading-none mb-2">Información Personal</h3>
              <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Datos registrados de tu cuenta de voluntario (Solo Lectura).</p>
            </div>
          </div>
          
          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              
              {/* Full Name */}
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Nombre completo</label>
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {volunteer.first_name} {volunteer.last_name}
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Teléfono WhatsApp</label>
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {volunteer.phone}
                </div>
              </div>

              {/* Barrio */}
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Barrio / Rama</label>
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {volunteer.neighborhood || "No especificado"}
                </div>
              </div>

              {/* Estaca */}
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Estaca</label>
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {volunteer.stake || "No especificada"}
                </div>
              </div>

              {/* Committee */}
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Comité Asignado</label>
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {volunteer.committees?.name || "Sin comité"}
                </div>
              </div>

              {/* Age */}
              <div className="space-y-2">
                <label className="block mb-2 text-xs font-normal text-text">Edad</label>
                <div className="w-full h-10 px-3 rounded-sm border border-white/5 bg-dark/50 text-text-dim text-sm font-inter font-bold flex items-center cursor-not-allowed">
                  {volunteer.age ? `${volunteer.age} años` : "-"}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-dark3">
            <div>
              <h3 className="font-bold text-text tracking-tight leading-none mb-2">Seguridad y Acceso</h3>
              <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Gestiona métodos de inicio de sesión rápidos.</p>
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
                  Vincula este dispositivo para iniciar sesión usando tu huella dactilar, Face ID o bloqueo seguro del sistema sin necesidad de introducir un PIN.
                </p>
              </div>
              
              {hasPasskey ? (
                <Button 
                  type="button" 
                  onClick={handleDeletePasskey}
                  disabled={isRegistering} 
                  className="font-bold px-6 h-10 transition-all active:scale-[0.97] rounded-full text-xs shrink-0 w-full md:w-auto bg-red/10 text-red hover:bg-red/20 border border-red/20"
                >
                  {isRegistering ? 'Desvinculando...' : 'Desvincular Dispositivo'}
                </Button>
              ) : (
                <Button 
                  type="button" 
                  onClick={handleRegisterPasskey}
                  disabled={isRegistering} 
                  className="font-bold px-6 h-10 transition-all active:scale-[0.97] rounded-full text-xs shrink-0 w-full md:w-auto bg-white/10 hover:bg-white/20 text-white"
                >
                  {isRegistering ? 'Registrando...' : 'Vincular Dispositivo'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Reliability KPI Card */}
        <div className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b border-white/5 bg-dark3">
            <h3 className="font-bold text-text tracking-tight leading-none mb-2">Confiabilidad</h3>
            <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Métrica de asistencia calculada automáticamente.</p>
          </div>
          
          <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="min-w-0 flex-grow pr-4 text-left">
              <p className="text-sm font-bold text-text mb-1.5">Índice de Asistencia</p>
              <p className="text-xs text-text-dim leading-relaxed max-w-sm font-inter font-bold">
                Este puntaje representa el porcentaje de turnos en los que has asistido (check-in) del total de turnos que has programado y que ya han concluido.
              </p>
            </div>

            {/* Circular Indicator */}
            <div className="relative w-18 h-18 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  className="stroke-white/5"
                  strokeWidth="5"
                  fill="transparent"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  className="stroke-[#4d7cfe]"
                  strokeWidth="5"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[11px] font-mono font-bold text-[#4d7cfe]">
                {score}%
              </span>
            </div>
          </div>
        </div>

        {/* Attendance History Card */}
        <div className="bg-dark2 border border-white/5 rounded-[20px] shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b border-white/5 bg-dark3">
            <h3 className="font-bold text-text tracking-tight leading-none mb-2">Historial de Asistencia</h3>
            <p className="text-xs md:text-sm font-inter font-bold text-text-dim">Registro cronológico de tus turnos y asistencias.</p>
          </div>
          
          <div className="p-6 md:p-8">
            {initialShifts.length === 0 ? (
              <div className="text-center py-8 text-text-dim italic text-sm font-inter">
                No tienes turnos programados en el sistema.
              </div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[360px] overflow-y-auto pr-1">
                {[...initialShifts]
                  .sort((a, b) => {
                    const dayA = parseInt(a.day_key.split(' ')[1]) || 0;
                    const dayB = parseInt(b.day_key.split(' ')[1]) || 0;
                    if (dayA !== dayB) return dayA - dayB;
                    const orderA = a.shift_key === 'T2' ? 2 : a.shift_key === 'T3' ? 3 : a.shift_key === 'T4' ? 4 : 1;
                    const orderB = b.shift_key === 'T2' ? 2 : b.shift_key === 'T3' ? 3 : b.shift_key === 'T4' ? 4 : 1;
                    return orderA - orderB;
                  })
                  .map((s) => {
                    // Check if shift has passed
                    const now = new Date();
                    const dayNumPart = s.day_key.split(' ')[1];
                    const dayNum = parseInt(dayNumPart) || 10;
                    const official = getOfficialShiftTime(s.day_key, s.shift_key);
                    const shiftEndTime = new Date(2026, 8, dayNum, Math.floor(official.endHour), Math.round((official.endHour % 1) * 60), 0); // Sept 2026
                    const passed = now > shiftEndTime;

                    const timeLabel = official.timeLabel;

                    return (
                      <div key={s.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                        <div className="min-w-0 pr-3">
                          <p className="text-sm font-bold text-white capitalize leading-tight">
                            {s.day_key} · Turno {s.shift_key[1]}
                          </p>
                          <p className="text-[11px] text-text-dim font-inter mt-1">
                            {timeLabel}
                          </p>
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-[#4d7cfe]">
                            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">location_on</span>
                            {s.area_name || 'Área pendiente'}
                          </p>
                        </div>

                        {s.checked_in ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-inter font-bold text-[10px] py-1 px-2.5">
                            Confirmado ✓
                          </Badge>
                        ) : passed ? (
                          <Badge className="bg-red-500/10 text-red border border-red-500/20 font-inter font-bold text-[10px] py-1 px-2.5">
                            Ausente
                          </Badge>
                        ) : (
                          <Badge className="bg-white/5 text-text-dim border border-white/10 font-inter font-bold text-[10px] py-1 px-2.5">
                            Programado
                          </Badge>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
}
