'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase-helpers";
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
  const [chartMetric, setChartMetric] = useState<'volunteers' | 'shifts'>('volunteers');
  const [activeKpiInfo, setActiveKpiInfo] = useState<{ title: string; explanation: string; formula: string } | null>(null);
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

  const [dbCheckedInMap, setDbCheckedInMap] = useState<Record<string, boolean>>({});

  const supabase = createClient();

  const loadData = async () => {
    const volsData = await fetchAllRows(supabase, 'volunteers', '*, committees(name)');

    const { data: commsData } = await supabase
      .from('committees')
      .select('id, name');

    if (commsData) {
      setCommitteesList(commsData);
    }

    const shiftsData = await fetchAllRows(supabase, 'shifts', '*');

    const gShifts: Record<string, Record<string, string[]>> = {};
    const cMap: Record<string, boolean> = {};

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
          if (s.checked_in) {
            cMap[`${s.volunteer_id}-${s.day_key}-${s.shift_key}`] = true;
          }
        }
      });
    }

    // Fetch committee_shift_requirements from Supabase and merge with defaults
    const reqsData = await fetchAllRows(supabase, 'committee_shift_requirements', '*, committees(name)');

    if (reqsData && reqsData.length > 0 && commsData) {
      const updatedReqs: Record<string, Record<string, number>> = {};
      reqsData.forEach((r: any) => {
        const commName = r.committees?.name || commsData.find((c: any) => c.id === r.committee_id)?.name;
        if (commName) {
          if (!updatedReqs[commName]) updatedReqs[commName] = {};
          updatedReqs[commName][r.shift_key] = r.required;
        }
      });
      // Merge into localStorage for client-side consistency
      const stored = localStorage.getItem("committee_requirements");
      let allReqs: any = stored ? JSON.parse(stored) : {};
      Object.assign(allReqs, updatedReqs);
      localStorage.setItem("committee_requirements", JSON.stringify(allReqs));
      setCommitteeRequirements(prev => ({ ...prev, ...updatedReqs }));
    }

    setGlobalShifts(gShifts);
    setDbCheckedInMap(cMap);

    if (volsData) {
      const mapped = volsData.map((v: any) => ({
        id: v.id,
        name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        committee: v.committees?.name || 'Sin comité',
        reliability: v.reliability_score ?? 100
      }));
      setVolunteers(mapped);
    }
  };

  const [confirmedReminders, setConfirmedReminders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadConfirmations = () => {
      const stored = localStorage.getItem("confirmed_reminders");
      if (stored) {
        try {
          setConfirmedReminders(JSON.parse(stored));
        } catch (e) {
          console.error("Error loading confirmations", e);
        }
      }
    };
    loadConfirmations();
    window.addEventListener("storage", loadConfirmations);
    window.addEventListener("focus", loadConfirmations);
    return () => {
      window.removeEventListener("storage", loadConfirmations);
      window.removeEventListener("focus", loadConfirmations);
    };
  }, []);

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
        <div className="flex flex-col gap-1">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            {timeOfDay}, {userName} {emoji}
          </h1>
          <p className="text-sm md:text-base text-text-dim font-inter font-bold">{randomMsg}</p>
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

    const totalRecruited = volunteers.length;
    // Dynamic Meta: Sum of requirements across all committees and shift slots
    const targetVolunteers = totalRequired;
    const recruitmentPercentage = targetVolunteers > 0 ? Math.round((totalRecruited / targetVolunteers) * 100) : 0;
    const globalCoveragePercentage = totalRequired > 0 ? Math.round((totalAssignedInRequired / totalRequired) * 100) : 100;
    
    let totalGlobalAssigned = 0;
    let totalGlobalCheckedIn = 0;
    Object.entries(globalShifts).forEach(([volId, days]) => {
      Object.entries(days).forEach(([day, shifts]) => {
        shifts.forEach(shift => {
          totalGlobalAssigned++;
          if (dbCheckedInMap[`${volId}-${day}-${shift}`]) {
            totalGlobalCheckedIn++;
          }
        });
      });
    });

    const attendanceRate = totalGlobalAssigned > 0
      ? Math.round((totalGlobalCheckedIn / totalGlobalAssigned) * 100) : 0;

    return {
      totalRecruited,
      targetVolunteers,
      recruitmentPercentage,
      globalCoveragePercentage,
      criticalAlerts,
      attendanceRate,
      checkedInCount: totalGlobalCheckedIn,
      totalAssigned: totalGlobalAssigned,
    };
  }, [volunteers, committeesList, globalShifts, committeeRequirements, dbCheckedInMap]);

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
        Object.keys(committeeRequirements).forEach(commName => {
          const reqs = committeeRequirements[commName];
          if (reqs && reqs[shiftId] > 0) {
            totalReq += reqs[shiftId];
            const assigned = volunteers.filter(v => {
              if (v.committee !== commName) return false;
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

  // Total shifts assigned per event day (sum of T1+T2+T3+T4 slots)
  const shiftsPerDay = useMemo(() => {
    const counts: Record<string, number> = {};
    EVENT_DAYS.forEach(day => {
      let total = 0;
      volunteers.forEach(vol => {
        const shifts = globalShifts[vol.id];
        if (shifts && shifts[day.key]) {
          total += shifts[day.key].length;
        }
      });
      counts[day.key] = total;
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
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0 border-b border-white/5">
        <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 relative z-10 text-text">
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              {greeting}
            </motion.div>
          </div>

          <div className="flex flex-row items-center gap-2 sm:gap-4 shrink-0 relative z-10 w-full lg:w-auto">
            <Link href="/settings" className="flex-none">
              <Button variant="outline" className="w-auto bg-dark2 hover:bg-dark3 text-text border-white/10 rounded-full shadow-lg h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 justify-center">
                <span className="material-symbols-outlined text-[16px]">settings</span>
                <span className="sm:hidden">Ajustes</span>
                <span className="hidden sm:inline">Ajustes Globales</span>
              </Button>
            </Link>
            <Link href="/shifts" className="flex-none">
              <Button className="w-auto bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 justify-center group">
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                <span className="sm:hidden">Turnos</span>
                <span className="hidden sm:inline">Gestionar Turnos</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-12 pb-20 pt-4"
      >

      {/* Primary KPIs - Edge to Edge Fine Line Grid */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/5 mb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px]">
          {/* Card 1 */}
          <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
            <div className="flex items-start justify-between mb-3 sm:mb-6">
              <div className="p-3 bg-blue-500/10 text-blue-500 rounded-sm group-hover:bg-[#4d7cfe] group-hover:text-white transition-colors duration-300">
                <span className="material-symbols-outlined text-[20px]">track_changes</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveKpiInfo({
                    title: "Voluntarios Reclutados",
                    explanation: "Compara el total de voluntarios registrados en el sistema contra la meta total de requerimientos sumando todos los turnos del evento.",
                    formula: "Voluntarios Registrados / Suma de Requerimientos Totales"
                  })}
                  className="text-text-dim hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                  title="¿Cómo se calcula este KPI?"
                >
                  <span className="material-symbols-outlined text-[18px]">help_outline</span>
                </button>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Progreso</span>
                  <Badge variant="secondary" className="bg-dark3 text-text font-bold border-none text-[10px] px-2 h-5">
                    +{globalStats.recruitmentPercentage}%
                  </Badge>
                </div>
              </div>
            </div>
            <div className="space-y-1 pr-4 sm:pr-0">
              <h3 className="text-text font-bold tracking-tighter flex items-baseline gap-2">
                {globalStats.totalRecruited} <span className="text-sm font-bold text-muted uppercase tracking-widest">/ {globalStats.targetVolunteers}</span>
              </h3>
              <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Voluntarios Reclutados</p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
            <div className="flex items-start justify-between mb-3 sm:mb-6">
              <div className="p-3 bg-accent/10 rounded-sm group-hover:bg-accent group-hover:text-white transition-colors duration-300 text-accent">
                <span className="material-symbols-outlined text-[20px]">monitoring</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveKpiInfo({
                    title: "Turnos Registrados",
                    explanation: "Muestra el porcentaje de cobertura de requerimientos que ya cuentan con un voluntario asignado en la agenda.",
                    formula: "(Turnos Asignados válidos / Suma de Requerimientos Totales) × 100"
                  })}
                  className="text-text-dim hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                  title="¿Cómo se calcula este KPI?"
                >
                  <span className="material-symbols-outlined text-[18px]">help_outline</span>
                </button>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Estado</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Óptimo</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-text font-bold tracking-tighter">
                {globalStats.globalCoveragePercentage}%
              </h3>
              <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Turnos Registrados</p>
            </div>
            <p className="text-[10px] text-text-dim mt-3 sm:mt-6 font-inter font-bold uppercase tracking-[0.1em]">% de turnos registrados</p>
          </div>

          {/* Card 3 */}
          <div className="bg-dark2 p-4 sm:p-7 group transition-all duration-300 hover:bg-dark3 relative">
            <div className="flex items-start justify-between mb-3 sm:mb-6">
              <div className={`p-3 rounded-sm transition-colors duration-300 ${globalStats.criticalAlerts > 0 ? 'bg-red/20 text-red group-hover:bg-red group-hover:text-white' : 'bg-dark3 text-text-dim group-hover:bg-white/10 group-hover:text-white'}`}>
                <span className="material-symbols-outlined text-[20px]">security</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveKpiInfo({
                    title: "Alertas Críticas",
                    explanation: "Cantidad de turnos (por comité y día) donde los voluntarios asignados son menores al mínimo de requerimientos configurado.",
                    formula: "Conteo de slots donde Voluntarios Asignados < Requerimiento Configurado"
                  })}
                  className="text-text-dim hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                  title="¿Cómo se calcula este KPI?"
                >
                  <span className="material-symbols-outlined text-[18px]">help_outline</span>
                </button>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Prioridad</span>
                  <Badge variant="outline" className={`font-inter font-bold text-[10px] border-none px-2 h-5 ${globalStats.criticalAlerts > 0 ? 'bg-red/20 text-red' : 'bg-dark3 text-text-dim'}`}>
                    {globalStats.criticalAlerts > 0 ? 'ACCIÓN REQ.' : 'NORMAL'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <h3 className={`font-bold tracking-tighter ${globalStats.criticalAlerts > 0 ? 'text-red' : 'text-text'}`}>
                {globalStats.criticalAlerts}
              </h3>
              <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Alertas Críticas</p>
            </div>
            <p className="text-[10px] mt-3 sm:mt-6 font-inter font-bold uppercase tracking-[0.1em] text-text-dim">
              {globalStats.criticalAlerts > 0 ? 'Turnos bajo el mínimo' : 'Estabilidad operativa'}
            </p>
          </div>

          {/* Card 4 — Asistencia General */}
          <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
            <div className="flex items-start justify-between mb-3 sm:mb-6">
              <div className="p-3 bg-dark3 rounded-sm group-hover:bg-emerald-500 transition-colors duration-300 text-text">
                <span className="material-symbols-outlined text-[20px]">person_check</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiInfo({
                  title: "Asistencia General (QR Confirmados)",
                  explanation: "Porcentaje de turnos donde el voluntario escaneó su código QR de asistencia respecto al total de turnos asignados.",
                  formula: "(Turnos con QR Confirmado / Total de Turnos Asignados a Voluntarios) × 100"
                })}
                className="text-text-dim hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                title="¿Cómo se calcula este KPI?"
              >
                <span className="material-symbols-outlined text-[18px]">help_outline</span>
              </button>
            </div>
            <div className="space-y-1">
              <h3 className="font-bold tracking-tighter text-text">
                {globalStats.attendanceRate}%
              </h3>
              <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Asistencia General</p>
            </div>
            <div className="mt-3 sm:mt-6 flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
              <p className="text-[13px] font-inter font-extrabold text-text tabular-nums leading-none shrink-0">
                {globalStats.checkedInCount}
                {globalStats.totalAssigned > 0 && (
                  <span className="text-white/30">/{globalStats.totalAssigned}</span>
                )}
              </p>
              <p className="text-[10px] text-text-dim font-inter font-bold uppercase tracking-widest whitespace-nowrap truncate">
                QR Confirmado{globalStats.checkedInCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bar Chart — edge to edge, no card */}
      <motion.div variants={itemVariants} className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/[0.02] mb-8">
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <p className="text-xl font-bold text-text tracking-tighter leading-none tabular-nums">
              {chartMetric === 'volunteers' ? totalVolsWithShifts.toLocaleString() : globalStats.totalAssigned.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider leading-tight mt-0.5">
              {chartMetric === 'volunteers' ? 'Voluntarios Únicos con Turnos' : 'Total Turnos Cubiertos'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-dark3 p-1 rounded-lg border border-white/10 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setChartMetric('volunteers')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                  chartMetric === 'volunteers'
                    ? 'bg-[#4d7cfe] text-white shadow-sm'
                    : 'text-text-dim hover:text-white'
                }`}
              >
                Personas Únicas
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('shifts')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                  chartMetric === 'shifts'
                    ? 'bg-[#4d7cfe] text-white shadow-sm'
                    : 'text-text-dim hover:text-white'
                }`}
              >
                Turnos Cubiertos
              </button>
            </div>

            <div className="hidden md:flex items-center px-2 py-1 rounded-sm border border-border bg-dark3 text-[10px] font-bold text-text-dim shrink-0">
              10 – 26 Sep
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="px-3 sm:px-8 py-5">
          <div className="w-full flex flex-col">
            <div className="flex items-end gap-0.5 sm:gap-1.5 h-[230px] pt-14 relative">
              {(() => {
                const targetData = chartMetric === 'volunteers' ? volsPerDay : shiftsPerDay;
                const maxCount = Math.max(...Object.values(targetData), 1);
                const totalDays = EVENT_DAYS.length;

                return EVENT_DAYS.map((day, idx) => {
                  const count = targetData[day.key] || 0;
                  const volsCount = volsPerDay[day.key] || 0;
                  const shiftsCount = shiftsPerDay[day.key] || 0;
                  const heightPct = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 2) : 2;
                  const isHovered = hoveredDay === day.key;

                  // Smart tooltip alignment to prevent screen edge overflow
                  let alignClass = "left-1/2 -translate-x-1/2";
                  if (idx < 3) {
                    alignClass = "left-0 translate-x-0";
                  } else if (idx >= totalDays - 3) {
                    alignClass = "right-0 left-auto translate-x-0";
                  }

                  return (
                    <div
                      key={day.key}
                      className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                      onMouseEnter={() => setHoveredDay(day.key)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onClick={() => setHoveredDay(prev => prev === day.key ? null : day.key)}
                    >
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPct}%` }}
                        transition={{ duration: 0.7, delay: idx * 0.025, ease: "circOut" }}
                        className={`w-full rounded-[2px] sm:rounded-[3px] transition-colors duration-150 relative ${isHovered
                          ? 'bg-[#4d7cfe] shadow-[0_0_12px_rgba(77,124,254,0.4)]'
                          : 'bg-[#4d7cfe]/20 hover:bg-[#4d7cfe]/50'
                          }`}
                      >
                        {/* Floating detailed tooltip popup (clamped within viewport) */}
                        {isHovered && (
                          <div className={`absolute bottom-full ${alignClass} mb-2 bg-dark2 border border-white/20 text-text text-[10px] font-bold px-3 py-2 rounded-lg whitespace-nowrap shadow-2xl pointer-events-none z-50 flex flex-col gap-0.5 text-center min-w-[110px]`}>
                            <span className="text-[#4d7cfe] font-black text-[11px]">{day.label} {day.dateNum}</span>
                            <span className="text-white">{volsCount} personas únicas</span>
                            <span className="text-text-dim text-[9px]">{shiftsCount} turnos cubiertos</span>
                          </div>
                        )}
                      </motion.div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex gap-0.5 sm:gap-1.5 mt-2">
              {EVENT_DAYS.map(day => (
                <div key={day.key} className="flex-1 text-center">
                  <span className={`text-[8px] sm:text-[10px] font-bold transition-colors ${hoveredDay === day.key ? 'text-[#4d7cfe]' : 'text-text-dim'}`}>{day.dateNum}</span>
                </div>
              ))}
            </div>

            {/* Mobile-friendly active day breakdown banner */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-2">
              <span className="text-[11px] font-bold text-text-dim uppercase tracking-widest">Septiembre 2026</span>
              <div className="sm:hidden flex items-center gap-1.5 text-[10px] font-bold text-[#4d7cfe] bg-dark3 px-2.5 py-1 rounded-full border border-white/10">
                <span className="material-symbols-outlined text-[14px]">touch_app</span>
                <span>{hoveredDay ? `${EVENT_DAYS.find(d => d.key === hoveredDay)?.label} ${EVENT_DAYS.find(d => d.key === hoveredDay)?.dateNum}: ${volsPerDay[hoveredDay] || 0} p. / ${shiftsPerDay[hoveredDay] || 0} turnos` : 'Toca una barra para ver detalle'}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Cobertura por Comité — edge to edge */}
      <motion.div variants={itemVariants} className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/[0.02] mb-8">
        <div className="px-5 sm:px-8 py-4 border-b border-white/5">
          <h3 className="text-text tracking-tight leading-none text-sm font-bold">Cobertura por Comité</h3>
          <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-widest mt-0.5">Porcentaje de requerimientos asignados</p>
        </div>
        <div className="divide-y divide-white/5">
          {committeeStatus.map((committee, idx) => (
            <motion.div
              key={committee.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + idx * 0.05 }}
              className="px-5 sm:px-8 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group cursor-default"
            >
              <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider group-hover:text-text transition-colors truncate" title={committee.name}>{committee.name}</p>
              <div className="flex items-center gap-4 shrink-0">
                <div className="w-32 sm:w-48 h-1.5 bg-dark3 rounded-full overflow-hidden border border-border">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${committee.coverage}%` }}
                    transition={{ duration: 1, delay: 0.5 + idx * 0.05 }}
                    className={`h-full rounded-full ${committee.status === 'success' ? 'bg-accent' :
                      committee.status === 'warning' ? 'bg-amber-400' : 'bg-red'
                      }`}
                  />
                </div>
                <span className="text-[11px] font-bold text-text-dim w-10 tabular-nums text-right">{committee.coverage}%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Mapa de Calor Operativo — edge to edge, no card */}
      <motion.div variants={itemVariants} className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/[0.02]">
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-white/5">
          <h3 className="text-text tracking-tight leading-none text-sm font-bold">Mapa de Calor Operativo</h3>
          <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-widest mt-0.5">Cobertura por Día y Turno</p>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto w-full">
          <div className="min-w-full flex">
            <div className="w-16 sm:w-20 shrink-0 bg-dark3 border-r border-border flex flex-col pt-8">
              {heatmapMatrix.map((dayData) => (
                <div key={dayData.day} className="flex-1 min-h-[60px] flex items-center justify-center border-b border-border last:border-0 px-1 text-center">
                  <span className="text-[10px] sm:text-xs font-bold text-text-dim leading-none">{dayData.shortLabel} {dayData.dayLabel}</span>
                </div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-4">
              {['T1', 'T2', 'T3', 'T4'].map((shiftId, shiftIdx) => (
                <div key={shiftId} className="flex flex-col border-r border-border last:border-0 min-w-0">
                  <div className="h-8 flex flex-col items-center justify-center bg-dark3 border-b border-border">
                    <span className="text-[10px] font-bold text-text">{shiftId}</span>
                  </div>
                  {heatmapMatrix.map((dayData) => {
                    const shift = dayData.shifts[shiftIdx];
                    return (
                      <div
                        key={dayData.day}
                        className="flex-1 min-h-[60px] flex flex-col items-center justify-center border-b border-dark2 last:border-b-0 p-1 transition-all duration-300"
                        style={{
                          backgroundColor: shift.required === 0 ? 'var(--dark3)' :
                            shift.coverage >= 1 ? 'rgba(20, 184, 166, 0.15)' :
                              shift.coverage >= 0.7 ? 'rgba(251, 191, 36, 0.15)' :
                                'rgba(248, 113, 113, 0.15)'
                        }}
                      >
                        {shift.required > 0 ? (
                          <>
                            <span className="text-xs font-inter font-bold text-text">{Math.round(shift.coverage * 100)}%</span>
                            <span className="text-[10px] font-inter font-bold text-text-dim mt-0.5">{shift.assigned}/{shift.required}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 sm:gap-8 py-5 border-t border-white/5 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: 'rgba(248, 113, 113, 0.15)', borderColor: 'rgba(248, 113, 113, 0.3)' }} />
            <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Crítico</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.3)' }} />
            <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Riesgo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: 'rgba(20, 184, 166, 0.15)', borderColor: 'rgba(20, 184, 166, 0.3)' }} />
            <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Óptimo</span>
          </div>
        </div>
      </motion.div>

      {/* KPI Explanation Modal */}
      <AnimatePresence>
        {activeKpiInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveKpiInfo(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-dark2 border border-white/10 p-6 rounded-lg max-w-md w-full shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="text-lg font-bold text-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4d7cfe]">info</span>
                  {activeKpiInfo.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveKpiInfo(null)}
                  className="text-text-dim hover:text-white transition-colors p-1 rounded-sm hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-text-dim leading-relaxed">
                  {activeKpiInfo.explanation}
                </p>
                <div className="p-3 bg-dark3 rounded-sm border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold text-[#4d7cfe] uppercase tracking-wider">Cálculo / Fórmula</span>
                  <p className="text-xs font-mono font-bold text-text">{activeKpiInfo.formula}</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setActiveKpiInfo(null)}
                  className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white text-xs font-bold px-4 h-9"
                >
                  Entendido
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </motion.div>
    </>
  );
}