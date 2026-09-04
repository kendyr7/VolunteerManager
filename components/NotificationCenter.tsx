'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { type NotificationItem, type NotificationPage, safeNotificationLink } from '@/lib/notifications/policy';
import styles from './NotificationCenter.module.css';
import { NAVIGATION_ICONS } from '@/lib/navigation-icons';
import { groupNotifications, notificationTimeLabel, notificationTodaySummary } from '@/lib/notifications/presentation';
import { announceNotificationRead, watchNotificationChanges } from '@/lib/notifications/browser-sync';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2';
const secondary = 'text-[#586383] dark:text-slate-300';
const notificationAppearance = {
  request: { icon: NAVIGATION_ICONS.requests, label: 'Solicitud', color: 'bg-teal-500/10 text-teal-800 dark:text-teal-300' },
  coverage: { icon: NAVIGATION_ICONS.dashboard, label: 'Cobertura', color: 'bg-rose-500/[0.08] text-rose-700 dark:text-rose-300' },
} satisfies Record<NotificationItem['kind'], { icon: string; label: string; color: string }>;
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined text-[22px] ${className}`}>{name}</span>;
}
function when(value: string) {
  return new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' }).format(new Date(value));
}

type ViewProps = {
  children?: ReactNode;
  open: boolean; onOpenChange: (value: boolean) => void; page: NotificationPage | null;
  loading: boolean; busy: boolean; error: string; notice: string; unreadOnly: boolean;
  onFilter: (value: boolean) => void; onRefresh: () => void; onMore: () => void;
  onRead: (item?: NotificationItem) => void; onVisit: (item: NotificationItem) => void;
};

const NotificationTriggerContext = createContext({ count: 0, unavailable: false });

// All navigation entry points share one dialog, unread count and polling loop.
export function NotificationCenterTrigger({ compact = false, mobile = false, dense = false, className = '' }: { compact?: boolean; mobile?: boolean; dense?: boolean; className?: string }) {
  const { count, unavailable } = useContext(NotificationTriggerContext);
  const iconOnly = compact || mobile;
  return <Dialog.Trigger aria-label={count ? `Notificaciones: ${count} sin leer` : 'Notificaciones'} title={iconOnly ? 'Notificaciones' : undefined}
    className={`relative inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-text transition-colors hover:bg-dark3 ${focus} ${mobile ? `${dense ? 'size-11' : 'size-12'} justify-center rounded-full border border-border bg-dark2` : compact ? 'w-full justify-center rounded-lg' : 'w-full gap-3 rounded-lg px-3'} ${className}`}>
    {mobile && dense ? <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span> : <Icon name="notifications" />}
    {!iconOnly && <span className="min-w-0 flex-1 truncate text-left">Notificaciones</span>}
    {count > 0 && <span aria-hidden="true" className={`flex items-center justify-center rounded-full bg-[#315ee0] px-1 font-bold text-white ${mobile && dense ? 'min-w-4 text-[9px] leading-4' : 'min-w-5 text-[11px] leading-5'} ${iconOnly ? 'absolute -top-0.5 right-0' : ''}`}>{count > 99 ? '99+' : count}</span>}
    {unavailable && <span aria-hidden="true" className={`size-2 rounded-full bg-amber-600 ${iconOnly ? 'absolute right-1 top-1' : ''}`} />}
  </Dialog.Trigger>;
}

