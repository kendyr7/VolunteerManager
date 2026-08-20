'use client';

import { cn } from '@/lib/utils';

export interface EventDayCardOption {
  key: string;
  label: string;
  dateNum: string;
}

const ACCENT_COLORS = [
  'bg-[#10a562]',
  'bg-[#4aa9df]',
  'bg-[#f1c130]',
  'bg-[#d54134]',
  'bg-[#981e32]',
  'bg-[#2c44c2]',
  'bg-[#f1c130]',
  'bg-[#ed1b24]',
];

export function EventDayCards({
  days,
  selectedDayKey,
  onDayChange,
  getDayCount,
  allowClear = false,
  label = 'Fecha',
}: {
  days: EventDayCardOption[];
  selectedDayKey: string;
  onDayChange: (dayKey: string) => void;
  getDayCount?: (dayKey: string) => number;
  allowClear?: boolean;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-text-dim">{label}</span>
      <div className="grid w-full grid-cols-4 gap-2 sm:grid-cols-8">
        {days.map((day, index) => {
          const selected = selectedDayKey === day.key;
          const count = getDayCount?.(day.key) || 0;

          return (
            <button
              key={day.key}
              type="button"
              onClick={() => onDayChange(selected && allowClear ? '' : day.key)}
              aria-pressed={selected}
              aria-label={`${day.label} ${day.dateNum}${count > 0 ? `, ${count} programados` : ''}`}
              className={cn(
                'relative flex w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-dark3 p-2 text-text-dim transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] md:rounded-sm md:px-3 md:py-2.5',
                selected
                  ? 'z-10 scale-105 border-text text-text shadow-sm'
                  : 'border-border opacity-80 hover:scale-[1.02] hover:opacity-100'
              )}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1.5 opacity-90', ACCENT_COLORS[index % ACCENT_COLORS.length])} />
              <span className={cn('font-inter text-[10px] font-bold uppercase tracking-widest md:text-[9px]', selected ? 'text-text' : 'text-text-dim')}>
                {day.label.substring(0, 3)}
              </span>
              <span className="text-base font-black leading-none drop-shadow-sm md:text-sm">{day.dateNum}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full md:static md:mt-1',
                  count > 0 ? 'bg-[#10a562] shadow-[0_0_6px_rgba(16,165,98,0.6)]' : 'bg-neutral-300 dark:bg-neutral-700'
                )}
              />
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
