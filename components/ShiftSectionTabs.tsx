'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type ShiftSection = 'active' | 'schedule';

export function ShiftSectionTabs({
  current,
  activeCount,
  onSelect,
  className,
}: {
  current: ShiftSection;
  activeCount?: number;
  onSelect?: (section: ShiftSection) => void;
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
  ];

  return (
    <nav
      aria-label="Secciones de turnos"
      className={cn(
        'relative flex shrink-0 rounded-full border border-black/5 bg-gray-200 p-1 dark:border-white/10 dark:bg-dark3 w-auto',
        className
      )}
    >
      {items.map((item) => {
        const selected = current === item.key;
        const content = (
          <>
            {selected && (
              <motion.div
                layoutId="shift-main-tab-pill"
                className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-white"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              {item.key === 'active' && (
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
              <span className="sm:hidden">{item.mobileLabel}</span>
              <span className="hidden sm:inline">{item.desktopLabel}</span>
            </span>
          </>
        );

        const itemClassName = cn(
          'relative flex min-h-8 min-w-0 items-center justify-center rounded-full px-2.5 font-inter text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] sm:px-3.5 cursor-pointer',
          selected
            ? 'font-extrabold text-black dark:text-black'
            : 'text-text-dim hover:text-text'
        );

        if (onSelect) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
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
