'use client'

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import Image from "next/image";
import { SearchProvider, useSearch } from "@/lib/search-context";
import { CoordinatorDataProvider } from "@/lib/coordinator-data-context";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { MobileThemeMenu } from "@/components/mobile-theme-menu";
import { useThemePreference } from "@/lib/use-theme-preference";
import { useMobileNavigationMode } from "@/lib/use-mobile-navigation-mode";
import {
  MobileQuickWheel,
  type MobileQuickWheelAction,
  type MobileQuickWheelItem,
} from "@/components/MobileQuickWheel";

// Helper component for Material Symbols
function Icon({ name, size = 20, className = "" }: { name: string, size?: number, className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size, width: size, height: size, lineHeight: 1 }}
    >
      {name}
    </span>
  );
}

const QUICK_WHEEL_ROUTES = [
  '/dashboard',
  '/volunteers',
  '/shifts',
  '/check-in',
  '/replacements',
  '/settings',
] as const;

const QUICK_WHEEL_LABELS: Record<(typeof QUICK_WHEEL_ROUTES)[number], string> = {
  '/dashboard': 'Inicio',
  '/volunteers': 'Voluntarios',
  '/shifts': 'Turnos',
  '/check-in': 'Escanear QR',
  '/replacements': 'Solicitudes',
  '/settings': 'Ajustes',
};

import {
  canViewDashboard,
  canViewReports,
  canViewVolunteers,
  canQrCheckin,
  canSendWhatsappMessages,
  canImportData,
  canManageUsers,
  canViewRequests,
  canManageOwnAreaCoverage,
  canViewSettings,
  canCreateVolunteer,
  getAuthorizationSnapshotCache,
  syncAllPermissionsFromDatabase
} from "@/lib/permissions";

