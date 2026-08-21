'use client';

import { cn } from '@/lib/utils';

export interface EventDayCardOption {
  key: string;
  label: string;
  dateNum: string;
}

export function EventDayCards({
  days,
  selectedDayKey,
  onDayChange,
  getDayCount,
  allowClear = false,
  showAllOption = false,
  allLabel = 'Todas',
  allKey = '__all__',
  label = 'Fecha',
}: {
  days: EventDayCardOption[];
  selectedDayKey: string;
  onDayChange: (dayKey: string) => void;
  getDayCount?: (dayKey: string) => number;
  allowClear?: boolean;
  showAllOption?: boolean;
  allLabel?: string;
  allKey?: string;
  label?: string;
}) {
  const isAllSelected = selectedDayKey === allKey;

  return (
    <div className="space-y-1.5">
      {label && <span className="block text-[10px] font-bold uppercase tracking-widest text-text-dim">{label}</span>}
      <div className={cn("grid w-full gap-1.5", showAllOption ? "grid-cols-5 sm:grid-cols-9" : "grid-cols-4 sm:grid-cols-8")}>
        {showAllOption && (
          <button
            type="button"
            onClick={() => onDayChange(allKey)}
            aria-pressed={isAllSelected}
            aria-label={allLabel}
            className={cn(
              'relative flex w-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border px-1.5 py-1.5 font-inter transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] cursor-pointer',
              isAllSelected
                ? 'z-10 border-text bg-dark text-text shadow-sm'
                : 'border-border bg-dark3 text-text-dim hover:text-text hover:border-text-dim/60'
            )}
          >
            <span className={cn('text-[9px] font-bold uppercase tracking-wider', isAllSelected ? 'text-text' : 'text-text-dim')}>
              Días
            </span>
            <span className="text-xs font-bold leading-none">{allLabel}</span>
          </button>
        )}

        {days.map((day) => {
          const selected = selectedDayKey === day.key;
          const count = getDayCount?.(day.key) ?? 0;

          return (
            <button
              key={day.key}
              type="button"
              onClick={() => onDayChange(selected && allowClear ? '' : day.key)}
              aria-pressed={selected}
              aria-label={`${day.label} ${day.dateNum}${count > 0 ? `, ${count} programados` : ''}`}
              className={cn(
                'relative flex w-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border px-1.5 py-1.5 font-inter transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] cursor-pointer',
                selected
                  ? 'z-10 border-text bg-dark text-text shadow-sm'
                  : 'border-border bg-dark3 text-text-dim hover:text-text hover:border-text-dim/60'
              )}
            >
              <span className={cn('text-[9px] font-bold uppercase tracking-wider', selected ? 'text-text' : 'text-text-dim')}>
                {day.label.substring(0, 3)}
              </span>
              <span className="text-sm font-black leading-none">{day.dateNum}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EventShiftCard({
  shiftKey,
  count,
  selected,
  disabled = false,
  title,
  onClick,
  className,
  countClassName,
}: {
  shiftKey: string;
  count: number;
  selected: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  className?: string;
  countClassName?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 items-center justify-center gap-1.5 rounded-sm border px-2 py-2.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] md:w-auto md:px-4',
        selected
          ? 'scale-105 border-[#0084d1] bg-[#0084d1] text-white shadow-sm'
          : count > 0
            ? 'border-border bg-dark3 text-text hover:border-text-dim'
            : 'border-border bg-dark2 text-text-dim hover:bg-dark3',
        className
      )}
    >
      <span className="font-inter font-bold">{shiftKey}</span>
      <span className="h-3 w-px bg-current opacity-20" />
      <span className={cn('font-inter font-bold tabular-nums', selected ? 'text-sky-100/90' : 'text-text-dim', countClassName)}>{count}</span>
    </button>
  );
}
