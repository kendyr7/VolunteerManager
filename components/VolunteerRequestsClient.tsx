'use client'

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getActiveEventDays, formatDateShort } from "@/lib/dates";
import {
  fetchVolunteerShiftChangeRequestsAction,
  createShiftChangeRequestAction
} from "@/app/actions/shift-change-actions";
import {
  useVolunteerRescheduleContext,
  isVolunteerShiftCompleted,
  isVolunteerShiftAssigned,
  getVolunteerShiftCapacity,
} from "@/lib/use-volunteer-reschedule-context";

interface VolunteerRequestsClientProps {
  volunteerId: string;
  shiftsByDay: Record<string, string[]>;
  initialRequests: any[];
}

export function VolunteerRequestsClient({
  volunteerId,
  shiftsByDay,
  initialRequests = []
}: VolunteerRequestsClientProps) {
  const [requests, setRequests] = useState<any[]>(initialRequests);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [sourceDayKey, setSourceDayKey] = useState<string>("");
  const [sourceShiftKey, setSourceShiftKey] = useState<string>("");
  const [targetDayKey, setTargetDayKey] = useState<string>("");
  const [targetShiftKey, setTargetShiftKey] = useState<string>("");
  const [requestReason, setRequestReason] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const rescheduleCtx = useVolunteerRescheduleContext(volunteerId);

  const sourceShiftCompleted = !!(sourceDayKey && sourceShiftKey && isVolunteerShiftCompleted(rescheduleCtx, sourceDayKey, sourceShiftKey));

  const targetShiftStatus = {
    isSource: sourceDayKey === targetDayKey && sourceShiftKey === targetShiftKey,
    isCompleted: !!(targetDayKey && targetShiftKey && isVolunteerShiftCompleted(rescheduleCtx, targetDayKey, targetShiftKey)),
    isAssigned: !!(targetDayKey && targetShiftKey && isVolunteerShiftAssigned(rescheduleCtx, targetDayKey, targetShiftKey)),
  };

  const targetCapacity = targetDayKey && targetShiftKey
    ? getVolunteerShiftCapacity(rescheduleCtx, targetDayKey, targetShiftKey)
    : { committeeName: '', count: 0, maxReq: 0, isFull: false };

  const isSourceDayFullyCompleted = (dayKey: string) => {
    const shifts = shiftsByDay[dayKey] || [];
    return shifts.length > 0 && shifts.every(t => isVolunteerShiftCompleted(rescheduleCtx, dayKey, t));
  };

  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  const refreshRequests = async () => {
    setLoading(true);
    const res = await fetchVolunteerShiftChangeRequestsAction(volunteerId);
    if (res.success && res.requests) {
      setRequests(res.requests);
    }
    setLoading(false);
  };

  // Days on which the volunteer has assigned shifts
  const assignedDayKeys = Object.keys(shiftsByDay).filter(d => (shiftsByDay[d] || []).length > 0);

  const handleSendRescheduleRequest = async () => {
    if (!volunteerId || !sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey) return;
    if (!requestReason.trim()) {
      setSubmitError("Por favor ingresa la razón o motivo por el cual solicitas el cambio.");
      return;
    }

    if (sourceShiftCompleted) {
      setSubmitError("No se puede solicitar un cambio para un turno que ya ha sido completado.");
      return;
    }

    if (targetShiftStatus.isSource) {
      setSubmitError("El turno solicitado es el mismo que tu turno actual.");
      return;
    }

    if (targetShiftStatus.isCompleted) {
      setSubmitError("Ya tienes un turno completado en esta fecha y horario.");
      return;
    }

    if (targetShiftStatus.isAssigned) {
      setSubmitError("Ya tienes un turno asignado en esta fecha y horario.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const res = await createShiftChangeRequestAction({
      volunteerId,
      currentDayKey: sourceDayKey,
      currentShiftKey: sourceShiftKey,
      requestedDayKey: targetDayKey,
      requestedShiftKey: targetShiftKey,
      reason: requestReason.trim(),
    });

    if (res.success) {
      setSubmitSuccess("✅ Solicitud enviada exitosamente. El coordinador la revisará en breve.");
      await refreshRequests();
      setTimeout(() => {
        setIsRescheduleModalOpen(false);
        setSubmitSuccess(null);
        setSourceDayKey("");
        setSourceShiftKey("");
        setTargetDayKey("");
        setTargetShiftKey("");
        setRequestReason("");
      }, 1500);
    } else {
      setSubmitError(res.error || "Ocurrió un error al enviar la solicitud.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-6 pb-32 lg:pb-8">
      {/* Header with Title, (?) Helper Badge, and + Nueva Solicitud button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-text tracking-tight">
              Mis Solicitudes
            </h1>
            <div className="relative group flex items-center cursor-help">
              <span className="w-5 h-5 rounded-full bg-dark3 border border-border text-text-dim text-xs font-bold flex items-center justify-center group-hover:bg-[#4d7cfe]/20 group-hover:text-[#4d7cfe] group-hover:border-[#4d7cfe]/40 transition-all">
                ?
              </span>
              <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col z-50 w-64 p-2.5 bg-dark2 border border-border text-text text-xs rounded-xl shadow-2xl backdrop-blur-xl font-medium pointer-events-none">
                Consulta el estado de tus solicitudes de reagendamiento de turno y envía nuevas peticiones.
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={() => setIsRescheduleModalOpen(true)}
          className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs rounded-full h-10 px-5 shadow-lg active:scale-95 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add_task</span>
          <span>Reagendar turno</span>
        </Button>
      </div>

      {/* Requests Content Area */}
      {loading ? (
        <Card className="border border-border bg-dark2 p-8 text-center text-text-dim rounded-xl">
          Cargando solicitudes...
        </Card>
      ) : requests.length === 0 ? (
        <Card className="border border-border bg-dark2/60 p-12 text-center text-text-dim rounded-2xl">
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-dark3 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[36px] text-text-dim">published_with_changes</span>
            </div>
            <h3 className="font-bold text-text text-lg mb-1">No tienes solicitudes enviadas</h3>
            <p className="text-xs text-text-dim max-w-md">
              Para solicitar un cambio de fecha u horario en tus turnos asignados, haz clic en el botón superior "Reagendar turno".
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW (hidden on tablet/mobile, NO horizontal scrollbar) */}
          <div className="hidden lg:block rounded-2xl border border-border bg-dark2 shadow-sm overflow-hidden w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/80 bg-dark3/80 text-[11px] font-extrabold uppercase text-text-dim tracking-wider">
                  <th className="py-3.5 px-4 w-32">Estado</th>
                  <th className="py-3.5 px-4 w-36">Turno Actual</th>
                  <th className="py-3.5 px-4 w-40">Nuevo Turno</th>
                  <th className="py-3.5 px-4">Motivo del Cambio</th>
                  <th className="py-3.5 px-4 text-right w-32">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {requests.map((req) => {
                  const isPending = req.status === 'pending';
                  const isApproved = req.status === 'approved';
                  const isRejected = req.status === 'rejected';

                  return (
                    <tr key={req.id} className="hover:bg-dark3/40 transition-all">
                      {/* Estado */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            En revisión
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Aprobada
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Rechazada
                          </span>
                        )}
                      </td>

                      {/* Turno Actual */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-rose-400 font-bold bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 text-xs">
                          {req.current_shift_key} <span className="font-normal text-text-dim text-[11px]">({req.current_day_key})</span>
                        </span>
                      </td>

                      {/* Turno Solicitado */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-xs">
                          {req.requested_shift_key} <span className="font-normal text-text-dim text-[11px]">({req.requested_day_key})</span>
                        </span>
                      </td>

                      {/* Motivo */}
                      <td className="py-3.5 px-4">
                        {req.reason ? (
                          <p className="text-xs text-text italic truncate max-w-xs" title={req.reason}>
                            "{req.reason}"
                          </p>
                        ) : (
                          <span className="text-text-dim text-[11px] italic">Sin motivo</span>
                        )}
                      </td>

                      {/* Fecha */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap text-text-dim font-mono text-[11px]">
                        {req.created_at ? new Date(req.created_at).toLocaleDateString('es-ES') : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET OPTIMIZED CARD VIEW (shown on tablet and mobile screens) */}
          <div className="block lg:hidden space-y-3 w-full">
            {requests.map((req) => {
              const isPending = req.status === 'pending';
              const isApproved = req.status === 'approved';
              const isRejected = req.status === 'rejected';

              return (
                <div key={req.id} className="bg-dark2 border border-border rounded-xl p-3.5 space-y-2.5 shadow-sm">
                  {/* Top line: Status Pill & Date */}
                  <div className="flex items-center justify-between gap-2">
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        En revisión
                      </span>
                    )}
                    {isApproved && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Aprobada
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        Rechazada
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-text-dim">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString('es-ES') : ''}
                    </span>
                  </div>

                  {/* Middle line: Shift Transition Pill Badges */}
                  <div className="flex items-center justify-between bg-dark3/60 p-2 rounded-lg border border-border/60 text-xs">
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase font-bold text-text-dim block mb-0.5">Original</span>
                      <span className="text-rose-400 font-bold">
                        {req.current_shift_key} <span className="text-[10px] text-text-dim">({req.current_day_key})</span>
                      </span>
                    </div>

                    <span className="material-symbols-outlined text-text-dim text-[16px]">arrow_forward</span>

                    <div className="text-right min-w-0">
                      <span className="text-[9px] uppercase font-bold text-text-dim block mb-0.5">Solicitado</span>
                      <span className="text-emerald-400 font-bold">
                        {req.requested_shift_key} <span className="text-[10px] text-text-dim">({req.requested_day_key})</span>
                      </span>
                    </div>
                  </div>

                  {/* Bottom line: Reason quote */}
                  {req.reason && (
                    <div className="text-[11px] text-text-dim italic font-medium pt-1 border-t border-border/40">
                      "{req.reason}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal para Nueva Solicitud */}
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

                {sourceShiftCompleted && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-rose-400 shrink-0">block</span>
                    <div>
                      <p className="text-rose-200 font-extrabold text-xs mb-0.5">Turno Origen Completado</p>
                      <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                        Este turno ya fue completado y finalizado. No es posible solicitar un cambio para un turno en estado completado.
                      </p>
                    </div>
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
                          const dayCompleted = isSourceDayFullyCompleted(d.key);
                          const bgColors = [
                            'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                            'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                          ];
                          const cardBg = bgColors[index % bgColors.length];

                          return (
                            <button
                              key={d.key}
                              type="button"
                              disabled={dayCompleted}
                              onClick={() => {
                                setSourceDayKey(d.key);
                                setSourceShiftKey("");
                              }}
                              className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-xl border transition-all bg-dark3 ${
                                dayCompleted
                                  ? 'opacity-30 border-border cursor-not-allowed'
                                  : isSelected
                                  ? 'border-[#4d7cfe] text-[#4d7cfe] shadow-md bg-[#4d7cfe]/10 cursor-pointer'
                                  : 'border-border text-text-dim hover:text-text cursor-pointer'
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
                              const isCompleted = isVolunteerShiftCompleted(rescheduleCtx, sourceDayKey, t);
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  disabled={isCompleted}
                                  onClick={() => setSourceShiftKey(t)}
                                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                                    isCompleted
                                      ? 'bg-dark2 border-border text-text-dim/40 cursor-not-allowed opacity-40'
                                      : isSelected
                                      ? 'bg-rose-500 border-rose-500 text-white shadow-md cursor-pointer'
                                      : 'bg-dark3 border-border text-text hover:bg-dark3/80 cursor-pointer'
                                  }`}
                                >
                                  <span>{t}</span>
                                  {isCompleted && <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Completado</span>}
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
                            const tCompleted = isVolunteerShiftCompleted(rescheduleCtx, targetDayKey, t);
                            const tAssigned = !isSameShift && isVolunteerShiftAssigned(rescheduleCtx, targetDayKey, t);
                            const capInfo = getVolunteerShiftCapacity(rescheduleCtx, targetDayKey, t);
                            const isFull = capInfo.isFull;
                            const isBtnDisabled = isSameShift || tCompleted || tAssigned;
                            return (
                              <button
                                key={t}
                                type="button"
                                disabled={isBtnDisabled}
                                onClick={() => setTargetShiftKey(t)}
                                className={`py-2 rounded-xl border text-xs font-bold transition-all relative ${
                                  isBtnDisabled
                                    ? 'bg-dark2 border-border text-text-dim/40 cursor-not-allowed opacity-40'
                                    : isFull
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 cursor-pointer'
                                    : isSelected
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md cursor-pointer'
                                    : 'bg-dark3 border-border text-text hover:bg-dark3/80 cursor-pointer'
                                }`}
                              >
                                <span>{t}</span>
                                {isSameShift ? (
                                  <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Actual</span>
                                ) : tCompleted ? (
                                  <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Completado</span>
                                ) : tAssigned ? (
                                  <span className="block text-[8px] text-amber-400 font-bold leading-none">Asignado</span>
                                ) : isFull ? (
                                  <span className="block text-[8px] text-amber-400 font-bold leading-none">Lleno ({capInfo.count}/{capInfo.maxReq})</span>
                                ) : (
                                  <span className="block text-[8px] text-text-dim/70 font-normal leading-none">
                                    {capInfo.maxReq > 0 ? `${capInfo.count} / ${capInfo.maxReq}` : `${capInfo.count} asig.`}
                                  </span>
                                )}
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

                {/* Advertencias de validación del turno destino */}
                {targetShiftStatus.isSource && (
                  <div className="p-3.5 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-inter font-bold flex items-center gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-purple-400 shrink-0">info</span>
                    <span>Este es el turno actual origen. Selecciona otro horario o día para solicitar el cambio.</span>
                  </div>
                )}
                {!targetShiftStatus.isSource && targetShiftStatus.isCompleted && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-rose-400 shrink-0">block</span>
                    <div>
                      <p className="text-rose-200 font-extrabold text-xs mb-0.5">Turno Ya Completado</p>
                      <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                        Ya completaste este turno previamente. No es posible solicitar un cambio hacia un turno ya completado.
                      </p>
                    </div>
                  </div>
                )}
                {!targetShiftStatus.isSource && !targetShiftStatus.isCompleted && targetShiftStatus.isAssigned && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                    <div>
                      <p className="text-amber-200 font-extrabold text-xs mb-0.5">Turno Ya Asignado</p>
                      <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                        Ya cuentas con este turno activo asignado. Elige un horario o día distinto.
                      </p>
                    </div>
                  </div>
                )}
                {!targetShiftStatus.isSource && !targetShiftStatus.isCompleted && !targetShiftStatus.isAssigned && targetCapacity.isFull && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                    <div>
                      <p className="text-amber-200 font-extrabold text-xs mb-0.5">Capacidad Máxima Alcanzada</p>
                      <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                        El turno <strong className="text-white">{targetShiftKey}</strong> del <strong className="text-white">{targetDayKey}</strong> ya alcanzó la meta requerida para <strong className="text-white">{targetCapacity.committeeName}</strong> ({targetCapacity.count}/{targetCapacity.maxReq}). Puedes enviar la solicitud y el coordinador decidirá si te sobreasigna.
                      </p>
                    </div>
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
                    disabled={!sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey || !requestReason.trim() || isSubmitting || sourceShiftCompleted || targetShiftStatus.isSource || targetShiftStatus.isCompleted || targetShiftStatus.isAssigned}
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
