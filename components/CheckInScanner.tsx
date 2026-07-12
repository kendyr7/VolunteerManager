'use client'

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { checkInVolunteer } from "@/app/actions/attendance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
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
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4 note
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

  // Start Scanner
  const startScanning = async () => {
    setState('scanning');
    setErrorMsg("");
    setScanResult(null);

    // Give the DOM a moment to render the #reader div
    setTimeout(async () => {
      try {
        const html5Qrcode = new Html5Qrcode("reader");
        html5QrcodeRef.current = html5Qrcode;

        const qrCodeSuccessCallback = async (decodedText: string) => {
          // Stop scanning immediately to prevent multiple scans
          await stopScanning();
          handleScannedData(decodedText);
        };

        const config = { 
          fps: 10, 
          qrbox: (width: number, height: number) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          }
        };

        await html5Qrcode.start(
          { facingMode: "environment" }, 
          config, 
          qrCodeSuccessCallback,
          () => {} // silent error callback for frames
        );
      } catch (err) {
        console.error("Failed to start scanner:", err);
        setErrorMsg("No se pudo iniciar la cámara. Asegúrese de otorgar permisos de cámara.");
        setState('error');
      }
    }, 100);
  };

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
          qrValue: qrValue // Keep qrValue for manual check-in request
        });
        setState('manual_selection');
      } else if (res.success) {
        playSuccessBeep();
        triggerVibration(150);
        setScanResult({
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail
        });
        setState('success');

        // Auto-reset to scanning mode after 3 seconds
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
        setScanResult({
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail
        });
        setState('success');

        // Auto-reset
        autoResetTimeoutRef.current = setTimeout(() => {
          startScanning();
        }, 3000);
      }
    } catch (e) {
      setErrorMsg("Ocurrió un error durante el check-in manual.");
      setState('error');
    }
  };

  // Cancel Auto Reset on manual click
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

  return (
    <div className="w-full mx-auto pb-32 lg:pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 shrink-0">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Scanner Asistencia
          </h1>
          <div className="text-right">
            <p className="text-[11px] font-bold text-text-dim uppercase tracking-wider">Coordinador</p>
            <p className="text-xs font-bold text-[#4d7cfe]">{coordinatorName}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 items-center w-full min-w-0 px-4 sm:px-6 lg:px-8">
        <Card className="border border-white/10 bg-dark2 rounded-[32px] shadow-2xl overflow-hidden w-full max-w-md relative min-h-[420px] flex flex-col justify-between">
          
          {/* Main Scanner Card Content */}
          <CardContent className="p-6 flex-1 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              
              {/* IDLE STATE */}
              {state === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center p-6"
                >
                  <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <span className="material-symbols-outlined text-[48px] text-[#4d7cfe] animate-pulse">qr_code_scanner</span>
                  </div>
                  <h2 className="text-lg font-bold text-white mb-2">Listo para Escanear</h2>
                  <p className="text-sm text-text-dim max-w-xs font-inter mb-6">
                    Presiona el botón para activar la cámara del celular y registrar la asistencia de los voluntarios.
                  </p>
                  <Button
                    onClick={startScanning}
                    className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/20 px-8 h-12 font-bold transition-all active:scale-[0.98] flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                    Activar Cámara
                  </Button>
                </motion.div>
              )}

              {/* SCANNING STATE */}
              {state === 'scanning' && (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full flex flex-col items-center relative"
                >
                  {/* Camera feed placeholder/container */}
                  <div className="w-full aspect-square max-w-[280px] rounded-3xl overflow-hidden border border-white/10 bg-black relative shadow-2xl">
                    <div id="reader" className="w-full h-full object-cover" />
                    
                    {/* Pulse Line & Corner Markers overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center border-2 border-transparent">
                      {/* Laser Line */}
                      <div className="absolute w-[80%] h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-[bounce_2s_infinite]" style={{ top: '10%' }} />
                      
                      {/* Frame Guide corners */}
                      <div className="absolute w-[70%] h-[70%] border border-white/20 rounded-xl" />
                    </div>
                  </div>

                  <p className="text-xs text-text-dim font-inter mt-6 mb-4 animate-pulse flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Buscando código QR...
                  </p>

                  <Button
                    variant="outline"
                    onClick={() => { stopScanning(); setState('idle'); }}
                    className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-full px-6 h-10 font-bold transition-all active:scale-[0.98]"
                  >
                    Detener Cámara
                  </Button>
                </motion.div>
              )}

              {/* LOADING STATE */}
              {state === 'loading' && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center p-6"
                >
                  <span className="material-symbols-outlined text-[48px] animate-spin text-[#4d7cfe] mb-6">progress_activity</span>
                  <h3 className="text-lg font-bold text-white mb-2">Procesando Check-in</h3>
                  <p className="text-sm text-text-dim font-inter">
                    Validando autenticidad y buscando turno activo...
                  </p>
                </motion.div>
              )}

              {/* SUCCESS STATE */}
              {state === 'success' && scanResult && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center w-full p-4"
                >
                  <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20 text-white">
                    <span className="material-symbols-outlined text-[40px] font-bold">check</span>
                  </div>
                  <h3 className="text-xl font-black text-emerald-400 mb-1">¡Asistencia Registrada!</h3>
                  <p className="text-lg font-bold text-white max-w-xs truncate">{scanResult.volunteer}</p>
                  
                  <div className="flex items-center gap-2 mt-2 mb-6">
                    <Badge variant="secondary" className="bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 text-[#4d7cfe] font-bold text-[10px] py-0.5 px-2 shadow-none">
                      {scanResult.committee}
                    </Badge>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px] py-0.5 px-2">
                      {scanResult.shiftDetail}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-text-dim italic font-inter mb-4">
                    Volviendo a buscar en unos segundos...
                  </p>
                  <Button
                    onClick={handleManualReset}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6 h-10 font-bold transition-all active:scale-[0.98]"
                  >
                    Escanear Siguiente
                  </Button>
                </motion.div>
              )}

              {/* ALREADY CHECKED IN STATE */}
              {state === 'already_checked_in' && scanResult && (
                <motion.div
                  key="already_checked_in"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center w-full p-4"
                >
                  <div className="w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20 text-white">
                    <span className="material-symbols-outlined text-[40px] font-bold">warning</span>
                  </div>
                  <h3 className="text-xl font-black text-amber-500 mb-1">Ya Registrado</h3>
                  <p className="text-lg font-bold text-white max-w-xs truncate">{scanResult.volunteer}</p>
                  
                  <div className="flex items-center gap-2 mt-2 mb-6">
                    <Badge variant="secondary" className="bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 text-[#4d7cfe] font-bold text-[10px] py-0.5 px-2 shadow-none">
                      {scanResult.committee}
                    </Badge>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[10px] py-0.5 px-2">
                      {scanResult.shiftDetail}
                    </Badge>
                  </div>

                  <Button
                    onClick={startScanning}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-full px-6 h-10 font-bold transition-all active:scale-[0.98]"
                  >
                    Entendido, Escanear Otro
                  </Button>
                </motion.div>
              )}

              {/* MANUAL SELECTION STATE */}
              {state === 'manual_selection' && scanResult && (
                <motion.div
                  key="manual_selection"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full flex flex-col items-center p-2"
                >
                  <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-4 text-blue-400">
                    <span className="material-symbols-outlined text-[32px]">checklist</span>
                  </div>
                  
                  <h3 className="text-base font-bold text-white text-center">Seleccionar Turno</h3>
                  <p className="text-sm font-bold text-text-dim text-center truncate w-full max-w-[280px]">{scanResult.volunteer}</p>
                  <p className="text-xs text-text-dim text-center mt-1 font-inter mb-5">
                    No se encontró un turno activo ahora. Selecciona el turno a registrar:
                  </p>

                  <div className="w-full max-h-[220px] overflow-y-auto divide-y divide-white/5 space-y-2 mb-6 pr-1">
                    {scanResult.shifts?.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-3 px-3 hover:bg-white/5 rounded-xl border border-white/5 transition-all">
                        <div className="text-left min-w-0 pr-3">
                          <p className="text-xs font-bold text-white capitalize leading-tight">{s.dayKey} • {s.shiftKey}</p>
                          <p className="text-[10px] text-text-dim font-inter mt-0.5">{s.timeLabel}</p>
                        </div>
                        {s.checkedIn ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[9px] py-0.5 px-2">
                            Asistió
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleManualCheckIn(s.id)}
                            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white h-7 px-3 text-[10px] font-bold rounded-lg shadow-sm"
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
                      className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl h-10 font-bold text-xs"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={startScanning}
                      className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl h-10 font-bold text-xs shadow-md shadow-blue-500/10"
                    >
                      Volver a Escanear
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ERROR STATE */}
              {state === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center w-full p-4"
                >
                  <div className="w-20 h-20 bg-red rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red/20 text-white">
                    <span className="material-symbols-outlined text-[40px] font-bold">close</span>
                  </div>
                  <h3 className="text-xl font-black text-red mb-2">Fallo de Validación</h3>
                  
                  <div className="bg-red-faint border border-red/20 rounded-2xl p-4 mb-6 w-full">
                    <p className="text-xs text-red font-bold font-inter leading-relaxed">
                      {errorMsg}
                    </p>
                  </div>

                  <div className="flex w-full gap-3">
                    <Button
                      variant="outline"
                      onClick={() => { setState('idle'); }}
                      className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl h-10 font-bold text-xs"
                    >
                      Volver
                    </Button>
                    <Button
                      onClick={startScanning}
                      className="flex-1 bg-red hover:bg-red/90 text-white rounded-xl h-10 font-bold text-xs shadow-md shadow-red/10"
                    >
                      Reintentar
                    </Button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
