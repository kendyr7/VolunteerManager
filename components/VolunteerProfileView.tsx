'use client'

import React, { useState, useEffect, useMemo } from "react";
import { getActiveEventDays, formatDateShort } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntryPassButton } from "@/components/EntryPassButton";
import { cn } from "@/lib/utils";
import {
  createShiftChangeRequestAction,
  fetchVolunteerShiftChangeRequestsAction
} from "@/app/actions/shift-change-actions";
import {
  undoVolunteerCheckInAction,
  reopenCompletedShiftAction
} from "@/app/actions/audit-actions";
import { useCoordinatorData } from "@/lib/coordinator-data-context";

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
  onClose?: () => void;
  onEditProfile?: (vol: VolunteerProfileData) => void;
  onArchiveProfile?: (vol: VolunteerProfileData) => void;
  currentUserId?: string;
  shiftsByDay?: Record<string, string[]>;
  checkedInMap?: Record<string, any>;
  checkedOutMap?: Record<string, any>;
  onToggleShift?: (dayKey: string, shiftKey: string) => void;
  isEditingShifts?: boolean;
  setIsEditingShifts?: (val: boolean) => void;
  canEditShifts?: boolean;
  onStartEditShifts?: () => void;
  onStartEditProfile?: () => void;
  onSaveShifts?: () => void;
  savedNotice?: boolean;
}

