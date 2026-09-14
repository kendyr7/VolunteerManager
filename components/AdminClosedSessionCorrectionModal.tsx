'use client';

import { useMemo, useState } from 'react';
import { correctClosedAttendanceSessionAdminAction } from '@/app/actions/attendance';
import { AttendanceSession } from '@/lib/session-utils';
import { getSessionsOverlappingCorrection, validateCorrectedSession } from '@/lib/session-correction';

function localDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (name: string) => parts.find(part => part.type === name)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

function toGuatemalaIso(value: string) {
  return value ? new Date(`${value}:00-06:00`).toISOString() : '';
}

export function AdminClosedSessionCorrectionModal({ session, otherSessions, volunteerName, onClose, onSuccess }: {
  session: AttendanceSession;
  otherSessions: AttendanceSession[];
  volunteerName: string;
  onClose: () => void;
  onSuccess: (absorbedSessionIds: string[]) => void | Promise<void>;
}) {
  const originalEntry = localDateTime(session.started_at);
  const originalExit = localDateTime(session.ended_at!);
  const [entry, setEntry] = useState(() => originalEntry);
  const [exit, setExit] = useState(() => originalExit);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const overlap = useMemo(() => {
    try {
      if (!entry || !exit) return { absorbed: [], blocking: [] };
      const corrected = {
        ...session,
        started_at: entry === originalEntry ? session.started_at : toGuatemalaIso(entry),
        ended_at: exit === originalExit ? session.ended_at : toGuatemalaIso(exit),
      };
      return getSessionsOverlappingCorrection(session, corrected, otherSessions);
    } catch {
      return { absorbed: [], blocking: [] };
    }
  }, [entry, exit, session, originalEntry, originalExit, otherSessions]);
  const duration = useMemo(() => {
    const startedAt = entry === originalEntry ? session.started_at : toGuatemalaIso(entry);
    const endedAt = exit === originalExit ? session.ended_at! : toGuatemalaIso(exit);
    const minutes = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    return Number.isFinite(minutes) && minutes >= 0 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : '—';
  }, [entry, exit, originalEntry, originalExit, session.started_at, session.ended_at]);

  const submit = async () => {
    let startedAt = '';
    let endedAt = '';
    try {
      startedAt = entry === originalEntry ? session.started_at : toGuatemalaIso(entry);
      endedAt = exit === originalExit ? session.ended_at! : toGuatemalaIso(exit);
    } catch { setError('Ingresa fechas y horas válidas.'); return; }
    const invalid = validateCorrectedSession(session.day_key, startedAt, endedAt);
    if (invalid) { setError(invalid); return; }
    if (overlap.blocking.length > 0) {
      setError('Hay otra asistencia abierta o parcialmente solapada. Revisa sus horas antes de unirla.');
      return;
    }
    if (overlap.absorbed.length > 0 && !mergeConfirmed) {
      setError('Confirma la unión de los registros de asistencia.');
      return;
    }
    if (reason.trim().length < 5) { setError('Indica un motivo de al menos 5 caracteres.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await correctClosedAttendanceSessionAdminAction({
        sessionId: session.id, expectedStartedAt: session.started_at, expectedEndedAt: session.ended_at!,
        startedAt, endedAt, reason, mergeOverlapping: overlap.absorbed.length > 0 && mergeConfirmed,
      });
      if (!result.success) { setError(result.error); return; }
      await onSuccess(overlap.absorbed.map(other => other.id));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la corrección.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="closed-session-title">
      <div className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl border border-border bg-dark2 p-5 text-text shadow-xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="closed-session-title" className="text-lg font-extrabold">Corregir asistencia cerrada</h2>
            <p className="mt-1 text-xs text-text-dim">{volunteerName} · {session.day_key}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-2 text-xl text-text-dim" aria-label="Cerrar">×</button>
        </div>
        <p className="rounded-lg bg-dark3 p-3 text-xs text-text-dim">
          Registro actual: {localDateTime(session.started_at).replace('T', ' ')} → {localDateTime(session.ended_at!).replace('T', ' ')}. La corrección quedará en el historial de auditoría junto con el motivo.
        </p>
        <label className="block text-xs font-bold">Entrada
          <input type="datetime-local" value={entry} onChange={event => { setEntry(event.target.value); setMergeConfirmed(false); }} disabled={busy} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-dark3 p-2 text-sm text-text" />
        </label>
        <label className="block text-xs font-bold">Salida
          <input type="datetime-local" value={exit} onChange={event => { setExit(event.target.value); setMergeConfirmed(false); }} disabled={busy} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-dark3 p-2 text-sm text-text" />
        </label>
        <p className="text-xs text-text-dim">Duración resultante: <strong className="text-text">{duration}</strong></p>
        {overlap.absorbed.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-text">
            <p className="font-bold">Esta corrección incluirá {overlap.absorbed.length} asistencia{overlap.absorbed.length === 1 ? '' : 's'} cerrada{overlap.absorbed.length === 1 ? '' : 's'} del mismo día.</p>
            {overlap.absorbed.map(other => (
              <p key={other.id}>{localDateTime(other.started_at).replace('T', ' ')} → {localDateTime(other.ended_at!).replace('T', ' ')}</p>
            ))}
            <p>Se conservarán las horas originales en auditoría y el tiempo se contará una sola vez.</p>
            <label className="flex items-start gap-2 font-semibold">
              <input type="checkbox" checked={mergeConfirmed} onChange={event => setMergeConfirmed(event.target.checked)} disabled={busy} className="mt-0.5" />
              Confirmo que fue una sola jornada continua y quiero unir estos registros.
            </label>
          </div>
        )}
        {overlap.blocking.length > 0 && <p role="alert" className="rounded-lg bg-red/10 p-2 text-xs font-bold text-red">Hay una asistencia abierta o solo parcialmente cubierta. Corrige sus horas antes de unirla.</p>}
        <label className="block text-xs font-bold">Motivo administrativo
          <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} disabled={busy} placeholder="Explica la corrección" className="mt-1 block w-full rounded-lg border border-border bg-dark3 p-2 text-sm text-text" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red/10 p-2 text-xs font-bold text-red">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 flex-1 rounded-lg border border-border text-xs font-bold">Cancelar</button>
          <button type="button" onClick={submit} disabled={busy || overlap.blocking.length > 0 || (overlap.absorbed.length > 0 && !mergeConfirmed)} className="min-h-11 flex-1 rounded-lg bg-primary text-xs font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : overlap.absorbed.length > 0 ? 'Unir y guardar' : 'Guardar corrección'}</button>
        </div>
      </div>
    </div>
  );
}
