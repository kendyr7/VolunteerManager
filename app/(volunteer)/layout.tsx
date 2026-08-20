'use client'

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { MobileThemeMenu } from "@/components/mobile-theme-menu";
import { useThemePreference } from "@/lib/use-theme-preference";

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

export default function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileThemeOpen, setIsMobileThemeOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { preference, resolvedTheme, setPreference, toggleTheme } = useThemePreference();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsMobileThemeOpen(false);
  }, [pathname]);

  const navItems = [
    { name: "Turnos", href: "/calendar", icon: "checklist" },
    { name: "Solicitudes", href: "/requests", icon: "published_with_changes" },
    { name: "Mi Perfil", href: "/profile", icon: "person" }
  ];

  const handleLogoutClick = async () => {
    await logout();
    window.location.href = "/login";
  };

  if (!mounted) {
    return (
      <div className="h-screen bg-dark flex items-center justify-center text-text">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
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

          {/* Scrollable nav content */}
          <div className={cn("flex-1 overflow-y-auto overflow-x-hidden py-6 space-y-6 min-h-0 transition-all duration-300", sidebarOpen ? "px-4" : "px-2")}>
            <div className="space-y-1">
              {sidebarOpen && (
                <div className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-text-dim">
                  <span>Navegación</span>
                  <Icon name="expand_more" size={16} />
                </div>
              )}
              {navItems.map((item) => {
                const isActive = pathname === item.href;
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
              onClick={handleLogoutClick}
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

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto min-w-0 bg-dark relative pb-24 lg:pb-0" style={{ scrollbarGutter: 'stable' }}>
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Floating Glassmorphic Bottom Navigation */}
      <div className="lg:hidden fixed bottom-6 left-0 right-0 z-50 px-4">
        <MobileThemeMenu
          open={isMobileThemeOpen}
          preference={preference}
          onChange={setPreference}
          onClose={() => setIsMobileThemeOpen(false)}
        />
        <div className="relative w-full">
          <div className="relative w-full overflow-hidden rounded-full">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border border-white/10 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl shadow-lg"
            />
            <div
              className="relative z-10 flex overflow-x-auto rounded-full bg-transparent p-1 justify-around"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const sharedStyle = { width: 'calc((100vw - 32px) / 5)' };
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    style={sharedStyle}
                    className={cn(
                      "flex flex-col items-center justify-center py-2 rounded-full transition-all duration-200 shrink-0 active:scale-[0.95]",
                      isActive ? "bg-black/10 dark:bg-white/25 text-black dark:text-white shadow-sm" : "text-black/50 dark:text-white/60 hover:text-black dark:hover:text-white"
                    )}
                  >
                    <Icon name={item.icon} size={20} className={cn("mb-1", isActive ? "text-black dark:text-white" : "text-black/50 dark:text-white/60")} />
                    <span className="font-inter text-[10px] font-semibold whitespace-nowrap">{item.name}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setIsMobileThemeOpen(open => !open)}
                aria-expanded={isMobileThemeOpen}
                aria-label="Cambiar apariencia"
                style={{ width: 'calc((100vw - 32px) / 5)' }}
                className={cn(
                  "flex flex-col items-center justify-center py-2 rounded-full transition-all duration-200 shrink-0 active:scale-[0.95]",
                  isMobileThemeOpen
                    ? "bg-[#4d7cfe]/15 text-[#4d7cfe]"
                    : "text-black/50 dark:text-white/60 hover:text-black dark:hover:text-white"
                )}
              >
                <Icon
                  name={resolvedTheme === 'dark' ? 'dark_mode' : 'light_mode'}
                  size={20}
                  className={cn("mb-1", isMobileThemeOpen ? "text-[#4d7cfe]" : "text-black/50 dark:text-white/60")}
                />
                <span className="font-inter text-[10px] font-semibold whitespace-nowrap">Tema</span>
              </button>
              
              {/* Logout button */}
              <button
                onClick={handleLogoutClick}
                style={{ width: 'calc((100vw - 32px) / 5)' }}
                className="flex flex-col items-center justify-center py-2 rounded-full transition-all duration-200 shrink-0 text-red-400 hover:text-red-300 active:scale-[0.95]"
              >
                <Icon name="logout" size={20} className="mb-1 text-red-400" />
                <span className="font-inter text-[10px] font-semibold whitespace-nowrap text-red-400">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
