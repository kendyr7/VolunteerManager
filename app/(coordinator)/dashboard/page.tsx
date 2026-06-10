'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Users, AlertTriangle, UserCheck, ArrowUpRight, TrendingUp, Target, Activity, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CoordinatorDashboard() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem('mock_role');
    if (role === 'Editor' || role === 'Lector') {
      router.replace('/volunteers'); // Redirect to their main page
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  if (!isAuthorized) return null;

  // ... rest of the component state
  const globalStats = {
    totalRecruited: 1245,
    targetVolunteers: 1500,
    recruitmentPercentage: 83, // 1245/1500
    globalCoveragePercentage: 78,
    criticalAlerts: 18,
    averageReliability: 94,
  };

  const committeeStatus = [
    { id: 1, name: "Historia", coverage: 95, missing: 2, status: "success" },
    { id: 2, name: "Acomodación", coverage: 88, missing: 10, status: "success" },
    { id: 3, name: "Limpieza", coverage: 82, missing: 15, status: "warning" },
    { id: 4, name: "Protocolo", coverage: 65, missing: 40, status: "high_risk" },
    { id: 5, name: "Alimentación", coverage: 40, missing: 25, status: "high_risk" },
  ];

  const criticalShifts = [
    { id: 1, day: "Sábado 19 Sep", shift: "T1 (8:00 - 12:00)", committee: "Alimentación", enrolled: 2, required: 10 },
    { id: 2, day: "Viernes 18 Sep", shift: "T4 (17:00 - 21:00)", committee: "Protocolo", enrolled: 4, required: 15 },
    { id: 3, day: "Miércoles 16 Sep", shift: "T2 (11:00 - 15:00)", committee: "Limpieza", enrolled: 1, required: 5 },
    { id: 4, day: "Sábado 19 Sep", shift: "T3 (14:00 - 18:00)", committee: "Protocolo", enrolled: 5, required: 15 },
    { id: 5, day: "Lunes 14 Sep", shift: "T1 (8:00 - 12:00)", committee: "Alimentación", enrolled: 0, required: 4 },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header Administrativo */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Visión General del Evento</h1>
            <span className="bg-slate-100 text-[#0084d1] font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider">Admin</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Monitoreo global de reclutamiento, comités y alertas críticas.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl h-10 px-5 shadow-sm">
            Gestionar Comités
          </Button>
          <Button className="bg-[#0084d1] hover:bg-[#006eb3] text-white rounded-xl h-10 px-5 shadow-sm transition-all active:scale-95 font-semibold">
            Ver Todas las Alertas
            <ArrowUpRight className="w-4 h-4 ml-1.5 opacity-70" />
          </Button>
        </div>
      </div>

      {/* Primary KPIs - Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-slate-200 bg-white shadow-sm rounded-2xl overflow-hidden hover:border-[#0084d1]/30 transition-colors">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
              Progreso Reclutamiento
              <Target className="w-3.5 h-3.5 text-[#0084d1]" />
            </p>
            <div className="text-3xl text-slate-900 font-black tracking-tight flex items-baseline gap-1">
              {globalStats.totalRecruited} <span className="text-sm font-medium text-slate-400">/ {globalStats.targetVolunteers}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 mt-4 rounded-full overflow-hidden">
              <div className="h-full bg-[#0084d1] rounded-full" style={{ width: `${globalStats.recruitmentPercentage}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm rounded-2xl overflow-hidden hover:border-[#0084d1]/30 transition-colors">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
              Cobertura de Turnos
              <Activity className="w-3.5 h-3.5 text-teal-500" />
            </p>
            <div className="text-3xl text-slate-900 font-black tracking-tight">
              {globalStats.globalCoveragePercentage}%
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">A nivel global de todo el evento</p>
          </CardContent>
        </Card>

        <Card className="border border-red-200 bg-red-50/50 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-3 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Alertas Críticas
            </p>
            <div className="text-3xl text-red-600 font-black tracking-tight">
              {globalStats.criticalAlerts}
            </div>
            <p className="text-[11px] text-red-600/70 mt-2 font-bold uppercase tracking-wider">Turnos en peligro</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-slate-900 text-white shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Confiabilidad Global
            </p>
            <div className="text-3xl font-black tracking-tight">
              {globalStats.averageReliability}%
            </div>
            <p className="text-[11px] text-teal-400 mt-2 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Excelente compromiso
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monitoreo Desglosado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna Izquierda: Estado por Comité */}
        <Card className="border border-slate-200 bg-white shadow-sm rounded-2xl flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight text-slate-900">Estado por Comité</h3>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Ranking de cobertura y déficit de personal.</p>
            </div>
          </div>
          <CardContent className="p-0 flex-1">
            <div className="divide-y divide-slate-100">
              {committeeStatus.map((committee) => (
                <div key={committee.id} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-bold text-slate-800">{committee.name}</h4>
                      {committee.status === 'high_risk' && (
                        <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">Alerta</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            committee.status === 'success' ? 'bg-teal-400' :
                            committee.status === 'warning' ? 'bg-amber-400' : 'bg-red-500'
                          }`}
                          style={{ width: `${committee.coverage}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-600 w-8">{committee.coverage}%</span>
                    </div>
                  </div>
                  <div className="pl-6 text-right shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Faltan</p>
                    <p className={`text-lg font-black leading-none ${committee.missing > 15 ? 'text-red-500' : 'text-slate-700'}`}>
                      {committee.missing}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <div className="p-4 border-t border-slate-100 bg-slate-50 text-center rounded-b-2xl">
            <button className="text-sm font-bold text-[#0084d1] hover:text-[#006eb3]">Ver todos los comités</button>
          </div>
        </Card>

        {/* Columna Derecha: Top Turnos en Riesgo */}
        <Card className="border border-slate-200 bg-white shadow-sm rounded-2xl flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight text-slate-900">Cuellos de Botella</h3>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Top turnos críticos que requieren tu atención.</p>
            </div>
            <span className="bg-red-100 text-red-600 font-bold px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Prioridad
            </span>
          </div>
          <CardContent className="p-0 flex-1">
            <div className="divide-y divide-slate-100">
              {criticalShifts.map((shift) => (
                <div key={shift.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{shift.committee}</h4>
                      <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="text-[#0084d1]">{shift.day}</span> &bull; {shift.shift}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block bg-red-50 text-red-600 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-red-100">
                        Peligro
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-12">Déficit</span>
                    <div className="flex-1 flex gap-1">
                      {/* Simulación visual de puestos llenos y vacíos */}
                      {Array.from({ length: Math.min(shift.required, 15) }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`h-2 flex-1 rounded-sm ${i < shift.enrolled ? 'bg-slate-800' : 'bg-red-100'}`}
                        />
                      ))}
                      {shift.required > 15 && <span className="text-[10px] text-slate-400 font-bold ml-1">+{shift.required - 15}</span>}
                    </div>
                    <span className="text-xs font-black text-slate-700 w-10 text-right">
                      {shift.enrolled}/{shift.required}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <div className="p-4 border-t border-slate-100 bg-slate-50 text-center rounded-b-2xl">
            <button className="text-sm font-bold text-[#0084d1] hover:text-[#006eb3]">Ver agenda completa</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
