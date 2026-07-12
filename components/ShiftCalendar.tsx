'use client'

import { useState, useEffect, useTransition } from "react";
import { getActiveEventDays, SHIFT_TIMES, formatDateShort } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import { recalculateReliability } from "@/app/actions/attendance";

interface ShiftCalendarProps {
  volunteerId: string;
}

export function ShiftCalendar({ volunteerId }: ShiftCalendarProps) {
  const supabase = createClient();
  const EVENT_DAYS = getActiveEventDays();

  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>({});
  const [checkedInShifts, setCheckedInShifts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Load shifts for this volunteer
  const loadShifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('volunteer_id', volunteerId);

      if (error) {
        console.error("Error loading volunteer shifts:", error);
        return;
      }

      const mapped: Record<string, string[]> = {};
      const confirmed: Record<string, string[]> = {};
      data?.forEach(s => {
        if (!mapped[s.day_key]) {
          mapped[s.day_key] = [];
        }
        if (!mapped[s.day_key].includes(s.shift_key)) {
          mapped[s.day_key].push(s.shift_key);
        }

        if (s.checked_in) {
          if (!confirmed[s.day_key]) {
            confirmed[s.day_key] = [];
          }
          if (!confirmed[s.day_key].includes(s.shift_key)) {
            confirmed[s.day_key].push(s.shift_key);
          }
        }
      });
      setShiftsByDay(mapped);
      setCheckedInShifts(confirmed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, [volunteerId]);

  // Toggle shift on click
  const handleToggleShift = (dayKey: string, shiftKey: string) => {
    // If the shift is already checked-in, do not allow toggling
    const isCheckedIn = (checkedInShifts[dayKey] || []).includes(shiftKey);
    if (isCheckedIn) return;

    startTransition(async () => {
      const active = (shiftsByDay[dayKey] || []).includes(shiftKey);

      if (active) {
        // Delete shift reservation
        const { error } = await supabase
          .from('shifts')
          .delete()
          .eq('volunteer_id', volunteerId)
          .eq('day_key', dayKey)
          .eq('shift_key', shiftKey);

        if (error) {
          console.error("Error deleting shift:", error);
          return;
        }

        setShiftsByDay(prev => {
          const current = prev[dayKey] || [];
          return {
            ...prev,
            [dayKey]: current.filter(s => s !== shiftKey)
          };
        });
      } else {
        // Insert shift reservation
        const { error } = await supabase
          .from('shifts')
          .insert({
            volunteer_id: volunteerId,
            day_key: dayKey,
            shift_key: shiftKey
          });

        if (error) {
          console.error("Error inserting shift:", error);
          return;
        }

        setShiftsByDay(prev => {
          const current = prev[dayKey] || [];
          return {
            ...prev,
            [dayKey]: [...current, shiftKey]
          };
        });
      }

      // Recalculate reliability score
      await recalculateReliability(volunteerId);
    });
  };

  if (loading) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center gap-4">
        <span className="material-symbols-outlined text-[48px] animate-spin text-[#4d7cfe]">progress_activity</span>
        <p className="text-sm font-bold text-slate-400 font-inter">Cargando tus turnos...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full pb-16">
      {isPending && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white border border-emerald-500/20 font-bold px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs animate-pulse">
          <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
          Guardando cambios...
        </div>
      )}

      {EVENT_DAYS.map((date, index) => {
        const key = formatDateShort(date); // e.g. "mié 16"
        const dayShifts = shiftsByDay[key] || [];

        const bgColors = [
          'bg-[#10a562]',
          'bg-[#4aa9df]',
          'bg-[#f1c130]',
          'bg-[#d54134]',
          'bg-[#981e32]',
          'bg-[#2c44c2]',
          'bg-[#f1c130]',
          'bg-[#ed1b24]'
        ];
        const cardBg = bgColors[index % bgColors.length];

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className="rounded-[20px] shadow-sm h-fit w-full bg-slate-900 border border-white/10 overflow-hidden flex transition-all duration-200 hover:scale-[1.005]"
          >
            {/* Structural color tag on left side */}
            <div className={`w-3 shrink-0 ${cardBg} opacity-90`} />

            {/* Content container */}
            <div className="flex-1 flex items-center justify-between px-5 sm:px-6 py-4">
              
              {/* Left: Date */}
              <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
                <p className="font-inter font-bold text-white text-[13px] capitalize truncate">
                  {format(date, "EEEE", { locale: es })} {format(date, "d", { locale: es })}
                </p>
                <p className="font-inter text-[9px] text-slate-500 font-bold tracking-wide uppercase mt-0.5">
                  {format(date, "MMMM", { locale: es })}
                </p>
              </div>

              {/* Right: 4 Columns (T1 to T4) */}
              <div className="flex items-center shrink-0 ml-auto border-l border-white/10 pl-3">
                {(['T1', 'T2', 'T3', 'T4'] as const).map((t, i) => {
                  const active = dayShifts.includes(t);
                  const isCheckedIn = (checkedInShifts[key] || []).includes(t);
                  const info = SHIFT_TIMES[i];

                  return (
                    <button
                      key={t}
                      onClick={() => handleToggleShift(key, t)}
                      disabled={isCheckedIn}
                      className={`flex flex-col items-center justify-center w-12 sm:w-16 py-2.5 ${
                        i !== 0 ? 'border-l border-white/10' : ''
                      } transition-all ${
                        isCheckedIn
                          ? 'bg-emerald-500/10 text-emerald-400 font-bold cursor-not-allowed opacity-100'
                          : active
                          ? 'bg-white/5 text-white opacity-100 font-bold active:scale-[0.96]'
                          : 'bg-transparent text-slate-500 hover:text-white/80 opacity-50 active:scale-[0.96]'
                      }`}
                      title={isCheckedIn ? `${t}: Asistencia Confirmada` : `${t}: ${info?.time}`}
                    >
                      <span className="text-[13px] font-bold leading-none flex items-center gap-0.5">
                        {isCheckedIn ? (
                          <span className="material-symbols-outlined text-[14px]">task_alt</span>
                        ) : active ? (
                          '✓'
                        ) : (
                          '-'
                        )}
                      </span>
                      <span className="font-inter text-[9px] font-black uppercase mt-1 tracking-widest leading-none">
                        {t}
                      </span>
                    </button>
                  );
                })}
              </div>

            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