// Inner layout component that consumes SearchContext
function CoordinatorLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isMobileThemeOpen, setIsMobileThemeOpen] = useState(false);
  const { searchTerm, setSearchTerm } = useSearch();
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [navPage, setNavPage] = useState(0);

  const { preference, resolvedTheme, setPreference, toggleTheme } = useThemePreference();
  const { isCommandMode } = useMobileNavigationMode();

  const [permTick, setPermTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  const openGlobalSearch = useCallback(() => {
    window.setTimeout(() => setIsGlobalSearchOpen(true), 0);
  }, []);

  useEffect(() => {
    const syncRoleAndPermissions = () => {
      const snapshot = getAuthorizationSnapshotCache();
      setCurrentRole(snapshot.role);
      setCurrentCommittee(snapshot.committeeName || '');
      setPermTick(v => v + 1);
    };

    syncAllPermissionsFromDatabase(true).then(() => {
      syncRoleAndPermissions();
      setMounted(true);
    });
    window.addEventListener('permissions-changed', syncRoleAndPermissions);
    return () => {
      window.removeEventListener('permissions-changed', syncRoleAndPermissions);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const routeAllowed = (() => {
      if (pathname.startsWith('/users')) return canManageUsers();
      if (pathname.startsWith('/settings/phone')) return canManageUsers();
      if (pathname.startsWith('/settings')) return canViewSettings();
      if (pathname.startsWith('/areas')) return canManageOwnAreaCoverage();
      if (pathname.startsWith('/check-in')) return canQrCheckin();
      if (pathname.startsWith('/import')) return canImportData();
      if (pathname.startsWith('/reports')) return canViewReports();
      if (pathname.startsWith('/reminders')) return canSendWhatsappMessages();
      if (pathname.startsWith('/replacements')) return canViewRequests();
      if (pathname.startsWith('/volunteers')) return canViewVolunteers();
      if (pathname.startsWith('/dashboard')) return canViewDashboard();
      return true;
    })();

    if (!routeAllowed) {
      if (currentRole === 'Lector') {
        router.replace('/shifts');
        return;
      }

      const fallbackRoute = canViewDashboard()
        ? '/dashboard'
        : canViewVolunteers()
          ? '/volunteers'
          : canViewRequests()
            ? '/replacements'
            : canSendWhatsappMessages()
              ? '/reminders'
              : canViewReports()
                ? '/reports'
                : canQrCheckin()
                  ? '/check-in'
                  : canImportData()
                    ? '/import'
                    : '/settings';

      router.replace(fallbackRoute);
    }
  }, [mounted, pathname, permTick, currentRole, router]);

  // Reset search when navigating to a new page
  useEffect(() => {
    setSearchTerm('');
  }, [pathname]);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsGlobalSearchOpen(open => !open);
      }
    };

    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('mock_role');
    localStorage.removeItem('mock_committee');
    await logout();
    window.location.href = '/login';
  };

  const NAV_ITEMS = [
    { name: "Dashboard", href: "/dashboard", icon: "space_dashboard", roles: ['Admin', 'Editor'] },
    { name: "Voluntarios", href: "/volunteers", icon: "group", roles: ['Admin', 'Editor', 'Lector'] },
    { name: currentRole === 'Lector' ? "Mi Perfil" : "Turnos", href: "/shifts", icon: currentRole === 'Lector' ? "person" : "checklist", roles: ['Admin', 'Editor', 'Lector'] },
    { name: "Áreas", href: "/areas", icon: "location_on", roles: ['Admin', 'Editor'] },
    { name: "Escanear QR", href: "/check-in", icon: "qr_code_scanner", roles: ['Admin', 'Editor'] },
    { name: "Solicitudes", href: "/replacements", icon: "published_with_changes", roles: ['Admin', 'Editor'] },
    { name: "Avisos", href: "/reminders", icon: "campaign", roles: ['Admin', 'Editor'] },
    { name: "Reportes", href: "/reports", icon: "analytics", roles: ['Admin', 'Editor'] },
    { name: "Usuarios", href: "/users", icon: "shield_person", roles: ['Admin'] },
    { name: "Importación", href: "/import", icon: "cloud_upload", roles: ['Admin', 'Editor'] },
  ];

  const BOTTOM_ITEMS = [
    { name: "Ajustes", href: "/settings", icon: "settings", roles: ['Admin', 'Editor'] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (!mounted) return item.roles.includes('Admin');
    if (!item.roles.includes(currentRole)) return false;
    if (item.href === '/dashboard' && !canViewDashboard()) return false;
    if (currentRole === 'Editor') {
      if (item.href === '/volunteers' && !canViewVolunteers()) return false;
      if (item.href === '/areas' && !canManageOwnAreaCoverage()) return false;
      if (item.href === '/check-in' && !canQrCheckin()) return false;
      if (item.href === '/reminders' && !canSendWhatsappMessages()) return false;
      if (item.href === '/replacements' && !canViewRequests()) return false;
      if (item.href === '/reports' && !canViewReports()) return false;
      if (item.href === '/import' && !canImportData()) return false;
      if (item.href === '/users' && !canManageUsers()) return false;
    }
    if (currentRole === 'Lector') {
      if (item.href === '/volunteers' && !canViewVolunteers()) return false;
    }
    return true;
  });
  const visibleBottomItems = BOTTOM_ITEMS.filter(item => !mounted ? item.roles.includes('Admin') : item.roles.includes(currentRole));
  const quickWheelActions: Record<(typeof QUICK_WHEEL_ROUTES)[number], MobileQuickWheelAction[]> = {
    '/dashboard': [
      { name: 'Mapa de calor', href: '/dashboard?view=heatmap-fullscreen', icon: 'grid_view' },
    ],
    '/volunteers': canCreateVolunteer()
      ? [{ name: 'Agregar nuevo', href: '/volunteers?action=new', icon: 'person_add' }]
      : [],
    '/shifts': [
      { name: 'Programados', href: '/shifts?view=turnos', icon: 'event_upcoming' },
      { name: 'Activos', href: '/shifts?view=active', icon: 'radio_button_checked' },
    ],
    '/check-in': [
      { name: 'Abrir escáner', href: '/check-in?view=scanner', icon: 'qr_code_scanner' },
      { name: 'Ver historial', href: '/check-in?view=history', icon: 'history' },
    ],
    '/replacements': [
      { name: 'Pendientes', href: '/replacements?tab=pending', icon: 'pending_actions' },
      { name: 'Historial', href: '/replacements?tab=history', icon: 'history' },
    ],
    '/settings': [
      {
        name: resolvedTheme === 'dark' ? 'Tema claro' : 'Tema oscuro',
        icon: resolvedTheme === 'dark' ? 'light_mode' : 'dark_mode',
        command: 'toggle-theme',
      },
      {
        name: 'Navegación',
        href: '/settings?section=mobileNavigation#settings-mobileNavigation',
        icon: 'mobile_friendly',
      },
    ],
  };
  const quickWheelItems = QUICK_WHEEL_ROUTES
    .map((href) => [...visibleNavItems, ...visibleBottomItems].find(item => item.href === href))
    .filter((item): item is (typeof visibleNavItems)[number] => Boolean(item))
    .map<MobileQuickWheelItem>(item => ({
      name: QUICK_WHEEL_LABELS[item.href as (typeof QUICK_WHEEL_ROUTES)[number]] || item.name,
      href: item.href,
      icon: item.icon,
      actions: quickWheelActions[item.href as (typeof QUICK_WHEEL_ROUTES)[number]],
    }));
  const allMobileNavItems = [
    ...visibleNavItems,
    ...visibleBottomItems,
    { name: "Tema", href: "#theme", icon: resolvedTheme === 'dark' ? 'dark_mode' : 'light_mode', roles: ['Admin', 'Editor', 'Lector'] },
    { name: "Salir", href: "#logout", icon: "logout", roles: ['Admin', 'Editor', 'Lector'] },
  ];
  const ITEMS_PER_PAGE = 5;
  const totalNavPages = Math.ceil(allMobileNavItems.length / ITEMS_PER_PAGE);

  const goToNavPage = useCallback((page: number) => {
    const element = navScrollRef.current;
    if (!element) return;
    element.scrollTo({ left: page * element.clientWidth, behavior: 'smooth' });
  }, []);

  const checkNavScroll = useCallback(() => {
    const element = navScrollRef.current;
    if (!element) return;
    setNavPage(Math.round(element.scrollLeft / element.clientWidth));
  }, []);

  useEffect(() => {
    if (isCommandMode) return;
    const element = navScrollRef.current;
    if (!element) return;

    checkNavScroll();
    element.addEventListener('scroll', checkNavScroll, { passive: true });
    const resizeObserver = new ResizeObserver(checkNavScroll);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', checkNavScroll);
      resizeObserver.disconnect();
    };
  }, [checkNavScroll, allMobileNavItems.length, isCommandMode]);

  if (!mounted) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-dark text-text"
        role="status"
        aria-label="Verificando acceso"
        aria-live="polite"
      >
        <AnimatedLogo isLooping className="h-16 w-16 md:h-20 md:w-20" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-dark flex flex-col font-sans text-text overflow-hidden">



      {/* Main Layout Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden lg:pb-0">

        {/* Desktop Sidebar */}
        <aside
          className="hidden lg:flex flex-col border-r border-border bg-dark2 shrink-0 overflow-hidden transition-all duration-300 relative z-50"
          style={{ width: sidebarOpen ? 280 : 72 }}
        >
          {/* Logo Section inside Sidebar */}
          <div className="h-16 flex items-center px-6 border-b border-border shrink-0 min-w-0 mb-2 mt-4 lg:mt-0">
            <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => setSidebarOpen(prev => !prev)} title={sidebarOpen ? 'Ocultar menú' : 'Expandir menú'}>
              <Image
                src="/icon-192.png"
                alt="Templo Managua"
                width={28}
                height={28}
                className="rounded-sm object-contain shrink-0"
              />
              <span
                className="font-inter font-bold text-lg text-text tracking-tight whitespace-nowrap transition-all duration-300 overflow-hidden"
                style={{ opacity: sidebarOpen ? 1 : 0, maxWidth: sidebarOpen ? 200 : 0 }}
              >
                Volunteer Manager
              </span>
            </div>
          </div>

          <div className={cn("shrink-0 transition-all duration-300", sidebarOpen ? "px-4 pt-2" : "px-2 pt-2")}>
            <button
              type="button"
              onClick={openGlobalSearch}
              title={!sidebarOpen ? "Buscar en toda la plataforma (Ctrl + K)" : undefined}
              className={cn(
                "flex h-10 w-full items-center rounded-lg border border-border bg-dark3 text-text-dim transition-colors hover:border-[#4d7cfe]/40 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]",
                sidebarOpen ? "gap-3 px-3" : "justify-center px-0"
              )}
            >
              <Icon name="search" size={19} className="shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="min-w-0 flex-1 truncate text-left text-[13px] font-bold">Buscar en todo</span>
                  <kbd className="rounded-md border border-border bg-dark2 px-1.5 py-0.5 font-mono text-[9px] font-bold text-text-dim">Ctrl K</kbd>
                </>
              )}
            </button>
          </div>

          {/* Scrollable nav content */}
          <div className={cn("flex-1 overflow-y-auto overflow-x-hidden py-6 space-y-6 min-h-0 transition-all duration-300", sidebarOpen ? "px-4" : "px-2")}>
            {/* Navigation Section */}
            <div className="space-y-1">
              {/* Section header — hidden when collapsed */}
              {sidebarOpen && (
                <div className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-text-dim">
                  <span>Navigation</span>
                  <Icon name="expand_more" size={16} />
                </div>
              )}
              {visibleNavItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch={false}
                    title={!sidebarOpen ? item.name : undefined}
                    className={cn(
                      "group flex items-center h-[42px] rounded-md transition-all duration-200 relative",
                      sidebarOpen ? "gap-3 px-3" : "justify-center px-0",
                      isActive
                        ? "bg-dark3 text-gold font-inter font-bold"
                        : "text-text-dim hover:bg-dark3 hover:text-text font-inter font-bold"
                    )}
                  >
                    <Icon name={item.icon} size={20} className={cn("shrink-0", isActive ? "text-[#4d7cfe]" : "text-text-dim")} />
                    {sidebarOpen && <span className="truncate">{item.name}</span>}
                    {isActive && sidebarOpen && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#4d7cfe] rounded-l-full mr-[-16px]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Bottom Section — always pinned */}
          <div className={cn("shrink-0 border-t border-border space-y-1 transition-all duration-300", sidebarOpen ? "p-4" : "p-2")}>
            {visibleBottomItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                title={!sidebarOpen ? item.name : undefined}
                className={cn(
                  "flex items-center rounded-sm transition-all duration-200 text-[14px] font-inter font-bold text-text hover:bg-dark3 hover:text-text",
                  sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
                )}
              >
                <Icon name={item.icon} size={20} className="text-text-dim shrink-0" />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
            <button
              onClick={toggleTheme}
              title={!sidebarOpen ? "Cambiar tema" : undefined}
              className={cn(
                "flex w-full items-center rounded-sm transition-all duration-200 text-[14px] font-inter font-bold text-text hover:bg-dark3 hover:text-text",
                sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
              )}
            >
              <Icon name={resolvedTheme === 'dark' ? 'light_mode' : 'dark_mode'} size={20} className="text-text-dim shrink-0" />
              {sidebarOpen && <span className="truncate">Cambiar Tema</span>}
            </button>
            <button
              onClick={handleLogout}
              title={!sidebarOpen ? "Cerrar Sesión" : undefined}
              className={cn(
                "flex w-full items-center rounded-sm transition-all duration-200 text-[14px] font-inter font-bold text-text hover:bg-dark3 hover:text-text",
                sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
              )}
            >
              <Icon name="logout" size={20} className="text-text-dim shrink-0" />
              {sidebarOpen && <span className="truncate">Cerrar Sesión</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto min-w-0 bg-dark relative lg:pb-0",
            isCommandMode ? "pb-4" : "pb-24"
          )}
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>

      {isCommandMode ? (
        <MobileQuickWheel
          items={quickWheelItems}
          onSearch={openGlobalSearch}
          onSelect={(item) => {
            if (item.command === 'toggle-theme') {
              toggleTheme();
              return;
            }
            if (item.href) router.push(item.href);
          }}
        />
      ) : (
        <div className="fixed bottom-6 left-0 right-0 z-50 px-4 lg:hidden">
          <MobileThemeMenu
            open={isMobileThemeOpen}
            preference={preference}
            onChange={setPreference}
            onClose={() => setIsMobileThemeOpen(false)}
          />
          <div className="relative w-full">
            {navPage > 0 && (
              <button
                type="button"
                aria-label="Ver opciones anteriores"
                onPointerDown={(event) => {
                  event.preventDefault();
                  goToNavPage(navPage - 1);
                }}
                className="absolute -left-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-dark2 text-text shadow-lg backdrop-blur-xl transition-all"
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              >
                <Icon name="chevron_left" size={18} />
              </button>
            )}

            <div className="relative w-full overflow-hidden rounded-full">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full border border-border bg-dark2/90 shadow-2xl backdrop-blur-xl dark:bg-dark2/80"
              />
              <div
                ref={navScrollRef}
                className="relative z-10 flex overflow-x-auto rounded-full bg-transparent p-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', scrollSnapType: 'x mandatory' }}
              >
                {allMobileNavItems.map((item, index) => {
                  const isActive = pathname.startsWith(item.href) && !item.href.startsWith('#');
                  const isLogout = item.href === '#logout';
                  const isTheme = item.href === '#theme';
                  const isPageStart = index % ITEMS_PER_PAGE === 0;
                  const sharedStyle = {
                    width: 'calc((100vw - 32px) / 5)',
                    scrollSnapAlign: isPageStart ? 'start' as const : undefined,
                  };
                  const tabColors: Record<string, { activeClass: string; iconClass: string }> = {
                    "/dashboard": { activeClass: "bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/40 shadow-[0_0_14px_rgba(77,124,254,0.2)]", iconClass: "text-[#4d7cfe]" },
                    "/volunteers": { activeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-[0_0_14px_rgba(16,185,129,0.2)]", iconClass: "text-emerald-600 dark:text-emerald-400" },
                    "/shifts": { activeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-[0_0_14px_rgba(245,158,11,0.2)]", iconClass: "text-amber-600 dark:text-amber-400" },
                    "/areas": { activeClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/40 shadow-[0_0_14px_rgba(20,184,166,0.2)]", iconClass: "text-teal-600 dark:text-teal-400" },
                    "/check-in": { activeClass: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/40 shadow-[0_0_14px_rgba(236,72,153,0.2)]", iconClass: "text-pink-600 dark:text-pink-400" },
                    "/reminders": { activeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/40 shadow-[0_0_14px_rgba(139,92,246,0.2)]", iconClass: "text-purple-600 dark:text-purple-400" },
                    "/replacements": { activeClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/40 shadow-[0_0_14px_rgba(20,184,166,0.2)]", iconClass: "text-teal-600 dark:text-teal-400" },
                    "/reports": { activeClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40 shadow-[0_0_14px_rgba(6,182,212,0.2)]", iconClass: "text-cyan-600 dark:text-cyan-400" },
                    "/users": { activeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/40 shadow-[0_0_14px_rgba(59,130,246,0.2)]", iconClass: "text-blue-600 dark:text-blue-400" },
                    "/import": { activeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/40 shadow-[0_0_14px_rgba(249,115,22,0.2)]", iconClass: "text-orange-600 dark:text-orange-400" },
                    "/settings": { activeClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/40 shadow-[0_0_14px_rgba(99,102,241,0.2)]", iconClass: "text-indigo-600 dark:text-indigo-400" },
                  };
                  const tabColor = tabColors[item.href] ?? {
                    activeClass: "border border-border bg-dark3 text-text",
                    iconClass: "text-text",
                  };
                  const sharedClass = cn(
                    "relative flex shrink-0 flex-col items-center justify-center rounded-full px-0.5 py-2 transition-all duration-300",
                    isActive ? tabColor.activeClass : "text-text-dim hover:bg-dark3/50 hover:text-text"
                  );

                  if (isLogout) {
                    return (
                      <button
                        key="logout"
                        type="button"
                        onClick={handleLogout}
                        style={sharedStyle}
                        className={cn(sharedClass, "text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400")}
                      >
                        <Icon name="logout" size={20} className="mb-1 text-red-500 dark:text-red-400" />
                        <span className="max-w-full truncate whitespace-nowrap font-inter text-[9px] font-bold sm:text-[10px]">Salir</span>
                      </button>
                    );
                  }

                  if (isTheme) {
                    return (
                      <button
                        key="theme"
                        type="button"
                        onClick={() => setIsMobileThemeOpen(open => !open)}
                        aria-expanded={isMobileThemeOpen}
                        aria-label="Cambiar apariencia"
                        style={sharedStyle}
                        className={cn(
                          sharedClass,
                          isMobileThemeOpen && "border border-[#4d7cfe]/40 bg-[#4d7cfe]/15 text-[#4d7cfe]"
                        )}
                      >
                        <Icon
                          name={resolvedTheme === 'dark' ? 'dark_mode' : 'light_mode'}
                          size={20}
                          className={cn("mb-1", isMobileThemeOpen ? "text-[#4d7cfe]" : "text-text-dim")}
                        />
                        <span className="whitespace-nowrap font-inter text-[9px] font-semibold sm:text-[10px]">Tema</span>
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={() => setIsMobileThemeOpen(false)}
                      style={sharedStyle}
                      className={sharedClass}
                    >
                      <Icon
                        name={item.icon}
                        size={20}
                        className={cn(
                          "mb-1 transition-transform duration-200",
                          isActive ? `${tabColor.iconClass} scale-110` : "text-text-dim"
                        )}
                      />
                      <span className={cn(
                        "max-w-full truncate whitespace-nowrap font-inter text-[9px] sm:text-[10px]",
                        isActive ? "font-extrabold" : "font-semibold"
                      )}>
                        {item.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {navPage < totalNavPages - 1 && (
              <button
                type="button"
                aria-label="Ver más opciones"
                onPointerDown={(event) => {
                  event.preventDefault();
                  goToNavPage(navPage + 1);
                }}
                className="absolute -right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-dark2 text-text shadow-lg backdrop-blur-xl transition-all"
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              >
                <Icon name="chevron_right" size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      <GlobalCommandPalette
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        navigationItems={[...visibleNavItems, ...visibleBottomItems]}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SearchProvider>
      <CoordinatorDataProvider>
        <CoordinatorLayoutInner>{children}</CoordinatorLayoutInner>
      </CoordinatorDataProvider>
    </SearchProvider>
  );
}
