'use client'

import { SHIFT_CHANGE_REASON_OPTIONS } from '@/lib/shift-change-reasons';
import { cn } from '@/lib/utils';

interface ShiftChangeReasonSelectorProps {
  value: string;
  onChange: (reason: string) => void;
  disabled?: boolean;
}

export function ShiftChangeReasonSelector({
  value,
  onChange,
  disabled = false,
}: ShiftChangeReasonSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Motivo del cambio de turno"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {SHIFT_CHANGE_REASON_OPTIONS.map(({ code, label, icon }) => {
        const isSelected = value === label;

        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(label)}
            className={cn(
              'flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[11px] font-bold leading-snug transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2 disabled:cursor-not-allowed disabled:opacity-50',
              isSelected
                ? 'border-[#4d7cfe] bg-[#4d7cfe]/15 text-[#7da0ff] shadow-sm'
                : 'border-border bg-dark3 text-text hover:border-border-strong hover:bg-dark'
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined flex size-7 shrink-0 items-center justify-center rounded-lg text-[16px]',
                isSelected ? 'bg-[#4d7cfe]/20 text-[#7da0ff]' : 'bg-dark2 text-text-dim'
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
            <span className="flex-1">{label}</span>
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                isSelected ? 'border-[#4d7cfe] bg-[#4d7cfe]' : 'border-border-strong bg-dark2'
              )}
              aria-hidden="true"
            >
              {isSelected && <span className="size-1.5 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
