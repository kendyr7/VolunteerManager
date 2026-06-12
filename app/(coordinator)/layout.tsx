'use client'

import { useState, useEffect, useRef } from "react";
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
  const { searchTerm, setSearchTerm } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

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
    { name: "Voluntarios", href: "/volunteers", icon: "work", roles: ['Admin', 'Editor'] },
    { name: "Importación", href: "/import", icon: "cloud_upload", roles: ['Admin', 'Editor'] },
    { name: currentRole === 'Lector' ? "Mi Perfil" : "Turnos", href: "/shifts", icon: currentRole === 'Lector' ? "person" : "checklist", roles: ['Admin', 'Editor', 'Lector'] },
    { name: "Avisos", href: "/reminders", icon: "campaign", roles: ['Admin', 'Editor'] },
    { name: "Usuarios", href: "/users", icon: "shield_person", roles: ['Admin'] },
  ];

  const BOTTOM_ITEMS = [
    { name: "Ajustes", href: "/settings", icon: "settings", roles: ['Admin', 'Editor'] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(currentRole));
  const visibleBottomItems = BOTTOM_ITEMS.filter(item => item.roles.includes(currentRole));

  const activeItem = [...NAV_ITEMS, ...BOTTOM_ITEMS].find(item => pathname === item.href);
  const currentTitle = activeItem ? activeItem.name : "Dashboard";

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-700 overflow-hidden">
      
      {/* Desktop Top Navbar */}
      <header className="hidden md:flex h-16 bg-white border-b border-slate-100 shrink-0 sticky top-0 z-50">
        {/* Left Logo Section — collapses with sidebar */}
        <div
          className="flex items-center px-6 border-r border-slate-100 shrink-0 overflow-hidden transition-all duration-300"
          style={{ width: sidebarOpen ? 260 : 72 }}
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
              className="font-bold text-lg text-slate-900 tracking-tight whitespace-nowrap transition-all duration-300 overflow-hidden"
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
              className="text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Icon name="sort" size={24} />
            </button>
            <span className="font-semibold text-[17px] text-slate-800">{currentTitle}</span>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Contextual Search Input */}
            <div className="relative hidden lg:flex items-center">
              <Icon name="search" size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
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
                className="pl-9 pr-4 h-9 w-56 xl:w-72 text-[13px] font-medium bg-slate-50 border border-slate-200 rounded-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4d7cfe]/30 focus:border-[#4d7cfe]/50 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-4 ml-4">
              <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
                <Icon name="notifications" size={22} />
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-pink-500 rounded-full border-[1.5px] border-white"></span>
              </button>
              <button className="text-slate-400 hover:text-slate-600 transition-colors">
                <Icon name="add_circle" size={22} />
              </button>
              <button className="text-slate-400 hover:text-slate-600 transition-colors">
                <Icon name="filter_list" size={22} />
              </button>
              
              <div className="ml-2 w-8 h-8 rounded-full overflow-hidden border border-slate-200 shrink-0">
                <img 
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e2e8f0" 
                  alt="Avatar" 
                  className="w-full h-full object-cover" 
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden pb-20 md:pb-0">
        
        {/* Desktop Sidebar */}
        <aside
          className="hidden md:flex flex-col border-r border-slate-100 bg-white shrink-0 overflow-hidden transition-all duration-300"
          style={{ width: sidebarOpen ? 260 : 72 }}
        >
          {/* Scrollable nav content */}
          <div className={cn("flex-1 overflow-y-auto overflow-x-hidden py-6 space-y-6 min-h-0 transition-all duration-300", sidebarOpen ? "px-4" : "px-2")}>
            {/* Navigation Section */}
            <div className="space-y-1">
              {/* Section header — hidden when collapsed */}
              {sidebarOpen && (
                <div className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-slate-400">
                  <span>Navigation</span>
                  <Icon name="expand_more" size={16} />
                </div>
              )}

              {visibleNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!sidebarOpen ? item.name : undefined}
                    className={cn(
                      "relative flex items-center rounded-sm transition-all duration-200 text-[14px] font-medium overflow-hidden",
                      sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5",
                      isActive
                        ? "bg-[#4d7cfe]/10 text-[#4d7cfe]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <Icon name={item.icon} size={20} className={cn("shrink-0", isActive ? "text-[#4d7cfe]" : "text-slate-500")} />
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
          <div className={cn("shrink-0 border-t border-slate-100 space-y-1 transition-all duration-300", sidebarOpen ? "p-4" : "p-2")}>
            {visibleBottomItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={!sidebarOpen ? item.name : undefined}
                className={cn(
                  "flex items-center rounded-sm transition-all duration-200 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
                )}
              >
                <Icon name={item.icon} size={20} className="text-slate-500 shrink-0" />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              title={!sidebarOpen ? "Cerrar Sesión" : undefined}
              className={cn(
                "flex w-full items-center rounded-sm transition-all duration-200 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center p-2.5"
              )}
            >
              <Icon name="logout" size={20} className="text-slate-500 shrink-0" />
              {sidebarOpen && <span className="truncate">Cerrar Sesión</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto min-w-0 bg-slate-50 relative">
          {/* Mobile Header (Only visible on small screens) */}
          <header className="md:hidden bg-white border-b border-slate-100 p-4 sticky top-0 z-40 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image 
                src="/icon-192.png" 
                alt="Templo Managua" 
                width={28} 
                height={28} 
                className="rounded-sm object-contain"
              />
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                Templo Managua
              </h1>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-red-600 transition-colors"
              title="Cerrar Sesión"
            >
              <Icon name="logout" size={20} />
            </button>
          </header>

          <div className="p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around p-2 z-50 pb-[env(safe-area-inset-bottom,0.5rem)] shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
        {visibleNavItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-sm min-w-[64px] transition-all",
                isActive ? "text-[#4d7cfe]" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Icon name={item.icon} size={24} className={cn("mb-1", isActive ? "text-[#4d7cfe]" : "text-slate-400")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
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
