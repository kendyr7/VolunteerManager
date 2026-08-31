'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import styles from './MobileNavigationDock.module.css';

export type MobileNavigationItem = { name: string; href: string; icon: string };

const activeColors: Record<string, string> = {
  '/dashboard': 'border-[#4d7cfe]/40 bg-[#4d7cfe]/15 text-[#315ee0] dark:text-[#8aa8ff]',
  '/volunteers': 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  '/shifts': 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  '/areas': 'border-teal-500/40 bg-teal-500/15 text-teal-800 dark:text-teal-300',
  '/check-in': 'border-pink-500/40 bg-pink-500/15 text-pink-800 dark:text-pink-300',
  '/reminders': 'border-purple-500/40 bg-purple-500/15 text-purple-800 dark:text-purple-300',
  '/replacements': 'border-teal-500/40 bg-teal-500/15 text-teal-800 dark:text-teal-300',
  '/reports': 'border-cyan-500/40 bg-cyan-500/15 text-cyan-800 dark:text-cyan-300',
  '/users': 'border-blue-500/40 bg-blue-500/15 text-blue-800 dark:text-blue-300',
  '/import': 'border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-300',
  '/settings': 'border-indigo-500/40 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
};

export function MobileNavigationDock({ items, pathname, notifications, themeMenu, themeOpen, onTheme, onLogout, onNavigate, onSearch }: {
  items: MobileNavigationItem[];
  pathname: string;
  notifications?: ReactNode;
  themeMenu?: ReactNode;
  themeOpen: boolean;
  onTheme: () => void;
  onLogout: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onSearch: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Deep links and browser history should keep the current section in view.
    const element = scroller.current;
    if (!element) return;
    const revealCurrent = () => element.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pathname]);

  return <div className="fixed inset-x-0 z-50 px-4 lg:hidden" style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))', paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
    {themeMenu}
    <nav aria-label="Navegación móvil" className="flex items-center gap-2">
      {notifications}
      <div className="min-w-0 flex-1 rounded-full border border-border bg-dark2 p-1">
        <div ref={scroller} className={styles.scroller}>
          {items.map(item => {
            const isTheme = item.href === '#theme';
            const isLogout = item.href === '#logout';
            const active = !item.href.startsWith('#') && (pathname === item.href || pathname.startsWith(`${item.href}/`));
            const className = cn(styles.item,
              'flex min-h-11 min-w-0 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border font-inter transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe]',
              active ? activeColors[item.href] ?? 'border-border bg-dark3 text-text' : 'border-transparent text-[#586383] dark:text-slate-300 hover:bg-dark3 hover:text-text',
              isLogout && 'text-red-700 dark:text-red-300 hover:bg-red-500/10',
              isTheme && themeOpen && 'border-[#4d7cfe]/40 bg-[#4d7cfe]/15 text-[#315ee0] dark:text-[#8aa8ff]');
            const content = <>
              <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, width: 18, height: 18, lineHeight: 1 }}>{item.icon}</span>
              <span className={cn('whitespace-nowrap text-[9.5px] leading-3', active ? 'font-extrabold' : 'font-semibold')}>{item.name}</span>
            </>;
            return isTheme || isLogout
              ? <button key={item.href} type="button" className={className} onClick={isTheme ? onTheme : onLogout} aria-label={isTheme ? 'Cambiar apariencia' : 'Cerrar sesión'} aria-expanded={isTheme ? themeOpen : undefined}>{content}</button>
              : <Link key={item.href} href={item.href} prefetch={false} aria-current={active ? 'page' : undefined} onClick={onNavigate} className={className}>{content}</Link>;
          })}
        </div>
      </div>
      <button type="button" aria-label="Buscar en toda la plataforma" title="Buscar" onClick={onSearch} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-dark2 text-text transition-colors duration-150 hover:bg-dark3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark motion-reduce:transition-none">
        <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
      </button>
    </nav>
  </div>;
}
