import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Users, AlertTriangle, UserCheck, ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Dashboard de Coordinador | Volunteer Manager",
};

export default function CoordinatorDashboard() {
  // Datos simulados (Mock) para el coordinador de un comité específico
  const stats = {
    totalVolunteers: 45,
    coveredShifts: 42,
    totalRequiredShifts: 48,
    atRiskShifts: 2,
    coveragePercentage: 87, // 42/48
    todayAttendance: 95, // %
  };

  const nextShifts = [
    { id: 1, name: "Turno 1 (8:00 AM - 12:00 PM)", status: "Completo", enrolled: 4, required: 4, risk: "none" },
    { id: 2, name: "Turno 2 (11:00 AM - 3:00 PM)", status: "Riesgo", enrolled: 2, required: 4, risk: "high" },
    { id: 3, name: "Turno 3 (2:00 PM - 6:00 PM)", status: "Atención", enrolled: 3, required: 4, risk: "medium" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink tracking-tight">Comité de Historia</h1>
            <span className="bg-surface-strong text-ink px-2 py-0.5 rounded-full text-caption-uppercase">Templo de Managua</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Gestión y estado de tus voluntarios.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button render={<Link href="/volunteers" />} nativeButton={false} className="bg-[#0084d1] hover:bg-[#006eb3] text-white text-btn rounded-lg h-10 px-5 shadow-sm transition-all active:scale-95">
            Ver Mis Voluntarios
            <ArrowUpRight className="w-4 h-4 ml-1.5 opacity-70" />
          </Button>
        </div>
      </div>

      {/* Primary KPIs - Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-slate-500 mb-3 flex items-center justify-between">
              Mi Equipo
              <Users className="w-3.5 h-3.5 text-slate-500-soft" />
            </p>
            <div className="text-display-lg text-ink font-semibold tracking-tighter">
              {stats.totalVolunteers}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-slate-500 mb-3">Cobertura del Comité</p>
            <div className="text-display-lg text-ink font-semibold tracking-tighter">
              {stats.coveragePercentage}%
            </div>
            <div className="w-full h-1 bg-surface-strong mt-3 rounded-full overflow-hidden">
              <div className="h-full bg-text-link" style={{ width: `${stats.coveragePercentage}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-warning/20 bg-warning/5 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-warning mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Turnos en Riesgo
            </p>
            <div className="text-display-lg text-warning font-semibold tracking-tighter">
              {stats.atRiskShifts}
            </div>
            <p className="text-[11px] text-warning/70 mt-2 font-medium">Requieren atención</p>
          </CardContent>
        </Card>

        <Card className="border border-hairline-strong bg-surface-dark text-white shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-slate-500-soft mb-3 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Asistencia Hoy
            </p>
            <div className="text-display-lg font-semibold tracking-tighter">
              {stats.todayAttendance}%
            </div>
            <p className="text-[11px] text-success mt-2 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Excelente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Próximos Turnos (Hoy) */}
      <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl">
        <div className="px-6 py-5 border-b border-hairline">
          <h3 className="text-lg font-bold tracking-tight text-ink">Turnos de Hoy (Lunes 14 Sep)</h3>
          <p className="text-xs font-medium text-slate-500">Asegura la asistencia de tu equipo para los próximos bloques.</p>
        </div>
        <CardContent className="p-0">
          <div className="divide-y divide-hairline">
            {nextShifts.map((shift) => (
              <div key={shift.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-canvas-soft transition-colors">
                <div>
                  <h4 className="text-sm font-medium font-medium text-ink">{shift.name}</h4>
                  <div className="flex items-center gap-2 mt-1.5">
                    {shift.risk === 'high' ? (
                      <span className="text-[10px] bg-error/10 text-error px-2 py-0.5 rounded font-medium uppercase tracking-wider border border-error/20">Crítico</span>
                    ) : shift.risk === 'medium' ? (
                      <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded font-medium uppercase tracking-wider border border-warning/20">Atención</span>
                    ) : (
                      <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded font-medium uppercase tracking-wider border border-success/20">Cubierto</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col md:items-end gap-2">
                  <span className="text-code text-slate-500">
                    <strong className="text-ink">{shift.enrolled}</strong> de {shift.required} voluntarios
                  </span>
                  <div className="w-32 h-1.5 bg-surface-strong rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${shift.risk === 'high' ? 'bg-error' : shift.risk === 'medium' ? 'bg-warning' : 'bg-success'}`}
                      style={{ width: `${(shift.enrolled / shift.required) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
