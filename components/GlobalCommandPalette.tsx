'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useRouter } from 'next/navigation';
import { HighlightText } from '@/components/HighlightText';
import { VolunteerProfileDrawer } from '@/components/VolunteerProfileDrawer';
import { useCoordinatorData } from '@/lib/coordinator-data-context';
import {
  canCreateVolunteer,
  canImportData,
  canQrCheckin,
  canSendWhatsappMessages,
  canViewRequests,
  canViewVolunteerProfile,
  canViewVolunteers,
} from '@/lib/permissions';
import { cn, normalizeSearch } from '@/lib/utils';

export interface GlobalNavigationItem {
  name: string;
  href: string;
  icon: string;
}

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigationItems: GlobalNavigationItem[];
  resolvedTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void | Promise<void>;
}

type CommandItem = {
  id: string;
  type: 'navigation' | 'volunteer' | 'action';
  title: string;
  subtitle?: string;
  icon: string;
  href?: string;
  volunteerId?: string;
  searchText: string;
  onSelect?: () => void | Promise<void>;
};

const ACTIONS: Array<CommandItem & { allowed: () => boolean }> = [
  {
    id: 'action-create-volunteer',
    type: 'action',
    title: 'Gestionar voluntarios',
    subtitle: 'Consultar o agregar un voluntario',
    icon: 'person_add',
    href: '/volunteers',
    searchText: 'gestionar agregar crear nuevo voluntario persona',
    allowed: canCreateVolunteer,
  },
  {
    id: 'action-scan-qr',
    type: 'action',
    title: 'Escanear código QR',
    subtitle: 'Registrar entrada o salida',
    icon: 'qr_code_scanner',
    href: '/check-in',
    searchText: 'escanear codigo qr check in entrada salida asistencia',
    allowed: canQrCheckin,
  },
  {
    id: 'action-import-volunteers',
    type: 'action',
    title: 'Importar voluntarios',
    subtitle: 'Cargar un archivo de voluntarios',
    icon: 'cloud_upload',
    href: '/import',
    searchText: 'importar cargar archivo voluntarios excel',
    allowed: canImportData,
  },
  {
    id: 'action-send-notices',
    type: 'action',
    title: 'Enviar avisos',
    subtitle: 'Abrir recordatorios de WhatsApp',
    icon: 'campaign',
    href: '/reminders',
    searchText: 'avisos recordatorios whatsapp mensajes enviar',
    allowed: canSendWhatsappMessages,
  },
  {
    id: 'action-review-requests',
    type: 'action',
    title: 'Revisar solicitudes',
    subtitle: 'Ver solicitudes de cambio de turno',
    icon: 'published_with_changes',
    href: '/replacements',
    searchText: 'revisar solicitudes cambios turnos pendientes',
    allowed: canViewRequests,
  },
];

