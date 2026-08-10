"use client";

import React, { useState, useMemo } from 'react';
import { getContinuousScheduledBlockForSession, calculateSessionMinutes } from '@/lib/session-utils';
import { formatUnifiedDuration } from '@/lib/shift-calculations';
import { adjustSessionTimesAdminAction } from '@/app/actions/attendance';
import { parseDayKeyToDateStr } from '@/lib/dates';
import { getNormalizedRole } from '@/lib/auth';

export interface AdminSessionCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  volunteerName: string;
  assignedShiftKeys?: string[];
  onSuccess?: () => void;
}

export function AdminSessionCorrectionModal({
  isOpen,
  onClose,
  session,
  volunteerName,
  assignedShiftKeys = ['T1', 'T2', 'T3', 'T4'],
  onSuccess,
}: AdminSessionCorrectionModalProps) {
  const isAdmin = getNormalizedRole() === 'Admin';
  const [mode, setMode] = useState<'selection' | 'confirm_official' | 'custom_time'>('selection');
  const [customTimeInput, setCustomTimeInput] = useState<string>('15:00');
  const [customReason, setCustomReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const block = useMemo(() => {
    if (!session?.day_key || !session?.started_at) return null;
    return getContinuousScheduledBlockForSession(
      session.day_key,
      session.started_at,
      assignedShiftKeys
    );
  }, [session, assignedShiftKeys]);

  const customTimeIso = useMemo(() => {
    if (!session?.day_key || !customTimeInput) return null;
    const dateStr = parseDayKeyToDateStr(session.day_key);
    return `${dateStr}T${customTimeInput}:00-06:00`;
  }, [session?.day_key, customTimeInput]);

  const customDurationMinutes = useMemo(() => {
    if (!session?.started_at || !customTimeIso) return 0;
    const calc = calculateSessionMinutes(session.started_at, customTimeIso);
    return calc.totalWorkedMinutes;
  }, [session?.started_at, customTimeIso]);

  if (!isOpen || !session) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-rose-500/30 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl">
          <span className="material-symbols-outlined text-4xl text-rose-400 mb-2">lock</span>
          <h3 className="text-lg font-bold text-text">Acceso Restringido</h3>
          <p className="text-sm text-text-dim mt-2">
            Solo un Administrador del sistema puede corregir horas de salida olvidadas.
          </p>
          <button
            onClick={onClose}
            className="mt-5 px-5 py-2 rounded-xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const handleConfirmOfficial = async () => {
    if (!block) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await adjustSessionTimesAdminAction({
        sessionId: session.id,
        endedAt: block.suggestedEndTimeIso,
        correctionType: 'official_shift_end'
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
    if (!customTimeIso) {
      setErrorMsg('Ingresa una hora de salida válida.');
      return;
    }
    if (!customReason || customReason.trim().length < 5) {
      setErrorMsg('Debes especificar un motivo manual de al menos 5 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await adjustSessionTimesAdminAction({
        sessionId: session.id,
        endedAt: customTimeIso,
        reason: customReason.trim(),
        correctionType: 'custom_time'
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <span className="material-symbols-outlined text-[22px]">edit_calendar</span>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-text leading-snug">Corregir Salida Olvidada</h3>
              <p className="text-xs text-text-dim font-medium">{volunteerName} · {session.day_key}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
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
                  <span className="text-amber-400 font-extrabold">{block.blockLabel}</span>
                </div>
                <p className="text-text-dim text-[11px]">
                  Hora sugerida de salida: <strong className="text-text">{block.suggestedEndTimeFormatted}</strong> (Duración: {formatUnifiedDuration(block.durationMinutes)})
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
                ⚠ No se pudo identificar un bloque continuo asignado a esta sesión. Debes indicar una hora personalizada.
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2.5 pt-2">
              {block && (
                <button
                  onClick={() => setMode('confirm_official')}
                  className="w-full py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                  Usar Fin Oficial ({block.suggestedEndTimeFormatted})
                </button>
              )}

              <button
                onClick={() => setMode('custom_time')}
                className="w-full py-3 px-4 rounded-2xl bg-surface border border-border text-text hover:bg-surface-hover font-bold text-xs flex items-center justify-center gap-2 transition-colors"
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
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs space-y-2">
              <span className="font-bold block text-sm">Confirmar salida a hora oficial</span>
              <p className="text-text/90">
                <strong>{volunteerName}</strong> será registrado con salida a las <strong>{block.suggestedEndTimeFormatted}</strong>.
              </p>
              <p className="text-text-dim text-[11px]">
                Tiempo total resultante: <strong className="text-text font-bold">{formatUnifiedDuration(block.durationMinutes)}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                disabled={isSubmitting}
                onClick={handleConfirmOfficial}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs shadow-lg flex items-center justify-center gap-1"
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar Salida'}
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => setMode('selection')}
                className="px-4 py-3 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* MODE 3: CUSTOM TIME */}
        {mode === 'custom_time' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-text block">Hora de salida (HH:MM 24h)</label>
              <input
                type="time"
                value={customTimeInput}
                onChange={(e) => setCustomTimeInput(e.target.value)}
                className="w-full p-3 rounded-xl bg-surface border border-border text-text font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            {customDurationMinutes > 0 && (
              <div className="p-3 rounded-xl bg-surface border border-border text-xs text-text-dim flex justify-between">
                <span>Tiempo resultante:</span>
                <strong className="text-amber-400 font-bold">{formatUnifiedDuration(customDurationMinutes)}</strong>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-text block">
                Motivo administrativo <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Especifica el motivo de la corrección (mín. 5 caracteres)"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full p-3 rounded-xl bg-surface border border-border text-text text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                disabled={isSubmitting}
                onClick={handleConfirmCustom}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs shadow-lg flex items-center justify-center gap-1"
              >
                {isSubmitting ? 'Guardando...' : 'Guardar hora personalizada'}
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => setMode('selection')}
                className="px-4 py-3 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover"
              >
                Volver
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
