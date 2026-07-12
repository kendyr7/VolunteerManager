'use client'

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateEntryPassToken } from "@/app/actions/attendance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface EntryPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  volunteerId: string;
  volunteerName: string;
  committeeName: string;
}

export function EntryPassModal({
  isOpen,
  onClose,
  volunteerId,
  volunteerName,
  committeeName,
}: EntryPassModalProps) {
  const [tokenData, setTokenData] = useState<{ id: string; ts: number; sig: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(1800); // 30 mins in seconds

  const loadToken = async () => {
    setLoading(true);
    try {
      const res = await generateEntryPassToken(volunteerId);
      setTokenData({
        id: res.volunteerId,
        ts: res.timestamp,
        sig: res.signature
      });
      setTimeLeft(1800); // Reset to 30 minutes
    } catch (e) {
      console.error("Error generating QR token:", e);
    } finally {
      setLoading(false);
    }
  };

  // Load token when modal opens
  useEffect(() => {
    if (isOpen) {
      loadToken();
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !tokenData) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto reload token when expired
          loadToken();
          return 0;
        }
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

  const qrValue = tokenData ? JSON.stringify(tokenData) : "";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative w-full max-w-sm overflow-hidden bg-slate-900 border border-white/10 rounded-[32px] p-6 text-center text-white shadow-2xl flex flex-col items-center"
          >
            {/* Header */}
            <h3 className="text-xl font-bold tracking-tight mb-1 text-white">
              Pase de Entrada
            </h3>
            <p className="text-xs text-slate-400 font-inter mb-4">
              Muestra este código al coordinador al llegar a tu turno.
            </p>

            {/* QR Card Container */}
            <div className="w-full bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col items-center justify-center relative group shadow-inner">
              <div className="bg-white p-4 rounded-2xl shadow-lg relative flex items-center justify-center">
                {loading ? (
                  <div className="w-[180px] h-[180px] flex items-center justify-center bg-white text-slate-900">
                    <span className="material-symbols-outlined text-[36px] animate-spin text-[#4d7cfe]">progress_activity</span>
                  </div>
                ) : qrValue ? (
                  <QRCodeSVG
                    value={qrValue}
                    size={180}
                    level="M"
                    fgColor="#1e293b" // slate-800
                    bgColor="#ffffff"
                  />
                ) : (
                  <div className="w-[180px] h-[180px] flex items-center justify-center bg-white text-slate-900">
                    <span className="text-xs font-semibold text-slate-400">Sin código</span>
                  </div>
                )}
              </div>

              {/* Volunteer Details inside Card */}
              <div className="mt-5 w-full">
                <p className="text-base font-bold text-white tracking-tight truncate">
                  {volunteerName}
                </p>
                <div className="flex items-center justify-center gap-2 mt-1.5">
                  <Badge variant="secondary" className="bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/25 font-bold text-[10px] py-0.5 px-2">
                    {committeeName}
                  </Badge>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px] py-0.5 px-2">
                    Pase Activo
                  </Badge>
                </div>
              </div>
            </div>

            {/* Timer and Countdown */}
            <div className="mt-5 flex items-center justify-between w-full px-2">
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vence en</span>
                <span className="font-mono text-sm font-semibold text-emerald-400">
                  {formatTime(timeLeft)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadToken}
                disabled={loading}
                className="h-8 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 rounded-lg flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>Actualizar</span>
              </Button>
            </div>

            {/* Close Button */}
            <Button
              onClick={onClose}
              className="mt-6 w-full bg-white hover:bg-white/90 text-slate-900 font-bold rounded-2xl h-11 transition-all active:scale-[0.98]"
            >
              Cerrar Pase
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
