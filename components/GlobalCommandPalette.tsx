'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useRouter } from 'next/navigation';
import { HighlightText } from '@/components/HighlightText';
import { VolunteerProfileDrawer } from '@/components/VolunteerProfileDrawer';
import { listUserProfilesAction } from '@/app/actions/user-actions';
import { useCoordinatorData } from '@/lib/coordinator-data-context';
import {
  canCreateVolunteer,
  canImportData,
  canManageUsers,
  canQrCheckin,
  canSendWhatsappMessages,
  canViewDashboard,
  canViewRequests,
  canViewReports,
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
  type: 'navigation' | 'volunteer' | 'user' | 'action';
  title: string;
  subtitle?: string;
  icon: string;
  href?: string;
  volunteerId?: string;
  targetSearch?: string;
  searchText: string;
  onSelect?: () => void | Promise<void>;
};

type SearchFilter = 'all' | 'people' | 'sections' | 'actions';

type VolunteerDestination = {
  id: 'profile' | 'shifts' | 'reports' | 'reminders' | 'requests';
  label: string;
  icon: string;
  href?: string;
};

type SearchPlatformUser = {
  id: string;
  full_name: string;
  phone?: string | null;
  role?: string | null;
  coordinator_type?: string | null;
  status?: string | null;
  committees?: { name?: string | null } | null;
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
    id: 'action-heatmap-fullscreen',
    type: 'action',
    title: 'Mapa de calor (Pantalla completa)',
    subtitle: 'Ver proyección de cobertura de turnos en tiempo real',
    icon: 'grid_view',
    href: '/dashboard?view=heatmap-fullscreen',
    searchText: 'mapa de calor cobertura turnos fullscreen pantalla completa proyeccion tv dashboard',
    allowed: canViewDashboard,
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

const SEARCH_FILTERS: Array<{ id: SearchFilter; label: string; icon: string }> = [
  { id: 'all', label: 'Todo', icon: 'search' },
  { id: 'people', label: 'Personas', icon: 'group' },
  { id: 'sections', label: 'Secciones', icon: 'grid_view' },
  { id: 'actions', label: 'Acciones', icon: 'bolt' },
];

const VOLUNTEER_CONTEXT_TERMS = new Set([
  'voluntario', 'perfil', 'turno', 'turnos', 'reporte', 'reportes', 'asistencia',
  'historial', 'aviso', 'avisos', 'recordatorio', 'recordatorios', 'whatsapp',
  'solicitud', 'solicitudes', 'cambio', 'cambios',
]);

function matchesTerms(searchText: string, terms: string[]) {
  return terms.every(term => searchText.includes(term));
}

function buildSearchHref(path: string, search: string, context?: Record<string, string>) {
  const params = new URLSearchParams({ search, ...context });
  return `${path}?${params.toString()}`;
}

function getPlatformRoleLabel(user: SearchPlatformUser) {
  if (user.role === 'Admin') return 'Administrador';
  if (user.role === 'Lector') return 'Voluntario (perfil legado)';
  return user.coordinator_type === 'technology' ? 'Coord. tecnología' : 'Coord. comité';
}

function getVolunteerDestinations(item: CommandItem): VolunteerDestination[] {
  const search = item.targetSearch || item.title;
  const destinations: VolunteerDestination[] = [
    { id: 'profile', label: 'Perfil', icon: 'person' },
    {
      id: 'shifts',
      label: 'Turnos',
      icon: 'calendar_clock',
      href: buildSearchHref('/shifts', search, { view: 'turnos' }),
    },
  ];

  if (canViewReports()) {
    destinations.push({
      id: 'reports',
      label: 'Reportes',
      icon: 'analytics',
      href: buildSearchHref('/reports', search, { tab: 'volunteers' }),
    });
  }
  if (canSendWhatsappMessages()) {
    destinations.push({
      id: 'reminders',
      label: 'Avisos',
      icon: 'campaign',
      href: buildSearchHref('/reminders', search),
    });
  }
  if (canViewRequests()) {
    destinations.push({
      id: 'requests',
      label: 'Solicitudes',
      icon: 'published_with_changes',
      href: buildSearchHref('/replacements', search, { tab: 'pending' }),
    });
  }

  return destinations;
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
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
  const [platformUsers, setPlatformUsers] = useState<SearchPlatformUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasLoadedUsersRef = useRef(false);

  useEffect(() => {
    if (!open || !canManageUsers() || hasLoadedUsersRef.current) return;

    let cancelled = false;
    setLoadingUsers(true);
    void listUserProfilesAction()
      .then(result => {
        if (cancelled || !result.success) return;
        setPlatformUsers(result.profiles as SearchPlatformUser[]);
        hasLoadedUsersRef.current = true;
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const committeeNames = useMemo(
    () => new Map(committeesList.map(committee => [committee.id, committee.name])),
    [committeesList]
  );

  const terms = useMemo(
    () => query.split(/[\s,]+/).map(term => normalizeSearch(term)).filter(Boolean),
    [query]
  );

  const volunteerTerms = useMemo(
    () => terms.filter(term => !VOLUNTEER_CONTEXT_TERMS.has(term)),
    [terms]
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
    if (terms.length === 0 || volunteerTerms.length === 0 || !canViewVolunteers()) return [];

    const normalizedQuery = volunteerTerms.join(' ');
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
          subtitle: ['Voluntario', committee, ward, phone].filter(Boolean).join(' · '),
          icon: 'person',
          volunteerId: volunteer.id,
          targetSearch: phone || name,
          searchText,
          score,
        };
      })
      .filter(item => matchesTerms(item.searchText, volunteerTerms))
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title))
      .slice(0, 6);
  }, [committeeNames, rawVolunteers, terms, volunteerTerms]);

  const userResults = useMemo<CommandItem[]>(() => {
    if (terms.length === 0 || !canManageUsers()) return [];

    const normalizedQuery = normalizeSearch(query.trim());
    return platformUsers
      .filter(user => user.status !== 'archived')
      .map(user => {
        const name = user.full_name?.trim() || 'Usuario sin nombre';
        const phone = user.phone || '';
        const committee = user.committees?.name || '';
        const role = getPlatformRoleLabel(user);
        const normalizedName = normalizeSearch(name);
        const searchText = normalizeSearch(`${name} ${phone} ${committee} ${role} usuario plataforma`);

        return {
          id: `user-${user.id}`,
          type: 'user' as const,
          title: name,
          subtitle: ['Usuario', role, committee, phone].filter(Boolean).join(' · '),
          icon: 'manage_accounts',
          href: buildSearchHref('/users', phone || name),
          searchText,
          score: normalizedName.startsWith(normalizedQuery)
            ? 0
            : normalizedName.includes(normalizedQuery)
              ? 1
              : 2,
        };
      })
      .filter(item => matchesTerms(item.searchText, terms))
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title))
      .slice(0, 8);
  }, [platformUsers, query, terms]);

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

  const peopleResults = useMemo(
    () => [...volunteerResults, ...userResults].sort((left, right) => {
      const leftTitle = normalizeSearch(left.title).replace(/\s+/g, ' ').trim();
      const rightTitle = normalizeSearch(right.title).replace(/\s+/g, ' ').trim();
      const titleComparison = leftTitle.localeCompare(rightTitle, 'es', { sensitivity: 'base' });
      if (titleComparison !== 0) return titleComparison;
      return left.type === 'volunteer' ? -1 : 1;
    }),
    [userResults, volunteerResults]
  );

  const groups = useMemo(() => {
    const nextGroups: Array<{ id: string; label: string; items: CommandItem[] }> = [];
    if (searchFilter === 'all' || searchFilter === 'sections') {
      nextGroups.push({ id: 'navigation', label: 'Secciones', items: navigationResults });
    }
    if ((searchFilter === 'all' || searchFilter === 'people') && terms.length > 0) {
      nextGroups.push({ id: 'people', label: 'Personas', items: peopleResults });
    }
    if (searchFilter === 'all' || searchFilter === 'actions') {
      nextGroups.push({ id: 'actions', label: 'Acciones', items: actionResults });
    }
    return nextGroups.filter(group => group.items.length > 0);
  }, [actionResults, navigationResults, peopleResults, searchFilter, terms.length]);

  const flatResults = useMemo(() => groups.flatMap(group => group.items), [groups]);
  const hasResults = flatResults.length > 0;
  const isLoadingPeople = terms.length > 0 && (loading || loadingUsers);
  const showPeopleLoading = isLoadingPeople && (searchFilter === 'all' || searchFilter === 'people');

  useEffect(() => {
    resultRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(flatResults.length - 1, 0)));
  }, [flatResults.length]);

  const closePalette = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setSearchFilter('all');
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
      if (item.href.includes('view=heatmap-fullscreen')) {
        window.dispatchEvent(new CustomEvent('open-heatmap-fullscreen'));
      }
      router.push(item.href);
    }
  }, [closePalette, router]);

  const executeVolunteerDestination = useCallback((item: CommandItem, destination: VolunteerDestination) => {
    if (destination.id === 'profile' && item.volunteerId) {
      closePalette();
      setSelectedVolunteerId(item.volunteerId);
      return;
    }
    if (destination.href) {
      closePalette();
      if (destination.href.includes('view=heatmap-fullscreen')) {
        window.dispatchEvent(new CustomEvent('open-heatmap-fullscreen'));
      }
      router.push(destination.href);
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
          if (!nextOpen) {
            setQuery('');
            setSearchFilter('all');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[70] bg-black/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <Dialog.Popup className="fixed inset-x-0 bottom-0 z-[71] flex h-[78dvh] max-h-[78dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-dark2 pb-[env(safe-area-inset-bottom)] text-text transition duration-200 ease-out data-ending-style:translate-y-3 data-ending-style:opacity-0 data-starting-style:translate-y-3 data-starting-style:opacity-0 motion-reduce:transition-none sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-[8dvh] sm:h-auto sm:max-h-[84dvh] sm:w-[calc(100%-2rem)] sm:max-w-[720px] sm:-translate-x-1/2 sm:rounded-2xl sm:pb-0 sm:data-ending-style:translate-y-0 sm:data-ending-style:scale-[0.985] sm:data-starting-style:translate-y-0 sm:data-starting-style:scale-[0.985]">
            <Dialog.Title className="sr-only">Búsqueda global</Dialog.Title>
            <Dialog.Description className="sr-only">
              Busca páginas, voluntarios, usuarios, turnos, reportes y acciones disponibles según tus permisos.
            </Dialog.Description>

            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-5">
              <span className="material-symbols-outlined text-[22px] text-[#4d7cfe]">search</span>
              <input
                type="search"
                autoFocus
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Buscar páginas, personas o acciones..."
                aria-label="Buscar en toda la plataforma"
                aria-controls="global-command-results"
                autoComplete="off"
                className="h-full min-w-0 flex-1 appearance-none bg-transparent text-[15px] font-semibold text-text outline-none placeholder:text-text-dim [&::-webkit-search-cancel-button]:hidden"
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
              <button
                type="button"
                onClick={closePalette}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] sm:hidden"
                aria-label="Cerrar buscador"
              >
                <span className="material-symbols-outlined text-[20px]">keyboard_arrow_down</span>
              </button>
            </div>

            <div className="shrink-0 border-b border-border px-3 py-2 sm:px-4" aria-label="Filtrar resultados">
              <div className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {SEARCH_FILTERS.map(filter => {
                  const isSelected = searchFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSearchFilter(filter.id);
                        setActiveIndex(0);
                      }}
                      className={cn(
                        'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#4d7cfe]',
                        isSelected
                          ? 'bg-[#4d7cfe]/15 text-[#315fd6] dark:text-[#7ea0ff]'
                          : 'text-text-dim hover:bg-dark3 hover:text-text'
                      )}
                    >
                      <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden="true">{filter.icon}</span>
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div id="global-command-results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3" aria-live="polite">
              {hasResults && groups.map(group => (
                <section key={group.id} aria-labelledby={`global-command-${group.id}`} className="mb-3 last:mb-0">
                  <h3 id={`global-command-${group.id}`} className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-text-dim">
                    <span>{group.label}</span>
                    <span className="rounded-full bg-dark3 px-1.5 py-0.5 text-[9px] tabular-nums">{group.items.length}</span>
                  </h3>
                  <div className="space-y-1">
                    {group.items.map(item => {
                      resultIndex += 1;
                      const currentIndex = resultIndex;
                      const isActive = currentIndex === activeIndex;
                      const isPerson = item.type === 'volunteer' || item.type === 'user';
                      const isVolunteer = item.type === 'volunteer';
                      const details = item.subtitle
                        ?.replace(/^Voluntario · /, '')
                        .replace(/^Usuario · /, '');

                      if (isPerson) {
                        const destinations = isVolunteer ? getVolunteerDestinations(item) : [];
                        return (
                          <article
                            key={item.id}
                            onMouseEnter={() => setActiveIndex(currentIndex)}
                            className={cn(
                              'rounded-xl border transition-colors duration-150',
                              isActive
                                ? 'border-[#4d7cfe]/30 bg-[#4d7cfe]/[0.06]'
                                : 'border-transparent hover:bg-dark3/70'
                            )}
                          >
                            <button
                              id={item.id}
                              ref={element => { resultRefs.current[currentIndex] = element; }}
                              type="button"
                              onFocus={() => setActiveIndex(currentIndex)}
                              onClick={() => executeItem(item)}
                              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe] sm:px-3"
                              aria-label={isVolunteer ? `Abrir perfil de ${item.title}` : `Administrar usuario ${item.title}`}
                            >
                              <span className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                                isVolunteer
                                  ? 'bg-[#4d7cfe]/15 text-[#315fd6] dark:text-[#7ea0ff]'
                                  : 'bg-dark3 text-text-dim'
                              )}>
                                <span className="material-symbols-outlined text-[21px] leading-none">{item.icon}</span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-[13px] font-bold text-text sm:text-sm">
                                    <HighlightText text={item.title} terms={highlightTerms} />
                                  </span>
                                  <span className={cn(
                                    'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold',
                                    isVolunteer
                                      ? 'bg-[#4d7cfe]/15 text-[#315fd6] dark:text-[#7ea0ff]'
                                      : 'bg-dark3 text-text-dim'
                                  )}>
                                    {isVolunteer ? 'Voluntario' : 'Usuario'}
                                  </span>
                                </span>
                                {details && (
                                  <span className="mt-0.5 block truncate text-[11px] font-medium text-text-dim">
                                    <HighlightText text={details} terms={highlightTerms} />
                                  </span>
                                )}
                              </span>
                              <span className="material-symbols-outlined text-[18px] text-text-dim">
                                {isVolunteer ? 'person' : 'manage_accounts'}
                              </span>
                            </button>

                            {isVolunteer && (
                              <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5 sm:px-3 sm:pl-[4.25rem]">
                                {destinations.map(destination => (
                                  <button
                                    key={destination.id}
                                    type="button"
                                    onClick={() => executeVolunteerDestination(item, destination)}
                                    className={cn(
                                      'flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#4d7cfe] sm:h-8 sm:px-2.5 sm:text-[10px]',
                                      destination.id === 'profile'
                                        ? 'bg-[#4d7cfe]/15 text-[#315fd6] hover:bg-[#4d7cfe]/20 dark:text-[#7ea0ff]'
                                        : 'bg-dark3 text-text-dim hover:bg-[#4d7cfe]/10 hover:text-text'
                                    )}
                                    aria-label={`${destination.label} de ${item.title}`}
                                  >
                                    <span className="material-symbols-outlined text-[15px] leading-none" aria-hidden="true">{destination.icon}</span>
                                    {destination.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      }

                      return (
                        <button
                          key={item.id}
                          id={item.id}
                          ref={element => { resultRefs.current[currentIndex] = element; }}
                          type="button"
                          onFocus={() => setActiveIndex(currentIndex)}
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
                            isActive ? 'bg-[#4d7cfe]/15 text-[#315fd6] dark:text-[#7ea0ff]' : 'bg-dark3 text-text-dim'
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
              ))}

              {showPeopleLoading && peopleResults.length === 0 && (
                <section aria-label="Cargando personas" className="px-2 py-3">
                  <p className="px-1 pb-2 text-[11px] font-bold text-text-dim">Buscando personas…</p>
                  <div className="space-y-2">
                    {[0, 1].map(index => (
                      <div key={index} className="flex items-center gap-3 rounded-xl bg-dark3/70 px-3 py-3 animate-pulse motion-reduce:animate-none">
                        <span className="h-10 w-10 shrink-0 rounded-lg bg-border" />
                        <span className="min-w-0 flex-1 space-y-2">
                          <span className="block h-3 w-2/5 rounded bg-border" />
                          <span className="block h-2.5 w-3/5 rounded bg-border" />
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!hasResults && !showPeopleLoading && (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                  <span className="material-symbols-outlined mb-3 text-[32px] text-text-dim">
                    {searchFilter === 'people' && terms.length === 0 ? 'person_search' : 'search_off'}
                  </span>
                  <p className="text-sm font-bold text-text">
                    {searchFilter === 'people' && terms.length === 0 ? 'Busca una persona' : 'No encontramos resultados'}
                  </p>
                  <p className="mt-1 max-w-sm text-xs font-medium text-text-dim">
                    {searchFilter === 'people' && terms.length === 0
                      ? 'Escribe un nombre, teléfono, barrio o subcomité para comenzar.'
                      : 'Prueba con un nombre, teléfono, subcomité o una sección de la plataforma.'}
                  </p>
                </div>
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
