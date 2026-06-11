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

  const activeItem = [...NAV_ITEMS, ...BOTTOM_ITEMS].find(item => pathname === item.href);
  const currentTitle = activeItem ? activeItem.name : "Dashboard";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-700">
      
      {/* Desktop Top Navbar */}
      <header className="hidden md:flex h-16 bg-white border-b border-slate-100 shrink-0 sticky top-0 z-50">
        {/* Left Logo Section (Matches sidebar width) */}
        <div className="w-[260px] flex items-center px-6 border-r border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <Image 
              src="/icon-192.png" 
              alt="Templo Managua" 
              width={28} 
              height={28} 
              className="rounded-sm object-contain"
            />
            <span className="font-bold text-lg text-slate-900 tracking-tight">Templo Managua</span>
          </div>
        </div>
        
        {/* Right Action Section */}
        <div className="flex-1 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center">
              <Icon name="sort" size={24} />
            </button>
            <span className="font-semibold text-[17px] text-slate-800">{currentTitle}</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
              <Icon name="search" size={20} />
              <span className="text-[13px] font-medium hidden lg:inline-block">Search for task and etc.</span>
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
      <div className="flex flex-1 overflow-hidden pb-20 md:pb-0">
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-[260px] border-r border-slate-100 bg-white overflow-y-auto shrink-0">
          <div className="flex-1 px-4 py-6 space-y-6">
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
              
              <Link
                href="#"
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <Icon name="grid_view" size={20} className="text-slate-500" />
                All Apps
              </Link>
            </div>

            {/* Latest Projects Section */}
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

