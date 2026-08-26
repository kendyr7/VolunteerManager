'use client'

import { Button } from '@/components/ui/button';
import type { CoverageLevel, ShiftChangeCoverageImpact, ShiftChangeImpactSlot } from '@/lib/shift-coverage';
import { cn } from '@/lib/utils';

interface ShiftChangeCoverageImpactProps {
  impact?: ShiftChangeCoverageImpact;
  loading: boolean;
  error?: string | null;
  processing?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

const coverageClasses: Record<CoverageLevel, string> = {
  deficit: 'bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
  at_requirement: 'bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  covered: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
  unconfigured: 'bg-slate-50 text-slate-700 dark:bg-dark3 dark:text-text-dim',
};

const recommendationClasses: Record<ShiftChangeCoverageImpact['recommendation'], string> = {
  blocked: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-200',
  safe: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-200',
};

const coverageLabels: Record<CoverageLevel, string> = {
  deficit: 'Queda con déficit',
  at_requirement: 'Queda justo',
  covered: 'Cobertura suficiente',
  unconfigured: 'Sin meta configurada',
};

const recommendationIcons: Record<ShiftChangeCoverageImpact['recommendation'], string> = {
  blocked: 'block',
  warning: 'warning',
  safe: 'check_circle',
};

function CoverageComparisonSlot({
  label,
  slot,
}: {
  label: string;
  slot: ShiftChangeImpactSlot;
}) {
  return (
    <div className={cn('min-w-0 p-3.5', coverageClasses[slot.level])}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-sm font-black text-current">{slot.dayKey} · {slot.shiftKey}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2" aria-label={`${slot.count} asignados ahora, ${slot.projectedCount} después del cambio`}>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">Ahora</p>
          <p className="font-mono text-sm font-black tabular-nums">
            {slot.count}<span className="text-[10px] font-bold opacity-65"> / {slot.required || '—'}</span>
          </p>
        </div>
        <span className="material-symbols-outlined text-[18px] opacity-55" aria-hidden="true">arrow_forward</span>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">Después</p>
          <p className="font-mono text-sm font-black tabular-nums">
            {slot.projectedCount}<span className="text-[10px] font-bold opacity-65"> / {slot.required || '—'}</span>
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] font-extrabold">{coverageLabels[slot.level]}</p>
    </div>
  );
}

export function ShiftChangeCoverageImpactPanel({
  impact,
  loading,
  error,
  processing = false,
  onApprove,
  onReject,
  onClose,
}: ShiftChangeCoverageImpactProps) {
  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-dark2 p-4" aria-label="Consultando cobertura">
        <div className="h-5 w-44 animate-pulse rounded bg-dark3 motion-reduce:animate-none" />
        <div className="h-12 animate-pulse rounded-lg bg-dark3 motion-reduce:animate-none" />
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1].map(item => <div key={item} className="h-28 animate-pulse rounded-lg bg-dark3 motion-reduce:animate-none" />)}
        </div>
      </div>
    );
  }

  if (error || !impact) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-200">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">error</span>
          <div>
            <p className="text-xs font-extrabold">No se pudo consultar la cobertura</p>
            <p className="mt-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">{error || 'Intenta nuevamente.'}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-rose-700 transition-colors hover:text-rose-950 dark:text-rose-300 dark:hover:text-white" aria-label="Cerrar consulta">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    );
  }

  const allSlots = impact.days.flatMap(day => day.slots);
  const sourceSlot = allSlots.find(slot => slot.role === 'source' || slot.role === 'both');
  const targetSlot = allSlots.find(slot => slot.role === 'target' || slot.role === 'both');
  const sameSlot = Boolean(
    sourceSlot
    && targetSlot
    && sourceSlot.dayKey === targetSlot.dayKey
    && sourceSlot.shiftKey === targetSlot.shiftKey
  );

  return (
    <section className="rounded-xl border border-border bg-dark2" aria-label={`Impacto de cobertura para ${impact.volunteerName}`}>
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2">
          <div className={cn('flex min-w-0 flex-1 items-start gap-2.5 rounded-lg border px-3 py-2.5', recommendationClasses[impact.recommendation])}>
            <span className="material-symbols-outlined mt-0.5 text-[19px]" aria-hidden="true">{recommendationIcons[impact.recommendation]}</span>
            <p className="text-xs font-bold leading-5">{impact.message}</p>
          </div>
          <button type="button" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-text-dim dark:hover:bg-dark3 dark:hover:text-text" aria-label="Cerrar consulta">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className={cn('overflow-hidden rounded-lg border border-border', !sameSlot && sourceSlot && targetSlot && 'sm:grid sm:grid-cols-2')}>
          {sourceSlot && <CoverageComparisonSlot label={sameSlot ? 'Turno solicitado' : 'Turno de origen'} slot={sourceSlot} />}
          {!sameSlot && sourceSlot && targetSlot && (
            <div className="flex h-8 items-center justify-center border-y border-border bg-dark2 text-text-dim sm:hidden">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_downward</span>
            </div>
          )}
          {!sameSlot && targetSlot && (
            <div className="border-t border-border sm:border-l sm:border-t-0">
              <CoverageComparisonSlot label="Turno solicitado" slot={targetSlot} />
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onReject} disabled={processing} className="h-9 rounded-full border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 dark:hover:text-rose-200">
            Rechazar solicitud
          </Button>
          <Button type="button" onClick={onApprove} disabled={!impact.canApprove || processing} className="h-9 rounded-full bg-emerald-700 px-4 text-xs font-extrabold text-white hover:bg-emerald-600 disabled:bg-dark3 disabled:text-text-dim dark:bg-emerald-600 dark:hover:bg-emerald-500">
            {processing ? 'Procesando…' : impact.canApprove ? 'Aprobar cambio' : 'Aprobación no disponible'}
          </Button>
        </div>
      </div>
    </section>
  );
}