// Presentation is separate from data access for isolated UI verification.
export function NotificationCenterView(props: ViewProps) {
  const { open, onOpenChange, page, loading, busy, error, notice, unreadOnly } = props;
  const count = page?.unreadCount || 0;
  return <NotificationTriggerContext.Provider value={{ count, unavailable: Boolean(error && !page) }}><Dialog.Root open={open} onOpenChange={onOpenChange}>
    {props.children ?? <NotificationCenterTrigger />}
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
      <Dialog.Popup className="fixed inset-y-0 right-0 z-[90] flex h-dvh w-full max-w-md flex-col border-l border-border bg-dark2 text-text outline-none transition-[transform,opacity] duration-200 ease-out data-starting-style:translate-x-4 data-starting-style:opacity-0 data-ending-style:translate-x-4 data-ending-style:opacity-0 motion-reduce:transition-none">
        <header className="shrink-0 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-start gap-2">
            <Dialog.Close aria-label="Cerrar notificaciones" title="Volver" className={`-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-dark3 ${focus}`}><Icon name="chevron_left" /></Dialog.Close>
            <div className="min-w-0 flex-1 pt-1.5">
              <Dialog.Title className="text-xl font-bold text-text">Notificaciones</Dialog.Title>
              <Dialog.Description className={`mt-1 text-[13px] leading-5 ${secondary}`}>{page ? notificationTodaySummary(page.todayCount) : error ? 'No se pudo consultar el total de hoy' : 'Consultando tus notificaciones…'}</Dialog.Description>
            </div>
            <div className="-mr-2 shrink-0">
              <Menu.Root>
                <Menu.Trigger aria-label="Más opciones de notificaciones" title="Más opciones" className={`flex size-11 items-center justify-center rounded-full hover:bg-dark3 ${focus}`}><Icon name="more_horiz" /></Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner align="end" sideOffset={8} className="z-[100] outline-none">
                    <Menu.Popup className="w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-dark2 p-1 text-text outline-none">
                      <Menu.Item onClick={() => props.onRead()} disabled={!count || busy || loading} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] outline-none data-highlighted:bg-dark3 data-disabled:cursor-default data-disabled:opacity-50"><Icon name="done_all" className="text-[18px]" />Marcar todas como leídas</Menu.Item>
                      <Menu.Item onClick={props.onRefresh} disabled={loading || busy} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] outline-none data-highlighted:bg-dark3 data-disabled:cursor-default data-disabled:opacity-50"><Icon name="refresh" className="text-[18px]" />Actualizar notificaciones</Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          </div>
          <div role="group" aria-label="Filtrar notificaciones" className="mt-5 grid w-full grid-cols-2 border-b border-border">
            {[{ label: 'No leídas', value: true }, { label: 'Leídas', value: false }].map(option => <button key={option.label} type="button" aria-pressed={unreadOnly === option.value} onClick={() => props.onFilter(option.value)} disabled={busy} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${focus} ${unreadOnly === option.value ? 'border-teal-600 text-teal-800 dark:border-teal-400 dark:text-teal-300' : `border-transparent ${secondary} hover:bg-dark3/60`}`}>{option.label}{option.value && count > 0 && <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] tabular-nums">{count > 99 ? '99+' : count}</span>}</button>)}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={loading}>
          {error && <div role="alert" className="m-5 rounded-lg border border-red-300 p-4 text-sm leading-6 text-red-800 dark:border-red-900 dark:text-red-200"><p>{error}</p><button type="button" onClick={props.onRefresh} disabled={loading} className={`mt-2 min-h-10 rounded px-2 font-bold underline ${focus}`}>Volver a intentar</button></div>}
          {(!page || !page.items.length) && loading && <div role="status" aria-label="Cargando notificaciones" className="space-y-5 p-5">{[1, 2, 3].map(key => <div aria-hidden="true" key={key} className="flex gap-3"><div className="size-10 shrink-0 rounded-xl bg-dark3" /><div className="flex-1 space-y-3"><div className="h-4 w-2/3 rounded bg-dark3" /><div className="h-3 w-full rounded bg-dark3" /><div className="h-3 w-1/3 rounded bg-dark3" /></div></div>)}</div>}
          {page && !page.items.length && !error && !loading && <div className="px-7 py-12 text-center">
            <Icon name={unreadOnly ? 'done_all' : 'notifications_none'} className="text-[32px] text-[#4d7cfe]" />
            <h3 className={`mt-4 font-bold ${styles.emptyTitle}`}>{unreadOnly ? 'Estás al día' : 'Aún no hay notificaciones leídas'}</h3>
            <p className={`mt-2 text-sm leading-6 ${secondary}`}>{unreadOnly ? 'No tienes notificaciones sin leer. Puedes consultar las anteriores en Leídas.' : 'Los avisos que abras o marques como leídos aparecerán aquí.'}</p>
          </div>}
          {page && page.items.length > 0 && <div className="space-y-7 px-4 pb-6 pt-4 sm:px-5">
            {groupNotifications(page.items, page.asOf).map(group => <section key={group.key} aria-label={group.label}>
              <div className="mb-4 flex items-center gap-3"><h3 className={styles.dayTitle}>{group.label}</h3><span aria-hidden="true" className="h-px flex-1 bg-border" /></div>
              <ul className="space-y-3">
                {group.items.map(item => <li key={item.id} className={`relative rounded-2xl transition-colors motion-reduce:transition-none ${item.read_at ? 'hover:bg-dark3/40' : styles.unreadRow}`}>
                  <a href={safeNotificationLink(item.url)} onClick={event => { event.preventDefault(); if (!busy) props.onVisit(item); }} className={`grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 rounded-2xl px-3 py-4 sm:px-4 ${focus}`}>
                    <span title={notificationAppearance[item.kind].label} className={`flex size-11 items-center justify-center rounded-full ${notificationAppearance[item.kind].color}`}><Icon name={notificationAppearance[item.kind].icon} /></span>
                    <div className="min-w-0">
                      <div className={styles.rowHeading}><h4 className={`min-w-0 break-words font-semibold ${styles.itemTitle}`}>{item.title}</h4><time dateTime={item.created_at} title={when(item.created_at)} className={`shrink-0 text-[11px] leading-5 tabular-nums ${secondary}`}>{notificationTimeLabel(item.created_at, page.asOf)}</time></div>
                      <p className={`mt-1 pr-8 pb-3 text-[13px] leading-[1.65] ${secondary}`}>{item.body}</p>
                      {!item.read_at && <span className="sr-only">Sin leer</span>}
                    </div>
                  </a>
                  {item.read_at
                    ? <span role="img" aria-label="Leída" title="Leída" className="pointer-events-none absolute bottom-1 right-1 flex size-11 items-center justify-center"><span className="flex size-6 items-center justify-center rounded-full bg-teal-700 text-white"><Icon name="done" className="text-[16px]" /></span></span>
                    : <button type="button" disabled={busy} onClick={() => props.onRead(item)} aria-label={`Marcar como leída: ${item.title}`} title="Marcar como leída" className={`group absolute bottom-1 right-1 flex size-11 items-center justify-center rounded-full disabled:opacity-50 ${focus}`}><span className="flex size-6 items-center justify-center rounded-full border border-slate-500 bg-transparent text-slate-500 transition-colors group-hover:border-teal-700 group-hover:text-teal-700 dark:border-slate-400 dark:text-slate-300 dark:group-hover:border-teal-300 dark:group-hover:text-teal-300"><Icon name="done" className="text-[16px]" /></span></button>}
                </li>)}
              </ul>
            </section>)}
          </div>}
          {page?.nextCursor && <div className="p-5"><button type="button" disabled={loading || busy} onClick={props.onMore} className={`min-h-11 w-full rounded-lg border border-border px-4 text-sm font-bold hover:bg-dark3 disabled:opacity-50 ${focus}`}>{loading ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
        </div>
        <footer className="shrink-0 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {notice && <p role="status" className="mb-2 text-xs leading-5">{notice}</p>}
          <Link href="/settings?section=notifications" onClick={() => onOpenChange(false)} className={`inline-flex min-h-11 items-center gap-2 rounded text-sm font-medium ${secondary} hover:text-text hover:underline ${focus}`}><Icon name={NAVIGATION_ICONS.settings} />Ajustes de notificaciones</Link>
          <p className="sr-only">Marcar como leída no aprueba ni rechaza una solicitud.</p>
        </footer>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root></NotificationTriggerContext.Provider>;
}

async function requestInbox(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/notifications${path}`, { method, cache: 'no-store', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la bandeja.');
  return result;
}

export function NotificationCenter({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const loadingRef = useRef(false);
  const busyRef = useRef(false);
  const lastSync = useRef(0);
  const filterRef = useRef(true);
  const invalidateLoad = useCallback(() => { generation.current++; loadingRef.current = false; }, []);

  const load = useCallback(async (filter: boolean, cursor: string | null = null, sync = false, quiet = false) => {
    if (busyRef.current) return;
    const version = ++generation.current;
    loadingRef.current = true;
    if (!quiet) setLoading(true);
    try {
      if (sync && Date.now() - lastSync.current > 60000) {
        lastSync.current = Date.now();
        // A busy/temporarily unavailable worker must not hide previously saved items.
        await requestInbox('/sync', 'POST').catch(() => undefined);
      }
      const query = new URLSearchParams({ filter: filter ? 'unread' : 'read' });
      if (cursor) query.set('cursor', cursor);
      const next = await requestInbox(`?${query}`) as NotificationPage;
      if (version !== generation.current) return;
      setPage(previous => cursor && previous ? { ...next, items: [...previous.items, ...next.items.filter(item => !previous.items.some(old => old.id === item.id))] } : next);
      setError('');
    } catch (error) {
      if (version === generation.current) setError(error instanceof Error ? error.message : 'No se pudo cargar la bandeja.');
    } finally {
      if (version === generation.current) { loadingRef.current = false; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    const stop = watchNotificationChanges(() => {
      if (!loadingRef.current && !busyRef.current) void load(filterRef.current, null, true, true);
    }, open);
    return () => {
      invalidateLoad();
      stop();
    };
  }, [load, invalidateLoad, open]);

  const markRead = async (item?: NotificationItem) => {
    if (!page || busyRef.current) return false;
    if (item?.read_at) return true;
    busyRef.current = true; setBusy(true); setNotice('');
    generation.current++; loadingRef.current = false; setLoading(false);
    try {
      await requestInbox('', 'PATCH', item ? { ids: [item.id] } : { all: true, before: page.asOf });
      announceNotificationRead();
      setPage(previous => {
        if (!previous) return previous;
        const updated = previous.items.map(row => !item || row.id === item.id ? { ...row, read_at: row.read_at || new Date().toISOString() } : row);
        return { ...previous, items: filterRef.current ? updated.filter(row => !row.read_at) : updated, unreadCount: item ? Math.max(0, previous.unreadCount - 1) : 0 };
      });
      setNotice(item ? 'Notificación marcada como leída.' : 'Notificaciones marcadas como leídas.'); setError('');
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar la lectura.'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };

  return <NotificationCenterView open={open} onOpenChange={value => { setOpen(value); if (value && !loadingRef.current) void load(filterRef.current, null, true); }}
    page={page} loading={loading} busy={busy} error={error} notice={notice} unreadOnly={unreadOnly}
    onFilter={value => { if (value === filterRef.current) return; filterRef.current = value; setUnreadOnly(value); setNotice(''); setPage(previous => previous ? { ...previous, items: [], nextCursor: null } : null); void load(value); }}
    onRefresh={() => void load(filterRef.current, null, true)} onMore={() => { if (page?.nextCursor) void load(filterRef.current, page.nextCursor); }}
    onRead={item => void markRead(item)} onVisit={item => { void markRead(item).then(success => { if (success) { setOpen(false); router.push(safeNotificationLink(item.url)); } }); }}>{children}</NotificationCenterView>;
}
