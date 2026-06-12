'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getActiveEventDays, formatDateShort, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 24
    }
  }
};

export default function CoordinatorDashboard() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [globalShifts, setGlobalShifts] = useState<Record<string, Record<string, string[]>>>({});
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [committeesList, setCommitteesList] = useState<{ id: string, name: string }[]>([]);

  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  const [committeeRequirements, setCommitteeRequirements] = useState<Record<string, Record<string, number>>>(() => {
    const defaults = {
      'Historia': { T1: 3, T2: 2, T3: 3, T4: 2 },
      'Seguridad': { T1: 4, T2: 4, T3: 4, T4: 4 },
      'Guía': { T1: 5, T2: 5, T3: 5, T4: 5 },
      'Traducción': { T1: 2, T2: 1, T3: 2, T4: 1 },
      'Transporte': { T1: 3, T2: 2, T3: 3, T4: 2 },
      'Primeros Auxilios': { T1: 2, T2: 2, T3: 2, T4: 2 }
    };
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        try {
          return { ...defaults, ...JSON.parse(stored) };
        } catch (e) {
          console.error("Error loading committee requirements in dashboard", e);
        }
      }
    }
    return defaults;
  });

  const supabase = createClient();

  const loadData = async () => {
    const { data: volsData } = await supabase
      .from('volunteers')
      .select('*, committees(name)');

    const { data: commsData } = await supabase
      .from('committees')
      .select('id, name');

    if (commsData) {
      setCommitteesList(commsData);
    }

    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('*');

    const gShifts: Record<string, Record<string, string[]>> = {};
    if (shiftsData) {
      shiftsData.forEach(s => {
        if (s.volunteer_id) {
          if (!gShifts[s.volunteer_id]) {
            gShifts[s.volunteer_id] = buildEmptyShifts();
          }
          if (!gShifts[s.volunteer_id][s.day_key]) {
            gShifts[s.volunteer_id][s.day_key] = [];
          }
          if (!gShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
            gShifts[s.volunteer_id][s.day_key].push(s.shift_key);
          }
        }
      });
    }

    setGlobalShifts(gShifts);

    if (volsData) {
      const mapped = volsData.map((v: any) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        committee: v.committees?.name || 'Sin comité',
        reliability: 100
      }));
      setVolunteers(mapped);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('mock_role') || 'Admin';
    if (role === 'Editor' || role === 'Lector') {
      router.replace('/volunteers');
    } else {
      setIsAuthorized(true);
      loadData().then(() => setLoading(false));
    }
  }, [router]);

  const globalStats = useMemo(() => {
    const totalRecruited = volunteers.length;
    const targetVolunteers = 1500;
    const recruitmentPercentage = targetVolunteers > 0 ? Math.round((totalRecruited / targetVolunteers) * 100) : 0;

    let totalRequired = 0;
    let totalAssignedInRequired = 0;
    let criticalAlerts = 0;

    const committees = committeesList.map(c => c.name);

    EVENT_DAYS.forEach(day => {
      committees.forEach(comm => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          totalRequired += req;

          const count = volunteers.filter(vol => {
            if (vol.committee !== comm) return false;
            const shifts = globalShifts[vol.id];
            return shifts && shifts[day.key] && shifts[day.key].includes(shiftId);
          }).length;

          totalAssignedInRequired += Math.min(count, req);

          if (count < req) {
            criticalAlerts++;
          }
        });
      });
    });

    const globalCoveragePercentage = totalRequired > 0 ? Math.round((totalAssignedInRequired / totalRequired) * 100) : 100;
    const averageReliability = 98;

    return {
      totalRecruited,
      targetVolunteers,
      recruitmentPercentage,
      globalCoveragePercentage,
      criticalAlerts,
      averageReliability
    };
  }, [volunteers, committeesList, globalShifts, committeeRequirements]);

  const committeeStatus = useMemo(() => {
    return committeesList.map((c, index) => {
      let totalReq = 0;
      let totalAssigned = 0;
      let totalMissing = 0;

      EVENT_DAYS.forEach(day => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[c.name]?.[shiftId] ?? 0;
          totalReq += req;

          const count = volunteers.filter(vol => {
            if (vol.committee !== c.name) return false;
            const shifts = globalShifts[vol.id];
            return shifts && shifts[day.key] && shifts[day.key].includes(shiftId);
          }).length;

          totalAssigned += Math.min(count, req);
          if (count < req) {
            totalMissing += (req - count);
          }
        });
      });

      const coverage = totalReq > 0 ? Math.round((totalAssigned / totalReq) * 100) : 100;
      let status = "success";
      if (coverage < 60) status = "high_risk";
      else if (coverage < 85) status = "warning";

      return {
        id: index + 1,
        name: c.name,
        coverage,
        missing: totalMissing,
        status
      };
    }).sort((a, b) => a.coverage - b.coverage);
  }, [volunteers, committeesList, globalShifts, committeeRequirements]);

  const criticalShifts = useMemo(() => {
    const list: any[] = [];
    const committees = committeesList.map(c => c.name);

    EVENT_DAYS.forEach(day => {
      committees.forEach(comm => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          if (req === 0) return;

          const count = volunteers.filter(vol => {
            if (vol.committee !== comm) return false;
            const shifts = globalShifts[vol.id];
            return shifts && shifts[day.key] && shifts[day.key].includes(shiftId);
          }).length;

          if (count < req) {
            const shiftInfo = SHIFT_TIMES.find(s => `T${s.id}` === shiftId);
            const dayLabel = format(day.date, "EEEE d 'de' MMMM", { locale: es });
            list.push({
              day: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
              shift: `${shiftId} (${shiftInfo?.time || ''})`,
              committee: comm,
              enrolled: count,
              required: req,
              missing: req - count
            });
          }
        });
      });
    });

    return list
      .sort((a, b) => b.missing - a.missing)
      .slice(0, 5)
      .map((item, index) => ({ id: index + 1, ...item }));
  }, [volunteers, committeesList, globalShifts, committeeRequirements]);

  // Volunteers per event day (unique volunteers with ≥1 shift that day)
  const volsPerDay = useMemo(() => {
    const counts: Record<string, number> = {};
    EVENT_DAYS.forEach(day => {
      const uniqueVols = new Set<string>();
      volunteers.forEach(vol => {
        const shifts = globalShifts[vol.id];
        if (shifts && shifts[day.key] && shifts[day.key].length > 0) {
          uniqueVols.add(vol.id);
        }
      });
      counts[day.key] = uniqueVols.size;
    });
    return counts;
  }, [volunteers, globalShifts]);

  const totalVolsWithShifts = useMemo(() => {
    const unique = new Set<string>();
    volunteers.forEach(vol => {
      const shifts = globalShifts[vol.id];
      if (shifts && Object.values(shifts).some(arr => arr.length > 0)) {
        unique.add(vol.id);
      }
    });
    return unique.size;
  }, [volunteers, globalShifts]);

  if (!isAuthorized) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="rounded-full h-8 w-8 border-b-2 border-[#0084d1]"
        />
      </div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-12 max-w-6xl mx-auto pb-20"
    >
      {/* Header Administrativo - High-End Redesign */}
      <motion.div variants={itemVariants} className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 pb-8 border-b border-slate-200/60 relative overflow-hidden">
        <div className="space-y-2 relative z-10">
          <p className="text-lg font-medium text-slate-400 max-w-xl leading-relaxed">
            Monitor central de operaciones para el programa de Puertas Abiertas.
          </p>
        </div>
        
        <div className="flex items-center gap-4 shrink-0 relative z-10">
          <Link href="/settings">
            <Button variant="outline" size="lg" className="rounded-sm font-bold border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all active:scale-[0.96]">
              Ajustes Globales
            </Button>
          </Link>
          <Link href="/shifts">
            <Button size="lg" className="bg-[#0084d1] hover:bg-[#006eb3] text-white rounded-sm font-bold shadow-xl shadow-blue-500/20 transition-all active:scale-[0.96] group px-6">
              Gestionar Turnos
              <span className="material-symbols-outlined text-[18px] ml-2 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">north_east</span>
            </Button>
          </Link>
        </div>
        
        {/* Subtle Background Accent */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl pointer-events-none" />
      </motion.div>

      {/* Primary KPIs - Interactive Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 h-full">
            <CardContent className="p-7">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-blue-50 rounded-sm group-hover:bg-[#0084d1] group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-[20px]">track_changes</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Progreso</span>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold border-none text-[10px] px-2 h-5">
                    +{globalStats.recruitmentPercentage}%
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-slate-900 font-bold tracking-tighter flex items-baseline gap-2">
                  {globalStats.totalRecruited} <span className="text-sm font-bold text-slate-300 uppercase tracking-widest">/ {globalStats.targetVolunteers}</span>
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Voluntarios Reclutados</p>
              </div>
              <div className="w-full h-1.5 bg-slate-50 mt-6 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${globalStats.recruitmentPercentage}%` }}
                  transition={{ duration: 1, ease: "circOut" }}
                  className="h-full bg-[#0084d1] rounded-full" 
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-teal-500/10 h-full">
            <CardContent className="p-7">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-teal-50 rounded-sm group-hover:bg-accent group-hover:text-white transition-colors duration-300 text-accent">
                  <span className="material-symbols-outlined text-[20px]">monitoring</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Estado</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Óptimo</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-slate-900 font-bold tracking-tighter">
                  {globalStats.globalCoveragePercentage}%
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cobertura de Turnos</p>
              </div>
              <p className="text-[10px] text-slate-400 mt-6 font-bold uppercase tracking-[0.1em]">Análisis Global del Evento</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className={`border-none ${globalStats.criticalAlerts > 0 ? 'bg-red-50/50' : 'bg-white'} shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/10 h-full border border-transparent hover:border-red-100`}>
            <CardContent className="p-7">
              <div className="flex items-start justify-between mb-6">
                <div className={`p-3 rounded-sm transition-colors duration-300 ${globalStats.criticalAlerts > 0 ? 'bg-red-100 text-red group-hover:bg-red group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                  <span className="material-symbols-outlined text-[20px]">security</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Prioridad</span>
                  <Badge variant="outline" className={`font-bold text-[10px] border-none px-2 h-5 ${globalStats.criticalAlerts > 0 ? 'bg-red-100 text-red' : 'bg-slate-100 text-slate-500'}`}>
                    {globalStats.criticalAlerts > 0 ? 'ACCIÓN REQ.' : 'NORMAL'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className={`font-bold tracking-tighter ${globalStats.criticalAlerts > 0 ? 'text-red' : 'text-slate-900'}`}>
                  {globalStats.criticalAlerts}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alertas Críticas</p>
              </div>
              <p className={`text-[10px] mt-6 font-bold uppercase tracking-[0.1em] ${globalStats.criticalAlerts > 0 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                {globalStats.criticalAlerts > 0 ? 'Turnos bajo el mínimo' : 'Estabilidad operativa'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className="border-none bg-slate-900 text-white shadow-2xl shadow-slate-900/20 rounded-sm overflow-hidden h-full relative group">
            <CardContent className="p-7 relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-white/10 rounded-sm group-hover:bg-blue-500 transition-colors duration-300 text-white">
                  <span className="material-symbols-outlined text-[20px]">person_check</span>
                </div>
                <span className="material-symbols-outlined text-[20px] text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity">trending_up</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold tracking-tighter text-white">
                  {globalStats.averageReliability}%
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Compromiso Real</p>
              </div>
              <div className="mt-6 flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-5 h-5 rounded-full border border-slate-900 bg-slate-700" />
                  ))}
                </div>
                <p className="text-[10px] text-teal-400 font-bold uppercase tracking-widest">Altamente Confiable</p>
              </div>
            </CardContent>
            {/* Visual Flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#0084d1]/20 rounded-full blur-[60px] group-hover:bg-[#0084d1]/40 transition-colors" />
          </Card>
        </motion.div>
      </div>

      {/* Daily Volunteer Distribution Chart */}
      <motion.div variants={itemVariants}>
        <Card className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden">
          <CardContent className="p-7">
            {/* Chart Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <p className="text-4xl font-bold text-slate-900 tracking-tighter leading-none tabular-nums">
                  {totalVolsWithShifts.toLocaleString()}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Voluntarios con turnos asignados</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                10 – 26 Sep 2026
              </div>
            </div>

            {/* Bars */}
            <div className="relative">
              {/* Tooltip container */}
              <div className="flex items-end gap-1.5 h-28">
                {(() => {
                  const maxCount = Math.max(...Object.values(volsPerDay), 1);
                  return EVENT_DAYS.map((day, idx) => {
                    const count = volsPerDay[day.key] || 0;
                    const heightPct = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 2) : 2;
                    const isHovered = hoveredDay === day.key;
                    return (
                      <div
                        key={day.key}
                        className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                        onMouseEnter={() => setHoveredDay(day.key)}
                        onMouseLeave={() => setHoveredDay(null)}
                      >
                        {/* Tooltip */}
                        {isHovered && (
                          <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-sm whitespace-nowrap z-20 shadow-lg pointer-events-none">
                            {count} voluntarios
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-slate-900" />
                          </div>
                        )}
                        {/* Bar */}
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{ duration: 0.7, delay: idx * 0.025, ease: "circOut" }}
                          className={`w-full rounded-[3px] transition-colors duration-150 ${
                            isHovered
                              ? 'bg-[#0084d1]'
                              : 'bg-slate-200 hover:bg-[#0084d1]/50'
                          }`}
                        />
                      </div>
                    );
                  });
                })()}
              </div>

              {/* X-axis: day numbers */}
              <div className="flex gap-1.5 mt-2">
                {EVENT_DAYS.map(day => (
                  <div key={day.key} className="flex-1 text-center">
                    <span className={`text-[10px] font-bold transition-colors ${
                      hoveredDay === day.key ? 'text-[#0084d1]' : 'text-slate-400'
                    }`}>{day.dateNum}</span>
                  </div>
                ))}
              </div>

              {/* Month label */}
              <div className="mt-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Septiembre 2026</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Detailed Monitoring Section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Committee Status Ranking */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-full flex flex-col">
            <div className="px-8 py-7 border-b border-slate-50 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-slate-800 tracking-tight leading-none">Estado por Comité</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ranking de Cobertura</p>
              </div>
              <Link href="/volunteers" className="group flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#0084d1] hover:text-[#006eb3] transition-colors">
                Ver Detalles <span className="material-symbols-outlined text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </Link>
            </div>
            <CardContent className="p-0 flex-1">
              <div className="divide-y divide-slate-50">
                {committeeStatus.map((committee, idx) => (
                  <motion.div 
                    key={committee.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + idx * 0.05 }}
                    className="px-8 py-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors group cursor-default"
                  >
                    <div className="flex-1 max-w-md">
                      <div className="flex items-center gap-3 mb-2.5">
                        <span className="text-[10px] font-bold text-slate-300 w-4">0{idx + 1}</span>
                        <h4 className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{committee.name}</h4>
                        {committee.status === 'high_risk' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red animate-ping" />
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${committee.coverage}%` }}
                            transition={{ duration: 1, delay: 0.5 + idx * 0.05 }}
                            className={`h-full rounded-full ${
                              committee.status === 'success' ? 'bg-accent' :
                              committee.status === 'warning' ? 'bg-amber-400' : 'bg-red'
                            }`}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 w-10 tabular-nums">{committee.coverage}%</span>
                      </div>
                    </div>
                    <div className="pl-8 text-right shrink-0">
                      <div className="flex flex-col items-end">
                        <p className={`text-xl font-bold leading-none tracking-tighter ${committee.missing > 15 ? 'text-red-500' : 'text-slate-800'}`}>
                          {committee.missing}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Faltan</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right: Critical Bottlenecks */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="border-none bg-slate-50/50 shadow-inner rounded-sm overflow-hidden h-full flex flex-col border border-slate-200/60">
            <div className="px-8 py-7 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-slate-800 tracking-tight leading-none">Cuellos de Botella</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Top Turnos en Riesgo</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-sm flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[20px] text-red">warning</span>
              </div>
            </div>
            <CardContent className="px-6 pb-8 space-y-4 flex-1">
              <AnimatePresence>
                {criticalShifts.map((shift, idx) => (
                  <motion.div 
                    key={shift.id} 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + idx * 0.05 }}
                    className="bg-white p-5 rounded-sm shadow-sm border border-slate-100 group hover:shadow-md transition-all cursor-default"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide group-hover:text-[#0084d1] transition-colors">{shift.committee}</h4>
                        <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                          <span className="text-slate-500">{shift.day}</span> &bull; {shift.shift}
                        </p>
                      </div>
                      <Badge className="bg-red-50 text-red text-[9px] font-bold px-2 py-0.5 border-none shadow-none uppercase tracking-widest">
                        -{shift.missing}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex-1 flex gap-0.5">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                              i < (shift.enrolled / shift.required) * 12 
                                ? 'bg-slate-900' 
                                : 'bg-red-100 group-hover:bg-red-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-slate-700 w-10 text-right tabular-nums">
                        {shift.enrolled}/{shift.required}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {criticalShifts.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px] text-teal-500">auto_awesome</span>
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Todo bajo control</p>
                </div>
              )}
            </CardContent>
            <div className="p-4 bg-slate-100/50 text-center border-t border-slate-200/50">
              <Link href="/shifts">
                <Button variant="ghost" className="w-full text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800 hover:bg-transparent transition-all">
                  Ver Agenda Completa <span className="material-symbols-outlined text-[18px] ml-2">chevron_right</span>
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

