'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarDays, MessageSquare, Upload, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Voluntarios", href: "/volunteers", icon: Users },
  { name: "Días", href: "/shifts", icon: CalendarDays },
  { name: "Avisos", href: "/reminders", icon: MessageSquare },
  { name: "Importar", href: "/import", icon: Upload },
  { name: "Ajustes", href: "/settings", icon: Settings },
];

export default function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Comité <span className="text-blue-600">Historia</span>
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-wider mt-1 font-medium">Panel de Coordinación</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium",
                  isActive 
                    ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-blue-600" : "text-slate-400")} />
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
          <h1 className="text-lg font-bold text-slate-800">
            Comité <span className="text-blue-600">Historia</span>
          </h1>
          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
            C
          </div>
        </header>

        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-50 pb-[env(safe-area-inset-bottom,0.5rem)] shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
        {NAV_ITEMS.slice(0, 5).map((item) => {
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
              <item.icon className={cn("h-5 w-5 mb-1", isActive && "fill-blue-100")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