function matchesTerms(searchText: string, terms: string[]) {
  return terms.every(term => searchText.includes(term));
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
  navigationItems,
  resolvedTheme,
  onToggleTheme,
  onLogout,
}: GlobalCommandPaletteProps) {
  const router = useRouter();
  const { rawVolunteers, committeesList, loading } = useCoordinatorData();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const committeeNames = useMemo(
    () => new Map(committeesList.map(committee => [committee.id, committee.name])),
    [committeesList]
  );

  const terms = useMemo(
    () => query.split(/[\s,]+/).map(term => normalizeSearch(term)).filter(Boolean),
    [query]
  );

  const navigationResults = useMemo<CommandItem[]>(() => {
    return navigationItems
      .map(item => ({
        id: `navigation-${item.href}`,
        type: 'navigation' as const,
        title: item.name,
        subtitle: item.href,
        icon: item.icon,
        href: item.href,
        searchText: normalizeSearch(`${item.name} ${item.href}`),
      }))
      .filter(item => terms.length === 0 || matchesTerms(item.searchText, terms));
  }, [navigationItems, terms]);

  const volunteerResults = useMemo<CommandItem[]>(() => {
    if (terms.length === 0 || !canViewVolunteers()) return [];

    const normalizedQuery = normalizeSearch(query.trim());
    return rawVolunteers
      .filter(volunteer => volunteer.status !== 'archived' && canViewVolunteerProfile(volunteer.committee_id))
      .map(volunteer => {
        const name = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();
        const committee = committeeNames.get(volunteer.committee_id)
          || volunteer.committees?.name
          || volunteer.committee
          || 'Sin subcomité';
        const ward = volunteer.neighborhood || volunteer.ward || '';
        const stake = volunteer.stake || '';
        const phone = volunteer.phone || '';
        const normalizedName = normalizeSearch(name);
        const normalizedCommittee = normalizeSearch(committee);
        const searchText = normalizeSearch(`${name} ${phone} ${committee} ${ward} ${stake}`);
        const score = normalizedName.startsWith(normalizedQuery)
          ? 0
          : normalizedName.includes(normalizedQuery)
            ? 1
            : normalizedCommittee.includes(normalizedQuery)
              ? 2
              : 3;

        return {
          id: `volunteer-${volunteer.id}`,
          type: 'volunteer' as const,
          title: name || 'Voluntario sin nombre',
          subtitle: [committee, ward, phone].filter(Boolean).join(' · '),
          icon: 'person',
          volunteerId: volunteer.id,
          searchText,
          score,
        };
      })
      .filter(item => matchesTerms(item.searchText, terms))
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title))
      .slice(0, 8);
  }, [committeeNames, query, rawVolunteers, terms]);

  const actionResults = useMemo<CommandItem[]>(() => {
    const permittedActions: CommandItem[] = ACTIONS
      .filter(action => action.allowed())
      .map(action => ({
        id: action.id,
        type: action.type,
        title: action.title,
        subtitle: action.subtitle,
        icon: action.icon,
        href: action.href,
        searchText: normalizeSearch(`${action.title} ${action.subtitle || ''} ${action.searchText}`),
      }));

    const utilityActions: CommandItem[] = [
      {
        id: 'action-toggle-theme',
        type: 'action',
        title: resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
        subtitle: 'Cambiar la apariencia de la plataforma',
        icon: resolvedTheme === 'dark' ? 'light_mode' : 'dark_mode',
        searchText: normalizeSearch('cambiar tema apariencia modo claro oscuro sistema'),
        onSelect: onToggleTheme,
      },
      {
        id: 'action-logout',
        type: 'action',
        title: 'Cerrar sesión',
        subtitle: 'Salir de la plataforma de forma segura',
        icon: 'logout',
        searchText: normalizeSearch('cerrar sesion salir plataforma logout'),
        onSelect: onLogout,
      },
    ];

    return [...permittedActions, ...utilityActions]
      .filter(action => terms.length === 0 || matchesTerms(action.searchText, terms));
  }, [onLogout, onToggleTheme, resolvedTheme, terms]);

  const groups = useMemo(
    () => [
      { id: 'navigation', label: 'Navegación', items: navigationResults },
      { id: 'volunteers', label: 'Voluntarios', items: volunteerResults },
      { id: 'actions', label: 'Acciones', items: actionResults },
    ].filter(group => group.items.length > 0),
    [actionResults, navigationResults, volunteerResults]
  );

  const flatResults = useMemo(() => groups.flatMap(group => group.items), [groups]);
  const hasResults = flatResults.length > 0;

  useEffect(() => {
    resultRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const closePalette = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setActiveIndex(0);
  }, [onOpenChange]);

  const executeItem = useCallback((item: CommandItem) => {
    if (item.type === 'volunteer' && item.volunteerId) {
      closePalette();
      setSelectedVolunteerId(item.volunteerId);
      return;
    }

    if (item.onSelect) {
      closePalette();
      void item.onSelect();
      return;
    }

    if (item.href) {
      closePalette();
      router.push(item.href);
    }
  }, [closePalette, router]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => flatResults.length ? (index + 1) % flatResults.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => flatResults.length ? (index - 1 + flatResults.length) % flatResults.length : 0);
    } else if (event.key === 'Enter' && flatResults[activeIndex]) {
      event.preventDefault();
      executeItem(flatResults[activeIndex]);
    }
  };

  let resultIndex = -1;
  const highlightTerms = query.split(/[\s,]+/).filter(Boolean);

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={nextOpen => {
          onOpenChange(nextOpen);
          setActiveIndex(0);
          if (!nextOpen) setQuery('');
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[70] bg-black/35 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <Dialog.Popup className="fixed left-1/2 top-[7dvh] z-[71] flex max-h-[82dvh] w-[calc(100%-1.5rem)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-dark2 text-text transition duration-200 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none sm:top-[11dvh]">
            <Dialog.Title className="sr-only">Búsqueda global</Dialog.Title>
            <Dialog.Description className="sr-only">
              Busca páginas, voluntarios y acciones disponibles según tus permisos.
            </Dialog.Description>

            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-5">
              <span className="material-symbols-outlined text-[22px] text-[#4d7cfe]">search</span>
              <input
                autoFocus
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Buscar páginas, voluntarios o acciones..."
                aria-label="Buscar en toda la plataforma"
                aria-controls="global-command-results"
                aria-activedescendant={flatResults[activeIndex]?.id}
                role="combobox"
                aria-expanded="true"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-text outline-none placeholder:text-text-dim"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setActiveIndex(0);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
                  aria-label="Limpiar búsqueda"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              ) : (
                <kbd className="hidden rounded-md border border-border bg-dark3 px-2 py-1 font-mono text-[10px] font-bold text-text-dim sm:inline-flex">ESC</kbd>
              )}
            </div>

            <div id="global-command-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3">
              {hasResults ? groups.map(group => (
                <section key={group.id} aria-labelledby={`global-command-${group.id}`} className="mb-2 last:mb-0">
                  <h3 id={`global-command-${group.id}`} className="px-3 py-2 text-[11px] font-bold text-text-dim">
                    {group.label}
                  </h3>
                  <div className="space-y-0.5">
                    {group.items.map(item => {
                      resultIndex += 1;
                      const currentIndex = resultIndex;
                      const isActive = currentIndex === activeIndex;
                      return (
                        <button
                          key={item.id}
                          id={item.id}
                          ref={element => { resultRefs.current[currentIndex] = element; }}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(currentIndex)}
                          onClick={() => executeItem(item)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors duration-150',
                            isActive ? 'bg-dark3 text-text' : 'text-text hover:bg-dark3/70',
                            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe]'
                          )}
                        >
                          <span className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            isActive ? 'bg-[#4d7cfe]/15 text-[#4d7cfe]' : 'bg-dark3 text-text-dim'
                          )}>
                            <span className="material-symbols-outlined text-[20px] leading-none">{item.icon}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold">
                              <HighlightText text={item.title} terms={highlightTerms} />
                            </span>
                            {item.subtitle && (
                              <span className="mt-0.5 block truncate text-[11px] font-medium text-text-dim">
                                <HighlightText text={item.subtitle} terms={highlightTerms} />
                              </span>
                            )}
                          </span>
                          <span className="material-symbols-outlined text-[18px] text-text-dim">arrow_forward</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )) : (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                  <span className="material-symbols-outlined mb-3 text-[32px] text-text-dim">search_off</span>
                  <p className="text-sm font-bold text-text">No encontramos resultados</p>
                  <p className="mt-1 max-w-sm text-xs font-medium text-text-dim">
                    Prueba con un nombre, teléfono, subcomité o una sección de la plataforma.
                  </p>
                </div>
              )}
              {loading && terms.length > 0 && volunteerResults.length === 0 && (
                <p className="px-3 py-2 text-xs font-medium text-text-dim">Cargando voluntarios…</p>
              )}
            </div>

            <div className="hidden h-11 shrink-0 items-center justify-between border-t border-border bg-dark3/55 px-5 text-[10px] font-semibold text-text-dim sm:flex">
              <span className="flex items-center gap-3">
                <span><kbd className="mr-1 rounded border border-border bg-dark2 px-1.5 py-0.5">↑↓</kbd> navegar</span>
                <span><kbd className="mr-1 rounded border border-border bg-dark2 px-1.5 py-0.5">Enter</kbd> abrir</span>
              </span>
              <span>Solo se muestran resultados permitidos para tu rol</span>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <VolunteerProfileDrawer
        isOpen={selectedVolunteerId !== null}
        volunteerId={selectedVolunteerId}
        onClose={() => setSelectedVolunteerId(null)}
        mode="coordinator"
      />
    </>
  );
}
