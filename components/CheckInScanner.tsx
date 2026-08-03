'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { checkInVolunteer, getHistoricalAttendanceLogs } from "@/app/actions/attendance";
import { canQrCheckin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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



function getInitials(name: string): string {
  if (!name || name === '—') return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function formatDateLabel(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Hoy, ${timeStr}`;
  const dayStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${dayStr}, ${timeStr}`;
}

export function CheckInScanner({
  coordinatorId,
  coordinatorName,
  role,
  committeeName
}: CheckInScannerProps) {
  const [state, setState] = useState<ScannerState>('idle');
  const [mainView, setMainView] = useState<'scanner' | 'history'>('scanner');
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

  // Load persistent scan history from localStorage on component mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("volunteer_manager_scan_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        setHistory(parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        })));
      }
    } catch (e) {
      console.error("Error restoring scan history:", e);
    }
  }, []);

  // Update history state and sync to localStorage
  const updateHistory = (updater: (prev: ScanEntry[]) => ScanEntry[]) => {
    setHistory(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem("volunteer_manager_scan_history", JSON.stringify(next.slice(0, 50)));
      } catch (e) {
        console.error("Error saving scan history:", e);
      }
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("volunteer_manager_scan_history");
    } catch (e) {}
  };

  const [historyTab, setHistoryTab] = useState<'session' | 'db'>('session');
  const [dbHistory, setDbHistory] = useState<ScanEntry[]>([]);
  const [loadingDbHistory, setLoadingDbHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState("all");

  const fetchDbHistory = useCallback(async () => {
    setLoadingDbHistory(true);
    try {
      const logs = await getHistoricalAttendanceLogs(150);
      setDbHistory(logs.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      })));
    } catch (e) {
      console.error("Error fetching db history", e);
    } finally {
      setLoadingDbHistory(false);
    }
  }, []);

  useEffect(() => {
    if (historyTab === 'db') {
      fetchDbHistory();
    }
  }, [historyTab, fetchDbHistory]);

  const activeRawList = historyTab === 'session' ? history : dbHistory;

  const filteredList = useMemo(() => {
    return activeRawList.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.volunteer.toLowerCase().includes(q);
        const matchComm = item.committee.toLowerCase().includes(q);
        const matchShift = (item.shiftDetail || '').toLowerCase().includes(q);
        if (!matchName && !matchComm && !matchShift) return false;
      }
      if (selectedDayFilter !== 'all') {
        const dayPart = item.shiftDetail ? item.shiftDetail.split(' - ')[0].trim().toLowerCase() : '';
        if (dayPart !== selectedDayFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [activeRawList, searchQuery, selectedDayFilter]);

  const uniqueDays = useMemo(() => {
    const daysSet = new Set<string>();
    activeRawList.forEach(item => {
      if (item.shiftDetail) {
        const dayPart = item.shiftDetail.split(' - ')[0].trim();
        if (dayPart) daysSet.add(dayPart);
      }
    });
    return Array.from(daysSet);
  }, [activeRawList]);

  const groupedShifts = useMemo(() => {
    if (!scanResult?.shifts) return {};
    const groups: Record<string, any[]> = {};
    scanResult.shifts.forEach((s: any) => {
      if (!groups[s.dayKey]) groups[s.dayKey] = [];
      groups[s.dayKey].push(s);
    });
    return groups;
  }, [scanResult?.shifts]);

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
        updateHistory(prev => [{
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
        updateHistory(prev => [entry, ...prev]);
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
        updateHistory(prev => [entry, ...prev]);
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
        updateHistory(prev => [entry, ...prev]);
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

  const [permTick, setPermTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handlePermissionsChange = () => setPermTick(v => v + 1);
    window.addEventListener("storage", handlePermissionsChange);
    window.addEventListener("permissions-changed", handlePermissionsChange);
    return () => {
      window.removeEventListener("storage", handlePermissionsChange);
      window.removeEventListener("permissions-changed", handlePermissionsChange);
    };
  }, []);

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

  if (mounted && !canQrCheckin()) {
    return (
      <div className="w-full min-h-[65vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Acceso Restringido a Escáner QR</h2>
        <p className="text-xs text-text-dim max-w-md leading-relaxed">
          El Administrador ha deshabilitado la función de Escanear QR para este rol. Si necesitas acceso, contacta a un Administrador para habilitar esta política en Ajustes.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full pb-32 lg:pb-12 flex flex-col min-h-full">

      {/* ── Page Header ── */}
      <div className="sticky top-0 z-40 bg-dark/80 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 mb-6 shrink-0 border-b border-black/5 dark:border-white/5">
        <div className="w-full flex items-center justify-between max-w-5xl mx-auto gap-3">
          <h1 className="text-[24px] sm:text-[32px] font-black text-text tracking-tight">
            Escanear
          </h1>
          {/* Toggle View: Escanear vs Historial (Estilo idéntico a Turnos, sin íconos) */}
          <div className="flex bg-gray-200 dark:bg-dark3 rounded-full p-1 border border-black/5 dark:border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setMainView('scanner')}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs transition-all font-inter cursor-pointer",
                mainView === 'scanner'
                  ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                  : "text-text-dim hover:text-text font-bold"
              )}
            >
              Escanear
            </button>
            <button
              type="button"
              onClick={() => {
                setMainView('history');
                if (dbHistory.length === 0) fetchDbHistory();
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs transition-all font-inter cursor-pointer",
                mainView === 'history'
                  ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                  : "text-text-dim hover:text-text font-bold"
              )}
            >
              Ver Historial
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ── LEFT: Camera Card + Meta (Shown in scanner mode) ── */}
          {mainView === 'scanner' && (
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
        )}

        {/* ── RIGHT / FULL-WIDTH: Result card or Scan History ── */}
        <div className={cn("w-full", (state === 'manual_selection' || mainView === 'history') ? 'lg:col-span-5' : 'lg:col-span-3')}>
            <AnimatePresence mode="wait">

              {/* MANUAL SHIFT SELECTION VIEW (REDESIGNED) */}
              {state === 'manual_selection' && scanResult && (
                <motion.div
                  key="manual_selection"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full bg-card border border-black/10 dark:border-white/10 rounded-[28px] p-5 sm:p-7 shadow-xl space-y-6"
                >
                  {/* Header Banner */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-black/8 dark:border-white/8">
                    <div className="flex items-center gap-3.5">
                      <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#4d7cfe]/15 text-[#4d7cfe] font-black text-base sm:text-lg flex items-center justify-center shrink-0 border border-[#4d7cfe]/20 shadow-sm">
                        {getInitials(scanResult.volunteer)}
                      </div>
                      <div>
                        <h2 className="text-lg sm:text-2xl font-black text-text tracking-tight leading-tight">
                          {scanResult.volunteer}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-xs font-bold text-text-dim bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/8 rounded-full px-2.5 py-0.5">
                            {scanResult.committee}
                          </span>
                          <span className="text-xs font-bold text-[#4d7cfe]">
                            {scanResult.shifts?.length || 0} turnos programados
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                      <Button
                        variant="outline"
                        onClick={() => { setState('idle'); setScanResult(null); }}
                        className="flex-1 sm:flex-initial border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 text-text rounded-xl h-10 font-bold text-xs"
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={startScanning}
                        className="flex-1 sm:flex-initial bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl h-10 font-bold text-xs shadow-md shadow-blue-500/20"
                      >
                        Volver a Escanear
                      </Button>
                    </div>
                  </div>

                  {/* Info Notice */}
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-medium">
                    <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
                    <span>
                      No se detectó un turno activo en este horario. Selecciona manualmente qué turno deseas registrar para este voluntario:
                    </span>
                  </div>

                  {/* Shift Groups */}
                  <div className="space-y-5 max-h-[550px] overflow-y-auto pr-1">
                    {Object.entries(groupedShifts).map(([dayKey, dayShifts]) => (
                      <div key={dayKey} className="space-y-2.5">
                        {/* Day Section Header */}
                        <div className="flex items-center gap-2 pt-1 border-b border-black/5 dark:border-white/5 pb-1">
                          <span className="material-symbols-outlined text-[16px] text-[#4d7cfe]">calendar_today</span>
                          <span className="text-xs font-black text-text uppercase tracking-wider capitalize">
                            {dayKey}
                          </span>
                        </div>

                        {/* Shift Grid (1 col on mobile, 2 cols on PC) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {dayShifts.map((s) => (
                            <div
                              key={s.id}
                              className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                s.checkedIn
                                  ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                                  : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/8 dark:border-white/10 hover:border-[#4d7cfe]/40 hover:bg-[#4d7cfe]/[0.02]'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-black text-sm text-text uppercase">
                                    {s.shiftKey}
                                  </span>
                                  <span className="text-xs text-text-dim font-bold truncate">
                                    • {s.timeLabel}
                                  </span>
                                </div>
                                <p className="text-[11px] font-medium text-text-dim mt-0.5 capitalize">
                                  {s.dayKey}
                                </p>
                              </div>

                              {s.checkedIn ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Asistió
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleManualCheckIn(s.id)}
                                  className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white h-9 px-4 text-xs font-bold rounded-xl shadow-md shadow-blue-500/15 shrink-0 transition-transform active:scale-95 cursor-pointer"
                                >
                                  Marcar Asistencia
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* SCAN HISTORY SECTION — shown when not in manual_selection */}
              {state !== 'manual_selection' && (
                <motion.div
                  key="history-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* Section Title + Main Tabs */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#4d7cfe]">history</span>
                      <h3 className="text-base font-black text-text tracking-tight">Historial de Escaneos</h3>
                    </div>

                    {/* Mode Tabs (Estilo Turnos, sin íconos) */}
                    <div className="flex bg-gray-200 dark:bg-dark3 rounded-full p-1 border border-black/5 dark:border-white/10 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setHistoryTab('session')}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-[10px] sm:text-xs transition-all font-inter cursor-pointer",
                          historyTab === 'session'
                            ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                            : "text-text-dim hover:text-text font-bold"
                        )}
                      >
                        Esta Sesión ({history.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryTab('db')}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-[10px] sm:text-xs transition-all font-inter cursor-pointer",
                          historyTab === 'db'
                            ? "bg-white text-black shadow-sm dark:bg-white dark:text-black font-extrabold"
                            : "text-text-dim hover:text-text font-bold"
                        )}
                      >
                        Días Anteriores ({dbHistory.length})
                      </button>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-1">
                    {/* Search Input */}
                    <div className="sm:col-span-7 relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-dim pointer-events-none">
                        search
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar por voluntario, comité o turno..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-text placeholder:text-text-dim focus:outline-none focus:border-[#4d7cfe]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text p-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      )}
                    </div>

                    {/* Day Filter */}
                    <div className="sm:col-span-5 flex gap-2">
                      <select
                        value={selectedDayFilter}
                        onChange={(e) => setSelectedDayFilter(e.target.value)}
                        className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-[#4d7cfe] capitalize"
                      >
                        <option value="all">Todos los días</option>
                        {uniqueDays.map(day => (
                          <option key={day} value={day} className="bg-dark text-text capitalize">
                            {day}
                          </option>
                        ))}
                      </select>

                      {historyTab === 'session' && history.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearHistory}
                          className="border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20 h-9 text-xs font-bold shrink-0 rounded-xl"
                          title="Limpiar historial local"
                        >
                          Limpiar
                        </Button>
                      )}

                      {historyTab === 'db' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchDbHistory}
                          disabled={loadingDbHistory}
                          className="border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 h-9 text-xs font-bold shrink-0 rounded-xl"
                          title="Actualizar registros de la base de datos"
                        >
                          <span className={`material-symbols-outlined text-[14px] ${loadingDbHistory ? 'animate-spin' : ''}`}>
                            refresh
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Main History Content Container */}
                  <div className="bg-card border border-black/10 dark:border-white/10 rounded-[24px] overflow-hidden p-3 sm:p-0">

                    {/* Loading State for DB tab */}
                    {historyTab === 'db' && loadingDbHistory && (
                      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                        <div className="w-10 h-10 border-2 border-[#4d7cfe] border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-xs font-bold text-text-dim">Cargando registros históricos...</p>
                      </div>
                    )}

                    {/* Empty state */}
                    {(!loadingDbHistory && filteredList.length === 0) && (
                      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                        <div className="w-14 h-14 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full flex items-center justify-center mb-3">
                          <span className="material-symbols-outlined text-[24px] text-text-dim">barcode_reader</span>
                        </div>
                        <p className="text-sm font-bold text-text mb-1">
                          {searchQuery || selectedDayFilter !== 'all' ? 'Sin coincidencias' : 'Sin escaneos registrados'}
                        </p>
                        <p className="text-xs text-text-dim font-inter max-w-[240px] leading-relaxed">
                          {historyTab === 'session'
                            ? 'Los escaneos que realices en esta sesión se irán guardando aquí.'
                            : 'No se encontraron asistencias en los días seleccionados.'}
                        </p>
                      </div>
                    )}

                    {/* LIST VIEW ON MOBILE (< sm) */}
                    {(!loadingDbHistory && filteredList.length > 0) && (
                      <div className="block sm:hidden space-y-2.5 max-h-[500px] overflow-y-auto pr-0.5">
                        {filteredList.map(entry => (
                          <div
                            key={entry.id}
                            className="p-3.5 rounded-[18px] bg-black/[0.02] dark:bg-white/[0.02] border border-black/8 dark:border-white/8 hover:border-[#4d7cfe]/30 transition-all flex flex-col gap-2.5"
                          >
                            {/* Top row: Avatar + Name + Status */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-[#4d7cfe]/15 text-[#4d7cfe] font-black text-xs flex items-center justify-center shrink-0 border border-[#4d7cfe]/20">
                                  {getInitials(entry.volunteer)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-extrabold text-[13px] text-text leading-tight truncate">
                                    {entry.type === 'error' ? '—' : entry.volunteer}
                                  </p>
                                  <p className="text-[11px] font-bold text-text-dim leading-tight truncate">
                                    {entry.type === 'error' ? (entry.errorMsg || 'Fallo de validación') : entry.committee}
                                  </p>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${
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
                            </div>

                            {/* Bottom row: Shift Detail + Timestamp */}
                            <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5 text-[11px] text-text-dim">
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px] text-[#4d7cfe]">event_available</span>
                                <span className="font-bold text-text uppercase text-[10px] tracking-wide">
                                  {entry.shiftDetail || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 font-mono text-[10px] text-text-dim font-bold">
                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                {formatDateLabel(entry.timestamp)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* TABLE VIEW ON DESKTOP (>= sm) */}
                    {(!loadingDbHistory && filteredList.length > 0) && (
                      <div className="hidden sm:block overflow-x-auto max-h-[480px] overflow-y-auto">
                        <table className="w-full text-sm text-left border-separate border-spacing-0">
                          <thead className="bg-black/5 dark:bg-white/5 sticky top-0 z-10 backdrop-blur-md text-[10px] font-bold text-text-dim uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3.5 w-px whitespace-nowrap">Estado</th>
                              <th className="px-4 py-3.5">Voluntario</th>
                              <th className="px-4 py-3.5">Comité</th>
                              <th className="px-4 py-3.5">Turno</th>
                              <th className="px-4 py-3.5 text-right whitespace-nowrap">Fecha / Hora</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {filteredList.map(entry => (
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
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-[#4d7cfe]/15 text-[#4d7cfe] font-bold text-[10px] flex items-center justify-center shrink-0 border border-[#4d7cfe]/20">
                                      {getInitials(entry.volunteer)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-[13px] text-text leading-tight truncate">
                                        {entry.type === 'error' ? '—' : entry.volunteer}
                                      </p>
                                      {entry.type === 'error' && (
                                        <p className="text-[11px] text-red-500 font-inter truncate">
                                          {entry.errorMsg || 'Fallo de validación'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Comité */}
                                <td className="px-4 py-3.5">
                                  <span className="text-[12px] font-inter font-bold text-text-dim">
                                    {entry.type === 'error' ? '—' : entry.committee}
                                  </span>
                                </td>

                                {/* Turno */}
                                <td className="px-4 py-3.5">
                                  <span className="text-[11px] font-bold text-text uppercase tracking-wider bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/8 rounded-lg px-2 py-1">
                                    {entry.shiftDetail || '—'}
                                  </span>
                                </td>

                                {/* Hora */}
                                <td className="px-4 py-3.5 text-right">
                                  <span className="text-[11px] font-bold text-text-dim tabular-nums">
                                    {formatDateLabel(entry.timestamp)}
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
