'use client'

import React, { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { EntryPassButton } from "@/components/EntryPassButton";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface VolunteerProfileData {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  committee?: string;
  stake?: string;
  ward?: string;
  phone?: string;
  reliability?: number;
  age?: number;
}

export interface VolunteerProfileViewProps {
  volunteer: VolunteerProfileData;
  mode?: 'volunteer' | 'coordinator';
  
  // Shift state
  shiftsByDay: Record<string, string[]>;
  checkedInMap?: Record<string, boolean> | Record<string, string[]>;
  checkedOutMap?: Record<string, boolean>;
  
  // Handlers
  onToggleShift: (dayKey: string, shiftKey: string) => void;
  
  // Coordinator controls (optional)
  isEditingShifts?: boolean;
  canEditShifts?: boolean;
  onStartEditShifts?: () => void;
  onSaveShifts?: () => void;
  onStartEditProfile?: () => void;
  savedNotice?: boolean;
  isPendingSave?: boolean;
  
  // Custom Action Buttons override (optional)
  customActions?: React.ReactNode;
}

export function VolunteerProfileView({
  volunteer,
  mode = 'volunteer',
  shiftsByDay,
  checkedInMap,
  checkedOutMap,
  onToggleShift,
  isEditingShifts = false,
  canEditShifts = true,
  onStartEditShifts,
  onSaveShifts,
  onStartEditProfile,
  savedNotice = false,
  isPendingSave = false,
  customActions,
}: VolunteerProfileViewProps) {
  const [showLegend, setShowLegend] = useState(false);
  const EVENT_DAYS = getActiveEventDays();

  // Helper to check checked_in status
  const isShiftCheckedIn = (dayKey: string, shiftKey: string): boolean => {
    if (!checkedInMap) return false;
    const arrayVal = (checkedInMap as Record<string, string[]>)[dayKey];
    if (Array.isArray(arrayVal)) {
      return arrayVal.includes(shiftKey);
    }
    return (
      !!(checkedInMap as Record<string, boolean>)[`${volunteer.id}-${dayKey}-${shiftKey}`] ||
      !!(checkedInMap as Record<string, boolean>)[`${dayKey}-${shiftKey}`]
    );
  };

  // Helper to check checked_out status
  const isShiftCheckedOut = (dayKey: string, shiftKey: string): boolean => {
    if (!checkedOutMap) return false;
    return (
      !!checkedOutMap[`${volunteer.id}-${dayKey}-${shiftKey}`] ||
      !!checkedOutMap[`${dayKey}-${shiftKey}`]
    );
  };

  // KPIs
  const totalTurnos = Object.values(shiftsByDay).reduce((acc, arr) => acc + arr.length, 0);
  const diasCubiertos = Object.values(shiftsByDay).filter(arr => arr.length > 0).length;
  const reliabilityScore = volunteer.reliability ?? 100;

  // Name splitting for elegant multi-line display when long
  const nameParts = (volunteer.name || '').trim().split(/\s+/).filter(Boolean);

  return (
    <div className="flex flex-col w-full">
      {/* 1. Encabezado con Nombre Grande y Badges */}
      <div className="text-center mt-2 mb-6 px-4">
        <div className="flex flex-col items-center justify-center leading-[1.25] font-black text-[26px] sm:text-[30px] text-text tracking-tight">
          {nameParts.length >= 4 ? (
            <>
              <span>{nameParts.slice(0, 2).join(' ')}</span>
              <span className="text-text/90">{nameParts.slice(2).join(' ')}</span>
            </>
          ) : (
            <span>{nameParts.join(' ')}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {volunteer.committee && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">groups</span>
              {volunteer.committee}
            </span>
          )}
          {volunteer.stake && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/25 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">account_balance</span>
              {volunteer.stake}
            </span>
          )}
          {volunteer.ward && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">location_on</span>
              {volunteer.ward}
            </span>
          )}
        </div>
      </div>

      {/* 2. Top Stats Row (Turnos, Días, Confiabilidad, Edad) */}
      <div className="flex items-center mb-6 py-3 border-y border-border -mx-2 sm:mx-0">
        <div className="flex flex-col items-center flex-1 border-r border-border">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">{totalTurnos}</span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Turnos</span>
        </div>
        <div className="flex flex-col items-center flex-1 border-r border-border">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">{diasCubiertos}</span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Días</span>
        </div>
        <div className="flex flex-col items-center flex-1 border-r border-border">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">
            {reliabilityScore}
            <span className="text-[15px] font-bold text-text-dim ml-0.5">%</span>
          </span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Confia.</span>
        </div>
        <div className="flex flex-col items-center flex-1">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">{volunteer.age || '-'}</span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Edad</span>
        </div>
      </div>

      {/* 3. Acciones de Botones */}
      <div className="mb-6 px-1">
        {customActions ? (
          customActions
        ) : mode === 'volunteer' ? (
          <div className="grid grid-cols-2 gap-3">
            <EntryPassButton
              volunteerId={volunteer.id}
              volunteerName={volunteer.name}
              committeeName={volunteer.committee || ''}
            />
            <Button
              variant="outline"
              className="h-10 px-3 gap-2 text-text border-border bg-dark3 hover:bg-dark font-bold text-xs rounded-full shadow-sm active:scale-95 transition-all truncate flex items-center justify-center"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Hola, soy ${volunteer.name} del comité ${volunteer.committee || ''}. Necesito asistencia con mis turnos.`)}`, '_blank')}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0 text-[#25D366]">message</span>
              <span>SOPORTE</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-11 px-1.5 gap-1.5 text-text border-border bg-dark3 hover:bg-dark font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all truncate"
              onClick={() => window.open(`https://wa.me/${(volunteer.phone || '').replace(/\s+/g, '')}`, '_blank')}
            >
              <span className="material-symbols-outlined text-[17px] shrink-0 text-[#25D366]">message</span>
              <span>WHATSAPP</span>
            </Button>
            <Button
              variant="outline"
              className="h-11 px-1.5 gap-1.5 text-text border-border bg-dark3 hover:bg-dark font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all truncate"
              onClick={() => window.location.href = `tel:${(volunteer.phone || '').replace(/\s+/g, '')}`}
            >
              <span className="material-symbols-outlined text-[17px] shrink-0 text-blue-500">call</span>
              <span>LLAMAR</span>
            </Button>
            <Button
              variant="outline"
              className="h-11 px-1.5 gap-1.5 text-text border-border bg-dark3 hover:bg-dark font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all truncate"
              onClick={onStartEditProfile}
            >
              <span className="material-symbols-outlined text-[17px] shrink-0 text-[#4d7cfe]">edit_square</span>
              <span>EDITAR</span>
            </Button>
          </div>
        )}
      </div>

      {/* 4. Cronograma Stylized Day Cards */}
      <div className="w-full">
        <div className="flex items-center justify-between px-1 mb-4">
          <div className="flex items-center gap-2 relative">
            <p className="text-drawer-label text-text font-bold">Cronograma</p>
            
            {/* Legend popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLegend(prev => !prev)}
                className="text-text-dim hover:text-text transition-colors p-0.5 rounded-full flex items-center justify-center focus:outline-none"
                title="Ver leyenda del cronograma"
              >
                <span className="material-symbols-outlined text-[15px]">help_outline</span>
              </button>

              {showLegend && (
                <div className="absolute left-0 top-6 z-50 w-64 bg-dark2 border border-border rounded-xl p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-border">
                    <span className="text-xs font-bold text-text font-inter">Leyenda del Cronograma</span>
                    <button onClick={() => setShowLegend(false)} className="text-text-dim hover:text-text flex items-center justify-center">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                  <div className="space-y-2.5 text-[11px] font-inter">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-[#4d7cfe]/20 border border-[#4d7cfe]/40 text-[#4d7cfe] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[13px]">check</span>
                      </span>
                      <div>
                        <p className="text-text font-bold leading-tight">Programado</p>
                        <p className="text-text-dim text-[10px]">Turno reservado</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[13px]">check</span>
                      </span>
                      <div>
                        <p className="text-emerald-400 font-bold leading-tight">Entrada / Check-in</p>
                        <p className="text-text-dim text-[10px]">Asistencia confirmada</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-slate-500/20 border border-slate-500/40 text-slate-400 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[13px]">check</span>
                      </span>
                      <div>
                        <p className="text-slate-400 font-bold leading-tight">Salida</p>
                        <p className="text-text-dim text-[10px]">Turno completado</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-dark3 border border-border text-text-dim flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-bold">-</span>
                      </span>
                      <div>
                        <p className="text-text font-bold leading-tight">Sin Turnos</p>
                        <p className="text-text-dim text-[10px]">Sin turno asignado</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Coordinator Edit Shift Toggle Controls */}
          {mode === 'coordinator' && (
            <div className="flex items-center gap-3">
              {savedNotice && <span className="text-[11px] text-emerald-500 font-bold animate-pulse">✓ Listo</span>}
              {isEditingShifts ? (
                <button
                  onClick={onSaveShifts}
                  disabled={isPendingSave}
                  className="h-7 px-4 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full font-bold text-[11px] shadow-md transition-all active:scale-[0.97]"
                >
                  {isPendingSave ? 'Guardando...' : 'Guardar'}
                </button>
              ) : (
                <button
                  onClick={onStartEditShifts}
                  className={cn(
                    "h-7 px-4 backdrop-blur-sm border font-bold text-[11px] transition-all rounded-full",
                    canEditShifts
                      ? "bg-dark3 border-border hover:bg-dark text-text active:scale-[0.97]"
                      : "bg-dark3/50 border-border/50 text-text-dim/40 cursor-not-allowed"
                  )}
                  title={canEditShifts ? "Editar turnos" : "Permiso deshabilitado por el administrador"}
                >
                  Editar
                </button>
              )}
            </div>
          )}
        </div>

        {/* List of Day Cards */}
        <div className="flex flex-col gap-2 pb-8">
          {EVENT_DAYS.map((date, index) => {
            const dayKey = formatDateShort(date);
            const dayShifts = shiftsByDay[dayKey] || [];

            const bgColors = [
              'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
              'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
            ];
            const cardBg = bgColors[index % bgColors.length];

            return (
              <motion.div
                key={dayKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.015 }}
                className="rounded-[20px] shadow-sm w-full overflow-hidden transition-transform duration-200 hover:scale-[1.005] bg-dark3 border border-border flex"
              >
                {/* Structural Color Bar */}
                <div className={`w-3 shrink-0 ${cardBg} opacity-90`} />

                <div className="flex-1 flex items-center justify-between px-4 sm:px-6 py-3.5">
                  {/* Left: Date info */}
                  <div className="flex-1 min-w-0 pr-3 flex items-center">
                    <p className="font-inter font-bold text-text text-[13px] truncate capitalize">
                      {format(date, "EEEE", { locale: es })} {format(date, "d", { locale: es })}
                    </p>
                  </div>

                  {/* Right: 4 Columns (T1 - T4) */}
                  <div className="flex items-center shrink-0 ml-auto gap-1">
                    {(['T1', 'T2', 'T3', 'T4'] as const).map((t) => {
                      const active = dayShifts.includes(t);
                      const inCheck = isShiftCheckedIn(dayKey, t);
                      const outCheck = isShiftCheckedOut(dayKey, t);

                      const canClick = mode === 'volunteer'
                        ? false
                        : (isEditingShifts && !inCheck && !outCheck && canEditShifts);

                      let statusStyle = "bg-dark2 border-border text-text-dim/40";
                      let iconContent: React.ReactNode = <span className="text-[13px] font-bold text-text-dim/40">-</span>;
                      let labelColor = "text-text-dim/40";

                      if (outCheck) {
                        statusStyle = "bg-slate-500/15 border-slate-500/30 text-slate-500 shadow-sm";
                        iconContent = <span className="material-symbols-outlined text-[15px] text-slate-500">check</span>;
                        labelColor = "text-slate-500 font-bold";
                      } else if (inCheck) {
                        statusStyle = "bg-emerald-500/15 border-emerald-500/30 text-emerald-500 shadow-sm";
                        iconContent = <span className="material-symbols-outlined text-[15px] text-emerald-500">check</span>;
                        labelColor = "text-emerald-500 font-bold";
                      } else if (active) {
                        statusStyle = "bg-[#4d7cfe]/15 border-[#4d7cfe]/35 text-[#4d7cfe] font-bold shadow-sm";
                        iconContent = <span className="material-symbols-outlined text-[15px] text-[#4d7cfe]">check</span>;
                        labelColor = "text-[#4d7cfe] font-bold";
                      }

                      return (
                        <button
                          key={t}
                          disabled={!canClick}
                          onClick={() => onToggleShift(dayKey, t)}
                          className={cn(
                            "flex flex-col items-center justify-center w-10 sm:w-13 h-11 rounded-lg border transition-all",
                            statusStyle,
                            canClick && "hover:bg-dark hover:border-border cursor-pointer active:scale-95"
                          )}
                          title={`${t}: ${active ? 'Programado' : 'Disponible'}${inCheck ? ' (Check-in)' : ''}`}
                        >
                          <div className="h-4 flex items-center justify-center">
                            {iconContent}
                          </div>
                          <span className={cn("font-inter text-[10px] uppercase tracking-wider mt-0.5", labelColor)}>
                            {t}
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
  );
}
