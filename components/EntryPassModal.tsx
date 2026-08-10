'use client'

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import QRCode from "react-qr-code";
import { generateEntryPassToken } from "@/app/actions/attendance";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SHIFT_TIMES, getOfficialShiftTime } from "@/lib/dates";

interface EntryPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  volunteerId: string;
  volunteerName: string;
  committeeName: string;
}

interface VolunteerShift {
  id: string;
  day_key: string;
  shift_key: string;
}

function isCurrentTimeInShiftWindow(dayKey: string, shiftKey: string): boolean {
  const now = new Date();
  const currentDayKey = format(now, "EEE d", { locale: es }).toLowerCase();
  const cleanDayKey = dayKey.replace('.', '').toLowerCase();
  const cleanCurrentDayKey = currentDayKey.replace('.', '').toLowerCase();
  if (cleanDayKey !== cleanCurrentDayKey) return false;

  const currentHour = now.getHours() + now.getMinutes() / 60;
  const official = getOfficialShiftTime(dayKey, shiftKey);
  const startWindow = official.startHour - 0.75;
  const endWindow = official.endHour + 0.75;
  return currentHour >= startWindow && currentHour <= endWindow;
}

export function EntryPassModal({
  isOpen,
  onClose,
  volunteerId,
  volunteerName,
  committeeName,
}: EntryPassModalProps) {
  const supabase = createClient();
  const [tokenData, setTokenData] = useState<{ id: string; ts: number; sig: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(1800);
  const [todayShifts, setTodayShifts] = useState<VolunteerShift[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const loadTokenAndShifts = async () => {
    setLoading(true);
    try {
      const res = await generateEntryPassToken(volunteerId);
      setTokenData({ id: res.volunteerId, ts: res.timestamp, sig: res.signature });
      setTimeLeft(1800);

      const { data: shifts } = await supabase
        .from('shifts')
        .select('id, day_key, shift_key')
        .eq('volunteer_id', volunteerId);

      if (shifts) {
        const now = new Date();
        const todayKey = format(now, "EEE d", { locale: es }).replace('.', '').toLowerCase();
        const filtered = shifts.filter(s => s.day_key.replace('.', '').toLowerCase() === todayKey);
        setTodayShifts(filtered);
      }
    } catch (e) {
      console.error("Error generating QR token:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadTokenAndShifts();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !tokenData) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); loadTokenAndShifts(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, tokenData]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Time expiry warning — last 5 mins
  const isExpiringSoon = timeLeft <= 300;

  const qrValue = tokenData ? JSON.stringify(tokenData) : "";
  const activeShift = todayShifts.find(s => isCurrentTimeInShiftWindow(s.day_key, s.shift_key));

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.18 }}
            className="relative w-full h-full sm:w-auto sm:h-auto sm:max-w-[1000px] z-10 flex flex-col"
          >
            {/* ── Card ── */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] sm:border sm:border-white/10 sm:rounded-[32px] sm:max-h-[min(720px,calc(100dvh-48px))] shadow-2xl overflow-hidden">

              {/* Accent gradient strip */}
              <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#4d7cfe] via-[#8b5cf6] to-[#4d7cfe]" />

              {/* Header strip */}
              <div className="relative px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-4 border-b border-white/8 shrink-0">
                <button
                  onClick={onClose}
                  aria-label="Cerrar pase"
                  className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
                <h3 className="text-lg font-black text-white tracking-tight">Pase de Entrada</h3>
                <p className="text-[11px] font-inter text-slate-500 mt-0.5">
                  Muestra este código al coordinador al llegar.
                </p>
              </div>

              {/* Body: two-column on desktop, single column on mobile */}
              <div className="flex-1 min-h-0 flex flex-col sm:grid sm:grid-cols-2 sm:divide-x sm:divide-white/8">

                {/* ── Left column: QR + identity + timer ── */}
                <div className="shrink-0 sm:shrink sm:min-h-0 px-6 py-8 flex flex-col items-center justify-center gap-6">
                  {/* QR container */}
                  <div className="bg-white rounded-2xl p-4 shadow-xl">
                    {loading ? (
                      <div className="w-[220px] h-[220px] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[40px] animate-spin text-[#4d7cfe]">
                          progress_activity
                        </span>
                      </div>
                    ) : qrValue ? (
                      <div className="relative w-[220px] h-[220px]">
                        <QRCode
                          value={qrValue}
                          size={220}
                          level="H"
                          fgColor="#0d1117"
                          bgColor="#ffffff"
                          style={{ height: '100%', width: '100%' }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-[52px] h-[52px] rounded-full bg-white flex items-center justify-center">
                            <Image
                              src="/window.svg"
                              alt="Logo"
                              width={34}
                              height={34}
                              draggable={false}
                              className="object-contain"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-[220px] h-[220px] flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[32px] text-slate-300">qr_code_2</span>
                        <span className="text-xs font-inter text-slate-400">Sin código</span>
                      </div>
                    )}
                  </div>

                  {/* Volunteer identity */}
                  <div className="text-center">
                    <p className="text-base font-semibold text-white tracking-tight">{volunteerName}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Badge variant="secondary" className="bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/25 font-inter font-bold text-[10px] py-0.5 px-2.5">
                        {committeeName}
                      </Badge>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-inter font-bold text-[10px] py-0.5 px-2.5">
                        Pase Activo
                      </Badge>
                    </div>
                  </div>

                  {/* Timer + refresh */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <span className={`material-symbols-outlined text-[18px] ${isExpiringSoon ? 'text-amber-400' : 'text-emerald-400'}`}>
                          timer
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none mb-1">
                          Vence en
                        </p>
                        <span className={`font-inter text-lg font-bold tabular-nums leading-none ${isExpiringSoon ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {formatTime(timeLeft)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={loadTokenAndShifts}
                      disabled={loading}
                      className="btn-action h-10 px-4 rounded-full text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                        refresh
                      </span>
                      Actualizar
                    </button>
                  </div>
                </div>

                {/* ── Right column: shifts + close ── */}
                <div className="flex flex-col min-h-0 flex-1 sm:flex-none px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:pb-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 shrink-0">
                    Turnos programados
                  </p>

                  {/* Shifts list (scrollable) */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-[20px] border border-white/8 bg-white/3 p-3 pr-2">
                    {todayShifts.length === 0 ? (
                      <p className="text-xs font-inter text-slate-500 italic text-center py-2">
                        Sin turnos asignados para hoy
                      </p>
                    ) : (
                      (() => {
                        const groups = new Map<string, VolunteerShift[]>();
                        todayShifts.forEach(s => {
                          const key = s.day_key.replace('.', '').toLowerCase();
                          if (!groups.has(key)) groups.set(key, []);
                          groups.get(key)!.push(s);
                        });
                        return Array.from(groups.entries()).map(([dayKey, dayShifts]) => (
                          <div key={dayKey}>
                            {groups.size > 1 && (
                              <div className="px-1 pt-2 first:pt-0 pb-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 capitalize">
                                  {dayKey}
                                </span>
                              </div>
                            )}
                            <div className="space-y-2">
                              {dayShifts.map(s => {
                                const isActive = isCurrentTimeInShiftWindow(s.day_key, s.shift_key);
                                const official = getOfficialShiftTime(s.day_key, s.shift_key);
                                const timeLabel = official.timeLabel;
                                return (
                                  <div
                                    key={s.id}
                                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                                      isActive
                                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                        : 'bg-white/4 border-white/5 text-slate-500'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                      <span className="text-xs font-bold uppercase">{s.shift_key}</span>
                                      {isActive && (
                                        <span className="text-[9px] font-inter font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                                          Activo
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-inter font-bold">{timeLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })()
                    )}
                  </div>

                  {/* Close */}
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full btn-cancel py-3.5 rounded-full border border-red/30 text-sm font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                  >
                    Cerrar Pase
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
