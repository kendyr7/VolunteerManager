'use client';

import { useState } from 'react';
import { NotificationCenterView, NotificationCenterTrigger } from '@/components/NotificationCenter';
import { MobileQuickWheel } from '@/components/MobileQuickWheel';
import { MobileNavigationDock } from '@/components/MobileNavigationDock';
import { MobileThemeMenu } from '@/components/mobile-theme-menu';
import { useThemePreference } from '@/lib/use-theme-preference';
import { Toast } from '@/components/ui/toast';
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
  const [pathname, setPathname] = useState('/dashboard');
  const [themeOpen, setThemeOpen] = useState(false);
  const [action, setAction] = useState('');
  const [lector, setLector] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({ message: '', type: 'success', visible: false });
  const { preference, resolvedTheme, setPreference } = useThemePreference();
  const navigation = [{ name: 'Inicio', icon: 'space_dashboard', href: '/dashboard' }, { name: 'Voluntarios', icon: 'group', href: '/volunteers' }, { name: 'Turnos', icon: 'checklist', href: '/shifts' }, { name: 'Solicitudes', icon: 'published_with_changes', href: '/replacements' }, { name: 'Ajustes', icon: 'settings', href: '/settings' }];
  const dockItems = [
    ...navigation.slice(0, 4),
    { name: 'Áreas', icon: 'location_on', href: '/areas' },
    { name: 'Escanear QR', icon: 'qr_code_scanner', href: '/check-in' },
    { name: 'Avisos', icon: 'campaign', href: '/reminders' },
    { name: 'Reportes', icon: 'analytics', href: '/reports' },
    { name: 'Usuarios', icon: 'shield_person', href: '/users' },
    { name: 'Importación', icon: 'cloud_upload', href: '/import' },
    navigation[4],
    { name: 'Tema', icon: resolvedTheme === 'dark' ? 'dark_mode' : 'light_mode', href: '#theme' },
    { name: 'Salir', icon: 'logout', href: '#logout' },
  ];
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
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => { setLector(value => !value); setPathname('/shifts'); }}>Alternar vista Lector</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => setToast({ message: 'Turnos actualizados · ejemplo sin guardar datos', type: 'success', visible: true })}>Probar toast de éxito</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => setToast({ message: 'No se pudo guardar · ejemplo de error', type: 'error', visible: true })}>Probar toast de error</button>
      <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => setToast({ message: 'Información de prueba', type: 'info', visible: true })}>Probar toast informativo</button>
    </div>
    <p role="status" className="mt-4 text-sm">{action}</p>
    </main>
    <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={() => setToast(previous => ({ ...previous, visible: false }))} />
    {wheel ? <MobileQuickWheel items={navigation} onSearch={() => setNotice('Búsqueda de prueba')} onSelect={() => {}} trailingAction={<NotificationCenterTrigger mobile />} /> :
      <MobileNavigationDock
        items={lector ? [{ name: 'Mi Perfil', icon: 'person', href: '/shifts' }, ...dockItems.slice(-2)] : dockItems}
        pathname={pathname}
        notifications={lector ? undefined : <NotificationCenterTrigger mobile dense />}
        themeMenu={<MobileThemeMenu open={themeOpen} preference={preference} onChange={setPreference} onClose={() => setThemeOpen(false)} />}
        themeOpen={themeOpen}
        onTheme={() => setThemeOpen(value => !value)}
        onLogout={() => setAction('Cerrar sesión: acción recibida, sin cerrar ninguna cuenta.')}
        onNavigate={event => { event.preventDefault(); setThemeOpen(false); setPathname(event.currentTarget.getAttribute('href')!); setAction('Navegación: ' + event.currentTarget.textContent); }}
        onSearch={() => { setThemeOpen(false); setAction('Búsqueda: acción recibida. En la app abre la búsqueda global.'); }}
      />}
    </div>
  </NotificationCenterView>;
}
