'use client'

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarDays, MessageSquare, Settings, ShieldCheck, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";

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
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ['Admin'] },
    { name: "Voluntarios", href: "/volunteers", icon: Users, roles: ['Admin', 'Editor'] },
    { name: currentRole === 'Lector' ? "Mi Perfil" : "Turnos", href: "/shifts", icon: currentRole === 'Lector' ? User : CalendarDays, roles: ['Admin', 'Editor', 'Lector'] },
    { name: "Avisos", href: "/reminders", icon: MessageSquare, roles: ['Admin', 'Editor'] },
    { name: "Ajustes", href: "/settings", icon: Settings, roles: ['Admin', 'Editor'] },
    { name: "Usuarios", href: "/users", icon: ShieldCheck, roles: ['Admin'] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(currentRole));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-20 md:pb-0 font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Templo <span className="text-blue-600">Managua</span>
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-black">
            {currentRole === 'Admin' ? 'Administración Global' : `Comité de ${currentCommittee}`}
          </p>
        </div>

        {/* User Profile */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-white">
          <div className="h-10 w-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold">
            {currentRole === 'Admin' ? 'AD' : currentRole === 'Editor' ? 'ED' : 'VO'}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {currentRole === 'Admin' ? 'Jasser Mendoza' : currentRole === 'Editor' ? 'Samantha Editora' : 'Voluntario'}
            </p>
            <p className="text-[10px] font-black text-[#0084d1] uppercase tracking-widest">
              {currentRole}
            </p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold",
                  isActive 
                    ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-blue-600" : "text-slate-400")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-slate-100 bg-white">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 sticky top-0 z-40 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              Templo <span className="text-blue-600">Managua</span>
            </h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
              {currentRole === 'Admin' ? 'Administración Global' : currentRole}
            </p>
          </div>
          <div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-red-600 transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-50 pb-[env(safe-area-inset-bottom,0.5rem)] shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
        {visibleNavItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center p-2 rounded-lg min-w-[64px] transition-all",
                isActive ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <item.icon className={cn("h-5 w-5 mb-1", isActive && "text-blue-600 fill-blue-50")} />
              <span className="text-[10px] font-bold">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
