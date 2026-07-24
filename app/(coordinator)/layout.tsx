'use client'

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import Image from "next/image";
import { SearchProvider, useSearch } from "@/lib/search-context";

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

// Inner layout component that consumes SearchContext
function CoordinatorLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('Historia');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { searchTerm, setSearchTerm } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [navPage, setNavPage] = useState(0);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee) setCurrentCommittee(committee);
  }, []);

  // Reset search when navigating to a new page
  useEffect(() => {
    setSearchTerm('');
  }, [pathname]);

  const handleLogout = async () => {
    localStorage.removeItem('mock_role');
    localStorage.removeItem('mock_committee');
    await logout();
    window.location.href = '/login';
  };

  const NAV_ITEMS = [
    { name: "Dashboard", href: "/dashboard", icon: "space_dashboard", roles: ['Admin'] },
    { name: "Voluntarios", href: "/volunteers", icon: "group", roles: ['Admin', 'Editor'] },
    { name: currentRole === 'Lector' ? "Mi Perfil" : "Turnos", href: "/shifts", icon: currentRole === 'Lector' ? "person" : "checklist", roles: ['Admin', 'Editor', 'Lector'] },
    { name: "Escanear QR", href: "/check-in", icon: "qr_code_scanner", roles: ['Admin', 'Editor'] },
    { name: "Avisos", href: "/reminders", icon: "campaign", roles: ['Admin', 'Editor'] },
    { name: "Reportes", href: "/reports", icon: "analytics", roles: ['Admin', 'Editor'] },
    { name: "Usuarios", href: "/users", icon: "shield_person", roles: ['Admin'] },
    { name: "Importación", href: "/import", icon: "cloud_upload", roles: ['Admin', 'Editor'] },
  ];

  const BOTTOM_ITEMS = [
    { name: "Ajustes", href: "/settings", icon: "settings", roles: ['Admin', 'Editor'] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(currentRole));
  const visibleBottomItems = BOTTOM_ITEMS.filter(item => item.roles.includes(currentRole));
  const allMobileNavItems = [
    ...visibleNavItems,
    ...visibleBottomItems,
    { name: "Salir", href: "#logout", icon: "logout", roles: ['Admin', 'Editor', 'Lector'] },
  ];

  const activeItem = [...NAV_ITEMS, ...BOTTOM_ITEMS].find(item => pathname === item.href);
  const currentTitle = activeItem ? activeItem.name : "Dashboard";
  const ITEMS_PER_PAGE = 5;
  const totalNavPages = Math.ceil(allMobileNavItems.length / ITEMS_PER_PAGE);

  const goToNavPage = useCallback((page: number) => {
    const el = navScrollRef.current;
    if (!el) return;
    el.scrollTo({ left: page * el.clientWidth, behavior: 'smooth' });
  }, []);

  const checkNavScroll = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    setNavPage(page);
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    checkNavScroll();
    el.addEventListener('scroll', checkNavScroll, { passive: true });
    const ro = new ResizeObserver(checkNavScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkNavScroll); ro.disconnect(); };
  }, [checkNavScroll, allMobileNavItems.length]);

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
              {NAV_ITEMS.filter(item => item.roles.includes(currentRole)).map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
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
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={20} className="text-text-dim shrink-0" />
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
        <main className="flex-1 overflow-y-auto min-w-0 bg-dark relative pb-24 lg:pb-0" style={{ scrollbarGutter: 'stable' }}>
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-6 left-0 right-0 z-50 px-4">
        <div className="relative w-full">
          {/* Left arrow — shown only when not on first page */}
          {navPage > 0 && (
            <button
              onPointerDown={(e) => { e.preventDefault(); goToNavPage(navPage - 1); }}
              className="absolute -left-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/55 text-black shadow-md transition-all backdrop-blur-xl backdrop-saturate-150 border border-black/10 supports-[backdrop-filter]:bg-white/42 dark:border-white/15 dark:bg-black/40 dark:text-white dark:supports-[backdrop-filter]:bg-black/28"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            >
              <Icon name="chevron_left" size={18} />
            </button>
          )}

          {/* Clip: clips left/right, contains items */}
          <div className="relative w-full overflow-hidden rounded-full">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border border-white/10 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl shadow-lg"
            />
            <div
              ref={navScrollRef}
              className="relative z-10 flex overflow-x-auto rounded-full bg-transparent p-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', scrollSnapType: 'x mandatory' }}
            >
              {allMobileNavItems.map((item, index) => {
                const isActive = pathname.startsWith(item.href) && item.href !== '#logout';
                const isLogout = item.href === '#logout';
                const isPageStart = index % ITEMS_PER_PAGE === 0;
                const sharedStyle = { width: 'calc((100vw - 32px) / 5)', scrollSnapAlign: isPageStart ? 'start' as const : undefined };
                
                const TAB_COLORS: Record<string, { activeClass: string; iconClass: string }> = {
                  "/dashboard": { activeClass: "bg-[#4d7cfe]/20 text-[#4d7cfe] border border-[#4d7cfe]/40 shadow-[0_0_14px_rgba(77,124,254,0.35)]", iconClass: "text-[#4d7cfe]" },
                  "/volunteers": { activeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_14px_rgba(16,185,129,0.35)]", iconClass: "text-emerald-400" },
                  "/shifts": { activeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_14px_rgba(245,158,11,0.35)]", iconClass: "text-amber-400" },
                  "/check-in": { activeClass: "bg-pink-500/20 text-pink-400 border border-pink-500/40 shadow-[0_0_14px_rgba(236,72,153,0.35)]", iconClass: "text-pink-400" },
                  "/reminders": { activeClass: "bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-[0_0_14px_rgba(139,92,246,0.35)]", iconClass: "text-purple-400" },
                  "/reports": { activeClass: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-[0_0_14px_rgba(6,182,212,0.35)]", iconClass: "text-cyan-400" },
                  "/users": { activeClass: "bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-[0_0_14px_rgba(59,130,246,0.35)]", iconClass: "text-blue-400" },
                  "/import": { activeClass: "bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-[0_0_14px_rgba(249,115,22,0.35)]", iconClass: "text-orange-400" },
                  "/settings": { activeClass: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-[0_0_14px_rgba(99,102,241,0.35)]", iconClass: "text-indigo-400" },
                };

                const tabColor = TAB_COLORS[item.href] || { activeClass: "bg-white/20 text-white border border-white/30", iconClass: "text-white" };

                const sharedClass = cn(
                  "flex flex-col items-center justify-center py-2 rounded-full transition-all duration-300 shrink-0 px-0.5 relative",
                  isActive ? tabColor.activeClass : "text-white/60 hover:text-white"
                );
                if (isLogout) {
                  return (
                    <button
                      key="logout"
                      onClick={handleLogout}
                      style={sharedStyle}
                      className={cn(sharedClass, "text-red-400 hover:text-red-300 hover:bg-red-500/10")}
                    >
                      <Icon name="logout" size={20} className="mb-1 text-red-400" />
                      <span className="font-inter text-[9px] sm:text-[10px] font-bold whitespace-nowrap truncate max-w-full">Salir</span>
                    </button>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={sharedStyle}
                    className={sharedClass}
                  >
                    <Icon name={item.icon} size={20} className={cn("mb-1 transition-transform duration-200", isActive ? `${tabColor.iconClass} scale-110` : "text-white/60")} />
                    <span className={cn("font-inter text-[9px] sm:text-[10px] whitespace-nowrap truncate max-w-full", isActive ? "font-extrabold" : "font-semibold")}>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right arrow — shown only when not on last page */}
          {navPage < totalNavPages - 1 && (
            <button
              onPointerDown={(e) => { e.preventDefault(); goToNavPage(navPage + 1); }}
              className="absolute -right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/55 text-black shadow-md transition-all backdrop-blur-xl backdrop-saturate-150 border border-black/10 supports-[backdrop-filter]:bg-white/42 dark:border-white/15 dark:bg-black/40 dark:text-white dark:supports-[backdrop-filter]:bg-black/28"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            >
              <Icon name="chevron_right" size={18} />
            </button>
          )}
        </div>
      </div>
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
      <CoordinatorLayoutInner>{children}</CoordinatorLayoutInner>
    </SearchProvider>
  );
}
