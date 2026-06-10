import { ShiftCalendar } from "@/components/ShiftCalendar";

export const metadata = {
  title: "Mi Calendario | Volunteer Manager",
  description: "Calendario de turnos de voluntariado",
};

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Header Minimalista */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              V
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-800">
              Mis Turnos
            </h1>
          </div>
          <div className="text-sm font-medium text-slate-500">
            Comité: <span className="text-blue-600">Historia</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-light text-slate-800">
            Septiembre 2026
          </h2>
          <p className="text-slate-500 mt-1">
            Selecciona los turnos en los que deseas servir. Los turnos en color azul son tus inscripciones confirmadas.
          </p>
        </div>

        <ShiftCalendar />
      </main>
    </div>
  );
}
