'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getReminderCapacityProjectionAction,
  type ReminderCapacityProjection,
  type ReminderCapacityProjectionRow,
} from '@/app/actions/whatsapp';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATUS_UI: Record<ReminderCapacityProjectionRow['status'], {
  label: string;
  textClassName: string;
  barClassName: string;
}> = {
  available: {
    label: 'Con margen',
    textClassName: 'text-emerald-700 dark:text-emerald-400',
    barClassName: 'bg-emerald-500',
  },
  warning: {
    label: 'Cerca del límite',
    textClassName: 'text-amber-700 dark:text-amber-400',
    barClassName: 'bg-amber-500',
  },
  at_limit: {
    label: 'Reserva utilizada',
    textClassName: 'text-orange-700 dark:text-orange-400',
    barClassName: 'bg-orange-500',
  },
  exceeded: {
    label: 'Límite superado',
    textClassName: 'text-rose-700 dark:text-rose-400',
    barClassName: 'bg-rose-500',
  },
};

function formatProjectionDate(value: string): string {
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 border-b border-border py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
      <p className="text-[11px] font-bold text-text-dim">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums text-text">{value}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-text-dim">{detail}</p>
    </div>
  );
}

function CapacityRow({
  row,
  projection,
}: {
  row: ReminderCapacityProjectionRow;
  projection: ReminderCapacityProjection;
}) {
  const display = STATUS_UI[row.status];
  const originalPercent = projection.messagingLimit > 0
    ? Math.round((row.originalRecipients / projection.messagingLimit) * 1000) / 10
    : 0;
  const reserveMarkerPercent = projection.messagingLimit > 0
    ? (projection.automaticCapacity / projection.messagingLimit) * 100
    : 90;

  return (
    <div className="border-t border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[160px_minmax(260px,1fr)_170px] lg:items-center lg:gap-5">
        <div className="min-w-0">
          <p className="text-sm font-black capitalize text-text">{formatProjectionDate(row.sendDate)}</p>
          <p className="mt-0.5 truncate text-[10px] capitalize text-text-dim">
            Turnos del {row.eventDates.map(formatProjectionDate).join(', ')}
          </p>
        </div>

        <div className="min-w-0 space-y-2.5">
          <div className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-2">
            <span className="text-[10px] font-bold text-text-dim">Original</span>
            <div className="h-2 overflow-hidden rounded-full bg-dark3">
              <div
                className="h-full rounded-full bg-text-dim/35"
                style={{ width: `${Math.min(originalPercent, 100)}%` }}
              />
            </div>
            <span className="text-right text-[10px] font-bold tabular-nums text-text-dim">{originalPercent}%</span>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-2">
            <span className="text-[10px] font-black text-text">Distribuido</span>
            <div className="relative h-2 overflow-visible rounded-full bg-dark3">
              <div
                className={cn('h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none', display.barClassName)}
                style={{ width: `${Math.min(row.usagePercent, 100)}%` }}
              />
              <span
                className="absolute -top-1 h-4 w-px bg-text/45"
                style={{ left: `${Math.min(reserveMarkerPercent, 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <span className={cn('text-right text-[10px] font-black tabular-nums', display.textClassName)}>
              {row.usagePercent}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
          <div>
            <p className="text-sm font-black tabular-nums text-text">
              {row.plannedRecipients} <span className="text-xs font-semibold text-text-dim">/ {projection.messagingLimit}</span>
            </p>
            <p className={cn('mt-0.5 text-[10px] font-black', display.textClassName)}>{display.label}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 lg:mt-2">
            {row.movedInRecipients > 0 && (
              <span className="rounded-full bg-[#4d7cfe]/10 px-2 py-1 text-[9px] font-bold text-[#4d7cfe]">
                +{row.movedInRecipients} recibidos
              </span>
            )}
            {row.movedOutRecipients > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                {row.movedOutRecipients} reubicados
              </span>
            )}
            {row.overflowRecipients > 0 && (
              <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-bold text-rose-700 dark:text-rose-400">
                {row.overflowRecipients} sin cupo
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReminderCapacityProjectionCard() {
  const [projection, setProjection] = useState<ReminderCapacityProjection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProjection = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const result = await getReminderCapacityProjectionAction();
    if (result.success) setProjection(result.projection);
    else setError(result.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getReminderCapacityProjectionAction().then(result => {
      if (cancelled) return;
      if (result.success) setProjection(result.projection);
      else setError(result.error);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const generatedLabel = useMemo(() => {
    if (!projection) return '';
    return new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Guatemala',
    }).format(new Date(projection.generatedAt));
  }, [projection]);

  return (
    <div className="bg-black/[0.02] dark:bg-black/20">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-[#4d7cfe]">monitoring</span>
            <h4 className="text-sm font-black text-text">Capacidad y distribución</h4>
          </div>
          <p className="mt-1 max-w-[70ch] text-[11px] leading-4 text-text-dim">
            Compara la demanda original con el plan automático de 3, 2 o 1 día antes. La línea vertical marca la reserva de seguridad.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadProjection()}
          disabled={isLoading}
          className="h-9 shrink-0 rounded-lg px-3 text-[11px] font-bold"
        >
          <span className={cn('material-symbols-outlined mr-1.5 text-[16px]', isLoading && 'animate-spin')}>refresh</span>
          Actualizar proyección
        </Button>
      </div>

      {isLoading && !projection ? (
        <div className="space-y-3 border-t border-border p-4 sm:p-6" aria-label="Calculando proyección">
          <div className="h-4 w-52 animate-pulse rounded bg-dark3 motion-reduce:animate-none" />
          <div className="h-16 animate-pulse rounded-lg bg-dark3 motion-reduce:animate-none" />
          <div className="h-16 animate-pulse rounded-lg bg-dark3 motion-reduce:animate-none" />
        </div>
      ) : error ? (
        <div className="border-t border-border p-4 sm:p-6">
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
            <span className="material-symbols-outlined mt-0.5 text-[18px]">error</span>
            <span>{error}</span>
          </div>
        </div>
      ) : projection ? (
        <>
          {projection.overflowRecipients > 0 && (
            <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-300 sm:mx-6">
              <span className="material-symbols-outlined mt-0.5 text-[18px]">warning</span>
              <p className="leading-5">
                <strong>Se superó el límite seguro de WhatsApp.</strong>{' '}
                {projection.overflowRecipients} destinatario{projection.overflowRecipients === 1 ? '' : 's'} no pudo{projection.overflowRecipients === 1 ? '' : 'ieron'} distribuirse manteniendo un mínimo de 24 horas.
              </p>
            </div>
          )}

          {projection.invalidPhoneVolunteers > 0 && (
            <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 sm:mx-6">
              <span className="material-symbols-outlined mt-0.5 text-[18px]">phone_disabled</span>
              <p className="leading-5">
                <strong>Hay teléfonos que requieren revisión.</strong>{' '}
                {projection.invalidPhoneVolunteers} voluntario{projection.invalidPhoneVolunteers === 1 ? '' : 's'} no se {projection.invalidPhoneVolunteers === 1 ? 'incluyó' : 'incluyeron'} en la distribución porque no {projection.invalidPhoneVolunteers === 1 ? 'tiene' : 'tienen'} un número válido.
              </p>
            </div>
          )}

          <div className="border-t border-border px-4 sm:px-6">
            <div className="grid sm:grid-cols-4">
              <Metric
                label="Mayor uso real"
                value={`${projection.maxUsagePercent}%`}
                detail={`${projection.messagingLimit} destinatarios únicos disponibles`}
              />
              <Metric
                label="Capacidad automática"
                value={`${projection.automaticCapacity}`}
                detail={`${projection.reservePercent}% reservado para otros envíos`}
              />
              <Metric
                label="Reubicados"
                value={`${projection.redistributedRecipients}`}
                detail="Destinatarios movidos a otra fecha"
              />
              <Metric
                label="Sin capacidad"
                value={`${projection.overflowRecipients}`}
                detail="Requieren atención del administrador"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[9px] font-bold text-text-dim sm:px-6">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-text-dim/35" /> Demanda original</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#4d7cfe]" /> Distribución final</span>
            <span>{projection.preferredLeadDays} días antes como fecha preferida</span>
          </div>

          {projection.days.length > 0 ? (
            <div>
              {projection.days.map(row => (
                <CapacityRow key={row.sendDate} row={row} projection={projection} />
              ))}
            </div>
          ) : (
            <div className="border-t border-border px-4 py-10 text-center sm:px-6">
              <span className="material-symbols-outlined text-[28px] text-text-dim">event_available</span>
              <p className="mt-2 text-xs font-bold text-text">No hay recordatorios pendientes por distribuir.</p>
            </div>
          )}

          <div className="border-t border-border px-4 py-3 text-[9px] text-text-dim sm:px-6">
            Última planificación: {generatedLabel} · {projection.scheduledMessages} mensajes programados · {projection.alreadySentMessages} ya registrados
          </div>
        </>
      ) : null}
    </div>
  );
}
