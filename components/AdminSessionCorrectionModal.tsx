"use client";

import React, { useState, useMemo } from 'react';
import { AttendanceSession, getContinuousScheduledBlockForSession } from '@/lib/session-utils';
import { formatUnifiedDuration } from '@/lib/shift-calculations';
import { adjustSessionTimesAdminAction, closeAttendanceSessionAction } from '@/app/actions/attendance';
import { canCorrectAttendanceTimes } from '@/lib/permissions';
import { getOfficialShiftTime, parseDayKeyToDateStr } from '@/lib/dates';
import { CustomTimePicker } from '@/components/CustomTimePicker';

export interface AdminSessionCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: AttendanceSession;
  volunteerName: string;
  assignedShiftKeys?: string[];
  onSuccess?: () => void;
  isMockMode?: boolean;
}

export function AdminSessionCorrectionModal({
  isOpen,
  onClose,
  session,
  volunteerName,
  assignedShiftKeys = [],
  onSuccess,
  isMockMode = false,
}: AdminSessionCorrectionModalProps) {
  const isAdmin = canCorrectAttendanceTimes();
  
  // Calculate continuous block based on started_at
  const block = useMemo(() => {
    if (!session?.day_key || !session?.started_at) return null;
    return getContinuousScheduledBlockForSession(session.day_key, session.started_at, assignedShiftKeys);
  }, [session?.day_key, session?.started_at, assignedShiftKeys]);

  // Modal Step/Mode
  const [mode, setMode] = useState<'selection' | 'confirm_official' | 'late_scan' | 'custom_time'>('selection');
  
  // Custom Time Form State
  const [customTimeInput, setCustomTimeInput] = useState<string>('15:00');
  const [customReason, setCustomReason] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Computed custom endedAt ISO
  const customTimeIso = useMemo(() => {
    if (!session?.started_at) return null;
    const startDateStr = session.started_at.split('T')[0];
    return `${startDateStr}T${customTimeInput}:00-06:00`;
  }, [session?.started_at, customTimeInput]);

  // Duration for custom time
  const customDurationMinutes = useMemo(() => {
    if (!session?.started_at || !customTimeIso) return 0;
    const startMs = new Date(session.started_at).getTime();
    const endMs = new Date(customTimeIso).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 0;
    return Math.floor((endMs - startMs) / 60000);
  }, [session?.started_at, customTimeIso]);

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-destructive/30 rounded-3xl max-w-md w-full p-6 text-center shadow-2xl">
          <span className="material-symbols-outlined text-4xl text-destructive mb-2">lock</span>
          <h3 className="text-lg font-bold text-foreground">Acceso Restringido</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Solo un Administrador puede realizar correcciones manuales de asistencia.
          </p>
          <button
            onClick={onClose}
            className="mt-5 min-h-[44px] px-6 py-2.5 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover w-full sm:w-auto"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const handleConfirmOfficial = async () => {
    if (!block) {
      setErrorMsg('No se pudo determinar la hora oficial de fin.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    if (isMockMode) {
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess?.();
        onClose();
      }, 200);
      return;
    }

    try {
      const res = await closeAttendanceSessionAction({
        sessionId: session.id,
        endedAt: block.suggestedEndTimeIso,
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.error || 'No se pudo cerrar la sesión.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la salida.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmLateScan = async () => {
    if (!block) {
      setErrorMsg('No se pudo determinar el inicio del bloque asignado.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const dateStr = parseDayKeyToDateStr(session.day_key);
    const startShiftTime = getOfficialShiftTime(session.day_key, block.startShiftKey);
    const startedAtIso = `${dateStr}T${startShiftTime.startTime}:00-06:00`;

    if (isMockMode) {
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess?.();
        onClose();
      }, 200);
      return;
    }

    try {
      const res = await adjustSessionTimesAdminAction({
        sessionId: session.id,
        startedAt: startedAtIso,
        endedAt: session.started_at,
        reason: 'Corrección de entrada sobre escaneo tardío de salida',
        correctionType: 'forgotten_entry_late_scan',
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.error || 'No se pudo guardar la corrección.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la corrección.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCustom = async () => {
    if (!customTimeInput) {
      setErrorMsg('Ingresa una hora de salida.');
      return;
    }
    if (!customReason || customReason.trim().length < 5) {
      setErrorMsg('Debes especificar un motivo de al menos 5 caracteres.');
      return;
    }

    const dateStr = parseDayKeyToDateStr(session.day_key);
    const endedAtIso = `${dateStr}T${customTimeInput}:00-06:00`;

    setIsSubmitting(true);
    setErrorMsg(null);

    if (isMockMode) {
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess?.();
        onClose();
      }, 200);
      return;
    }

    try {
      const res = await adjustSessionTimesAdminAction({
        sessionId: session.id,
        endedAt: endedAtIso,
        reason: customReason.trim(),
        correctionType: 'custom_time',
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.error || 'No se pudo guardar la corrección.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar el tiempo personalizado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-md max-h-[90dvh] flex flex-col shadow-2xl relative overflow-hidden pb-[env(safe-area-inset-bottom)]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 flex items-center justify-center text-[#4d7cfe] shrink-0">
              <span className="material-symbols-outlined text-[22px]">edit_calendar</span>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-text leading-snug">Corregir Asistencia</h3>
              <p className="text-xs text-text-dim font-medium">{volunteerName} · {session.day_key}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-text-dim hover:text-text hover:bg-surface-hover transition-colors shrink-0"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* MODE 1: SELECTION */}
          {mode === 'selection' && (
            <div className="space-y-4">
              {/* Block info card */}
              {block ? (
                <div className="p-4 rounded-2xl bg-surface border border-border text-xs space-y-2">
                  <div className="flex items-center justify-between text-text font-bold">
                    <span>Bloque programado continuo</span>
                    <span className="text-[#4d7cfe] font-black">{block.blockLabel}</span>
                  </div>
                  <p className="text-text-dim text-[11px]">
                    Entrada original: <strong className="text-text">{new Date(session.started_at).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', hour12: true })}</strong>
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  <span>No se pudo identificar un bloque continuo asignado. Indica una hora personalizada.</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2.5 pt-2">
                {block && (
                  <button
                    onClick={() => setMode('confirm_official')}
                    className="min-h-[48px] w-full py-3 px-4 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[18px]">schedule</span>
                    Usar Fin Oficial ({block.suggestedEndTimeFormatted})
                  </button>
                )}

                {session.status === 'open' && (
                  <button
                    onClick={() => setMode('late_scan')}
                    className="min-h-[48px] w-full py-3 px-4 rounded-2xl bg-surface border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px] text-amber-400">warning</span>
                    Corregir entrada sobre escaneo tardío de salida
                  </button>
                )}

                <button
                  onClick={() => setMode('custom_time')}
                  className="min-h-[48px] w-full py-3 px-4 rounded-2xl bg-surface border border-border text-text hover:bg-surface-hover font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">more_time</span>
                  Indicar otra hora personalizada
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: CONFIRM OFFICIAL */}
          {mode === 'confirm_official' && block && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 text-text text-xs space-y-2">
                <span className="font-bold block text-sm text-[#4d7cfe]">Confirmar salida a hora oficial</span>
                <p className="text-text/90">
                  <strong>{volunteerName}</strong> será registrado con salida a las <strong>{block.suggestedEndTimeFormatted}</strong>.
                </p>
                <p className="text-text-dim text-[11px]">
                  Tiempo total resultante: <strong className="text-[#4d7cfe] font-extrabold">{formatUnifiedDuration(block.durationMinutes)}</strong>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                <button
                  disabled={isSubmitting}
                  onClick={handleConfirmOfficial}
                  className="min-h-[48px] w-full sm:flex-1 py-3 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1 transition-transform active:scale-[0.98]"
                >
                  {isSubmitting ? 'Guardando...' : 'Confirmar Salida'}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => setMode('selection')}
                  className="min-h-[48px] w-full sm:w-auto px-5 py-3 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover transition-colors flex items-center justify-center"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* MODE: LATE SCAN CORRECTION */}
          {mode === 'late_scan' && block && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs space-y-2 flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                <div>
                  <div className="font-extrabold text-sm text-amber-300 mb-1">
                    ⚠ Posible Entrada Olvidada
                  </div>
                  <p className="text-text-dim leading-relaxed">
                    El voluntario escaneó a las <strong>{new Date(session.started_at).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', hour12: true })}</strong>. Se corregirá su hora de entrada a la hora oficial de inicio del bloque.
                  </p>
                  <p className="text-text-dim text-[11px] mt-1">
                    Bloque programado: <strong className="text-text">{block.blockLabel}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                <button
                  disabled={isSubmitting}
                  onClick={handleConfirmLateScan}
                  className="min-h-[48px] w-full sm:flex-1 py-3 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1 transition-transform active:scale-[0.98]"
                >
                  {isSubmitting ? 'Guardando...' : 'Confirmar Corrección de Entrada'}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => setMode('selection')}
                  className="min-h-[48px] w-full sm:w-auto px-5 py-3 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover transition-colors flex items-center justify-center"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* MODE 3: CUSTOM TIME */}
          {mode === 'custom_time' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-dim tracking-widest uppercase mb-1.5 block">Hora de salida personalizada</label>
                <CustomTimePicker
                  value={customTimeInput}
                  onChange={setCustomTimeInput}
                />
              </div>

              {customDurationMinutes > 0 && (
                <div className="p-3.5 rounded-2xl bg-surface border border-border text-xs text-text-dim flex justify-between items-center">
                  <span>Tiempo resultante:</span>
                  <strong className="text-[#4d7cfe] font-extrabold text-sm">{formatUnifiedDuration(customDurationMinutes)}</strong>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-dim tracking-widest uppercase mb-1.5 block">
                  Motivo administrativo <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Especifica el motivo de la corrección (mín. 5 caracteres)"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-card p-3 text-xs font-medium text-text focus:outline-none focus:border-[#4d7cfe] focus:ring-2 focus:ring-[#4d7cfe]/20 transition-all"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                <button
                  disabled={isSubmitting}
                  onClick={handleConfirmCustom}
                  className="min-h-[48px] w-full sm:flex-1 py-3 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1 transition-transform active:scale-[0.98]"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar hora personalizada'}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => setMode('selection')}
                  className="min-h-[48px] w-full sm:w-auto px-5 py-3 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover transition-colors flex items-center justify-center"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