export function VolunteerProfileView({
  volunteer,
  mode = 'coordinator',
  onClose,
  onEditProfile,
  onArchiveProfile,
}: VolunteerProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'shifts' | 'requests'>('details');

  const { refresh } = useCoordinatorData();

  // Permisos y Usuario
  const userRole = typeof window !== 'undefined' ? localStorage.getItem('mock_role') || 'Admin' : 'Admin';
  const userName = typeof window !== 'undefined' ? localStorage.getItem('mock_user_name') || 'Administrador' : 'Administrador';
  const isAdmin = userRole === 'Admin';

  // Historial de solicitudes
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Formulario de Solicitud de Cambio de Turno (Modo Voluntario)
  const [sourceDayKey, setSourceDayKey] = useState<string>("");
  const [sourceShiftKey, setSourceShiftKey] = useState<string>("");
  const [targetDayKey, setTargetDayKey] = useState<string>("");
  const [targetShiftKey, setTargetShiftKey] = useState<string>("");
  const [requestReason, setRequestReason] = useState<string>("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestNotice, setRequestNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Auditoría State
  const [auditMessage, setAuditMessage] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isProcessingAudit, setIsProcessingAudit] = useState(false);

  // Días de Evento
  const EVENT_DAYS_RAW = useMemo(() => getActiveEventDays(), []);
  const EVENT_DAYS = useMemo(() => EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  })), [EVENT_DAYS_RAW]);

  // Turnos mock o sincronizados
  const [shiftsByDayState, setShiftsByDayState] = useState<Record<string, string[]>>({});
  const [checkedInMapState, setCheckedInMapState] = useState<Record<string, boolean>>({});
  const [checkedOutMapState, setCheckedOutMapState] = useState<Record<string, boolean>>({});
  const [isEditingShiftsState, setIsEditingShiftsState] = useState(false);
  const [savedNoticeState, setSavedNoticeState] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedShifts = localStorage.getItem(`vol_shifts_${volunteer.id}`);
        if (storedShifts) {
          setShiftsByDayState(JSON.parse(storedShifts));
        } else {
          setShiftsByDayState({
            [EVENT_DAYS[0]?.key || "Jue 10"]: ["T1"],
            [EVENT_DAYS[2]?.key || "Sáb 12"]: ["T2"]
          });
        }

        const storedCheckIn = localStorage.getItem(`vol_checkin_${volunteer.id}`);
        if (storedCheckIn) {
          setCheckedInMapState(JSON.parse(storedCheckIn));
        }

        const storedCheckOut = localStorage.getItem(`completed_shifts_map`);
        if (storedCheckOut) {
          const map = JSON.parse(storedCheckOut);
          const userOut: Record<string, boolean> = {};
          Object.keys(map).forEach(key => {
            if (key.startsWith(`${volunteer.id}-`)) {
              const subKey = key.replace(`${volunteer.id}-`, '');
              userOut[subKey] = true;
            }
          });
          setCheckedOutMapState(userOut);
        }
      } catch (e) {
        console.error("Error loading volunteer state:", e);
      }
    }
  }, [volunteer.id, EVENT_DAYS]);

  // Cargar solicitudes de cambio de turno
  useEffect(() => {
    async function loadRequests() {
      setIsLoadingRequests(true);
      const res = await fetchVolunteerShiftChangeRequestsAction(volunteer.id);
      if (res.success && res.requests) {
        setRequests(res.requests);
      }
      setIsLoadingRequests(false);
    }
    loadRequests();
  }, [volunteer.id]);

  const assignedDayKeys = useMemo(() => {
    return Object.keys(shiftsByDayState).filter(d => (shiftsByDayState[d] || []).length > 0);
  }, [shiftsByDayState]);

  const handleToggleShift = (dayKey: string, shiftKey: string) => {
    if (!isEditingShiftsState) return;
    setShiftsByDayState(prev => {
      const current = prev[dayKey] || [];
      const updated = current.includes(shiftKey)
        ? current.filter(s => s !== shiftKey)
        : [...current, shiftKey];
      return { ...prev, [dayKey]: updated };
    });
  };

  const handleSaveShifts = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`vol_shifts_${volunteer.id}`, JSON.stringify(shiftsByDayState));
    }
    setIsEditingShiftsState(false);
    setSavedNoticeState(true);
    setTimeout(() => setSavedNoticeState(false), 3000);
  };

  // Reversión exclusiva para Admins: Deshacer Check-in
  const handleUndoCheckIn = async (dayKey: string, shiftKey: string) => {
    if (!isAdmin) return;
    setIsProcessingAudit(true);
    setAuditMessage(null);

    const res = await undoVolunteerCheckInAction({
      volunteerId: volunteer.id,
      dayKey,
      shiftKey,
      actorName: userName,
      actorRole: userRole
    });

    if (res.success) {
      setCheckedInMapState(prev => ({ ...prev, [`${dayKey}-${shiftKey}`]: false }));
      setAuditMessage({ type: 'success', msg: res.message || 'Check-in revertido correctamente.' });
      await refresh(true);
    } else {
      setAuditMessage({ type: 'error', msg: res.error || 'Error al revertir check-in' });
    }
    setIsProcessingAudit(false);
  };

  // Reversión exclusiva para Admins: Reabrir Turno Completado
  const handleReopenShift = async (dayKey: string, shiftKey: string) => {
    if (!isAdmin) return;
    setIsProcessingAudit(true);
    setAuditMessage(null);

    const res = await reopenCompletedShiftAction({
      volunteerId: volunteer.id,
      dayKey,
      shiftKey,
      actorName: userName,
      actorRole: userRole
    });

    if (res.success) {
      setCheckedOutMapState(prev => ({ ...prev, [`${dayKey}-${shiftKey}`]: false }));
      setCheckedInMapState(prev => ({ ...prev, [`${dayKey}-${shiftKey}`]: true }));
      setAuditMessage({ type: 'success', msg: res.message || 'Turno reabierto correctamente.' });
      await refresh(true);
    } else {
      setAuditMessage({ type: 'error', msg: res.error || 'Error al reabrir turno' });
    }
    setIsProcessingAudit(false);
  };

  // Solicitar Cambio de Turno (Modo Voluntario)
  const handleSubmitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey) {
      setRequestNotice({ type: 'error', msg: 'Por favor completa todos los campos requeridos.' });
      return;
    }

    setIsSubmittingRequest(true);
    setRequestNotice(null);

    const res = await createShiftChangeRequestAction({
      volunteerId: volunteer.id,
      currentDayKey: sourceDayKey,
      currentShiftKey: sourceShiftKey,
      requestedDayKey: targetDayKey,
      requestedShiftKey: targetShiftKey,
      reason: requestReason
    });

    if (res.success) {
      setRequestNotice({ type: 'success', msg: 'Solicitud enviada correctamente. El administrador la revisará en breve.' });
      setSourceDayKey("");
      setSourceShiftKey("");
      setTargetDayKey("");
      setTargetShiftKey("");
      setRequestReason("");
      
      const reqRes = await fetchVolunteerShiftChangeRequestsAction(volunteer.id);
      if (reqRes.success && reqRes.requests) {
        setRequests(reqRes.requests);
      }
    } else {
      setRequestNotice({ type: 'error', msg: res.error || 'No se pudo enviar la solicitud.' });
    }
    setIsSubmittingRequest(false);
  };

  const isShiftCheckedIn = (dayKey: string, shiftKey: string) => {
    return !!checkedInMapState[`${dayKey}-${shiftKey}`];
  };

  const isShiftCheckedOut = (dayKey: string, shiftKey: string) => {
    return !!checkedOutMapState[`${dayKey}-${shiftKey}`];
  };

  return (
    <div className="flex flex-col h-full bg-dark text-text font-sans">
      {/* Target/Header */}
      <div className="p-4 sm:p-6 bg-dark2 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 flex items-center justify-center text-[#4d7cfe] font-bold text-lg">
              {(volunteer.first_name || volunteer.name || "V").charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-text leading-tight">
                {volunteer.first_name ? `${volunteer.first_name} ${volunteer.last_name || ''}` : volunteer.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px] bg-dark3 border-border font-bold">
                  {volunteer.committee || 'Sin comité'}
                </Badge>
                {volunteer.stake && (
                  <span className="text-[10px] text-text-dim">Estaca {volunteer.stake}</span>
                )}
              </div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-dark3 border border-border flex items-center justify-center text-text-dim hover:text-text cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Modal Tabs */}
        <div className="flex items-center gap-2 border-b border-border/50 pb-1">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === 'details'
                ? "bg-[#4d7cfe] text-white shadow-sm"
                : "text-text-dim hover:text-text hover:bg-dark3"
            )}
          >
            Detalles
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === 'shifts'
                ? "bg-[#4d7cfe] text-white shadow-sm"
                : "text-text-dim hover:text-text hover:bg-dark3"
            )}
          >
            Turnos y Asistencia
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === 'requests'
                ? "bg-[#4d7cfe] text-[#ffffff] shadow-sm"
                : "text-text-dim hover:text-text hover:bg-dark3"
            )}
          >
            <span>Solicitudes</span>
            {requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Mensaje de auditoría */}
        {auditMessage && (
          <div className={cn(
            "p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between animate-in fade-in",
            auditMessage.type === 'success'
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border-rose-500/30 text-rose-300"
          )}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                {auditMessage.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{auditMessage.msg}</span>
            </div>
            <button onClick={() => setAuditMessage(null)} className="text-text-dim hover:text-text">✕</button>
          </div>
        )}

        {/* Tab 1: Detalles */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-dark2 border border-border rounded-xl">
                <span className="text-[10px] text-text-dim uppercase font-bold block mb-1">Teléfono</span>
                <span className="text-xs font-bold text-text">{volunteer.phone || 'No registrado'}</span>
              </div>
              <div className="p-3 bg-dark2 border border-border rounded-xl">
                <span className="text-[10px] text-text-dim uppercase font-bold block mb-1">Barrio / Confiabilidad</span>
                <span className="text-xs font-bold text-text">{volunteer.ward || 'N/A'} · {volunteer.reliability ?? 100}%</span>
              </div>
            </div>

            {/* Pases de entrada */}
            <div className="pt-2">
              <span className="text-xs font-bold text-text uppercase tracking-wider block mb-3">Pase de Entrada</span>
              <EntryPassButton volunteerId={volunteer.id} volunteerName={volunteer.name} committeeName={volunteer.committee || ''} />
            </div>

            {/* Acciones de administración */}
            {mode === 'coordinator' && (
              <div className="pt-4 border-t border-border flex gap-3">
                {onEditProfile && (
                  <Button
                    onClick={() => onEditProfile(volunteer)}
                    className="flex-1 bg-dark3 border-border text-text hover:bg-dark2 font-bold text-xs h-10 rounded-xl"
                  >
                    Editar Datos
                  </Button>
                )}
                {onArchiveProfile && (
                  <Button
                    onClick={() => onArchiveProfile(volunteer)}
                    variant="outline"
                    className="flex-1 bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 font-bold text-xs h-10 rounded-xl"
                  >
                    Archivar Voluntario
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Turnos y Asistencia */}
        {activeTab === 'shifts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-xs font-bold text-text uppercase tracking-wider">Programación de Turnos</h3>
                <p className="text-[10px] text-text-dim">Horarios asignados para el evento</p>
              </div>
              {mode === 'coordinator' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => isEditingShiftsState ? handleSaveShifts() : setIsEditingShiftsState(true)}
                  className="h-8 px-3 text-xs font-bold bg-[#4d7cfe]/15 border-[#4d7cfe]/30 text-[#4d7cfe]"
                >
                  {isEditingShiftsState ? 'Guardar Cambios' : 'Editar Turnos'}
                </Button>
              )}
            </div>

            {savedNoticeState && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl text-center">
                ¡Turnos actualizados correctamente!
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {EVENT_DAYS.map((d, index) => {
                const dayKey = d.key;
                const assignedList = shiftsByDayState[dayKey] || [];
                const dayAbbr = d.label.substring(0, 3);

                return (
                  <div
                    key={dayKey}
                    className="bg-dark2 border border-border rounded-xl p-3 sm:p-4 flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[36px]">
                        <span className="font-inter font-black text-xs uppercase tracking-widest text-text-dim leading-none">
                          {dayAbbr}
                        </span>
                        <span className="text-lg font-black text-text leading-none mt-1">{d.dateNum}</span>
                      </div>
                      <div className="h-8 w-[1px] bg-border" />
                    </div>

                    <div className="flex items-center gap-2">
                      {['T1', 'T2', 'T3', 'T4'].map((t) => {
                        const active = assignedList.includes(t);
                        const inCheck = isShiftCheckedIn(dayKey, t);
                        const outCheck = isShiftCheckedOut(dayKey, t);

                        return (
                          <div key={t} className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              disabled={!isEditingShiftsState}
                              onClick={() => handleToggleShift(dayKey, t)}
                              className={cn(
                                "flex flex-col items-center justify-center w-10 h-10 rounded-lg border text-xs font-bold transition-all",
                                outCheck
                                  ? "bg-slate-500/20 border-slate-500/40 text-slate-400"
                                  : inCheck
                                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                  : active
                                  ? "bg-[#4d7cfe]/20 border-[#4d7cfe]/40 text-[#8bb0ff]"
                                  : "bg-dark3 border-border text-text-dim opacity-50"
                              )}
                            >
                              <span>{t}</span>
                              {outCheck ? (
                                <span className="text-[7px] font-extrabold text-slate-400 uppercase">Fin</span>
                              ) : inCheck ? (
                                <span className="text-[7px] font-extrabold text-emerald-400 uppercase">Entró</span>
                              ) : null}
                            </button>

                            {/* Opciones exclusivas de Administrador: Reversión de Asistencia */}
                            {isAdmin && mode === 'coordinator' && (
                              <div className="flex gap-1">
                                {outCheck ? (
                                  <button
                                    type="button"
                                    disabled={isProcessingAudit}
                                    onClick={() => handleReopenShift(dayKey, t)}
                                    title="Reabrir turno completado"
                                    className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold border border-amber-500/30 hover:bg-amber-500/30 transition-all cursor-pointer"
                                  >
                                    Reabrir
                                  </button>
                                ) : inCheck ? (
                                  <button
                                    type="button"
                                    disabled={isProcessingAudit}
                                    onClick={() => handleUndoCheckIn(dayKey, t)}
                                    title="Deshacer entrada"
                                    className="px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[8px] font-bold border border-rose-500/30 hover:bg-rose-500/30 transition-all cursor-pointer"
                                  >
                                    Deshacer
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Solicitudes de Reagendamiento */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider">Historial de Solicitudes</h3>

            {/* Formulario de Reagendamiento para Voluntarios */}
            {mode === 'volunteer' && (
              <form onSubmit={handleSubmitReschedule} className="p-4 bg-dark2 border border-border rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-[#4d7cfe] uppercase">Solicitar Reagendamiento de Turno</h4>
                
                {requestNotice && (
                  <div className={cn(
                    "p-3 rounded-xl text-xs font-bold border",
                    requestNotice.type === 'success' ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  )}>
                    {requestNotice.msg}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-text-dim uppercase block mb-1">Día Actual</label>
                    <select
                      value={sourceDayKey}
                      onChange={e => setSourceDayKey(e.target.value)}
                      className="w-full h-9 px-2 bg-dark3 border border-border rounded-lg text-xs font-bold text-text outline-none"
                    >
                      <option value="">Seleccionar día</option>
                      {assignedDayKeys.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text-dim uppercase block mb-1">Turno Actual</label>
                    <select
                      value={sourceShiftKey}
                      onChange={e => setSourceShiftKey(e.target.value)}
                      className="w-full h-9 px-2 bg-dark3 border border-border rounded-lg text-xs font-bold text-text outline-none"
                    >
                      <option value="">Seleccionar turno</option>
                      {(shiftsByDayState[sourceDayKey] || []).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text-dim uppercase block mb-1">Día Deseado</label>
                    <select
                      value={targetDayKey}
                      onChange={e => setTargetDayKey(e.target.value)}
                      className="w-full h-9 px-2 bg-dark3 border border-border rounded-lg text-xs font-bold text-text outline-none"
                    >
                      <option value="">Seleccionar fecha</option>
                      {EVENT_DAYS.map(d => (
                        <option key={d.key} value={d.key}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text-dim uppercase block mb-1">Turno Deseado</label>
                    <select
                      value={targetShiftKey}
                      onChange={e => setTargetShiftKey(e.target.value)}
                      className="w-full h-9 px-2 bg-dark3 border border-border rounded-lg text-xs font-bold text-text outline-none"
                    >
                      <option value="">Seleccionar horario</option>
                      {['T1', 'T2', 'T3', 'T4'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-text-dim uppercase block mb-1">Motivo (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. Compromiso personal / Choque de horario"
                    value={requestReason}
                    onChange={e => setRequestReason(e.target.value)}
                    className="w-full h-9 px-3 bg-dark3 border border-border rounded-lg text-xs font-bold text-text outline-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmittingRequest}
                  className="w-full bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold h-10 rounded-xl text-xs"
                >
                  {isSubmittingRequest ? 'Enviando...' : 'Enviar Solicitud al Administrador'}
                </Button>
              </form>
            )}

            {/* Lista de Solicitudes Registradas */}
            {isLoadingRequests ? (
              <div className="py-6 text-center text-text-dim text-xs font-bold">Cargando solicitudes...</div>
            ) : requests.length === 0 ? (
              <div className="p-6 text-center text-text-dim border border-dashed border-border rounded-xl text-xs">
                No hay solicitudes de cambio registradas.
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map(r => (
                  <div key={r.id} className="p-3 bg-dark2 border border-border rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">
                        Cambio: {r.current_shift_key} ({r.current_day_key}) ➔ {r.requested_shift_key} ({r.requested_day_key})
                      </span>
                      <Badge className={cn(
                        "text-[9px] uppercase font-bold",
                        r.status === 'approved' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                        r.status === 'rejected' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                        "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      )}>
                        {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                      </Badge>
                    </div>
                    {r.reason && <p className="text-text-dim text-[11px]">Motivo: {r.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
