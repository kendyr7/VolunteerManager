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
  const [greeting, setGreeting] = useState<React.ReactNode>("Monitor central de operaciones para el programa de Puertas Abiertas.");

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
    const phone = localStorage.getItem('volunteer_phone');

    const fetchUserNameAndSetGreeting = async () => {
      let userName = 'Coordinador (Sin Teléfono)';

      if (phone) {
        const cleanPhone = phone.replace(/\s+/g, '');
        console.log("Buscando en supabase con el teléfono:", cleanPhone);
        
        const { data: user, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('phone', cleanPhone)
          .maybeSingle();

        if (error) {
          console.error("Error fetching profile:", error);
          userName = 'Error BD';
        } else if (user) {
          userName = user.full_name ? user.full_name.split(' ')[0] : 'Sin Nombre';
        } else {
          userName = 'Coordinador';
        }
      }

      // Generar saludo dinámico
      const hour = new Date().getHours();
      let timeOfDay = 'Buenas noches';
      let emoji = '🌙';
      if (hour >= 5 && hour < 12) {
        timeOfDay = 'Buenos días';
        emoji = '☀️';
      } else if (hour >= 12 && hour < 19) {
        timeOfDay = 'Buenas tardes';
        emoji = '🌤️';
      }

      const messages = [
        `¿Listo para organizar un excelente evento? 🚀`,
        `Aquí tienes el resumen operativo de hoy. 📊`,
        `Vamos a hacer grandes cosas hoy. ✨`,
        `Es un buen momento para revisar los turnos. 🕒`,
        `El equipo cuenta contigo. 💪`
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];

      setGreeting(
        <div className="flex flex-row sm:flex-col items-baseline sm:items-start gap-2 sm:gap-1 flex-wrap sm:flex-nowrap">
          <span className="text-text">{timeOfDay}, <span className="font-bold">{userName}</span> {emoji}</span>
          <span className="text-base text-text-dim font-normal">{randomMsg}</span>
        </div>
      );
    };

    if (role === 'Editor' || role === 'Lector') {
      router.replace('/volunteers');
    } else {
      setIsAuthorized(true);
      fetchUserNameAndSetGreeting();
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

  const heatmapMatrix = useMemo(() => {
    return EVENT_DAYS.map(day => {
      const shiftsData = ['T1', 'T2', 'T3', 'T4'].map(shiftId => {
        let totalReq = 0;
        let totalAssigned = 0;
        Object.keys(committeeRequirements).forEach(commId => {
          const reqs = committeeRequirements[commId];
          if (reqs && reqs[shiftId] > 0) {
            totalReq += reqs[shiftId];
            const assigned = volunteers.filter(v => {
              if (v.committee_id !== commId) return false;
              const vShifts = globalShifts[v.id];
              return vShifts && vShifts[day.key] && vShifts[day.key].includes(shiftId);
            }).length;
            totalAssigned += assigned;
          }
        });
        return { shift: shiftId, required: totalReq, assigned: totalAssigned, coverage: totalReq === 0 ? 1 : totalAssigned / totalReq };
      });
      return { day: day.key, shortLabel: day.label, dayLabel: day.dateNum, shifts: shiftsData };
    });
  }, [committeeRequirements, volunteers, globalShifts]);

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
      className="w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-12 pb-20"
    >
      {/* Header Administrativo - High-End Redesign */}
      <motion.div variants={itemVariants} className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 md:gap-8 pb-4 md:pb-8 border-b border-border relative overflow-hidden">
        <div className="space-y-2 relative z-10 text-text">
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-2xl tracking-tight leading-relaxed"
          >
            {greeting}
          </motion.div>
        </div>

        <div className="flex flex-row items-center gap-2 sm:gap-4 shrink-0 relative z-10 w-full lg:w-auto">
          <Link href="/settings" className="flex-1 sm:flex-none">
            <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-sm font-bold border-border bg-dark2 hover:bg-dark3 text-text shadow-sm transition-all active:scale-[0.96] px-2 sm:px-6">
              <span className="sm:hidden">Ajustes</span>
              <span className="hidden sm:inline">Ajustes Globales</span>
            </Button>
          </Link>
          <Link href="/shifts" className="flex-1 sm:flex-none">
            <Button size="lg" className="w-full sm:w-auto bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold transition-all active:scale-[0.96] group px-2 sm:px-6">
              <span className="sm:hidden">Turnos</span>
              <span className="hidden sm:inline">Gestionar Turnos</span>
              <span className="material-symbols-outlined text-[18px] ml-1 sm:ml-2 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">north_east</span>
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Primary KPIs - Interactive Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className="card-premium h-full border-none">
            <CardContent className="p-4 sm:p-7">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className="p-3 bg-blue-500/10 text-blue-500 rounded-sm group-hover:bg-[#4d7cfe] group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-[20px]">track_changes</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Progreso</span>
                  <Badge variant="secondary" className="bg-dark3 text-text font-bold border-none text-[10px] px-2 h-5">
                    +{globalStats.recruitmentPercentage}%
                  </Badge>
                </div>
              </div>
              <div className="space-y-1 pr-4 sm:pr-0">
                <h3 className="text-text font-bold tracking-tighter flex items-baseline gap-2">
                  {globalStats.totalRecruited} <span className="text-sm font-bold text-muted uppercase tracking-widest">/ {globalStats.targetVolunteers}</span>
                </h3>
                <p className="text-xs font-bold text-text-dim uppercase tracking-wider">Voluntarios Reclutados</p>
              </div>
              <div className="w-full h-1.5 bg-dark3 mt-3 sm:mt-6 rounded-full overflow-hidden">
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
          <Card className="card-premium h-full border-none">
            <CardContent className="p-4 sm:p-7">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className="p-3 bg-accent/10 rounded-sm group-hover:bg-accent group-hover:text-white transition-colors duration-300 text-accent">
                  <span className="material-symbols-outlined text-[20px]">monitoring</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Estado</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Óptimo</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-text font-bold tracking-tighter">
                  {globalStats.globalCoveragePercentage}%
                </h3>
                <p className="text-xs font-bold text-text-dim uppercase tracking-wider">Cobertura de Turnos</p>
              </div>
              <p className="text-[10px] text-text-dim mt-3 sm:mt-6 font-bold uppercase tracking-[0.1em]">Análisis Global del Evento</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className={`card-premium h-full border-none transition-all duration-300 hover:border-red/50 ${globalStats.criticalAlerts > 0 ? 'bg-red-faint border-red/30' : ''}`}>
            <CardContent className="p-4 sm:p-7">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className={`p-3 rounded-sm transition-colors duration-300 ${globalStats.criticalAlerts > 0 ? 'bg-red/20 text-red group-hover:bg-red group-hover:text-white' : 'bg-dark3 text-text-dim'}`}>
                  <span className="material-symbols-outlined text-[20px]">security</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Prioridad</span>
                  <Badge variant="outline" className={`font-bold text-[10px] border-none px-2 h-5 ${globalStats.criticalAlerts > 0 ? 'bg-red/20 text-red' : 'bg-dark3 text-text-dim'}`}>
                    {globalStats.criticalAlerts > 0 ? 'ACCIÓN REQ.' : 'NORMAL'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className={`font-bold tracking-tighter ${globalStats.criticalAlerts > 0 ? 'text-red' : 'text-text'}`}>
                  {globalStats.criticalAlerts}
                </h3>
                <p className="text-xs font-bold text-text-dim uppercase tracking-wider">Alertas Críticas</p>
              </div>
              <p className={`text-[10px] mt-3 sm:mt-6 font-bold uppercase tracking-[0.1em] ${globalStats.criticalAlerts > 0 ? 'text-red animate-pulse' : 'text-text-dim'}`}>
                {globalStats.criticalAlerts > 0 ? 'Turnos bajo el mínimo' : 'Estabilidad operativa'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="group">
          <Card className="card-premium bg-dark3 border-none shadow-2xl shadow-black/20 rounded-sm overflow-hidden h-full relative group">
            <CardContent className="p-4 sm:p-7 relative z-10">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className="p-3 bg-dark2 rounded-sm group-hover:bg-blue-500 transition-colors duration-300 text-text">
                  <span className="material-symbols-outlined text-[20px]">person_check</span>
                </div>
                <span className="material-symbols-outlined text-[20px] text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity">trending_up</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold tracking-tighter text-text">
                  {globalStats.averageReliability}%
                </h3>
                <p className="text-xs font-bold text-text-dim uppercase tracking-wider">Compromiso Real</p>
              </div>
              <div className="mt-3 sm:mt-6 flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-5 h-5 rounded-full border border-dark bg-border" />
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

      {/* Middle Row: Chart & Committee Status */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8 min-w-0">
        {/* Left: Daily Volunteer Distribution Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3 min-w-0">
          <Card className="card-premium h-full flex flex-col min-w-0 border-none">
            <CardContent className="p-4 pt-3 sm:p-7 flex-1 flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-xl font-bold text-text tracking-tighter leading-none tabular-nums">
                    {totalVolsWithShifts.toLocaleString()}
                  </p>
                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider leading-tight max-w-none mt-0.5">Voluntarios con turnos</p>
                </div>
                <div className="flex items-center px-2 py-1 rounded-sm border border-border bg-dark3 text-[10px] font-bold text-text-dim shrink-0 mt-0.5">
                  10 – 26 Sep
                </div>
              </div>

              <div className="relative flex-1 flex flex-col overflow-x-auto w-full pb-2">
                <div className="min-w-[400px] flex flex-col h-full"><div className="flex-1 flex items-end gap-1.5 min-h-[220px] mt-1 pt-8">
                  {(() => {
                    const maxCount = Math.max(...Object.values(volsPerDay), 1);
                    return EVENT_DAYS.map((day, idx) => {
                      const count = volsPerDay[day.key] || 0;
                      const heightPct = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 2) : 2;
                      const isHovered = hoveredDay === day.key;
                      return (
                        <div
                          key={day.key}
                          className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                          onMouseEnter={() => setHoveredDay(day.key)}
                          onMouseLeave={() => setHoveredDay(null)}
                        >
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPct}%` }}
                            transition={{ duration: 0.7, delay: idx * 0.025, ease: "circOut" }}
                            className={`w-full rounded-[3px] transition-colors duration-150 relative ${isHovered
                              ? 'bg-[#4d7cfe] shadow-[0_0_12px_rgba(77,124,254,0.4)]'
                              : 'bg-[#4d7cfe]/20 hover:bg-[#4d7cfe]/50'
                              }`}
                          >
                            {isHovered && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-dark2 border border-border text-text text-[10px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap shadow-sm pointer-events-none z-50">
                                {count}
                              </div>
                            )}
                          </motion.div>
                        </div>
                      );
                    });
                  })()}
                </div>

                  <div className="flex gap-1.5 mt-2">
                    {EVENT_DAYS.map(day => (
                      <div key={day.key} className="flex-1 text-center">
                        <span className={`text-[10px] font-bold transition-colors ${hoveredDay === day.key ? 'text-[#4d7cfe]' : 'text-text-dim'
                          }`}>{day.dateNum}</span>
                      </div>
                    ))}
                  </div>

                </div><div className="mt-1.5">
                  <span className="text-[11px] font-bold text-text-dim uppercase tracking-widest">Septiembre 2026</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right: Committee Status Ranking */}
        <motion.div variants={itemVariants} className="lg:col-span-1 min-w-0">
          <Card className="card-premium h-full flex flex-col border-none">
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="divide-y divide-border flex-1 flex flex-col justify-evenly h-full">
                {committeeStatus.map((committee, idx) => (
                  <motion.div
                    key={committee.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + idx * 0.05 }}
                    className="px-6 py-1.5 flex items-center justify-between hover:bg-dark3 transition-colors group cursor-default"
                  >
                    <div className="flex-1 w-full min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider group-hover:text-text transition-colors truncate" title={committee.name}>{committee.name}</p>
                        {committee.status === 'high_risk' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red animate-ping" />
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-1.5 bg-dark3 rounded-full overflow-hidden border border-border">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${committee.coverage}%` }}
                            transition={{ duration: 1, delay: 0.5 + idx * 0.05 }}
                            className={`h-full rounded-full ${committee.status === 'success' ? 'bg-accent' :
                              committee.status === 'warning' ? 'bg-amber-400' : 'bg-red'
                              }`}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-text-dim w-10 tabular-nums">{committee.coverage}%</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom Row: Mapa de Calor Operativo */}
      <motion.div variants={itemVariants} className="w-full min-w-0">
        <Card className="card-premium border-none shadow-inner rounded-sm overflow-hidden flex flex-col min-w-0">
          <div className="px-5 sm:px-8 py-5 sm:py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-text tracking-tight leading-none">Mapa de Calor Operativo</h3>
              <p className="text-xs font-bold text-text-dim uppercase tracking-widest">Cobertura por Día y Turno</p>
            </div>
            <div className="w-10 h-10 bg-gold/10 rounded-sm flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[20px] text-gold">grid_view</span>
            </div>
          </div>
          <CardContent className="p-0 flex-1 min-w-0">
            <div className="overflow-x-auto w-full">
              <div className="min-w-[600px] flex">
                <div className="w-24 shrink-0 bg-dark3 border-r border-border flex flex-col pt-8">
                  {['T1', 'T2', 'T3', 'T4'].map((shiftId) => (
                    <div key={shiftId} className="flex-1 min-h-[60px] flex items-center justify-center border-b border-border last:border-0">
                      <span className="text-[10px] font-bold text-text-dim">{shiftId}</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1 grid grid-cols-8">
                  {heatmapMatrix.map((dayData, idx) => (
                    <div key={dayData.day} className="flex flex-col border-r border-border last:border-0 min-w-0">
                      <div className="h-8 flex flex-col items-center justify-center bg-dark3 border-b border-border">
                        <span className="text-[10px] font-bold text-text">{dayData.shortLabel}</span>
                      </div>
                      {dayData.shifts.map((shift) => (
                        <div
                          key={shift.shift}
                          className="flex-1 min-h-[60px] flex flex-col items-center justify-center border-b border-dark2 border-r border-dark2 last:border-b-0 p-1 transition-all duration-300 relative group"
                          style={{
                            backgroundColor: shift.required === 0 ? 'var(--dark3)' :
                              shift.coverage >= 1 ? 'rgba(20, 184, 166, 0.15)' :
                                shift.coverage >= 0.7 ? 'rgba(251, 191, 36, 0.15)' :
                                  'rgba(248, 113, 113, 0.15)'
                          }}
                        >
                          {shift.required > 0 ? (
                            <>
                              <span className="text-[11px] font-bold text-text">{Math.round(shift.coverage * 100)}%</span>
                              <span className="text-[8px] font-bold text-text-dim mt-0.5">{shift.assigned}/{shift.required}</span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted">-</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 sm:gap-6 mt-8 flex-wrap shrink-0 pb-8">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-red" />
                <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Crítico</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-amber-400" />
                <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Riesgo</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-accent" />
                <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Óptimo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

    </motion.div>
  );
}