'use client'

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCode from "react-qr-code";
import { generateEntryPassToken } from "@/app/actions/attendance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SHIFT_TIMES } from "@/lib/dates";

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
  let startWindow = 7.25;
  let endWindow = 12.75;
  if (shiftKey === 'T2') { startWindow = 10.25; endWindow = 15.75; }
  else if (shiftKey === 'T3') { startWindow = 13.25; endWindow = 18.75; }
  else if (shiftKey === 'T4') { startWindow = 16.25; endWindow = 22.75; }
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
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 w-screen h-screen">
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
            className="relative w-full max-w-sm z-10 flex flex-col"
          >
            {/* ── Card ── */}
            <div className="bg-[#0d1117] border border-white/10 rounded-[32px] shadow-2xl overflow-hidden">

              {/* Header strip */}
              <div className="px-6 pt-6 pb-4 border-b border-white/8">
                <h3 className="text-lg font-black text-white tracking-tight">Pase de Entrada</h3>
                <p className="text-[11px] font-inter text-slate-500 mt-0.5">
                  Muestra este código al coordinador al llegar.
                </p>
              </div>

              {/* QR Section */}
              <div className="px-6 py-6 flex flex-col items-center">
                {/* QR container */}
                <div className="bg-white rounded-2xl p-4 shadow-xl">
                    {loading ? (
                      <div className="w-[180px] h-[180px] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[40px] animate-spin text-[#4d7cfe]">
                          progress_activity
                        </span>
                      </div>
                    ) : qrValue ? (
                      <QRCode
                        value={qrValue}
                        size={180}
                        level="M"
                        fgColor="#0d1117"
                        bgColor="#ffffff"
                        style={{ height: 'auto', maxWidth: '100%', width: '180px' }}
                      />
                    ) : (
                      <div className="w-[180px] h-[180px] flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[32px] text-slate-300">qr_code_2</span>
                        <span className="text-xs font-inter text-slate-400">Sin código</span>
                      </div>
                    )}
                  </div>

                {/* Volunteer identity */}
                <div className="mt-5 text-center">
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
              </div>

              {/* Shifts section */}
              <div className="mx-6 mb-5 rounded-[20px] border border-white/8 bg-white/3 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Turnos programados hoy
                  </p>
                </div>
                <div className="p-3 space-y-2">
                  {todayShifts.length === 0 ? (
                    <p className="text-xs font-inter text-slate-500 italic text-center py-2">
                      Sin turnos asignados para hoy
                    </p>
                  ) : (
                    todayShifts.map(s => {
                      const isActive = isCurrentTimeInShiftWindow(s.day_key, s.shift_key);
                      const shiftIdx = parseInt(s.shift_key[1]) - 1;
                      const timeLabel = SHIFT_TIMES[shiftIdx]?.time || "";
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
                    })
                  )}
                </div>
              </div>

              {/* Footer: expiry + refresh */}
              <div className="px-6 pb-6 flex flex-col gap-3">
                {/* Timer row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-slate-500">timer</span>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none mb-0.5">
                        Vence en
                      </p>
                      <span className={`font-inter text-sm font-bold ${isExpiringSoon ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatTime(timeLeft)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadTokenAndShifts}
                    disabled={loading}
                    className="h-9 px-3 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/8 border border-white/10 rounded-xl flex items-center gap-1.5"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                      refresh
                    </span>
                    Actualizar
                  </Button>
                </div>

                {/* Close */}
                <Button
                  onClick={onClose}
                  className="w-full bg-white hover:bg-white/90 text-[#0d1117] font-bold rounded-2xl h-12 transition-all active:scale-[0.98] text-sm"
                >
                  Cerrar Pase
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
