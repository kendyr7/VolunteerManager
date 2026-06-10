import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, AlertTriangle, ShieldCheck, UserMinus, CalendarClock, TrendingUp } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Dashboard Global | Volunteer Manager",
};

export default function AdminDashboard() {
  // KPIs base actualizados para reflejar los nuevos valores de prueba (20+12+50 = 82)
  const kpis = {
    totalVolunteers: 82,
    coveredShifts: 65,
    atRiskShifts: 4,
    volunteersNoShift: 2,
    globalReliability: 96, // %
    criticalNextShift: "Mañana, Turno 1 (Transporte)",
  };

  const committeesProgress = [
    { name: "Historia", current: 20, required: 48, percentage: Math.round((20/48)*100) },
    { name: "Seguridad", current: 12, required: 48, percentage: Math.round((12/48)*100) },
    { name: "Transporte", current: 0, required: 48, percentage: 0 },
    { name: "Traducción", current: 0, required: 48, percentage: 0 },
    { name: "Guía", current: 50, required: 48, percentage: 100 },
  ];

  const todayAlerts = [
    { name: "María González", committee: "Historia", shift: "T1", time: "Hace 15m" },
    { name: "José Pérez", committee: "Seguridad", shift: "T1", time: "Hace 12m" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-md text-ink mb-1 tracking-tight">Panel Global</h1>
          <p className="text-body-md text-muted">Métricas generales de la Jornada de Puertas Abiertas.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button render={<Link href="/admin/replacements" />} className="bg-primary-cta hover:bg-primary-active text-canvas text-btn rounded-lg h-10 px-5 shadow-sm transition-all active:scale-95">
            Resolver Crisis
            <ArrowUpRight className="w-4 h-4 ml-1.5 opacity-70" />
          </Button>
        </div>
      </div>

      {/* Primary KPIs - Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl overflow-hidden group">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-muted mb-3 flex items-center justify-between">
              Voluntarios Total
              <span className="text-[10px] bg-surface-strong text-ink px-1.5 py-0.5 rounded font-mono">+12 hoy</span>
            </p>
            <div className="text-display-lg text-ink font-semibold tracking-tighter">
              {kpis.totalVolunteers}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-muted mb-3">Turnos Cubiertos</p>
            <div className="text-display-lg text-ink font-semibold tracking-tighter">
              {kpis.coveredShifts}
            </div>
            <div className="w-full h-1 bg-surface-strong mt-3 rounded-full overflow-hidden">
              <div className="h-full bg-success w-[78%]" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-warning/20 bg-warning/5 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-warning mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              En Riesgo
            </p>
            <div className="text-display-lg text-warning font-semibold tracking-tighter">
              {kpis.atRiskShifts}
            </div>
            <p className="text-[11px] text-warning/70 mt-2 font-medium">Bloques por debajo del mínimo</p>
          </CardContent>
        </Card>

        <Card className="border border-error/20 bg-error/5 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-caption-uppercase text-error mb-3 flex items-center gap-1.5">
              <UserMinus className="w-3.5 h-3.5" />
              Sin Turno Asignado
            </p>
            <div className="text-display-lg text-error font-semibold tracking-tighter">
              {kpis.volunteersNoShift}
            </div>
            <p className="text-[11px] text-error/70 mt-2 font-medium">Requieren seguimiento</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cobertura por Comité (Main column) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl">
            <div className="px-6 py-5 border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="text-title-md text-ink">Cobertura por Comité</h3>
                <p className="text-body-sm text-muted">Progreso hacia la meta de 48 bloques cubiertos por área.</p>
              </div>
            </div>
            <CardContent className="p-0">
              <div className="divide-y divide-hairline">
                {committeesProgress.map((com, i) => (
                  <div key={i} className="px-6 py-4 flex flex-col gap-3 hover:bg-canvas-soft transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: com.percentage === 100 ? 'var(--color-success)' : com.percentage < 65 ? 'var(--color-warning)' : 'var(--color-text-link)' }} />
                        <span className="text-body-md font-medium text-ink">{com.name}</span>
                      </div>
                      <span className="text-code text-muted">
                        <strong className="text-ink font-medium">{com.current}</strong> / {com.required}
                      </span>
                    </div>
                    <Progress 
                      value={com.percentage} 
                      className="h-1.5 bg-surface-strong" 
                      indicatorClassName={
                        com.percentage === 100 ? "bg-success" :
                        com.percentage < 65 ? "bg-warning" : "bg-text-link"
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Insights Column */}
        <div className="space-y-6">
          
          {/* Confiabilidad Global */}
          <Card className="border border-hairline-strong bg-surface-dark text-canvas shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-muted-soft mb-2">
                <ShieldCheck className="w-4 h-4" />
                <h3 className="text-caption-uppercase">Confiabilidad Global</h3>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-display-xl font-bold tracking-tighter text-canvas">{kpis.globalReliability}%</span>
                <span className="text-body-sm text-success flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +2%</span>
              </div>
              <p className="text-body-sm text-muted-soft">Porcentaje histórico de asistencia de los voluntarios asignados.</p>
            </CardContent>
          </Card>

          {/* Próximo Cuello de Botella */}
          <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-muted mb-3">
                <CalendarClock className="w-4 h-4" />
                <h3 className="text-caption-uppercase">Cuello de Botella Inmediato</h3>
              </div>
              <p className="text-body-md font-medium text-ink leading-tight mb-2">
                {kpis.criticalNextShift}
              </p>
              <p className="text-body-sm text-muted mb-4">
                Faltan 8 voluntarios para alcanzar el mínimo de cobertura de seguridad operativa.
              </p>
              <Button variant="outline" className="w-full border-hairline-strong text-ink hover:bg-canvas-soft rounded-lg h-9 text-btn">
                Ver Turno Detallado
              </Button>
            </CardContent>
          </Card>

          {/* Alertas Urgentes (Minimalista) */}
          {todayAlerts.length > 0 && (
            <div className="pt-2">
              <h3 className="text-caption-uppercase text-muted mb-3 pl-1">Ausencias de Hoy ({todayAlerts.length})</h3>
              <div className="space-y-2">
                {todayAlerts.map((alert, i) => (
                  <div key={i} className="flex items-center justify-between bg-error/5 border border-error/10 p-3 rounded-xl">
                    <div>
                      <p className="text-body-sm font-medium text-ink">{alert.name}</p>
                      <p className="text-[11px] text-muted">{alert.committee} • {alert.shift}</p>
                    </div>
                    <span className="text-[10px] font-mono text-error font-medium">{alert.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
