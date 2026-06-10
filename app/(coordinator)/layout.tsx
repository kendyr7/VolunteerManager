'use client'

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarDays, MessageSquare, Settings, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // --- MOCK AUTH SYSTEM ---
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [currentCommittee, setCurrentCommittee] = useState<string>('Historia');

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const committee = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (committee) setCurrentCommittee(committee);
  }, []);

  const changeRole = (role: 'Admin' | 'Editor' | 'Lector') => {
    setCurrentRole(role);
    localStorage.setItem('mock_role', role);
    window.location.reload();
  };

  const changeCommittee = (c: string) => {
    setCurrentCommittee(c);
    localStorage.setItem('mock_committee', c);
    window.location.reload();
  };

  const NAV_ITEMS = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ['Admin', 'Editor'] },
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
        
        {/* Mock Auth Switcher */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
          <p className="text-[9px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5"><User className="w-3 h-3"/> Simular Sesión</p>
          <Select value={currentRole} onValueChange={(v) => v && changeRole(v as any)}>
            <SelectTrigger className="w-full h-8 text-xs bg-white border-slate-200 text-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 text-slate-700">
              <SelectItem value="Admin">Rol: Admin</SelectItem>
              <SelectItem value="Editor">Rol: Editor</SelectItem>
              <SelectItem value="Lector">Rol: Lector</SelectItem>
            </SelectContent>
          </Select>
          
          {currentRole === 'Editor' && (
            <Select value={currentCommittee} onValueChange={(v) => v && changeCommittee(v)}>
              <SelectTrigger className="w-full h-8 text-xs bg-white border-slate-200 text-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-700">
                <SelectItem value="Historia">Historia</SelectItem>
                <SelectItem value="Seguridad">Seguridad</SelectItem>
                <SelectItem value="Guía">Guía</SelectItem>
              </SelectContent>
            </Select>
          )}
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
          <div className="flex gap-2">
            <Select value={currentRole} onValueChange={(v) => v && changeRole(v as any)}>
              <SelectTrigger className="w-24 h-8 text-xs bg-slate-50 border-slate-200 text-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-700">
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Editor">Editor</SelectItem>
                <SelectItem value="Lector">Lector</SelectItem>
              </SelectContent>
            </Select>
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
