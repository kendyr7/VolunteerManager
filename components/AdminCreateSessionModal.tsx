"use client";

import React, { useMemo, useState } from 'react';
import { createAttendanceSessionAdminAction } from '@/app/actions/attendance';
import { Button } from '@/components/ui/button';
import { CustomTimePicker } from '@/components/CustomTimePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canRegisterMissingAttendance } from '@/lib/permissions';
import { parseDayKeyToDateStr } from '@/lib/dates';
import { formatUnifiedDuration } from '@/lib/shift-calculations';
import { calculateSessionMinutes, getContinuousScheduledBlocks } from '@/lib/session-utils';
import { useMobileDrawerNavigation } from '@/lib/use-mobile-drawer-navigation';

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
  assignedShiftRecords = [],
  initialDayKey,
  onSuccess,
  isMockMode = false,
}: AdminCreateSessionModalProps) {
  const isAdmin = canRegisterMissingAttendance();

  const availableDayKeys = useMemo(() => {
    const dayKeys = new Set<string>();
    assignedShiftRecords.forEach((record) => dayKeys.add(record.day_key));
    if (initialDayKey) dayKeys.add(initialDayKey);
    if (dayKeys.size === 0) dayKeys.add('vie 11');
    return Array.from(dayKeys);
  }, [assignedShiftRecords, initialDayKey]);

  const [selectedDayKey, setSelectedDayKey] = useState(initialDayKey || availableDayKeys[0] || 'vie 11');
  const [selectedShiftKey, setSelectedShiftKey] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<'completed' | 'open'>('completed');
  const [entryMode, setEntryMode] = useState<'official' | 'custom'>('official');
  const [exitMode, setExitMode] = useState<'official' | 'custom'>('official');
  const [customEntryTime, setCustomEntryTime] = useState('11:00');
  const [customExitTime, setCustomExitTime] = useState('15:00');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOutsideWarning, setConfirmOutsideWarning] = useState(false);
  const { drawerRef, scrollAreaRef } = useMobileDrawerNavigation<HTMLElement, HTMLDivElement>({
    isOpen,
    onClose,
    disabled: isSubmitting,
    mobileQuery: '(max-width: 639px)',
    closeThreshold: 88,
  });

  const assignedShiftKeys = useMemo(
    () => assignedShiftRecords.filter((record) => record.day_key === selectedDayKey).map((record) => record.shift_key),
    [assignedShiftRecords, selectedDayKey],
  );

  const scheduledShifts = useMemo(
    () => Array.from(new Set(assignedShiftKeys.map((shiftKey) => shiftKey.toUpperCase().trim())))
      .filter((shiftKey) => /^T[1-4]$/.test(shiftKey))
      .flatMap((shiftKey) => getContinuousScheduledBlocks(selectedDayKey, [shiftKey]))
      .sort((first, second) => first.startHour - second.startHour),
    [assignedShiftKeys, selectedDayKey],
  );

  const selectedShift = useMemo(
    () => scheduledShifts.find((shift) => shift.shiftKeys[0] === selectedShiftKey) || scheduledShifts[0] || null,
    [scheduledShifts, selectedShiftKey],
  );
  const resolvedEntryMode = selectedShift ? entryMode : 'custom';
  const resolvedExitMode = selectedShift ? exitMode : 'custom';

  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, onClose]);

  const entryIso = useMemo(() => {
    if (!selectedDayKey) return null;
    if (resolvedEntryMode === 'official' && selectedShift) return selectedShift.startTimeIso;
    return `${parseDayKeyToDateStr(selectedDayKey)}T${customEntryTime}:00-06:00`;
  }, [customEntryTime, resolvedEntryMode, selectedDayKey, selectedShift]);

  const exitIso = useMemo(() => {
    if (!selectedDayKey || sessionState === 'open') return null;
    if (resolvedExitMode === 'official' && selectedShift) return selectedShift.endTimeIso;
    return `${parseDayKeyToDateStr(selectedDayKey)}T${customExitTime}:00-06:00`;
  }, [customExitTime, resolvedExitMode, selectedDayKey, selectedShift, sessionState]);

  const workedMinutes = useMemo(() => {
    if (!entryIso) return 0;
    const calculation = calculateSessionMinutes(entryIso, exitIso);
    return calculation.isClosed ? calculation.totalWorkedMinutes : calculation.provisionalMinutes;
  }, [entryIso, exitIso]);

  const isOutsideShift = useMemo(() => {
    if (!selectedShift || !entryIso) return false;
    const shiftStartMs = new Date(selectedShift.startTimeIso).getTime();
    const shiftEndMs = new Date(selectedShift.endTimeIso).getTime();
    const entryMs = new Date(entryIso).getTime();
    const entryOutsideShift = entryMs < shiftStartMs - 900000;
    const exitOutsideShift = exitIso ? new Date(exitIso).getTime() > shiftEndMs + 900000 : false;
    return entryOutsideShift || exitOutsideShift;
  }, [entryIso, exitIso, selectedShift]);

  const handleSubmit = async () => {
    if (!entryIso) {
      setErrorMsg('Selecciona una hora de entrada válida.');
      return;
    }

    if ((resolvedEntryMode === 'custom' || resolvedExitMode === 'custom') && reason.trim().length < 5) {
      setErrorMsg('Debes ingresar un motivo administrativo de al menos 5 caracteres.');
      return;
    }

    if (isOutsideShift && !confirmOutsideWarning) {
      setConfirmOutsideWarning(true);
      setErrorMsg(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    if (isMockMode) {
      window.setTimeout(() => {
        setIsSubmitting(false);
        onSuccess?.();
        onClose();
      }, 200);
      return;
    }

    try {
      const response = await createAttendanceSessionAdminAction({
        volunteerId,
        dayKey: selectedDayKey,
        startedAt: entryIso,
        endedAt: sessionState === 'completed' ? exitIso : null,
        correctionType: resolvedEntryMode === 'official' ? 'official_shift_start' : 'custom_start_time',
        reason: reason.trim(),
      });

      if (response.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg('No se pudo guardar la sesión de asistencia.');
      }
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Error al procesar la sesión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="missing-attendance-denied-title">
        <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Cerrar" />
        <div className="relative w-full max-w-sm rounded-xl bg-dark2 p-6 text-center shadow-xl">
          <span className="material-symbols-outlined mb-3 text-3xl text-red">lock</span>
          <h2 id="missing-attendance-denied-title" className="text-lg font-bold text-text">Acceso restringido</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-dim">
            Solo un Administrador puede crear registros manuales de asistencia faltante.
          </p>
          <Button onClick={onClose} className="mt-6 w-full rounded-full">Cerrar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-labelledby="missing-attendance-title">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none"
        onClick={() => !isSubmitting && onClose()}
        disabled={isSubmitting}
        aria-label="Cerrar panel"
      />

      <section
        ref={drawerRef}
        className="relative flex h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full flex-col overflow-hidden rounded-t-2xl border-border bg-dark2 pb-[env(safe-area-inset-bottom)] text-text shadow-xl animate-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none sm:h-full sm:max-h-none sm:max-w-[520px] sm:rounded-none sm:border-l sm:pb-0 sm:slide-in-from-right-4"
      >
        <div className="flex justify-center pb-1 pt-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-text-dim/30" />
        </div>

        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-6">
          <h2 id="missing-attendance-title" className="text-xl font-bold leading-tight text-text">Registrar asistencia faltante</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={isSubmitting} className="hidden shrink-0 rounded-full text-text-dim hover:text-text sm:inline-flex" aria-label="Cerrar panel">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </Button>
        </header>

        <div ref={scrollAreaRef} className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-red/10 p-3.5 text-sm font-semibold text-red" role="alert">
              <span className="material-symbols-outlined shrink-0 text-[20px]">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-text">Día asignado del evento</label>
            <Select value={selectedDayKey} onValueChange={(value) => value && setSelectedDayKey(value)}>
              <SelectTrigger className="h-11 w-full rounded-lg border border-border bg-dark3 px-3 text-sm font-bold text-text focus:border-primary focus:ring-2 focus:ring-primary/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">calendar_today</span>
                  <SelectValue placeholder="Selecciona el día" />
                </div>
              </SelectTrigger>
              <SelectContent className="z-[250] border-border bg-dark2 text-text shadow-lg">
                {availableDayKeys.map((dayKey) => (
                  <SelectItem key={dayKey} value={dayKey} className="cursor-pointer px-3 py-2.5 text-sm font-bold focus:bg-dark3">{dayKey}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-extrabold text-text">Turno programado</legend>
            {scheduledShifts.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {scheduledShifts.map((shift) => {
                  const shiftKey = shift.shiftKeys[0];
                  const isSelected = selectedShift?.shiftKeys[0] === shiftKey;
                  return (
                    <button
                      key={`${shiftKey}-${shift.startTimeIso}`}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedShiftKey(shiftKey)}
                      className={`flex min-h-[56px] items-center justify-between rounded-lg border px-3.5 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isSelected ? 'border-primary bg-primary/10 text-text' : 'border-border bg-dark2 text-text hover:bg-dark3'}`}
                    >
                      <span>
                        <span className="block text-sm font-extrabold">{shiftKey}</span>
                        <span className="mt-0.5 block text-xs font-medium text-text-dim">{shift.startTimeFormatted} – {shift.endTimeFormatted}</span>
                      </span>
                      <span className={`material-symbols-outlined text-[19px] ${isSelected ? 'text-primary' : 'text-text-dim/40'}`}>
                        {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-dark3 p-3.5 text-sm leading-relaxed text-text-dim">No hay turnos asignados para este día.</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-extrabold text-text">Estado de la jornada</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-dark3 p-1">
              <button type="button" aria-pressed={sessionState === 'completed'} className={`min-h-[44px] rounded-md px-3 py-2 text-xs font-extrabold transition-colors ${sessionState === 'completed' ? 'bg-dark2 text-text shadow-sm' : 'text-text-dim hover:text-text'}`} onClick={() => setSessionState('completed')}>
                Jornada completada
              </button>
              <button type="button" aria-pressed={sessionState === 'open'} className={`min-h-[44px] rounded-md px-3 py-2 text-xs font-extrabold transition-colors ${sessionState === 'open' ? 'bg-dark2 text-text shadow-sm' : 'text-text-dim hover:text-text'}`} onClick={() => setSessionState('open')}>
                Actualmente en turno
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="pr-3 text-sm font-extrabold text-text">Hora de entrada</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {selectedShift && (
                <button type="button" aria-pressed={entryMode === 'official'} onClick={() => setEntryMode('official')} className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${entryMode === 'official' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-dark2 text-text-dim hover:bg-dark3 hover:text-text'}`}>
                  Inicio oficial · {selectedShift.startTimeFormatted}
                </button>
              )}
              <button type="button" aria-pressed={resolvedEntryMode === 'custom'} onClick={() => setEntryMode('custom')} className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${resolvedEntryMode === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-dark2 text-text-dim hover:bg-dark3 hover:text-text'}`}>
                Indicar otra hora
              </button>
            </div>
            {resolvedEntryMode === 'custom' && <CustomTimePicker value={customEntryTime} onChange={setCustomEntryTime} />}
          </fieldset>

          {sessionState === 'completed' && (
            <fieldset className="space-y-3 border-t border-border pt-5">
              <legend className="pr-3 text-sm font-extrabold text-text">Hora de salida</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selectedShift && (
                  <button type="button" aria-pressed={exitMode === 'official'} onClick={() => setExitMode('official')} className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${exitMode === 'official' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-dark2 text-text-dim hover:bg-dark3 hover:text-text'}`}>
                    Fin oficial · {selectedShift.endTimeFormatted}
                  </button>
                )}
                <button type="button" aria-pressed={resolvedExitMode === 'custom'} onClick={() => setExitMode('custom')} className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${resolvedExitMode === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-dark2 text-text-dim hover:bg-dark3 hover:text-text'}`}>
                  Indicar otra hora
                </button>
              </div>
              {resolvedExitMode === 'custom' && <CustomTimePicker value={customExitTime} onChange={setCustomExitTime} />}
            </fieldset>
          )}

          <div className="space-y-2 rounded-lg bg-dark3 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-text-dim">Duración resultante</span>
              <strong className="text-base font-extrabold text-primary">{formatUnifiedDuration(workedMinutes)}</strong>
            </div>
            {selectedShift && (
              <div className="flex items-center justify-between gap-4 border-t border-border pt-2 text-xs">
                <span className="text-text-dim">Horario del turno</span>
                <span className="font-bold text-text">{selectedShift.startTimeFormatted} – {selectedShift.endTimeFormatted}</span>
              </div>
            )}
          </div>

          {isOutsideShift && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 p-4 text-amber-800 dark:text-amber-300">
              <span className="material-symbols-outlined shrink-0 text-[20px]">warning</span>
              <div>
                <p className="text-sm font-extrabold">Horario fuera del turno programado</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                  {confirmOutsideWarning ? 'Confirma nuevamente para registrar este horario.' : 'El horario difiere del turno oficial. Revisa los datos antes de continuar.'}
                </p>
              </div>
            </div>
          )}

          {(resolvedEntryMode === 'custom' || resolvedExitMode === 'custom') && (
            <div className="space-y-2">
              <label htmlFor="attendance-reason" className="block text-xs font-extrabold text-text">Motivo administrativo <span className="text-red">*</span></label>
              <textarea
                id="attendance-reason"
                rows={3}
                placeholder="Explica brevemente por qué se registra un horario diferente"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full resize-none rounded-lg border border-border bg-dark3 p-3 text-sm font-medium text-text outline-none transition-colors placeholder:text-text-dim focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-text-dim">Mínimo 5 caracteres.</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 gap-3 border-t border-border bg-dark2 px-5 py-4 sm:px-7" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="h-11 flex-1 rounded-full bg-dark3 text-xs sm:text-sm">Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="h-11 flex-[1.35] rounded-full bg-primary px-4 text-xs text-white hover:bg-primary/90 sm:text-sm">
            {isSubmitting ? (
              <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>Guardando…</>
            ) : (
              <><span className="material-symbols-outlined text-[18px]">check</span>{isOutsideShift && !confirmOutsideWarning ? 'Confirmar horario' : 'Registrar asistencia'}</>
            )}
          </Button>
        </footer>
      </section>
    </div>
  );
}
