'use client';

import type { FocusEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SmartSearchBarProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  onImmediateSearch?: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
  results?: ReactNode;
  showResults?: boolean;
  resultsId?: string;
  className?: string;
  inputClassName?: string;
}

export function SmartSearchBar({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  onImmediateSearch,
  onFocusChange,
  results,
  showResults = false,
  resultsId,
  className,
  inputClassName,
}: SmartSearchBarProps) {
  const normalizedValue = value.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onImmediateSearch?.(normalizedValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    onValueChange('');
    onImmediateSearch?.('');
    onFocusChange?.(false);
    event.currentTarget.blur();
  };

  const handleBlur = (event: FocusEvent<HTMLFormElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onFocusChange?.(false);
    }
  };

  return (
    <form
      className={cn('relative flex w-full min-w-0 items-center', className)}
      onSubmit={handleSubmit}
      onFocus={() => onFocusChange?.(true)}
      onBlur={handleBlur}
      role="search"
    >
      <span className="material-symbols-outlined pointer-events-none absolute left-4 z-10 text-[20px] text-black/40 dark:text-white/70">
        search
      </span>
      <input
        type="search"
        value={value}
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        role={results ? 'combobox' : undefined}
        aria-expanded={results ? showResults : undefined}
        aria-controls={results ? resultsId : undefined}
        aria-autocomplete={results ? 'list' : undefined}
        autoComplete="off"
        className={cn(
          'h-12 w-full rounded-full border border-black/10 bg-black/5 py-3.5 pl-12 pr-32 text-[13px] font-bold font-inter text-black outline-none transition-all placeholder:text-black/50 focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-[#fff6] dark:text-white dark:placeholder:text-white/70 dark:focus:ring-white/30',
          '[&::-webkit-search-cancel-button]:hidden',
          inputClassName
        )}
      />
      <div className="absolute inset-y-0 right-1.5 z-10 flex items-center">
        {value ? (
          <button
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              onValueChange('');
              onImmediateSearch?.('');
            }}
            className="flex h-9 cursor-pointer items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/20 px-3.5 text-xs font-bold font-inter text-rose-500 transition-colors hover:bg-rose-500/30 dark:text-rose-400"
            aria-label="Limpiar búsqueda"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            <span>Limpiar</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled
            className="flex h-9 items-center gap-1 rounded-full bg-[#4d7cfe] px-4 text-xs font-bold font-inter text-white opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            <span>Buscar</span>
          </button>
        )}
      </div>
      {showResults ? results : null}
    </form>
  );
}
