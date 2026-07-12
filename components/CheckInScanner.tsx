'use client'

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { checkInVolunteer } from "@/app/actions/attendance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface CheckInScannerProps {
  coordinatorId: string;
  coordinatorName: string;
  role: string;
  committeeName: string;
}

type ScannerState = 'idle' | 'scanning' | 'loading' | 'success' | 'already_checked_in' | 'manual_selection' | 'error';

export function CheckInScanner({
  coordinatorId,
  coordinatorName,
  role,
  committeeName
}: CheckInScannerProps) {
  const [state, setState] = useState<ScannerState>('idle');
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionCount, setSessionCount] = useState(0);
  const [scanResult, setScanResult] = useState<{
    volunteer: string;
    committee: string;
    shiftDetail?: string;
    shifts?: any[];
    qrValue?: string;
  } | null>(null);
  
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const autoResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sound feedback using Web Audio API
  const playSuccessBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.error("Audio feedback error", e);
    }
  };

  const playWarningBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error("Audio feedback error", e);
    }
  };

  const triggerVibration = (duration = 150) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  };

  // Start Scanner — only changes state. The useEffect below does DOM init.
  const startScanning = () => {
    setState('scanning');
    setErrorMsg("");
    setScanResult(null);
  };

  // Initialize html5-qrcode — polls until #reader is in the DOM
  useEffect(() => {
    if (state !== 'scanning') return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 × 50ms = 1.5s max wait
    let pollTimer: NodeJS.Timeout;

    const initScanner = async () => {
      if (cancelled) return;

      const readerEl = document.getElementById('reader');
      if (!readerEl) {
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          setErrorMsg("No se pudo iniciar la cámara. Intenta de nuevo.");
          setState('error');
          return;
        }
        pollTimer = setTimeout(initScanner, 50);
        return;
      }

      try {
        const html5Qrcode = new Html5Qrcode("reader");
        html5QrcodeRef.current = html5Qrcode;

        const qrCodeSuccessCallback = async (decodedText: string) => {
          await stopScanning();
          handleScannedData(decodedText);
        };

        const config = {
          fps: 10,
          qrbox: (width: number, height: number) => {
            const size = Math.min(width, height) * 0.72;
            return { width: size, height: size };
          }
        };

        await html5Qrcode.start(
          { facingMode: "environment" },
          config,
          qrCodeSuccessCallback,
          () => {}
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to start scanner:", err);
          setErrorMsg("No se pudo iniciar la cámara. Asegúrese de otorgar permisos de cámara.");
          setState('error');
        }
      }
    };

    // Small initial delay to let React begin rendering the scanning state
    pollTimer = setTimeout(initScanner, 50);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);


  // Stop Scanner
  const stopScanning = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (e) {
        console.error("Error stopping scanner:", e);
      }
    }
    html5QrcodeRef.current = null;
  };

  // Process Scanned Data
  const handleScannedData = async (qrValue: string) => {
    setState('loading');
    try {
      const res = await checkInVolunteer(qrValue, coordinatorId);
      
      if (res.error) {
        playWarningBeep();
        triggerVibration(300);
        setErrorMsg(res.error);
        setState('error');
      } else if (res.alreadyCheckedIn) {
        playWarningBeep();
        triggerVibration(100);
        setScanResult({
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail
        });
        setState('already_checked_in');
      } else if (res.requiresManualSelection) {
        playWarningBeep();
        setScanResult({
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shifts: res.shifts || [],
          qrValue: qrValue
        });
        setState('manual_selection');
      } else if (res.success) {
        playSuccessBeep();
        triggerVibration(150);
        setSessionCount(c => c + 1);
        setScanResult({
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail
        });
        setState('success');

        autoResetTimeoutRef.current = setTimeout(() => {
          startScanning();
        }, 3000);
      }
    } catch (e) {
      console.error("Error in check-in transaction:", e);
      setErrorMsg("Ocurrió un error al registrar la asistencia.");
      setState('error');
    }
  };

  // Handle Manual Shift Check-in
  const handleManualCheckIn = async (shiftId: string) => {
    setState('loading');
    try {
      const res = await checkInVolunteer("", coordinatorId, shiftId);
      
      if (res.error) {
        playWarningBeep();
        triggerVibration(300);
        setErrorMsg(res.error);
        setState('error');
      } else if (res.success) {
        playSuccessBeep();
        triggerVibration(150);
        setSessionCount(c => c + 1);
        setScanResult({
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail
        });
        setState('success');

        autoResetTimeoutRef.current = setTimeout(() => {
          startScanning();
        }, 3000);
      }
    } catch (e) {
      setErrorMsg("Ocurrió un error durante el check-in manual.");
      setState('error');
    }
  };

  const handleManualReset = () => {
    if (autoResetTimeoutRef.current) {
      clearTimeout(autoResetTimeoutRef.current);
    }
    startScanning();
  };

  useEffect(() => {
    return () => {
      stopScanning();
      if (autoResetTimeoutRef.current) {
        clearTimeout(autoResetTimeoutRef.current);
      }
    };
  }, []);

  // Status color for the scanner card border
  const borderColor =
    state === 'success' ? 'border-emerald-500/40' :
    state === 'already_checked_in' ? 'border-amber-500/40' :
    state === 'error' ? 'border-red-500/40' :
    state === 'scanning' ? 'border-[#4d7cfe]/40' :
    'border-white/10';

  const shadowColor =
    state === 'success' ? 'shadow-emerald-500/10' :
    state === 'already_checked_in' ? 'shadow-amber-500/10' :
    state === 'error' ? 'shadow-red-500/10' :
    state === 'scanning' ? 'shadow-[#4d7cfe]/10' :
    'shadow-black/20';

  return (
    <div className="w-full pb-32 lg:pb-12 flex flex-col min-h-full">
      {/* ── Page Header ── */}
      <div className="sticky top-0 z-40 bg-dark/80 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 mb-6 shrink-0 border-b border-white/5">
        <div className="w-full flex items-center max-w-5xl mx-auto">
          <h1 className="text-[28px] sm:text-[32px] font-black text-text tracking-tight">
            Escanear Turno
          </h1>
        </div>
      </div>

      {/* ── Body: two-col on desktop ── */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ── Left Panel: Info & Stats ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Primary CTA — only show when idle */}
            {state === 'idle' && (
              <Button
                onClick={startScanning}
                className="w-full bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-[20px] shadow-lg shadow-blue-500/20 h-14 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-base"
              >
                <span className="material-symbols-outlined text-[22px]">photo_camera</span>
                Activar Cámara
              </Button>
            )}

            {/* Instructions */}
            <div className="rounded-[24px] border border-white/10 bg-dark2 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-4">Instrucciones</p>
              <ol className="space-y-3">
                {[
                  { icon: 'photo_camera', text: 'Presiona Activar Cámara para comenzar.' },
                  { icon: 'qr_code_scanner', text: 'Apunta el lente al código QR del pase del voluntario.' },
                  { icon: 'task_alt', text: 'El sistema registra la asistencia automáticamente.' },
                  { icon: 'refresh', text: 'La cámara se reactiva en 3 segundos para el siguiente.' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-xl bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[15px] text-[#4d7cfe]">{item.icon}</span>
                    </div>
                    <p className="text-[12px] font-inter text-text-dim leading-snug">{item.text}</p>
                  </li>
                ))}
              </ol>
            </div>

            {/* Session Counter + Status — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[20px] border border-white/10 bg-dark2 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2">Esta Sesión</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-4xl font-black text-white leading-none">{sessionCount}</span>
                  <span className="text-xs font-inter font-bold text-text-dim pb-0.5">registros</span>
                </div>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-dark2 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2">Estado</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    state === 'scanning' ? 'bg-emerald-400 animate-pulse' :
                    state === 'success' ? 'bg-emerald-400' :
                    state === 'already_checked_in' ? 'bg-amber-400' :
                    state === 'error' ? 'bg-red-400' :
                    state === 'loading' ? 'bg-[#4d7cfe] animate-pulse' :
                    'bg-white/20'
                  }`} />
                  <p className="text-xs font-bold text-white leading-tight">
                    {state === 'idle' && 'En espera'}
                    {state === 'scanning' && 'Escaneando'}
                    {state === 'loading' && 'Procesando'}
                    {state === 'success' && 'Registrado'}
                    {state === 'already_checked_in' && 'Ya marcado'}
                    {state === 'manual_selection' && 'Manual'}
                    {state === 'error' && 'Error'}
                  </p>
                </div>
              </div>
            </div>

            {/* Coordinator tag */}
            <div className="flex items-center gap-2 px-1">
              <span className="material-symbols-outlined text-[16px] text-text-dim">badge</span>
              <p className="text-[11px] font-inter font-bold text-text-dim">
                Coord. <span className="text-[#4d7cfe]">{coordinatorName}</span>
                {committeeName && <span className="text-text-dim"> · {committeeName}</span>}
              </p>
            </div>

          </div>

          {/* ── Right Panel: Scanner Card ── */}
          <div className="lg:col-span-3">
            <div className={`rounded-[28px] border ${borderColor} bg-dark2 shadow-2xl ${shadowColor} overflow-hidden transition-colors duration-500`}>
              <div className="p-6 sm:p-8 flex flex-col items-center min-h-[480px] justify-center">
                <AnimatePresence mode="wait">

                  {/* IDLE */}
                  {state === 'idle' && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center"
                    >
                      <div className="w-28 h-28 bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 rounded-full flex items-center justify-center mb-7 shadow-inner">
                        <span className="material-symbols-outlined text-[56px] text-[#4d7cfe] animate-pulse">qr_code_scanner</span>
                      </div>
                      <h2 className="text-xl font-black text-white mb-2">Listo para Escanear</h2>
                      <p className="text-sm text-text-dim font-inter max-w-xs mb-8 leading-relaxed">
                        Activa la cámara y apunta al código QR del pase del voluntario para registrar su asistencia.
                      </p>
                      <Button
                        onClick={startScanning}
                        className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/20 px-10 h-13 font-bold transition-all active:scale-[0.98] flex items-center gap-2 text-base"
                      >
                        <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                        Activar Cámara
                      </Button>
                    </motion.div>
                  )}

                  {/* SCANNING */}
                  {state === 'scanning' && (
                    <motion.div
                      key="scanning"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full flex flex-col items-center"
                    >
                      <div className="w-full max-w-sm aspect-square rounded-[24px] overflow-hidden border border-white/10 bg-black relative shadow-2xl mb-5">
                        <div id="reader" className="w-full h-full" />
                        {/* Scan overlay */}
                        <div className="absolute inset-0 pointer-events-none">
                          {/* Corner brackets */}
                          {[
                            'top-4 left-4 border-t-2 border-l-2',
                            'top-4 right-4 border-t-2 border-r-2',
                            'bottom-4 left-4 border-b-2 border-l-2',
                            'bottom-4 right-4 border-b-2 border-r-2',
                          ].map((cls, i) => (
                            <div key={i} className={`absolute w-7 h-7 border-[#4d7cfe] rounded-sm ${cls}`} />
                          ))}
                          {/* Laser line */}
                          <div
                            className="absolute left-[15%] right-[15%] h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-[bounce_2s_infinite]"
                            style={{ top: '12%' }}
                          />
                        </div>
                      </div>

                      <p className="text-sm text-text-dim font-inter mb-5 animate-pulse flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        Buscando código QR...
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => { stopScanning(); setState('idle'); }}
                        className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-full px-8 h-11 font-bold transition-all active:scale-[0.98]"
                      >
                        Detener Cámara
                      </Button>
                    </motion.div>
                  )}

                  {/* LOADING */}
                  {state === 'loading' && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center"
                    >
                      <span className="material-symbols-outlined text-[56px] animate-spin text-[#4d7cfe] mb-6">progress_activity</span>
                      <h3 className="text-xl font-black text-white mb-2">Procesando Check-in</h3>
                      <p className="text-sm text-text-dim font-inter max-w-xs">
                        Validando autenticidad y buscando turno activo...
                      </p>
                    </motion.div>
                  )}

                  {/* SUCCESS */}
                  {state === 'success' && scanResult && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center w-full"
                    >
                      <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/25 text-white">
                        <span className="material-symbols-outlined text-[48px] font-bold">check</span>
                      </div>
                      <h3 className="text-2xl font-black text-emerald-400 mb-1">¡Asistencia Registrada!</h3>
                      <p className="text-xl font-bold text-white max-w-xs truncate mt-1">{scanResult.volunteer}</p>
                      <div className="flex items-center gap-2 mt-3 mb-8">
                        <Badge variant="secondary" className="bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 text-[#4d7cfe] font-inter font-bold text-[10px] py-0.5 px-2.5 shadow-none">
                          {scanResult.committee}
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-inter font-bold text-[10px] py-0.5 px-2.5">
                          {scanResult.shiftDetail}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-dim italic font-inter mb-5">
                        Volviendo a buscar en unos segundos...
                      </p>
                      <Button
                        onClick={handleManualReset}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 h-11 font-bold transition-all active:scale-[0.98]"
                      >
                        Escanear Siguiente
                      </Button>
                    </motion.div>
                  )}

                  {/* ALREADY CHECKED IN */}
                  {state === 'already_checked_in' && scanResult && (
                    <motion.div
                      key="already_checked_in"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center w-full"
                    >
                      <div className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-amber-500/25 text-white">
                        <span className="material-symbols-outlined text-[48px] font-bold">warning</span>
                      </div>
                      <h3 className="text-2xl font-black text-amber-500 mb-1">Ya Registrado</h3>
                      <p className="text-xl font-bold text-white max-w-xs truncate mt-1">{scanResult.volunteer}</p>
                      <div className="flex items-center gap-2 mt-3 mb-8">
                        <Badge variant="secondary" className="bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 text-[#4d7cfe] font-inter font-bold text-[10px] py-0.5 px-2.5 shadow-none">
                          {scanResult.committee}
                        </Badge>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border border-amber-500/20 font-inter font-bold text-[10px] py-0.5 px-2.5">
                          {scanResult.shiftDetail}
                        </Badge>
                      </div>
                      <Button
                        onClick={startScanning}
                        className="bg-amber-500 hover:bg-amber-600 text-white rounded-full px-8 h-11 font-bold transition-all active:scale-[0.98]"
                      >
                        Entendido, Escanear Otro
                      </Button>
                    </motion.div>
                  )}

                  {/* MANUAL SELECTION */}
                  {state === 'manual_selection' && scanResult && (
                    <motion.div
                      key="manual_selection"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="w-full flex flex-col items-center"
                    >
                      <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-4 text-blue-400">
                        <span className="material-symbols-outlined text-[32px]">checklist</span>
                      </div>
                      <h3 className="text-lg font-black text-white text-center">Seleccionar Turno</h3>
                      <p className="text-base font-bold text-text-dim text-center truncate w-full max-w-[320px] mt-0.5">{scanResult.volunteer}</p>
                      <p className="text-xs text-text-dim text-center mt-2 font-inter mb-5 max-w-xs">
                        No se encontró un turno activo ahora. Selecciona el turno a registrar:
                      </p>

                      <div className="w-full max-h-[240px] overflow-y-auto space-y-2 mb-6 pr-1">
                        {scanResult.shifts?.map((s) => (
                          <div key={s.id} className="flex items-center justify-between py-3 px-4 hover:bg-white/5 rounded-xl border border-white/8 transition-all">
                            <div className="text-left min-w-0 pr-3">
                              <p className="text-sm font-bold text-white capitalize leading-tight">{s.dayKey} · {s.shiftKey}</p>
                              <p className="text-[11px] text-text-dim font-inter mt-0.5">{s.timeLabel}</p>
                            </div>
                            {s.checkedIn ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[9px] py-0.5 px-2 shrink-0">
                                Asistió
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleManualCheckIn(s.id)}
                                className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white h-8 px-4 text-[11px] font-bold rounded-lg shadow-sm shrink-0"
                              >
                                Marcar
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex w-full gap-3">
                        <Button
                          variant="outline"
                          onClick={() => { setState('idle'); setScanResult(null); }}
                          className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl h-11 font-bold text-sm"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={startScanning}
                          className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl h-11 font-bold text-sm shadow-md shadow-blue-500/10"
                        >
                          Volver a Escanear
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* ERROR */}
                  {state === 'error' && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center w-full"
                    >
                      <div className="w-24 h-24 bg-red rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red/20 text-white">
                        <span className="material-symbols-outlined text-[48px] font-bold">close</span>
                      </div>
                      <h3 className="text-2xl font-black text-red mb-4">Fallo de Validación</h3>
                      <div className="bg-red-faint border border-red/20 rounded-2xl p-4 mb-8 w-full text-left">
                        <p className="text-sm text-red font-bold font-inter leading-relaxed">
                          {errorMsg}
                        </p>
                      </div>
                      <div className="flex w-full gap-3">
                        <Button
                          variant="outline"
                          onClick={() => { setState('idle'); }}
                          className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl h-11 font-bold text-sm"
                        >
                          Volver
                        </Button>
                        <Button
                          onClick={startScanning}
                          className="flex-1 bg-red hover:bg-red/90 text-white rounded-xl h-11 font-bold text-sm shadow-md shadow-red/10"
                        >
                          Reintentar
                        </Button>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
