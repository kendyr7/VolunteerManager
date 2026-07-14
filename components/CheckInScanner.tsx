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
  const [camerasList, setCamerasList] = useState<Array<{ id: string, label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
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
          // No qrbox — scan the full frame without visual region brackets
        };

        // Build a list of camera sources to try in order (cascade fallback)
        const cameraCandidates: Array<string | { facingMode: string }> = [];

        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            setCamerasList(cameras.map(c => ({ id: c.id, label: c.label })));

            // 1st choice: main back camera (includes 'wide' if not 'ultra')
            const mainBack = cameras.find(c => {
              const lbl = c.label.toLowerCase();
              const isBack = lbl.includes('back') || lbl.includes('rear') || lbl.includes('trasera') || lbl.includes('camara 0') || lbl.includes('camera 0');
              const isUltra = lbl.includes('ultra') || lbl.includes('0.5x') || lbl.includes('0.6x');
              const isTele = lbl.includes('telephoto') || lbl.includes('2x') || lbl.includes('3x') || lbl.includes('zoom');
              return isBack && !isUltra && !isTele;
            });

            if (mainBack) {
              cameraCandidates.push(mainBack.id);
              setSelectedCameraId(mainBack.id);
            } else {
              // Intenta tomar la última cámara trasera de la lista
              const lastCam = cameras[cameras.length - 1];
              cameraCandidates.push(lastCam.id);
              setSelectedCameraId(lastCam.id);
            }

            // Registrar el resto de las cámaras detectadas como candidatos de respaldo
            cameras.forEach(c => {
              if (c.id !== selectedCameraId) {
                cameraCandidates.push(c.id);
              }
            });
          }
        } catch {
          // Enumeration not supported — skip to facingMode fallback
        }

        // Always add facingMode as final fallback
        cameraCandidates.push({ facingMode: "environment" });

        // Try each candidate in order until one works
        let started = false;
        for (const candidate of cameraCandidates) {
          if (cancelled) break;
          try {
            await html5Qrcode.start(candidate, config, qrCodeSuccessCallback, () => {});
            started = true;
            break;
          } catch {
            // This candidate failed — try the next one silently
          }
        }

        if (!started && !cancelled) {
          setErrorMsg("No se pudo acceder a la cámara. Verifica los permisos e intenta de nuevo.");
          setState('error');
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg("Ocurrió un error al iniciar la cámara. Intenta de nuevo.");
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

  // Alternar cámara en caliente
  const handleSwitchCamera = async () => {
    if (!html5QrcodeRef.current || camerasList.length <= 1) return;

    const currentIndex = camerasList.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % camerasList.length;
    const nextCamera = camerasList[nextIndex];

    try {
      if (html5QrcodeRef.current.isScanning) {
        await html5QrcodeRef.current.stop();
      }

      setSelectedCameraId(nextCamera.id);

      const qrCodeSuccessCallback = async (decodedText: string) => {
        await stopScanning();
        handleScannedData(decodedText);
      };

      const config = {
        fps: 10,
      };

      await html5QrcodeRef.current.start(nextCamera.id, config, qrCodeSuccessCallback, () => {});
    } catch (e) {
      console.error("Error switching camera:", e);
      setErrorMsg("No se pudo cambiar a la siguiente cámara.");
      setState('error');
    }
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

      {/* ── Body ── */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        {/* A flexible grid system where order-* changes elements order on mobile vs desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* Left panel items stacked individually for micro-ordering */}

          {/* 1. Camera Card (Listo para Escanear) — col-span-2, order 1 */}
          <div className="lg:col-span-2 order-1 flex flex-col gap-4">
            <div className={`rounded-[24px] border bg-dark2 overflow-hidden transition-colors duration-300 ${
              state === 'scanning' ? 'border-[#4d7cfe]/40' : 'border-white/10'
            }`}>
              {/* Camera feed */}
              <div className={state === 'scanning' ? 'block' : 'hidden'}>
                <div className="aspect-square w-full bg-black">
                  <div id="reader" className="w-full h-full" />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <p className="text-xs text-text-dim font-inter flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Buscando código QR...
                  </p>
                  <div className="flex gap-2">
                    {camerasList.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSwitchCamera}
                        className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl h-8 px-3 text-xs font-bold flex items-center gap-1.5"
                        title="Cambiar de cámara"
                      >
                        <span className="material-symbols-outlined text-[16px]">flip_camera_ios</span>
                        <span>Cámara</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { stopScanning(); setState('idle'); setScanResult(null); }}
                      className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl h-8 px-3 text-xs font-bold"
                    >
                      Detener
                    </Button>
                  </div>
                </div>
              </div>

              {/* Idle state */}
              {state !== 'scanning' && (
                <div className="p-5 flex flex-col items-center text-center">
                  <div className="w-14 h-14 bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 rounded-full flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-[30px] text-[#4d7cfe] animate-pulse">qr_code_scanner</span>
                  </div>
                  <h2 className="text-base font-black text-white mb-1">Listo para Escanear</h2>
                  <p className="text-xs text-text-dim font-inter mb-4 leading-relaxed">
                    Activa la cámara y apunta al QR del voluntario.
                  </p>
                  <Button
                    onClick={startScanning}
                    className="w-full bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-[16px] shadow-lg shadow-blue-500/20 h-11 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                    Activar Cámara
                  </Button>
                </div>
              )}
            </div>

            {/* KPIs: Session + Status */}
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

            {/* Coordinator info */}
            <div className="flex items-center gap-2 px-1">
              <span className="material-symbols-outlined text-[16px] text-text-dim">badge</span>
              <p className="text-[11px] font-inter font-bold text-text-dim">
                Coord. <span className="text-[#4d7cfe]">{coordinatorName}</span>
                {committeeName && <span className="text-text-dim"> · {committeeName}</span>}
              </p>
            </div>
          </div>

          {/* 2. Results Card — col-span-3, order 2 on mobile, order 3 on desktop */}
          <div className="lg:col-span-3 order-2 lg:order-3">
            <div className={`rounded-[28px] border ${borderColor} bg-dark2 shadow-2xl ${shadowColor} overflow-hidden transition-colors duration-500`}>
              <div className="p-6 sm:p-8 flex flex-col items-center min-h-[480px] justify-center">
                <AnimatePresence mode="wait">

                  {/* RIGHT PANEL: Idle and Scanning placeholder */}
                  {(state === 'idle' || state === 'scanning') && (
                    <motion.div
                      key="idle-placeholder"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center p-6"
                    >
                      <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-5">
                        <span className="material-symbols-outlined text-[36px] text-text-dim">barcode_reader</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-1">Resultados de Escaneo</h3>
                      <p className="text-xs text-text-dim font-inter max-w-xs leading-relaxed">
                        Los resultados del registro de asistencia se mostrarán aquí en tiempo real al detectar un código QR.
                      </p>
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

                  {/* SUCCESS — REDESIGNED PREMIUM TICKET STYLE */}
                  {state === 'success' && scanResult && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center w-full max-w-md"
                    >
                      {/* Success Glow */}
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
                        <div className="relative w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg text-white">
                          <span className="material-symbols-outlined text-[40px] font-bold">check</span>
                        </div>
                      </div>

                      <h3 className="text-2xl font-black text-emerald-400 mb-4 tracking-tight">¡Asistencia Confirmada!</h3>

                      {/* Ticket Container */}
                      <div className="w-full bg-white/3 border border-white/10 rounded-[20px] p-5 text-left space-y-4 mb-6 font-inter shadow-inner relative overflow-hidden">
                        {/* Ticket left/right notched details */}
                        <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 rounded-full bg-dark2 border-r border-white/10" />
                        <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 rounded-full bg-dark2 border-l border-white/10" />

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-0.5">Voluntario</p>
                          <p className="text-base font-bold text-white tracking-tight leading-snug">{scanResult.volunteer}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-3.5 border-t border-white/5">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-0.5">Comité</p>
                            <p className="text-sm font-bold text-white tracking-tight">{scanResult.committee}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-0.5">Turno Registrado</p>
                            <p className="text-sm font-bold text-emerald-400 tracking-tight">{scanResult.shiftDetail}</p>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-text-dim italic font-inter mb-6">
                        Listo para el siguiente escaneo automáticamente...
                      </p>
                      <Button
                        onClick={handleManualReset}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-10 h-12 font-bold transition-all active:scale-[0.98] w-full text-sm"
                      >
                        Escanear Siguiente
                      </Button>
                    </motion.div>
                  )}

                  {/* ALREADY CHECKED IN — REDESIGNED PREMIUM TICKET STYLE */}
                  {state === 'already_checked_in' && scanResult && (
                    <motion.div
                      key="already_checked_in"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center w-full max-w-md"
                    >
                      {/* Warning Glow */}
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
                        <div className="relative w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center shadow-lg text-white">
                          <span className="material-symbols-outlined text-[40px] font-bold">warning</span>
                        </div>
                      </div>

                      <h3 className="text-2xl font-black text-amber-500 mb-4 tracking-tight">Asistencia Ya Registrada</h3>

                      {/* Ticket Container */}
                      <div className="w-full bg-white/3 border border-white/10 rounded-[20px] p-5 text-left space-y-4 mb-6 font-inter shadow-inner relative overflow-hidden">
                        <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 rounded-full bg-dark2 border-r border-white/10" />
                        <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 rounded-full bg-dark2 border-l border-white/10" />

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-0.5">Voluntario</p>
                          <p className="text-base font-bold text-white tracking-tight leading-snug">{scanResult.volunteer}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-3.5 border-t border-white/5">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-0.5">Comité</p>
                            <p className="text-sm font-bold text-white tracking-tight">{scanResult.committee}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-0.5">Turno</p>
                            <p className="text-sm font-bold text-amber-400 tracking-tight">{scanResult.shiftDetail}</p>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={startScanning}
                        className="bg-amber-500 hover:bg-amber-600 text-white rounded-2xl px-10 h-12 font-bold transition-all active:scale-[0.98] w-full text-sm"
                      >
                        Entendido, Escanear Otro
                      </Button>
                    </motion.div>
                  )}

                  {/* MANUAL SELECTION — REDESIGNED LIST */}
                  {state === 'manual_selection' && scanResult && (
                    <motion.div
                      key="manual_selection"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="w-full flex flex-col items-center max-w-md"
                    >
                      <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-4 text-blue-400">
                        <span className="material-symbols-outlined text-[32px]">checklist</span>
                      </div>
                      <h3 className="text-xl font-black text-white text-center">Seleccionar Turno</h3>
                      <p className="text-base font-bold text-text-dim text-center truncate w-full max-w-[320px] mt-1 mb-2">{scanResult.volunteer}</p>
                      <p className="text-xs text-text-dim text-center mt-1 font-inter mb-6 max-w-xs leading-relaxed">
                        No se encontró un turno activo ahora mismo. Selecciona manualmente qué turno deseas registrar:
                      </p>

                      <div className="w-full max-h-[220px] overflow-y-auto space-y-2 mb-6 pr-1">
                        {scanResult.shifts?.map((s) => (
                          <div key={s.id} className="flex items-center justify-between py-3.5 px-4 hover:bg-white/5 rounded-xl border border-white/8 transition-all">
                            <div className="text-left min-w-0 pr-3">
                              <p className="text-sm font-bold text-white capitalize leading-tight">{s.dayKey} · {s.shiftKey}</p>
                              <p className="text-[11px] text-text-dim font-inter mt-1">{s.timeLabel}</p>
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

                  {/* ERROR — REDESIGNED BLOCK */}
                  {state === 'error' && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center w-full max-w-md"
                    >
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full" />
                        <div className="relative w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg text-white">
                          <span className="material-symbols-outlined text-[40px] font-bold">close</span>
                        </div>
                      </div>

                      <h3 className="text-2xl font-black text-red-500 mb-4 tracking-tight">Fallo de Validación</h3>
                      
                      <div className="bg-red-500/5 border border-red-500/15 rounded-2xl p-5 mb-8 w-full text-left font-inter">
                        <p className="text-xs font-bold uppercase tracking-wider text-red-400/70 mb-1.5">Detalle del Error</p>
                        <p className="text-sm text-red-400 font-bold leading-relaxed">
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
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl h-11 font-bold text-sm shadow-md shadow-red-500/10"
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

          {/* 3. Instructions — col-span-5 on desktop (bottom), order 4 on mobile */}
          <div className="lg:col-span-5 order-4 mt-2">
            <div className="rounded-[24px] border border-white/10 bg-dark2 p-5 max-w-5xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-4">Instrucciones de Operación</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { icon: 'photo_camera', text: 'Presiona Activar Cámara para comenzar.' },
                  { icon: 'qr_code_scanner', text: 'Apunta el lente al código QR del pase del voluntario.' },
                  { icon: 'task_alt', text: 'El sistema registra la asistencia automáticamente.' },
                  { icon: 'refresh', text: 'La cámara se reactiva en 3 segundos para el siguiente.' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 hover:bg-white/3 rounded-xl transition-all">
                    <div className="w-8 h-8 rounded-xl bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[16px] text-[#4d7cfe]">{item.icon}</span>
                    </div>
                    <p className="text-[12px] font-inter text-text-dim leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
