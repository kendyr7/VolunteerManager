'use client'

import React, { useState, useEffect, useMemo } from "react";
import { getActiveEventDays, formatDateShort } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntryPassButton } from "@/components/EntryPassButton";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  createShiftChangeRequestAction,
  fetchVolunteerShiftChangeRequestsAction
} from "@/app/actions/shift-change-actions";

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
  const EVENT_DAYS_RAW = getActiveEventDays();

  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  // Reagendamiento State
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [profileSubTab, setProfileSubTab] = useState<'schedule' | 'requests'>('schedule');

  const [sourceDayKey, setSourceDayKey] = useState<string>("");
  const [sourceShiftKey, setSourceShiftKey] = useState<string>("");
  const [targetDayKey, setTargetDayKey] = useState<string>("");
  const [targetShiftKey, setTargetShiftKey] = useState<string>("");
  const [requestReason, setRequestReason] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Load existing shift change requests for this volunteer
  const loadRequests = async () => {
    if (!volunteer.id) return;
    setLoadingRequests(true);
    const res = await fetchVolunteerShiftChangeRequestsAction(volunteer.id);
    if (res.success && res.requests) {
      setAllRequests(res.requests);
    }
    setLoadingRequests(false);
  };

  useEffect(() => {
    loadRequests();
  }, [volunteer.id]);

  const pendingRequests = useMemo(() => {
    return allRequests.filter((r: any) => r.status === 'pending');
  }, [allRequests]);

  // Days on which the volunteer has assigned shifts
  const assignedDayKeys = Object.keys(shiftsByDay).filter(d => (shiftsByDay[d] || []).length > 0);

  const handleSendRescheduleRequest = async () => {
    if (!sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey) return;
    if (!requestReason.trim()) {
      setSubmitError("Por favor ingresa la razón o motivo por el cual solicitas el cambio.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const res = await createShiftChangeRequestAction({
      volunteerId: volunteer.id,
      currentDayKey: sourceDayKey,
      currentShiftKey: sourceShiftKey,
      requestedDayKey: targetDayKey,
      requestedShiftKey: targetShiftKey,
      reason: requestReason.trim(),
    });

    if (res.success) {
      setSubmitSuccess("✅ Solicitud enviada exitosamente. El coordinador la revisará en breve.");
      await loadRequests();
      setTimeout(() => {
        setIsRescheduleModalOpen(false);
        setSubmitSuccess(null);
        setSourceDayKey("");
        setSourceShiftKey("");
        setTargetDayKey("");
        setTargetShiftKey("");
        setRequestReason("");
      }, 2000);
    } else {
      setSubmitError(res.error || "Ocurrió un error al enviar la solicitud.");
    }
    setIsSubmitting(false);
  };

  // Helpers to check checked_in / checked_out status
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
  const nameParts = (volunteer.name || '').trim().split(/\s+/).filter(Boolean);

  return (
    <div className="flex flex-col w-full relative">
      {/* Pending Shift Change Banner */}
      {pendingRequests.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-amber-400">schedule</span>
            </div>
            <div>
              <span className="font-bold text-amber-300 block text-xs">Solicitud de reagendamiento pendiente</span>
              <span className="text-text-dim text-[11px]">
                {pendingRequests[0].current_shift_key} ({pendingRequests[0].current_day_key}) ➔ {pendingRequests[0].requested_shift_key} ({pendingRequests[0].requested_day_key})
              </span>
            </div>
          </div>
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] shrink-0 font-bold">
            En revisión
          </Badge>
        </div>
      )}

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

      {/* 2. Top Stats Row */}
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

      {/* 3. Acciones de Botones (incluye Solicitar Reagendamiento) */}
      <div className="mb-6 px-1 flex flex-col gap-3">
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
              onClick={() => setIsRescheduleModalOpen(true)}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0 text-[#4d7cfe]">published_with_changes</span>
              <span>REAGENDAR TURNO</span>
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLegend(prev => !prev)}
                className="text-text-dim hover:text-text transition-colors p-0.5 rounded-full flex items-center justify-center focus:outline-none"
              >
                <span className="material-symbols-outlined text-[17px]">info</span>
              </button>

              {showLegend && (
                <div className="absolute left-0 top-full mt-2 w-56 p-3 bg-dark2 border border-border rounded-xl shadow-xl z-50 text-xs text-text space-y-2 animate-in fade-in zoom-in-95">
                  <p className="font-bold text-text-dim text-[11px] border-b border-border pb-1">Leyenda de Estados</p>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#4d7cfe]/15 border border-[#4d7cfe]/35 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[12px] text-[#4d7cfe]">check</span>
                    </span>
                    <span>Programado</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[12px] text-emerald-500">check</span>
                    </span>
                    <span>Asistió (Check-in)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-slate-500/15 border border-slate-500/30 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[12px] text-slate-500">check</span>
                    </span>
                    <span>Completado (Out)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {canEditShifts && onStartEditShifts && (
            <div>
              {isEditingShifts ? (
                <Button
                  size="sm"
                  onClick={onSaveShifts}
                  disabled={isPendingSave}
                  className="h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">save</span>
                  <span>{isPendingSave ? 'Guardando...' : 'Guardar'}</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onStartEditShifts}
                  className="h-8 px-2.5 text-xs font-bold text-[#4d7cfe] hover:bg-[#4d7cfe]/10 rounded-full transition-all flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  <span>Editar Turnos</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {savedNotice && (
          <div className="mb-3 px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl text-center animate-in fade-in">
            ¡Turnos actualizados correctamente!
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {EVENT_DAYS.map((d, index) => {
            const dayKey = d.key;
            const assignedList = shiftsByDay[dayKey] || [];
            const dayAbbr = d.label.substring(0, 3);
            const bgColors = [
              'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
              'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
            ];
            const cardBg = bgColors[index % bgColors.length];

            return (
              <div
                key={dayKey}
                className="relative overflow-hidden bg-dark2 border border-border rounded-xl p-3 sm:p-4 flex items-center justify-between shadow-sm transition-all"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-2 ${cardBg} opacity-90`} />

                <div className="flex items-center gap-3 pl-2">
                  <div className="flex flex-col items-center justify-center min-w-[36px]">
                    <span className="font-inter font-black text-xs uppercase tracking-widest text-text-dim leading-none">
                      {dayAbbr}
                    </span>
                    <span className="text-lg font-black text-text leading-none mt-1">{d.dateNum}</span>
                  </div>
                  <div className="h-8 w-[1px] bg-border" />
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  {['T1', 'T2', 'T3', 'T4'].map((t) => {
                    const active = assignedList.includes(t);
                    const inCheck = isShiftCheckedIn(dayKey, t);
                    const outCheck = isShiftCheckedOut(dayKey, t);

                    const canClick = isEditingShifts;

                    let statusStyle = "bg-dark3/50 border-border/50 text-text-dim/40";
                    let iconContent: React.ReactNode = <span className="text-[13px] font-bold text-text-dim/40">-</span>;
                    let labelColor = "text-text-dim/40";

                    if (outCheck) {
                      statusStyle = "bg-slate-500/15 border-slate-500/30 text-slate-500 shadow-sm";
                      iconContent = <span className="material-symbols-outlined text-[15px] text-slate-500">check</span>;
                      labelColor = "text-slate-500 font-bold";
                    } else if (inCheck) {
                      statusStyle = "bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981] shadow-sm";
                      iconContent = <span className="material-symbols-outlined text-[15px] text-[#10b981]">check</span>;
                      labelColor = "text-[#10b981] font-bold";
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
            );
          })}
        </div>
      </div>

      {/* Modal / Sheet para Solicitar Reagendar Turno */}
      {isRescheduleModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in"
            onClick={() => setIsRescheduleModalOpen(false)}
          />

          <div className="relative w-full max-w-lg bg-dark2 border border-white/10 rounded-3xl p-6 shadow-2xl z-10 space-y-6 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px] text-[#4d7cfe]">published_with_changes</span>
                </div>
                <div>
                  <h3 className="font-bold text-text text-base">Solicitar Reagendamiento</h3>
                  <p className="text-xs text-text-dim font-medium">Envía tu petición de cambio de fecha o turno.</p>
                </div>
              </div>
              <button
                onClick={() => setIsRescheduleModalOpen(false)}
                className="w-8 h-8 rounded-full bg-dark3 flex items-center justify-center text-text-dim hover:text-text transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {submitSuccess ? (
              <div className="p-6 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-center space-y-2">
                <span className="material-symbols-outlined text-[48px] text-emerald-400">check_circle</span>
                <p className="font-bold text-sm">{submitSuccess}</p>
              </div>
            ) : (
              <div className="space-y-5">
                {submitError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                    {submitError}
                  </div>
                )}
                       {/* Paso 1: Seleccionar turno actual */}
                <div>
                  <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                    1. Selecciona el turno actual que deseas cambiar:
                  </label>
                  {assignedDayKeys.length === 0 ? (
                    <p className="text-xs text-text-dim italic">No tienes turnos asignados actualmente para solicitar cambio.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-2">
                        {EVENT_DAYS.filter(d => assignedDayKeys.includes(d.key)).map((d, index) => {
                          const isSelected = sourceDayKey === d.key;
                          const bgColors = [
                            'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                            'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                          ];
                          const cardBg = bgColors[index % bgColors.length];

                          return (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => {
                                setSourceDayKey(d.key);
                                setSourceShiftKey("");
                              }}
                              className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-xl border transition-all bg-dark3 ${
                                isSelected
                                  ? 'border-[#4d7cfe] text-[#4d7cfe] shadow-md bg-[#4d7cfe]/10'
                                  : 'border-border text-text-dim hover:text-text'
                              }`}
                            >
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${cardBg}`} />
                              <span className="text-[9px] uppercase font-bold tracking-wider">{d.label.substring(0, 3)}</span>
                              <span className="text-sm font-black">{d.dateNum}</span>
                            </button>
                          );
                        })}
                      </div>

                      {sourceDayKey && (
                        <div className="animate-in fade-in">
                          <span className="text-[10px] text-text-dim uppercase font-bold block mb-1.5">Turno del {sourceDayKey}:</span>
                          <div className="grid grid-cols-4 gap-2">
                            {(shiftsByDay[sourceDayKey] || []).map((t) => {
                              const isSelected = sourceShiftKey === t;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setSourceShiftKey(t)}
                                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                                    isSelected
                                      ? 'bg-rose-500 border-rose-500 text-white shadow-md'
                                      : 'bg-dark3 border-border text-text hover:bg-dark3/80'
                                  }`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Paso 2: Seleccionar turno destino */}
                {sourceDayKey && sourceShiftKey && (
                  <div className="space-y-4 pt-3 border-t border-border animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                        2. Selecciona la nueva fecha deseada:
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {EVENT_DAYS.map((d, index) => {
                          const isSelected = targetDayKey === d.key;
                          const bgColors = [
                            'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                            'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                          ];
                          const cardBg = bgColors[index % bgColors.length];

                          return (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => setTargetDayKey(d.key)}
                              className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-xl border transition-all bg-dark3 ${
                                isSelected
                                  ? 'border-[#4d7cfe] text-[#4d7cfe] shadow-md bg-[#4d7cfe]/10'
                                  : 'border-border text-text-dim hover:text-text'
                              }`}
                            >
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${cardBg}`} />
                              <span className="text-[9px] uppercase font-bold tracking-wider">{d.label.substring(0, 3)}</span>
                              <span className="text-sm font-black">{d.dateNum}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {targetDayKey && (
                      <div className="animate-in fade-in">
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                          Nuevo turno para {targetDayKey}:
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {['T1', 'T2', 'T3', 'T4'].map((t) => {
                            const isSameShift = sourceDayKey === targetDayKey && sourceShiftKey === t;
                            const isSelected = targetShiftKey === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                disabled={isSameShift}
                                onClick={() => setTargetShiftKey(t)}
                                className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                                  isSameShift
                                    ? 'bg-dark2 border-border text-text-dim/40 cursor-not-allowed opacity-40'
                                    : isSelected
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                                    : 'bg-dark3 border-border text-text hover:bg-dark3/80'
                                }`}
                              >
                                <span>{t}</span>
                                {isSameShift && <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Actual</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Paso 3: Razón o Motivo */}
                    {targetShiftKey && (
                      <div className="space-y-1.5 pt-2 border-t border-border animate-in fade-in">
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block">
                          3. Motivo o razón del cambio:
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Explica brevemente el motivo por el cual necesitas reagendar tu turno (ej: compromiso laboral, asunto de salud...)"
                          value={requestReason}
                          onChange={(e) => setRequestReason(e.target.value)}
                          className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe] font-medium placeholder:text-text-dim"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Botón de Enviar */}
                <div className="pt-4 border-t border-border flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsRescheduleModalOpen(false)}
                    className="flex-1 h-11 rounded-full text-xs font-bold border-border text-text bg-dark3 hover:bg-dark"
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    disabled={!sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey || !requestReason.trim() || isSubmitting}
                    onClick={handleSendRescheduleRequest}
                    className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:bg-dark3 disabled:text-text-dim disabled:border-border text-white rounded-full h-11 text-xs font-bold shadow-lg active:scale-95 transition-all"
                  >
                    {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
