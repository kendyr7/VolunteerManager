'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

type ShiftSection = 'active' | 'schedule' | 'areas';

export function ShiftSectionTabs({
  current,
  activeCount,
  showAreas = true,
  onSelect,
  className,
}: {
  current: ShiftSection;
  activeCount?: number;
  showAreas?: boolean;
  onSelect?: (section: Exclude<ShiftSection, 'areas'>) => void;
  className?: string;
}) {
  const items: Array<{
    key: ShiftSection;
    href: string;
    mobileLabel: string;
    desktopLabel: string;
  }> = [
    {
      key: 'active',
      href: '/shifts?view=active',
      mobileLabel: 'En turno',
      desktopLabel: `En turno${activeCount === undefined ? '' : ` (${activeCount})`}`,
    },
    {
      key: 'schedule',
      href: '/shifts?view=turnos',
      mobileLabel: 'Programación',
      desktopLabel: 'Programación',
    },
    ...(showAreas
      ? [{
          key: 'areas' as const,
          href: '/shifts/areas',
          mobileLabel: 'Áreas',
          desktopLabel: 'Áreas y cobertura',
        }]
      : []),
  ];

  return (
    <nav
      aria-label="Secciones de turnos"
      className={cn(
        'grid w-full rounded-full border border-black/5 bg-gray-200 p-1 dark:border-white/10 dark:bg-dark3 sm:flex sm:w-auto',
        showAreas ? 'grid-cols-3' : 'grid-cols-2',
        className
      )}
    >
      {items.map((item) => {
        const selected = current === item.key;
        const content = (
          <>
            {item.key === 'active' && (
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            <span className="sm:hidden">{item.mobileLabel}</span>
            <span className="hidden sm:inline">{item.desktopLabel}</span>
          </>
        );
        const itemClassName = cn(
          'flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 font-inter text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] sm:px-3.5',
          selected
            ? 'bg-white font-extrabold text-black shadow-sm dark:bg-white dark:text-black'
            : 'text-text-dim hover:text-text'
        );

        if (item.key !== 'areas' && onSelect) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key as 'active' | 'schedule')}
              aria-pressed={selected}
              className={itemClassName}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selected ? 'page' : undefined}
            className={itemClassName}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
