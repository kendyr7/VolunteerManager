'use client';

import { cn } from '@/lib/utils';
import type { ThemePreference, ThemeTransitionOrigin } from '@/lib/use-theme-preference';

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: string;
}> = [
  { value: 'light', label: 'Claro', icon: 'light_mode' },
  { value: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  { value: 'system', label: 'Sistema', icon: 'devices' },
];

interface MobileThemeMenuProps {
  open: boolean;
  preference: ThemePreference;
  onChange: (preference: ThemePreference, source?: ThemeTransitionOrigin) => void;
  onClose: () => void;
}

export function MobileThemeMenu({
  open,
  preference,
  onChange,
  onClose,
}: MobileThemeMenuProps) {
  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label="Seleccionar apariencia"
      className="fixed bottom-[104px] left-4 right-4 z-[60] mx-auto max-w-md rounded-xl border border-border bg-dark2 p-2 shadow-lg lg:hidden"
    >
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <div>
          <p className="text-sm font-bold text-text">Apariencia</p>
          <p className="text-[11px] font-medium text-text-dim">Elige cómo quieres ver la aplicación</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar selector de apariencia"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-dark3 hover:text-text"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-dark3 p-1">
        {THEME_OPTIONS.map(option => {
          const isSelected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={isSelected}
              onClick={(event) => {
                onChange(option.value, event);
                onClose();
              }}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors',
                isSelected
                  ? 'bg-[#4d7cfe] text-white'
                  : 'text-text-dim hover:bg-dark2 hover:text-text'
              )}
            >
              <span className="material-symbols-outlined text-[20px]">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
