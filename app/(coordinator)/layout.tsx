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
    { name: "Avisos", href: "/reminders", icon: "campaign", roles: ['Admin', 'Editor'] },
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
  const hideMobileHeader = pathname === '/shifts' || pathname === '/users';

  const ITEMS_PER_PAGE = 4;
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
      
      {/* Desktop Top Navbar */}
      <header className="hidden lg:flex h-16 bg-dark2 border-b border-border shrink-0 sticky top-0 z-50">
        {/* Left Logo Section — collapses with sidebar */}
        <div
          className="flex items-center px-6 border-r border-border shrink-0 overflow-hidden transition-all duration-300"
          style={{ width: sidebarOpen ? 280 : 72 }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Image
              src="/icon-192.png"
              alt="Templo Managua"
              width={28}
              height={28}
              className="rounded-sm object-contain shrink-0"
            />
            <span
              className="font-bold text-lg text-text tracking-tight whitespace-nowrap transition-all duration-300 overflow-hidden"
              style={{ opacity: sidebarOpen ? 1 : 0, maxWidth: sidebarOpen ? 200 : 0 }}
            >
              Templo Managua
            </span>
          </div>
        </div>
        
        {/* Right Action Section */}
        <div className="flex-1 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="text-text-dim hover:text-text transition-colors flex items-center justify-center"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Icon name="sort" size={24} />
            </button>
            <span className="font-semibold text-[17px] text-text">{currentTitle}</span>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Contextual Search Input */}
            <div className="relative hidden lg:flex items-center">
              <Icon name="search" size={18} className="absolute left-3 text-text-dim pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  pathname === '/volunteers' ? 'Buscar voluntario...' :
                  pathname === '/shifts' ? 'Buscar voluntario en turnos...' :
                  pathname === '/reminders' ? 'Buscar en avisos...' :
                  pathname === '/users' ? 'Buscar usuario...' :
                  'Buscar...'
                }
                className="pl-9 pr-4 h-9 w-56 xl:w-72 text-[13px] font-medium bg-dark3 border border-border rounded-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-[#4d7cfe]/30 focus:border-[#4d7cfe]/50 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 text-text-dim hover:text-text"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-4 ml-4">
              <button 
                onClick={toggleTheme}
                className="text-text-dim hover:text-text transition-colors hidden lg:block"
                title="Cambiar tema"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={22} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden lg:pb-0">
        
        {/* Desktop Sidebar */}
        <aside
          className="hidden lg:flex flex-col border-r border-border bg-dark2 shrink-0 overflow-hidden transition-all duration-300"
          style={{ width: sidebarOpen ? 280 : 72 }}
        >
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
                        ? "bg-dark3 text-gold font-semibold" 
                        : "text-text-dim hover:bg-dark3 hover:text-text font-medium"
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
                  "flex items-center rounded-sm transition-all duration-200 text-[14px] font-medium text-text hover:bg-dark3 hover:text-text",
                  sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
                )}
              >
                <Icon name={item.icon} size={20} className="text-text-dim shrink-0" />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              title={!sidebarOpen ? "Cerrar Sesión" : undefined}
              className={cn(
                "flex w-full items-center rounded-sm transition-all duration-200 text-[14px] font-medium text-text hover:bg-dark3 hover:text-text",
                sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
              )}
            >
              <Icon name="logout" size={20} className="text-text-dim shrink-0" />
              {sidebarOpen && <span className="truncate">Cerrar Sesión</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto min-w-0 bg-dark relative">
          {/* Mobile Header (Only visible on small screens) */}
          {!hideMobileHeader && (
            <header className="lg:hidden bg-dark2 border-b border-border px-4 py-3 sticky top-0 z-40 shadow-sm flex items-center justify-between min-h-[57px]">
            {isMobileSearchOpen ? (
              <div className="flex w-full items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                <button
                  onClick={() => {
                    setIsMobileSearchOpen(false);
                    setSearchTerm('');
                  }}
                  className="p-1 text-text-dim hover:text-text transition-colors shrink-0"
                >
                  <Icon name="arrow_back" size={20} />
                </button>
                <div className="relative flex-1 flex items-center">
                  <Icon name="search" size={18} className="absolute left-3 text-text-dim pointer-events-none" />
                  <input
                    autoFocus
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={
                      pathname === '/volunteers' ? 'Buscar voluntario...' :
                      pathname === '/shifts' ? 'Buscar voluntario...' :
                      pathname === '/reminders' ? 'Buscar avisos...' :
                      pathname === '/users' ? 'Buscar usuario...' :
                      'Buscar...'
                    }
                    className="w-full pl-9 pr-4 h-9 text-[13px] font-medium bg-dark3 border border-border rounded-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-[#4d7cfe]/30 focus:border-[#4d7cfe]/50 transition-all"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 text-text-dim hover:text-text"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center">
                  <Image 
                    src="/icon-192.png" 
                    alt="Templo Managua" 
                    width={32} 
                    height={32} 
                    className="rounded-sm object-contain"
                  />
                </div>
                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => setIsMobileSearchOpen(true)}
                    className="p-2 text-text-dim hover:text-gold transition-colors"
                    title="Buscar"
                  >
                    <Icon name="search" size={24} />
                  </button>
                  <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-text-dim hover:text-text transition-colors"
                    title="Más opciones"
                  >
                    <Icon name="more_vert" size={24} />
                  </button>
                  
                  {isMobileMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsMobileMenuOpen(false)} />
                      <div className="absolute top-12 right-0 w-48 bg-dark2 border border-border shadow-lg rounded-sm py-1 z-50 animate-in fade-in slide-in-from-top-2">
                        <button 
                          onClick={() => { toggleTheme(); setIsMobileMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text hover:bg-dark3 transition-colors text-left"
                        >
                          <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={20} className="text-text-dim" />
                          Tema
                        </button>
                        <Link 
                          href="/settings" 
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text hover:bg-dark3 transition-colors"
                        >
                          <Icon name="settings" size={20} className="text-text-dim" />
                          Ajustes
                        </Link>
                        <div className="h-[1px] bg-border my-1" />
                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-faint transition-colors text-left font-medium"
                        >
                          <Icon name="logout" size={20} className="text-red-400" />
                          Cerrar Sesión
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </header>
          )}

          <div className={cn(hideMobileHeader ? "p-0 lg:p-8" : "p-4 lg:p-8")}>
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
              className="absolute -left-3 z-20 w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-md border border-white/20 text-white transition-all"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            >
              <Icon name="chevron_left" size={18} />
            </button>
          )}

          {/* Clip: clips left/right, contains items */}
          <div className="w-full overflow-hidden rounded-full">
            <div
              ref={navScrollRef}
              className="flex overflow-x-auto bg-black/30 backdrop-blur-xl rounded-full p-1 shadow-2xl"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', scrollSnapType: 'x mandatory' }}
            >
              {allMobileNavItems.map((item, index) => {
                const isActive = pathname === item.href;
                const isLogout = item.href === '#logout';
                const isPageStart = index % ITEMS_PER_PAGE === 0;
                const sharedStyle = { width: 'calc((100vw - 32px) / 4)', scrollSnapAlign: isPageStart ? 'start' as const : undefined };
                const sharedClass = cn(
                  "flex flex-col items-center justify-center py-2 rounded-full transition-all duration-200 shrink-0",
                  isActive ? "bg-white/25 text-white shadow-sm" : "text-white/60 hover:text-white"
                );
                if (isLogout) {
                  return (
                    <button
                      key="logout"
                      onClick={handleLogout}
                      style={sharedStyle}
                      className={cn(sharedClass, "text-red-400 hover:text-red-300")}
                    >
                      <Icon name="logout" size={20} className="mb-1 text-red-400" />
                      <span className="font-inter text-[10px] font-semibold whitespace-nowrap">Salir</span>
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
                    <Icon name={item.icon} size={20} className={cn("mb-1", isActive ? "text-white" : "text-white/60")} />
                    <span className="font-inter text-[10px] font-semibold whitespace-nowrap">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right arrow — shown only when not on last page */}
          {navPage < totalNavPages - 1 && (
            <button
              onPointerDown={(e) => { e.preventDefault(); goToNavPage(navPage + 1); }}
              className="absolute -right-3 z-20 w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-md border border-white/20 text-white transition-all"
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
