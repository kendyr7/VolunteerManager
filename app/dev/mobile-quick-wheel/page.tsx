'use client';

import { useState } from 'react';
import { MobileQuickWheel, type MobileQuickWheelItem } from '@/components/MobileQuickWheel';

const DEMO_ITEMS: MobileQuickWheelItem[] = [
  {
    name: 'Inicio',
    href: '/dashboard',
    icon: 'space_dashboard',
    actions: [{ name: 'Mapa de calor', href: '/dashboard?view=heatmap-fullscreen', icon: 'grid_view' }],
  },
  {
    name: 'Voluntarios',
    href: '/volunteers',
    icon: 'group',
    actions: [{ name: 'Agregar nuevo', href: '/volunteers?action=new', icon: 'person_add' }],
  },
  {
    name: 'Turnos',
    href: '/shifts',
    icon: 'checklist',
    actions: [
      { name: 'Programados', href: '/shifts?view=turnos', icon: 'event_upcoming' },
      { name: 'Activos', href: '/shifts?view=active', icon: 'radio_button_checked' },
    ],
  },
  {
    name: 'Escanear QR',
    href: '/check-in',
    icon: 'qr_code_scanner',
    actions: [
      { name: 'Abrir escáner', href: '/check-in?view=scanner', icon: 'qr_code_scanner' },
      { name: 'Ver historial', href: '/check-in?view=history', icon: 'history' },
    ],
  },
  {
    name: 'Solicitudes',
    href: '/replacements',
    icon: 'published_with_changes',
    actions: [
      { name: 'Pendientes', href: '/replacements?tab=pending', icon: 'pending_actions' },
      { name: 'Historial', href: '/replacements?tab=history', icon: 'history' },
    ],
  },
  {
    name: 'Ajustes',
    href: '/settings',
    icon: 'settings',
    actions: [
      { name: 'Cambiar tema', command: 'toggle-theme', icon: 'dark_mode' },
      { name: 'Navegación', href: '/settings?section=mobileNavigation', icon: 'mobile_friendly' },
    ],
  },
];

export default function MobileQuickWheelPreviewPage() {
  const [lastAction, setLastAction] = useState('Ninguna acción todavía');

  return (
    <main className="min-h-dvh bg-dark px-5 py-8 text-text">
      <div className="mx-auto max-w-sm space-y-6">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-[#4d7cfe]/15 px-2.5 py-1 text-[11px] font-bold text-[#315fd6] dark:text-[#8ca9ff]">
            Prototipo táctil
          </span>
          <h1 className="text-balance">Navegación rápida radial</h1>
          <p className="text-pretty text-sm font-medium leading-6 text-text-dim">
            Toca Buscar para abrir la búsqueda. Mantén presionado, desliza hacia una opción y suelta para elegirla.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-dark2 p-4">
          <p className="text-[12px] font-bold text-text-dim">Última interacción</p>
          <p className="mt-1 text-sm font-extrabold text-text" aria-live="polite">{lastAction}</p>
        </section>
      </div>

      <MobileQuickWheel
        items={DEMO_ITEMS}
        onSearch={() => setLastAction('Búsqueda global abierta')}
        onSelect={(item) => setLastAction(`Seleccionaste ${item.name}`)}
      />
    </main>
  );
}
