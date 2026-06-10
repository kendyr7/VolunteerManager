'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, AlertTriangle, ShieldCheck, Download, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Global", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Reemplazos", href: "/admin/replacements", icon: AlertTriangle },
  { name: "Coordinadores", href: "/admin/coordinators", icon: ShieldCheck },
  { name: "Ver Comités", href: "/dashboard", icon: LayoutTemplate }, // Link to standard coordinator view
  { name: "Exportar", href: "/admin/export", icon: Download },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-slate-900 sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Administración
          </h1>
          <p className="text-xs text-slate-400 uppercase tracking-wider mt-1 font-medium">Control Global</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            // Check if active or child routes
            const isActive = pathname.startsWith(item.href) && (item.href !== '/dashboard');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium",
                  isActive 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-slate-400")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-slate-900 p-4 sticky top-0 z-40 shadow-sm flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">
            Administración
          </h1>
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
            A
          </div>
        </header>

        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 flex justify-around p-2 z-50 pb-[env(safe-area-inset-bottom,0.5rem)]">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = pathname.startsWith(item.href) && (item.href !== '/dashboard');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center p-2 rounded-lg min-w-[64px] transition-all",
                isActive ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <item.icon className={cn("h-5 w-5 mb-1", isActive && "text-blue-400")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
