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

interface ScanEntry {
  id: string;
  volunteer: string;
  committee: string;
  shiftDetail?: string;
  timestamp: Date;
  type: 'success' | 'already_checked_in' | 'error';
  errorMsg?: string;
}



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
  const [history, setHistory] = useState<ScanEntry[]>([]);

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

  const startScanning = () => {
    setState('scanning');
    setErrorMsg("");
    setScanResult(null);
  };

  // Initialize html5-qrcode
  useEffect(() => {
    if (state !== 'scanning') return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 30;
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

        const config = { fps: 10 };

        const cameraCandidates: Array<string | { facingMode: string }> = [];

        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            setCamerasList(cameras.map(c => ({ id: c.id, label: c.label })));

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
              const lastCam = cameras[cameras.length - 1];
              cameraCandidates.push(lastCam.id);
              setSelectedCameraId(lastCam.id);
            }

            cameras.forEach(c => {
              if (c.id !== selectedCameraId) {
                cameraCandidates.push(c.id);
              }
            });
          }
        } catch {
          // Enumeration not supported
        }

        cameraCandidates.push({ facingMode: "environment" });

        let started = false;
        for (const candidate of cameraCandidates) {
          if (cancelled) break;
          try {
            await html5Qrcode.start(candidate, config, qrCodeSuccessCallback, () => {});
            started = true;
            break;
          } catch {
            // Try next
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

    pollTimer = setTimeout(initScanner, 50);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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

      await html5QrcodeRef.current.start(nextCamera.id, { fps: 10 }, qrCodeSuccessCallback, () => {});
    } catch (e) {
      console.error("Error switching camera:", e);
      setErrorMsg("No se pudo cambiar a la siguiente cámara.");
      setState('error');
    }
  };

  const handleScannedData = async (qrValue: string) => {
    setState('loading');
    try {
      const res = await checkInVolunteer(qrValue, coordinatorId);

      if (res.error) {
        playWarningBeep();
        triggerVibration(300);
        setErrorMsg(res.error);
        setHistory(prev => [{
          id: crypto.randomUUID(),
          volunteer: '—',
          committee: '—',
          timestamp: new Date(),
          type: 'error',
          errorMsg: res.error,
        }, ...prev]);
        setState('error');
      } else if (res.alreadyCheckedIn) {
        playWarningBeep();
        triggerVibration(100);
        const entry: ScanEntry = {
          id: crypto.randomUUID(),
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail,
          timestamp: new Date(),
          type: 'already_checked_in',
        };
        setHistory(prev => [entry, ...prev]);
        setScanResult({
          volunteer: entry.volunteer,
          committee: entry.committee,
          shiftDetail: entry.shiftDetail,
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
        const entry: ScanEntry = {
          id: crypto.randomUUID(),
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail,
          timestamp: new Date(),
          type: 'success',
        };
        setHistory(prev => [entry, ...prev]);
        setScanResult({
          volunteer: entry.volunteer,
          committee: entry.committee,
          shiftDetail: entry.shiftDetail,
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
        const entry: ScanEntry = {
          id: crypto.randomUUID(),
          volunteer: res.volunteer || "Voluntario",
          committee: res.committee || "Sin comité",
          shiftDetail: res.shiftDetail,
          timestamp: new Date(),
          type: 'success',
        };
        setHistory(prev => [entry, ...prev]);
        setScanResult({
          volunteer: entry.volunteer,
          committee: entry.committee,
          shiftDetail: entry.shiftDetail,
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

  const isActive = state === 'scanning';

  // Status pill config
  const statusConfig = {
    idle:              { dot: 'bg-black/20 dark:bg-white/25',   label: 'En espera' },
    scanning:          { dot: 'bg-emerald-400 animate-pulse',   label: 'Escaneando' },
    loading:           { dot: 'bg-[#4d7cfe] animate-pulse',     label: 'Procesando' },
    success:           { dot: 'bg-emerald-400',                  label: 'Registrado ✓' },
    already_checked_in:{ dot: 'bg-amber-400',                   label: 'Ya marcado' },
    manual_selection:  { dot: 'bg-[#4d7cfe]',                   label: 'Selección manual' },
    error:             { dot: 'bg-red-400',                     label: 'Error' },
  } as const;

  const { dot, label } = statusConfig[state];

  return (
    <div className="w-full pb-32 lg:pb-12 flex flex-col min-h-full">

      {/* ── Page Header ── */}
      <div className="sticky top-0 z-40 bg-dark/80 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 mb-6 shrink-0 border-b border-black/5 dark:border-white/5">
        <div className="w-full flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-[28px] sm:text-[32px] font-black text-text tracking-tight">
            Escanear Turno
          </h1>
          {/* Status + coordinator info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/8 rounded-full px-3 py-1.5">
              <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
              <span className="text-[11px] font-bold text-text">{label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ── LEFT: Camera Card + Meta ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Camera Card */}
            <div className={`rounded-[24px] border bg-dark2 overflow-hidden transition-colors duration-300 ${
              isActive ? 'border-[#4d7cfe]/40' : 'border-black/8 dark:border-white/10'
            }`}>
              {/* Camera feed */}
              <div className={isActive ? 'block' : 'hidden'}>
                <div className="aspect-square w-full bg-black">
                  <div id="reader" className="w-full h-full" />
                </div>
                {/* Camera controls */}
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
                        className="border-black/8 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/8 dark:hover:bg-white/10 text-text rounded-xl h-8 px-3 text-xs font-bold flex items-center gap-1.5"
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
                      className="border-black/8 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/8 dark:hover:bg-white/10 text-text rounded-xl h-8 px-3 text-xs font-bold"
                    >
                      Detener
                    </Button>
                  </div>
                </div>
              </div>

              {/* Idle / result states → show activate button */}
              {!isActive && (
                <div className="p-5 flex flex-col gap-4">
                  {/* Status icon area */}
                  <div className="flex flex-col items-center text-center pt-2">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 transition-colors duration-300 ${
                      state === 'success' ? 'bg-emerald-500/15 border border-emerald-500/20' :
                      state === 'already_checked_in' ? 'bg-amber-500/15 border border-amber-500/20' :
                      state === 'error' ? 'bg-red-500/15 border border-red-500/20' :
                      'bg-[#4d7cfe]/10 border border-[#4d7cfe]/20'
                    }`}>
                      <span className={`material-symbols-outlined text-[28px] ${
                        state === 'success' ? 'text-emerald-400' :
                        state === 'already_checked_in' ? 'text-amber-400' :
                        state === 'error' ? 'text-red-400' :
                        'text-[#4d7cfe] animate-pulse'
                      }`}>
                        {state === 'success' ? 'check_circle' :
                         state === 'already_checked_in' ? 'warning' :
                         state === 'error' ? 'error' :
                         'qr_code_scanner'}
                      </span>
                    </div>
                    <h2 className="text-sm font-black text-text mb-0.5">
                      {state === 'idle' ? 'Listo para Escanear' :
                       state === 'success' ? '¡Asistencia Confirmada!' :
                       state === 'already_checked_in' ? 'Ya Estaba Marcado' :
                       state === 'error' ? 'Fallo de Validación' :
                       state === 'manual_selection' ? 'Seleccionar Turno' :
                       'Procesando...'}
                    </h2>
                    <p className="text-[11px] text-text-dim font-inter leading-relaxed">
                      {state === 'idle' ? 'Activa la cámara y apunta al QR.' :
                       state === 'success' ? `${scanResult?.volunteer}` :
                       state === 'already_checked_in' ? `${scanResult?.volunteer}` :
                       state === 'error' ? errorMsg :
                       state === 'manual_selection' ? `${scanResult?.volunteer}` :
                       'Registrando asistencia...'}
                    </p>
                  </div>

                  {/* Primary Action Button */}
                  <Button
                    onClick={
                      state === 'idle' ? startScanning :
                      state === 'error' ? startScanning :
                      state === 'already_checked_in' ? startScanning :
                      state === 'success' ? handleManualReset :
                      startScanning
                    }
                    className={`w-full rounded-[16px] h-12 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg text-white ${
                      state === 'success' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' :
                      state === 'already_checked_in' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' :
                      state === 'error' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' :
                      'bg-[#4d7cfe] hover:bg-[#3b66e0] shadow-blue-500/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {state === 'success' || state === 'already_checked_in' || state === 'error'
                        ? 'qr_code_scanner'
                        : 'photo_camera'}
                    </span>
                    {state === 'success' ? 'Escanear Siguiente' :
                     state === 'already_checked_in' ? 'Escanear Otro' :
                     state === 'error' ? 'Reintentar Escaneo' :
                     'Activar Cámara'}
                  </Button>

                  {/* Secondary cancel for non-idle states */}
                  {(state === 'error' || state === 'already_checked_in') && (
                    <Button
                      variant="outline"
                      onClick={() => { setState('idle'); setScanResult(null); }}
                      className="w-full border-black/8 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/8 dark:hover:bg-white/10 text-text rounded-[16px] h-10 font-bold text-sm"
                    >
                      Volver al inicio
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[20px] border border-black/8 dark:border-white/10 bg-dark2 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2">Esta Sesión</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-4xl font-black text-text leading-none">{sessionCount}</span>
                  <span className="text-xs font-inter font-bold text-text-dim pb-0.5">registros</span>
                </div>
              </div>
              <div className="rounded-[20px] border border-black/8 dark:border-white/10 bg-dark2 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2">Historial</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-4xl font-black text-text leading-none">{history.length}</span>
                  <span className="text-xs font-inter font-bold text-text-dim pb-0.5">escaneos</span>
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

          {/* ── RIGHT: Result card (when active) or Scan History ── */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">

              {/* MANUAL SELECTION */}
              {state === 'manual_selection' && scanResult && (
                <motion.div
                  key="manual_selection"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-[28px] border border-[#4d7cfe]/30 bg-dark2 shadow-lg shadow-[#4d7cfe]/5 overflow-hidden"
                >
                  <div className="p-6 sm:p-8 flex flex-col items-center">
                    <div className="w-16 h-16 bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 rounded-full flex items-center justify-center mb-4 text-[#4d7cfe]">
                      <span className="material-symbols-outlined text-[32px]">checklist</span>
                    </div>
                    <h3 className="text-xl font-black text-text text-center">Seleccionar Turno</h3>
                    <p className="text-base font-bold text-text-dim text-center truncate w-full max-w-[320px] mt-1 mb-2">{scanResult.volunteer}</p>
                    <p className="text-xs text-text-dim text-center mt-1 font-inter mb-6 max-w-xs leading-relaxed">
                      No se encontró un turno activo ahora mismo. Selecciona manualmente qué turno deseas registrar:
                    </p>

                    <div className="w-full max-h-[220px] overflow-y-auto space-y-2 mb-6 pr-1">
                      {scanResult.shifts?.map((s) => (
                        <div key={s.id} className="flex items-center justify-between py-3.5 px-4 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 transition-all">
                          <div className="text-left min-w-0 pr-3">
                            <p className="text-sm font-bold text-text capitalize leading-tight">{s.dayKey} · {s.shiftKey}</p>
                            <p className="text-[11px] text-text-dim font-inter mt-1">{s.timeLabel}</p>
                          </div>
                          {s.checkedIn ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-[9px] py-0.5 px-2 shrink-0">
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
                        className="flex-1 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-text rounded-xl h-11 font-bold text-sm"
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
                  </div>
                </motion.div>
              )}

              {/* SCAN HISTORY TABLE — shown when not in manual_selection */}
              {state !== 'manual_selection' && (
                <motion.div
                  key="history-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Section title row — outside any card */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-text-dim">history</span>
                      <p className="text-sm font-black text-text">Historial de Escaneos</p>
                    </div>
                    {history.length > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-text-dim bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full px-2.5 py-1">
                        {history.length} escaneos
                      </span>
                    )}
                  </div>

                  {/* Table container — matches volunteers page wrapper */}
                  <div className="bg-card border border-black/10 dark:border-white/10 rounded-[20px] overflow-hidden">

                    {/* Empty state */}
                    {history.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                        <div className="w-14 h-14 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full flex items-center justify-center mb-3">
                          <span className="material-symbols-outlined text-[24px] text-text-dim">barcode_reader</span>
                        </div>
                        <p className="text-sm font-bold text-text mb-1">Sin escaneos aún</p>
                        <p className="text-xs text-text-dim font-inter max-w-[220px] leading-relaxed">
                          Los escaneos de esta sesión aparecerán aquí en tiempo real.
                        </p>
                      </div>
                    )}

                    {/* Table */}
                    {history.length > 0 && (
                      <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                        <table className="w-full text-sm text-left border-separate border-spacing-0">
                          <thead className="bg-black/5 dark:bg-white/5 sticky top-0 z-10 backdrop-blur-md text-[10px] font-bold text-text-dim uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3.5 w-px whitespace-nowrap">Estado</th>
                              <th className="px-4 py-3.5">Voluntario</th>
                              <th className="px-4 py-3.5 hidden sm:table-cell whitespace-nowrap">Comité</th>
                              <th className="px-4 py-3.5 hidden md:table-cell whitespace-nowrap">Turno</th>
                              <th className="px-4 py-3.5 text-right whitespace-nowrap">Hora</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {history.map(entry => (
                              <tr
                                key={entry.id}
                                className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group"
                              >
                                {/* Estado */}
                                <td className="px-4 py-3.5 w-px">
                                  <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border whitespace-nowrap ${
                                    entry.type === 'success'
                                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                      : entry.type === 'already_checked_in'
                                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                      : 'bg-red-500/10 text-red-500 border-red-500/20'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      entry.type === 'success' ? 'bg-emerald-500' :
                                      entry.type === 'already_checked_in' ? 'bg-amber-500' :
                                      'bg-red-500'
                                    }`} />
                                    {entry.type === 'success' ? 'Registrado' :
                                     entry.type === 'already_checked_in' ? 'Ya marcado' :
                                     'Error'}
                                  </div>
                                </td>

                                {/* Voluntario */}
                                <td className="px-4 py-3.5">
                                  <p className="font-bold text-[13px] text-text leading-tight truncate max-w-[160px]">
                                    {entry.type === 'error' ? '—' : entry.volunteer}
                                  </p>
                                  {entry.type === 'error' && (
                                    <p className="text-[11px] text-red-500 font-inter truncate max-w-[200px]">
                                      {entry.errorMsg || 'Fallo de validación'}
                                    </p>
                                  )}
                                </td>

                                {/* Comité */}
                                <td className="px-4 py-3.5 hidden sm:table-cell">
                                  <span className="text-[13px] font-inter font-bold text-text-dim">
                                    {entry.type === 'error' ? '—' : entry.committee}
                                  </span>
                                </td>

                                {/* Turno */}
                                <td className="px-4 py-3.5 hidden md:table-cell">
                                  <span className="text-[12px] font-inter font-bold text-text-dim uppercase">
                                    {entry.shiftDetail || '—'}
                                  </span>
                                </td>

                                {/* Hora */}
                                <td className="px-4 py-3.5 text-right">
                                  <span className="text-[12px] font-bold text-text-dim tabular-nums">
                                    {entry.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}
