'use client';

import { useState } from 'react';
import { NotificationCenterView, NotificationCenterTrigger } from '@/components/NotificationCenter';
import { MobileQuickWheel } from '@/components/MobileQuickWheel';
import type { NotificationPage } from '@/lib/notifications/policy';

const initial: NotificationPage = {
  asOf: '2026-09-09T16:00:00Z', unreadCount: 3, todayCount: 2, nextCursor: null,
  items: [
    { id: 'sample-request', kind: 'request', title: 'Nueva solicitud de cambio', body: 'Se recibió una solicitud de cambio de turno. Consulta su estado y los detalles.', created_at: '2026-09-09T15:55:00Z', read_at: null, url: '/replacements' },
    { id: 'sample-coverage', kind: 'coverage', title: 'Cobertura crítica de un turno', body: 'jue 10 · T1: 2 de 4 puestos cubiertos. Revisa el dashboard.', created_at: '2026-09-09T14:20:00Z', read_at: null, url: '/dashboard' },
    { id: 'sample-yesterday', kind: 'request', title: 'Nueva solicitud de cambio', body: 'Se recibió una solicitud de cambio de turno. Consulta su estado y los detalles.', created_at: '2026-09-08T19:20:00Z', read_at: null, url: '/replacements' },
    { id: 'sample-read', kind: 'request', title: 'Nueva solicitud de cambio', body: 'Se recibió una solicitud de cambio de turno. Consulta su estado y los detalles.', created_at: '2026-09-08T17:00:00Z', read_at: '2026-09-08T18:00:00Z', url: '/replacements' },
  ],
};

// Synthetic, UI-only harness. Production returns 404; no API calls or permissions.
export function NotificationCenterPreview() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const [page, setPage] = useState(initial);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [wheel, setWheel] = useState(false);
  const navigation = [{ name: 'Inicio', icon: 'space_dashboard', href: '/dashboard' }, { name: 'Voluntarios', icon: 'group', href: '/volunteers' }, { name: 'Turnos', icon: 'checklist', href: '/shifts' }, { name: 'Solicitudes', icon: 'published_with_changes', href: '/replacements' }, { name: 'Ajustes', icon: 'settings', href: '/settings' }];
  return <NotificationCenterView open={open} onOpenChange={setOpen} page={{ ...page, items: page.items.filter(item => unread ? !item.read_at : Boolean(item.read_at)) }} loading={false} busy={false} error={error} notice={notice} unreadOnly={unread}
        onFilter={setUnread} onMore={() => {}} onRefresh={() => { setError(''); setNotice('Bandeja actualizada.'); }}
        onRead={item => { setPage(previous => ({ ...previous, unreadCount: item ? Math.max(0, previous.unreadCount - 1) : 0, items: previous.items.map(row => !item || row.id === item.id ? { ...row, read_at: initial.asOf } : row) })); setNotice('Lectura guardada en esta vista de prueba.'); }}
        onVisit={() => setNotice('En la app, este enlace abre la solicitud o la cobertura.')}>
    <div className="flex min-h-dvh bg-dark text-text">
      <aside className="hidden shrink-0 border-r border-border bg-dark2 lg:block" style={{ width: collapsed ? 72 : 280 }}>
        <button className="flex h-16 w-full items-center justify-center border-b border-border font-bold" onClick={() => setCollapsed(value => !value)} aria-label="Alternar menú lateral">{collapsed ? 'VM' : 'Volunteer Manager'}</button>
        <div className={collapsed ? 'px-2 pt-4' : 'px-4 pt-4'}>
          <button className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-border bg-dark3 text-sm"><span className="material-symbols-outlined" aria-hidden="true">search</span>{!collapsed && 'Buscar en todo'}</button>
          <NotificationCenterTrigger compact={collapsed} className="mt-2" />
          <div className="mt-6 space-y-1">{navigation.map(item => <div key={item.href} className={`flex h-11 items-center gap-3 rounded-lg text-sm ${collapsed ? 'justify-center' : 'px-3'}`}><span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>{!collapsed && item.name}</div>)}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-28 sm:p-8">
      <h1 className="text-xl font-bold text-text">Vista de prueba · Notificaciones</h1><p className="mt-2 text-sm">Datos ficticios. No se envían avisos ni se consultan cuentas.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => { setPage(initial); setError(''); }}>Restablecer ejemplos</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => { setPage({ ...initial, items: [], unreadCount: 0, todayCount: 0 }); setOpen(true); }}>Probar bandeja vacía</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => { setError('No se pudieron cargar las notificaciones. Intenta nuevamente.'); setOpen(true); }}>Probar error</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => document.documentElement.classList.remove('dark')}>Vista clara temporal</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => document.documentElement.classList.add('dark')}>Vista oscura temporal</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => setWheel(value => !value)}>Alternar navegación móvil</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => setPage(previous => ({ ...previous, unreadCount: 120 }))}>Probar contador 99+</button>
    </div>
    </main>
    {wheel ? <MobileQuickWheel items={navigation} onSearch={() => setNotice('Búsqueda de prueba')} onSelect={() => {}} trailingAction={<NotificationCenterTrigger mobile />} /> :
      <div className="fixed inset-x-0 z-50 px-4 lg:hidden" style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-full border border-border bg-dark2 p-1">
            <div className="flex overflow-x-auto rounded-full" style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}>
              {[...navigation, ...navigation.slice(0, 3)].map((item, index) => <button key={index} className="flex shrink-0 flex-col items-center justify-center rounded-full px-0.5 py-2" style={{ width: '25%', scrollSnapAlign: index % 4 === 0 ? 'start' : undefined }}><span className="material-symbols-outlined mb-1 text-[20px]" aria-hidden="true">{item.icon}</span><span className="max-w-full truncate text-[9px] font-bold">{item.name}</span></button>)}
            </div>
          </div>
          <NotificationCenterTrigger mobile />
        </div>
      </div>}
    </div>
  </NotificationCenterView>;
}
