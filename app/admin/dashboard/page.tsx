import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, AlertTriangle, ShieldCheck, UserMinus, CalendarClock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const metadata = {
  title: "Dashboard Global | Volunteer Manager",
};

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Fetch volunteers, committees and shifts
  const { data: volunteersData } = await supabase
    .from('volunteers')
    .select('*, committees(name)');

  const { data: committeesData } = await supabase
    .from('committees')
    .select('id, name');

  const { data: shiftsData } = await supabase
    .from('shifts')
    .select('*');

  const volunteers = volunteersData || [];
  const committees = committeesData || [];
  const shifts = shiftsData || [];

  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  const committeeRequirements: Record<string, Record<string, number>> = {
    'Historia': { T1: 3, T2: 2, T3: 3, T4: 2 },
    'Seguridad': { T1: 4, T2: 4, T3: 4, T4: 4 },
    'Guía': { T1: 5, T2: 5, T3: 5, T4: 5 },
    'Traducción': { T1: 2, T2: 1, T3: 2, T4: 1 },
    'Transporte': { T1: 3, T2: 2, T3: 3, T4: 2 },
    'Primeros Auxilios': { T1: 2, T2: 2, T3: 2, T4: 2 }
  };

  // Build global shifts map
  const globalShifts: Record<string, Record<string, string[]>> = {};
  shifts.forEach(s => {
    if (s.volunteer_id) {
      if (!globalShifts[s.volunteer_id]) {
        globalShifts[s.volunteer_id] = {};
      }
      if (!globalShifts[s.volunteer_id][s.day_key]) {
        globalShifts[s.volunteer_id][s.day_key] = [];
      }
      if (!globalShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
        globalShifts[s.volunteer_id][s.day_key].push(s.shift_key);
      }
    }
  });

  // Calculate KPIs
  const totalVolunteers = volunteers.length;
  const volsWithShift = new Set(shifts.map(s => s.volunteer_id));
  const volunteersNoShift = volunteers.filter(v => !volsWithShift.has(v.id)).length;
  const coveredShifts = shifts.length;

  let totalRequired = 0;
  let totalAssignedInRequired = 0;
  let atRiskShifts = 0;
  const committeeNames = committees.map(c => c.name);

  // For finding worst shift deficit
  let worstShiftDeficit = 0;
  let worstShiftInfo = { day: "No hay turnos en riesgo", shift: "", committee: "", missing: 0 };

  EVENT_DAYS.forEach(day => {
    committeeNames.forEach(comm => {
      ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
        const req = committeeRequirements[comm]?.[shiftId] ?? 0;
        totalRequired += req;

        const count = volunteers.filter(vol => {
          const volComm = vol.committees?.name || 'Sin comité';
          if (volComm !== comm) return false;
          const vShifts = globalShifts[vol.id];
          return vShifts && vShifts[day.key] && vShifts[day.key].includes(shiftId);
        }).length;

        totalAssignedInRequired += Math.min(count, req);

        if (count < req) {
          atRiskShifts++;
          const deficit = req - count;
          if (deficit > worstShiftDeficit) {
            worstShiftDeficit = deficit;
            const shiftInfo = SHIFT_TIMES.find(s => `T${s.id}` === shiftId);
            const dayLabel = format(day.date, "EEEE d 'de' MMMM", { locale: es });
            worstShiftInfo = {
              day: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
              shift: `${shiftId} (${shiftInfo?.time || ''})`,
              committee: comm,
              missing: deficit
            };
          }
        }
      });
    });
  });

  const globalCoveragePercentage = totalRequired > 0 ? Math.round((totalAssignedInRequired / totalRequired) * 100) : 100;

  // Calculate committee progress
  const committeesProgress = committees.map(c => {
    let current = 0;
    let required = 0;

    EVENT_DAYS.forEach(day => {
      ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
        const req = committeeRequirements[c.name]?.[shiftId] ?? 0;
        required += req;

        const count = volunteers.filter(vol => {
          const volComm = vol.committees?.name || 'Sin comité';
          if (volComm !== c.name) return false;
          const vShifts = globalShifts[vol.id];
          return vShifts && vShifts[day.key] && vShifts[day.key].includes(shiftId);
        }).length;

        current += Math.min(count, req);
      });
    });

    return {
      name: c.name,
      current,
      required,
      percentage: required > 0 ? Math.round((current / required) * 100) : 100
    };
  }).sort((a, b) => a.percentage - b.percentage);

  const todayAlerts: any[] = []; // Empty list for real-time notifications placeholder

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-md text-ink mb-1 tracking-tight">Panel Global</h1>
          <p className="text-body-md text-muted">Métricas generales de la Jornada de Puertas Abiertas en tiempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button render={<Link href="/shifts" />} nativeButton={false} className="bg-[#0084d1] hover:bg-[#006eb3] text-white text-btn rounded-lg h-10 px-5 shadow-sm transition-all active:scale-95">
            Gestionar Turnos
            <ArrowUpRight className="w-4 h-4 ml-1.5 opacity-70" />
          </Button>
        </div>
      </div>

      {/* Primary KPIs - Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl overflow-hidden group">
          <CardContent className="p-5">
            <div className="text-caption-uppercase text-muted mb-3 flex items-center justify-between">
              Voluntarios Total
            </div>
            <div className="text-display-lg text-ink font-semibold tracking-tighter">
              {totalVolunteers}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-hairline-strong bg-canvas shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="text-caption-uppercase text-muted mb-3">Turnos Asignados</div>
            <div className="text-display-lg text-ink font-semibold tracking-tighter">
              {coveredShifts}
            </div>
            <div className="w-full h-1 bg-surface-strong mt-3 rounded-full overflow-hidden">
              <div className="h-full bg-success transition-all duration-500" style={{ width: `${globalCoveragePercentage}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm rounded-2xl overflow-hidden transition-colors ${atRiskShifts > 0 ? 'border-warning/20 bg-warning/5' : 'border-hairline-strong bg-canvas'}`}>
          <CardContent className="p-5">
            <div className={`text-caption-uppercase mb-3 flex items-center gap-1.5 ${atRiskShifts > 0 ? 'text-warning' : 'text-muted'}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              Turnos Incompletos
            </div>
            <div className={`text-display-lg font-semibold tracking-tighter ${atRiskShifts > 0 ? 'text-warning' : 'text-ink'}`}>
              {atRiskShifts}
            </div>
            <p className={`text-[11px] mt-2 font-medium ${atRiskShifts > 0 ? 'text-warning/70' : 'text-muted/70'}`}>
              {atRiskShifts > 0 ? 'Bloques por debajo del mínimo' : 'Todos los mínimos cubiertos'}
            </p>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm rounded-2xl overflow-hidden transition-colors ${volunteersNoShift > 0 ? 'border-error/20 bg-error/5' : 'border-hairline-strong bg-canvas'}`}>
          <CardContent className="p-5">
            <div className={`text-caption-uppercase mb-3 flex items-center gap-1.5 ${volunteersNoShift > 0 ? 'text-error' : 'text-muted'}`}>
              <UserMinus className="w-3.5 h-3.5" />
              Sin Asignación
            </div>
            <div className={`text-display-lg font-semibold tracking-tighter ${volunteersNoShift > 0 ? 'text-error' : 'text-ink'}`}>
              {volunteersNoShift}
            </div>
            <p className={`text-[11px] mt-2 font-medium ${volunteersNoShift > 0 ? 'text-error/70' : 'text-muted/70'}`}>
              {volunteersNoShift > 0 ? 'Requieren programación' : 'Todos asignados'}
            </p>
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
                <p className="text-body-sm text-muted">Progreso hacia la meta de cobertura de bloques por área.</p>
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
                {committeesProgress.length === 0 && (
                  <div className="p-8 text-center text-muted">No hay comités registrados.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Insights Column */}
        <div className="space-y-6">
          
          {/* Confiabilidad Global */}
          <Card className="border border-hairline-strong bg-surface-dark text-white shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-muted-soft mb-2">
                <ShieldCheck className="w-4 h-4" />
                <h3 className="text-caption-uppercase">Confiabilidad Global</h3>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-display-xl font-bold tracking-tighter text-white">98%</span>
                <span className="text-body-sm text-success flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +2%</span>
              </div>
              <p className="text-body-sm text-muted-soft">Porcentaje general estimado de asistencia y puntualidad de los voluntarios asignados.</p>
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
                {worstShiftInfo.day} {worstShiftInfo.shift ? `• ${worstShiftInfo.shift}` : ''}
              </p>
              <p className="text-body-sm text-muted mb-4">
                {worstShiftInfo.missing > 0 
                  ? `Faltan ${worstShiftInfo.missing} voluntarios para alcanzar el mínimo de cobertura para el comité de ${worstShiftInfo.committee}.`
                  : 'Todos los turnos programados cumplen con los mínimos requeridos.'
                }
              </p>
              <Link href="/shifts" className="block w-full">
                <Button variant="outline" className="w-full border-hairline-strong text-ink hover:bg-canvas-soft rounded-lg h-9 text-btn">
                  Ver Turno Detallado
                </Button>
              </Link>
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
