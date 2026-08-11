"use client";

import React, { useState, useMemo } from 'react';
import { getContinuousScheduledBlocks, ScheduledBlock, calculateSessionMinutes } from '@/lib/session-utils';
import { formatUnifiedDuration } from '@/lib/shift-calculations';
import { createAttendanceSessionAdminAction } from '@/app/actions/attendance';
import { parseDayKeyToDateStr } from '@/lib/dates';
import { getNormalizedRole } from '@/lib/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomTimePicker } from '@/components/CustomTimePicker';

export interface AdminCreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  volunteerId: string;
  volunteerName: string;
  assignedShiftRecords?: { day_key: string; shift_key: string }[];
  initialDayKey?: string;
  onSuccess?: () => void;
  isMockMode?: boolean;
}

export function AdminCreateSessionModal({
  isOpen,
  onClose,
  volunteerId,
  volunteerName,
  assignedShiftRecords = [],
  initialDayKey,
  onSuccess,
  isMockMode = false,
}: AdminCreateSessionModalProps) {
  const isAdmin = getNormalizedRole() === 'Admin';
  
  // Available unique day_keys from assigned shifts or defaults
  const availableDayKeys = useMemo(() => {
    const set = new Set<string>();
    assignedShiftRecords.forEach(r => set.add(r.day_key));
    if (initialDayKey) set.add(initialDayKey);
    if (set.size === 0) set.add('vie 11');
    return Array.from(set);
  }, [assignedShiftRecords, initialDayKey]);

  const [selectedDayKey, setSelectedDayKey] = useState<string>(initialDayKey || availableDayKeys[0] || 'vie 11');
  
  // Get all continuous blocks for selected day
  const assignedShiftKeys = useMemo(() => {
    return assignedShiftRecords.filter(r => r.day_key === selectedDayKey).map(r => r.shift_key);
  }, [assignedShiftRecords, selectedDayKey]);

  const blocks = useMemo(() => {
    return getContinuousScheduledBlocks(selectedDayKey, assignedShiftKeys.length > 0 ? assignedShiftKeys : ['T1', 'T2', 'T3', 'T4']);
  }, [selectedDayKey, assignedShiftKeys]);

  const [selectedBlock, setSelectedBlock] = useState<ScheduledBlock | null>(null);

  // Form State
  const [sessionState, setSessionState] = useState<'completed' | 'open'>('completed');
  const [entryMode, setEntryMode] = useState<'official' | 'custom'>('official');
  const [exitMode, setExitMode] = useState<'official' | 'custom'>('official');
  
  const [customEntryTime, setCustomEntryTime] = useState<string>('11:00');
  const [customExitTime, setCustomExitTime] = useState<string>('15:00');
  const [reason, setReason] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOutsideWarning, setConfirmOutsideWarning] = useState(false);

  // Auto-select first block when day or blocks change
  React.useEffect(() => {
    if (blocks.length > 0) {
      setSelectedBlock(blocks[0]);
    } else {
      setSelectedBlock(null);
    }
  }, [blocks]);

  // Derived Timestamps
  const entryIso = useMemo(() => {
    if (!selectedDayKey) return null;
    const dateStr = parseDayKeyToDateStr(selectedDayKey);
    if (entryMode === 'official' && selectedBlock) {
      return selectedBlock.startTimeIso;
    }
    return `${dateStr}T${customEntryTime}:00-06:00`;
  }, [selectedDayKey, entryMode, selectedBlock, customEntryTime]);

  const exitIso = useMemo(() => {
    if (!selectedDayKey || sessionState === 'open') return null;
    const dateStr = parseDayKeyToDateStr(selectedDayKey);
    if (exitMode === 'official' && selectedBlock) {
      return selectedBlock.endTimeIso;
    }
    return `${dateStr}T${customExitTime}:00-06:00`;
  }, [selectedDayKey, sessionState, exitMode, selectedBlock, customExitTime]);

  // Worked Minutes
  const workedMinutes = useMemo(() => {
    if (!entryIso) return 0;
    const calc = calculateSessionMinutes(entryIso, exitIso);
    return calc.isClosed ? calc.totalWorkedMinutes : calc.provisionalMinutes;
  }, [entryIso, exitIso]);

  // Check if chosen times fall outside the selected block
  const isOutsideBlock = useMemo(() => {
    if (!selectedBlock || !entryIso) return false;
    const blockStartMs = new Date(selectedBlock.startTimeIso).getTime();
    const blockEndMs = new Date(selectedBlock.endTimeIso).getTime();

    const entryMs = new Date(entryIso).getTime();
    const exitMs = exitIso ? new Date(exitIso).getTime() : Date.now();

    return entryMs < blockStartMs - 900000 || exitMs > blockEndMs + 900000; // >15m buffer
  }, [selectedBlock, entryIso, exitIso]);

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-destructive/30 rounded-3xl max-w-md w-full p-6 text-center shadow-2xl">
          <span className="material-symbols-outlined text-4xl text-destructive mb-2">lock</span>
          <h3 className="text-lg font-bold text-foreground">Acceso Restringido</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Solo un Administrador puede crear registros manuales de asistencia faltante.
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

  const handleSubmit = async () => {
    if (!entryIso) {
      setErrorMsg('Selecciona una hora de entrada válida.');
      return;
    }

    if ((entryMode === 'custom' || exitMode === 'custom') && (!reason || reason.trim().length < 5)) {
      setErrorMsg('Debes ingresar un motivo administrativo de al menos 5 caracteres.');
      return;
    }

    if (isOutsideBlock && !confirmOutsideWarning) {
      setConfirmOutsideWarning(true);
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
      const res = await createAttendanceSessionAdminAction({
        volunteerId,
        dayKey: selectedDayKey,
        startedAt: entryIso,
        endedAt: sessionState === 'completed' ? exitIso : null,
        correctionType: entryMode === 'official' ? 'official_shift_start' : 'custom_start_time',
        reason: reason.trim(),
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg('No se pudo guardar la sesión de asistencia.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la sesión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden pb-[env(safe-area-inset-bottom)]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 flex items-center justify-center text-[#4d7cfe] shrink-0">
              <span className="material-symbols-outlined text-[22px]">more_time</span>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-text leading-snug">Registrar Asistencia Faltante</h3>
              <p className="text-xs text-text-dim font-medium">{volunteerName}</p>
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

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Day Selector (Dropdown) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-dim tracking-widest uppercase mb-1.5 block">
              Día asignado del evento
            </label>
            <Select value={selectedDayKey} onValueChange={(v) => v && setSelectedDayKey(v)}>
              <SelectTrigger className="w-full h-11 border border-border bg-card text-text font-bold flex items-center justify-between px-3.5 rounded-xl text-xs focus:border-[#4d7cfe] focus:ring-2 focus:ring-[#4d7cfe]/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#4d7cfe]">calendar_today</span>
                  <SelectValue placeholder="Selecciona el día" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-card border border-border text-text shadow-2xl z-[250]">
                {availableDayKeys.map(dk => (
                  <SelectItem key={dk} value={dk} className="font-bold text-xs text-text hover:bg-muted focus:bg-muted cursor-pointer py-2.5 px-3">
                    {dk}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Block Selection Cards (NO CHECKMARKS) */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-dim tracking-widest uppercase mb-1.5 block">
              ¿A qué bloque programado corresponde?
            </label>
            {blocks.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {blocks.map((b, idx) => {
                  const isSelected = selectedBlock?.blockLabel === b.blockLabel;
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-pressed={isSelected}
                      aria-selected={isSelected}
                      onClick={() => setSelectedBlock(b)}
                      className={`min-h-[56px] p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#4d7cfe]/15 border-2 border-[#4d7cfe] text-text shadow-sm'
                          : 'bg-surface border-border text-text-dim hover:text-text hover:bg-surface-hover'
                      }`}
                    >
                      <div>
                        <span className="font-extrabold text-xs block text-text">{b.blockLabel}</span>
                        <span className="text-[11px] text-text-dim font-medium">{b.startTimeFormatted} – {b.endTimeFormatted}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-surface border border-border text-xs text-text-dim">
                No hay turnos asignados para este día. Se utilizará horario personalizado.
              </div>
            )}
          </div>

          {/* 3. Session State: Completed vs Open */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-dim tracking-widest uppercase mb-1.5 block">
              Estado de la jornada
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`min-h-[44px] px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  sessionState === 'completed' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm' : 'bg-surface border-border text-text-dim hover:text-text'
                }`}
                onClick={() => setSessionState('completed')}
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Jornada completada
              </button>
              <button
                type="button"
                className={`min-h-[44px] px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  sessionState === 'open' ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm' : 'bg-surface border-border text-text-dim hover:text-text'
                }`}
                onClick={() => setSessionState('open')}
              >
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                Actualmente en turno
              </button>
            </div>
          </div>

          {/* 4. Entry Time Controls */}
          <div className="space-y-2.5 p-4 rounded-2xl bg-surface/50 border border-border">
            <label className="text-xs font-extrabold text-text block">Hora de Entrada</label>
            <div className="flex flex-col sm:flex-row gap-2">
              {selectedBlock && (
                <button
                  type="button"
                  className={`min-h-[44px] flex-1 py-2 px-3.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    entryMode === 'official' ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-sm' : 'bg-surface border-border text-text-dim hover:text-text'
                  }`}
                  onClick={() => setEntryMode('official')}
                >
                  Usar inicio oficial ({selectedBlock.startTimeFormatted})
                </button>
              )}
              <button
                type="button"
                className={`min-h-[44px] flex-1 py-2 px-3.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  entryMode === 'custom' ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-sm' : 'bg-surface border-border text-text-dim hover:text-text'
                }`}
                onClick={() => setEntryMode('custom')}
              >
                Indicar otra hora
              </button>
            </div>

            {entryMode === 'custom' && (
              <CustomTimePicker
                value={customEntryTime}
                onChange={setCustomEntryTime}
              />
            )}
          </div>

          {/* 5. Exit Time Controls (If Completed) */}
          {sessionState === 'completed' && (
            <div className="space-y-2.5 p-4 rounded-2xl bg-surface/50 border border-border">
              <label className="text-xs font-extrabold text-text block">Hora de Salida</label>
              <div className="flex flex-col sm:flex-row gap-2">
                {selectedBlock && (
                  <button
                    type="button"
                    className={`min-h-[44px] flex-1 py-2 px-3.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      exitMode === 'official' ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-sm' : 'bg-surface border-border text-text-dim hover:text-text'
                    }`}
                    onClick={() => setExitMode('official')}
                  >
                    Usar fin oficial ({selectedBlock.endTimeFormatted})
                  </button>
                )}
                <button
                  type="button"
                  className={`min-h-[44px] flex-1 py-2 px-3.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    exitMode === 'custom' ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-sm' : 'bg-surface border-border text-text-dim hover:text-text'
                  }`}
                  onClick={() => setExitMode('custom')}
                >
                  Indicar otra hora
                </button>
              </div>

              {exitMode === 'custom' && (
                <CustomTimePicker
                  value={customExitTime}
                  onChange={setCustomExitTime}
                />
              )}
            </div>
          )}

          {/* 6. Summary Card */}
          <div className="p-3.5 rounded-2xl bg-surface border border-border text-xs space-y-1.5">
            <div className="flex justify-between items-center text-text-dim">
              <span>Duración resultante:</span>
              <strong className="text-[#4d7cfe] font-extrabold text-sm">
                {formatUnifiedDuration(workedMinutes)}
              </strong>
            </div>
            {selectedBlock && (
              <div className="flex justify-between items-center text-[11px] text-text-dim border-t border-border/50 pt-1.5">
                <span>Horario del bloque:</span>
                <span className="text-text font-semibold">{selectedBlock.startTimeFormatted} – {selectedBlock.endTimeFormatted}</span>
              </div>
            )}
          </div>

          {/* 7. Non-blocking Warning outside scheduled block */}
          {isOutsideBlock && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs space-y-1.5 flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
              <div>
                <span className="font-extrabold block text-xs text-amber-300">⚠ Horario fuera del bloque programado</span>
                <p className="text-[11px] text-text-dim leading-relaxed">
                  El horario indicado difiere del horario oficial del bloque. Puedes continuar si existe una justificación administrativa.
                </p>
              </div>
            </div>
          )}

          {/* 8. Mandatory Reason for Custom Times */}
          {(entryMode === 'custom' || exitMode === 'custom') && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-dim tracking-widest uppercase mb-1.5 block">
                Motivo administrativo <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Ingresa el motivo de la corrección personalizada (mín. 5 caracteres)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-2xl border border-border bg-card p-3 text-xs font-medium text-text focus:outline-none focus:border-[#4d7cfe] focus:ring-2 focus:ring-[#4d7cfe]/20 transition-all"
              />
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-card shrink-0 flex flex-col sm:flex-row gap-2.5">
          <button
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="min-h-[48px] w-full sm:flex-1 py-3 px-4 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[20px]">check</span>
            {isSubmitting ? 'Guardando...' : (isOutsideBlock && !confirmOutsideWarning ? 'Confirmar de todas formas' : 'Crear Registro de Asistencia')}
          </button>
          <button
            disabled={isSubmitting}
            onClick={onClose}
            className="min-h-[48px] w-full sm:w-auto px-5 py-3 rounded-2xl bg-surface border border-border text-text font-bold text-xs hover:bg-surface-hover transition-colors flex items-center justify-center"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
