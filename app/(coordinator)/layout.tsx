'use client'

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import Image from "next/image";

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

export default function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('Historia');

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee) setCurrentCommittee(committee);
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('mock_role');
    localStorage.removeItem('mock_committee');
    await logout();
    window.location.href = '/login';
  };

  const NAV_ITEMS = [
    { name: "Dashboard", href: "/dashboard", icon: "space_dashboard", roles: ['Admin'] },
    { name: "Voluntarios", href: "/volunteers", icon: "work", roles: ['Admin', 'Editor'] },
    { name: currentRole === 'Lector' ? "Mi Perfil" : "Turnos", href: "/shifts", icon: currentRole === 'Lector' ? "person" : "checklist", roles: ['Admin', 'Editor', 'Lector'] },
    { name: "Avisos", href: "/reminders", icon: "campaign", roles: ['Admin', 'Editor'] },
    { name: "Usuarios", href: "/users", icon: "shield_person", roles: ['Admin'] },
  ];

  const BOTTOM_ITEMS = [
    { name: "Ajustes", href: "/settings", icon: "settings", roles: ['Admin', 'Editor'] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(currentRole));
  const visibleBottomItems = BOTTOM_ITEMS.filter(item => item.roles.includes(currentRole));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-20 md:pb-0 font-sans text-slate-700">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] border-r border-slate-100 bg-white sticky top-0 h-screen shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <Image 
              src="/icon-192.png" 
              alt="Templo Managua" 
              width={32} 
              height={32} 
              className="rounded-sm object-contain"
            />
            <span className="font-bold text-xl text-slate-900 tracking-tight">Templo Managua</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
          {/* Navigation Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-slate-400">
              <span>Navigation</span>
              <Icon name="expand_more" size={16} />
            </div>
            
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 text-[14px] font-medium",
                    isActive 
                      ? "bg-[#eff6ff] text-[#2563eb]" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon name={item.icon} size={20} className={isActive ? "text-[#2563eb]" : "text-slate-500"} />
                  {item.name}
                  {isActive && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#3b82f6] rounded-l-full mr-[-16px]" />
                  )}
                </Link>
              );
            })}
            
            {/* Added an "All Apps" link to match the image visually, though it might not go anywhere useful */}
            <Link
              href="#"
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon name="grid_view" size={20} className="text-slate-500" />
              All Apps
            </Link>
          </div>

          {/* Latest Projects Section (Visuals from the image) */}
          <div className="space-y-1 pt-2">
            <div className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-slate-400">
              <span>Latest Projects</span>
              <Icon name="add_circle" size={16} />
            </div>
            
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-sm text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center text-white">
                <Icon name="sports_basketball" size={12} />
              </div>
              UI/UX Inspiration
            </Link>
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-sm text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <div className="w-5 h-5 rounded-t-full rounded-bl-full bg-green-500" />
              Theme Development
            </Link>
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-sm text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <div className="w-5 h-5 rounded-sm bg-blue-500 flex items-center justify-center text-white">
                <Icon name="deployed_code" size={14} />
              </div>
              Campaing Design
            </Link>
            
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-sm text-[13px] font-medium text-[#3b82f6] hover:underline mt-2">
              <Icon name="more_horiz" size={16} />
              See More Projects
            </Link>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="p-4 space-y-1 mt-auto">
          {visibleBottomItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon name={item.icon} size={20} className="text-slate-500" />
              {item.name}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <Icon name="logout" size={20} className="text-slate-500" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden min-w-0 bg-white">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-100 p-4 sticky top-0 z-40 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image 
              src="/icon-192.png" 
              alt="Templo Managua" 
              width={28} 
              height={28} 
              className="rounded object-contain"
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
                isActive ? "text-[#2563eb]" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Icon name={item.icon} size={24} className={cn("mb-1", isActive ? "text-[#2563eb]" : "text-slate-400")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

