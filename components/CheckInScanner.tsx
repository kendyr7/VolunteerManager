'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { checkInVolunteer, getHistoricalAttendanceLogs, checkOutVolunteer, reassignVolunteerShift } from "@/app/actions/attendance";
import { canQrCheckin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getActiveEventDays, formatDateShort } from "@/lib/dates";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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
  dayKey?: string;
  shiftKey?: string;
  timestamp: Date;
  type: 'success' | 'already_checked_in' | 'error';
  errorMsg?: string;
  isCompleted?: boolean;
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

function formatSimplifiedTime(label: string): string {
  if (!label) return '';
  return label
    .replace('8:00 AM - 12:00 PM', '8-12 AM')
    .replace('11:00 AM - 3:00 PM', '11 AM-3 PM')
    .replace('2:00 PM - 6:00 PM', '2-6 PM')
    .replace('5:00 PM - 10:00 PM', '5-10 PM')
    .replace('5:00 PM - 9:00 PM', '5-9 PM')
    .replace(':00', '');
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

  const [expandedHistoryDays, setExpandedHistoryDays] = useState<Record<string, boolean>>({});
  const [mobileDrawerDayGroup, setMobileDrawerDayGroup] = useState<{
    dayKey: string;
    totalCount: number;
    shifts: { T1: ScanEntry[]; T2: ScanEntry[]; T3: ScanEntry[]; T4: ScanEntry[] };
  } | null>(null);

  const toggleHistoryDay = (dayKey: string) => {
    setExpandedHistoryDays(prev => ({
      ...prev,
      [dayKey]: prev[dayKey] === undefined ? false : !prev[dayKey]
    }));
  };

  const handleDayCardClick = (dayGroup: {
    dayKey: string;
    totalCount: number;
    shifts: { T1: ScanEntry[]; T2: ScanEntry[]; T3: ScanEntry[]; T4: ScanEntry[] };
  }) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileDrawerDayGroup(dayGroup);
    } else {
      toggleHistoryDay(dayGroup.dayKey);
    }
  };

  const groupedHistoryDays = useMemo(() => {
    const map: Record<string, {
      dayKey: string;
      totalCount: number;
      shifts: { T1: ScanEntry[]; T2: ScanEntry[]; T3: ScanEntry[]; T4: ScanEntry[] };
    }> = {};

    filteredList.forEach(entry => {
      let day = entry.dayKey;
      let shift = entry.shiftKey;

      if (!day || !shift) {
        if (entry.shiftDetail) {
          const parts = entry.shiftDetail.split(' - ');
          if (parts.length >= 2) {
            day = day || parts[0].trim();
            shift = shift || parts[1].trim();
          }
        }
      }

      day = day || 'Sin fecha';
      shift = shift || 'T1';

      if (!map[day]) {
        map[day] = {
          dayKey: day,
          totalCount: 0,
          shifts: { T1: [], T2: [], T3: [], T4: [] }
        };
      }

      map[day].totalCount += 1;
      const validShiftKey = (['T1', 'T2', 'T3', 'T4'].includes(shift) ? shift : 'T1') as 'T1' | 'T2' | 'T3' | 'T4';
      map[day].shifts[validShiftKey].push(entry);
    });

    return Object.values(map);
  }, [filteredList]);

  const groupedShifts = useMemo(() => {
    if (!scanResult?.shifts) return {};
    const groups: Record<string, any[]> = {};
    scanResult.shifts.forEach((s: any) => {
      if (!groups[s.dayKey]) groups[s.dayKey] = [];
      groups[s.dayKey].push(s);
    });
    return groups;
  }, [scanResult?.shifts]);

  const EVENT_DAYS_RAW = useMemo(() => getActiveEventDays(), []);
  const EVENT_DAYS = useMemo(() => EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  })), [EVENT_DAYS_RAW]);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const autoResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activeTimeTooltipId, setActiveTimeTooltipId] = useState<string | null>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleTimeTooltip = (shiftId: string) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    if (activeTimeTooltipId === shiftId) {
      setActiveTimeTooltipId(null);
    } else {
      setActiveTimeTooltipId(shiftId);
      tooltipTimeoutRef.current = setTimeout(() => {
        setActiveTimeTooltipId(null);
      }, 3000);
    }
  };

  // Reassign & Checkout state and handlers
  const [reassignTarget, setReassignTarget] = useState<{
    shiftId: string;
    volunteerName: string;
    committee?: string;
    dayKey: string;
    shiftKey: string;
  } | null>(null);
  const [reassignDayKey, setReassignDayKey] = useState<string>("");
  const [reassignShiftKey, setReassignShiftKey] = useState<string>("T1");
  const [isReassigning, setIsReassigning] = useState<boolean>(false);
  const [reassignSuccessMsg, setReassignSuccessMsg] = useState<string | null>(null);

  const handleOpenReassignModal = (shiftId: string, dayKey: string, shiftKey: string) => {
    setReassignTarget({
      shiftId,
      volunteerName: scanResult?.volunteer || 'Voluntario',
      committee: scanResult?.committee,
      dayKey,
      shiftKey
    });
    setReassignDayKey(dayKey);
    setReassignShiftKey(shiftKey);
    setReassignSuccessMsg(null);
  };

  const handleConfirmReassign = async () => {
    if (!reassignTarget || !reassignDayKey || !reassignShiftKey) return;
    setIsReassigning(true);

    const res = await reassignVolunteerShift(reassignTarget.shiftId, reassignDayKey, reassignShiftKey);
    setIsReassigning(false);

    if (res.error) {
      alert("Error al reasignar turno: " + res.error);
      return;
    }

    if (scanResult && scanResult.shifts) {
      const updatedShifts = scanResult.shifts.map((s: any) => {
        if (s.id === reassignTarget.shiftId) {
          let timeLabel = "8-12 AM";
          if (reassignShiftKey === 'T2') timeLabel = "11 AM-3 PM";
          if (reassignShiftKey === 'T3') timeLabel = "2-6 PM";
          if (reassignShiftKey === 'T4') timeLabel = "5-10 PM";

          return {
            ...s,
            dayKey: reassignDayKey,
            shiftKey: reassignShiftKey,
            timeLabel
          };
        }
        return s;
      });

      setScanResult({
        ...scanResult,
        shifts: updatedShifts
      });
    }

    const newShiftDetail = `${reassignDayKey} - ${reassignShiftKey}`;
    setHistory(prev => prev.map(item => item.id === reassignTarget.shiftId ? { ...item, shiftDetail: newShiftDetail, dayKey: reassignDayKey, shiftKey: reassignShiftKey } : item));
    setDbHistory(prev => prev.map(item => item.id === reassignTarget.shiftId ? { ...item, shiftDetail: newShiftDetail, dayKey: reassignDayKey, shiftKey: reassignShiftKey } : item));

    setReassignSuccessMsg(`Turno reasignado exitosamente a ${reassignShiftKey} (${reassignDayKey})`);
    setTimeout(() => {
      setReassignTarget(null);
      setReassignSuccessMsg(null);
    }, 1200);
  };

  const handleHistoryOpenReassign = (entry: ScanEntry) => {
    const day = entry.dayKey || (entry.shiftDetail ? entry.shiftDetail.split(' - ')[0].trim() : 'jue 10');
    const shift = entry.shiftKey || (entry.shiftDetail ? entry.shiftDetail.split(' - ')[1].trim() : 'T1');
    setReassignTarget({
      shiftId: entry.id,
      volunteerName: entry.volunteer,
      committee: entry.committee,
      dayKey: day,
      shiftKey: shift
    });
    setReassignDayKey(day);
    setReassignShiftKey(shift);
    setReassignSuccessMsg(null);
  };

  const handleHistoryMarkCompleted = async (entry: ScanEntry) => {
    playSuccessBeep();
    setHistory(prev => prev.map(item => item.id === entry.id ? { ...item, isCompleted: true } : item));
    setDbHistory(prev => prev.map(item => item.id === entry.id ? { ...item, isCompleted: true } : item));

    if (mobileDrawerDayGroup) {
      setMobileDrawerDayGroup(prev => {
        if (!prev) return null;
        const updatedShifts = { ...prev.shifts };
        (Object.keys(updatedShifts) as (keyof typeof updatedShifts)[]).forEach(k => {
          updatedShifts[k] = updatedShifts[k].map(item => item.id === entry.id ? { ...item, isCompleted: true } : item);
        });
        return { ...prev, shifts: updatedShifts };
      });
    }

    await checkOutVolunteer(entry.id);
  };

  const handleMarkCompleted = async (shiftId: string) => {
    const res = await checkOutVolunteer(shiftId);
    if (res.success) {
      playSuccessBeep();
      if (scanResult && scanResult.shifts) {
        const updatedShifts = scanResult.shifts.map((s: any) => {
          if (s.id === shiftId) {
            return {
              ...s,
              checkedIn: true,
              checkedOut: true
            };
          }
          return s;
        });

        setScanResult({
          ...scanResult,
          shifts: updatedShifts
        });
      }
    }
  };

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
        <div className={cn("w-full flex items-center justify-between mx-auto gap-3 transition-all duration-300", state === 'manual_selection' || mainView === 'history' ? 'w-full max-w-full' : 'max-w-7xl')}>
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
      <div className={cn("flex-1 px-3 sm:px-6 lg:px-8 w-full mx-auto transition-all duration-300", state === 'manual_selection' || mainView === 'history' ? 'w-full max-w-full' : 'max-w-7xl')}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ── LEFT: Camera Card + Meta (Shown in scanner mode ONLY when not selecting shifts) ── */}
          {mainView === 'scanner' && state !== 'manual_selection' && (
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
                       'Procesando...'}
                    </h2>
                    <p className="text-[11px] text-text-dim font-inter leading-relaxed">
                      {state === 'idle' ? 'Activa la cámara y apunta al QR.' :
                       state === 'success' ? `${scanResult?.volunteer}` :
                       state === 'already_checked_in' ? `${scanResult?.volunteer}` :
                       state === 'error' ? errorMsg :
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
        <div className={cn("w-full", ((mainView === 'scanner' && state === 'manual_selection') || mainView === 'history') ? 'lg:col-span-5' : 'lg:col-span-3')}>
            <AnimatePresence mode="wait">

              {/* MANUAL SHIFT SELECTION VIEW (when mainView is scanner and state is manual_selection) */}
              {mainView === 'scanner' && state === 'manual_selection' && scanResult && (
                <motion.div
                  key="manual_selection"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full space-y-6"
                >
                  {/* Volunteer Header Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-black/8 dark:border-white/8">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-inter font-bold text-[#4d7cfe] bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 rounded-full px-3 py-0.5 shadow-sm">
                          {scanResult.committee}
                        </span>
                        <span className="text-xs font-inter font-bold text-text-dim">
                          {scanResult.shifts?.length || 0} turnos asignados
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-text tracking-tight">
                        {scanResult.volunteer}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2.5 self-stretch sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => { setState('idle'); setScanResult(null); }}
                        className="h-9 px-4 bg-dark3 hover:bg-dark2 text-text-dim hover:text-text border border-border rounded-full text-xs font-bold font-inter transition-all flex items-center justify-center active:scale-95 cursor-pointer flex-1 sm:flex-initial"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={startScanning}
                        className="h-9 px-4 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-md shadow-blue-500/20 flex-1 sm:flex-initial"
                      >
                        <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                        <span>Volver a Escanear</span>
                      </button>
                    </div>
                  </div>

                  {/* Notice Banner */}
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-600 dark:text-amber-300 text-xs font-inter font-medium">
                    <span className="material-symbols-outlined text-[18px] shrink-0 text-amber-500">info</span>
                    <span>
                      No hay un turno activo en este horario exacto. Selecciona manualmente qué turno deseas marcar para este voluntario:
                    </span>
                  </div>

                  {/* Day Cards List (Matching Turnos Cronograma Layout) */}
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {Object.entries(groupedShifts).map(([dayKey, dayShifts]) => (
                      <div key={dayKey} className="bg-dark3 border border-border rounded-[20px] shadow-sm overflow-hidden flex flex-col">
                        {/* Day Header */}
                        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-black/5 dark:bg-white/5">
                          <span className="material-symbols-outlined text-[18px] text-[#4d7cfe]">calendar_today</span>
                          <span className="font-inter font-extrabold text-sm text-text capitalize">
                            {dayKey}
                          </span>
                        </div>

                        {/* Shifts List inside Day */}
                        <div className="divide-y divide-border">
                          {dayShifts.map((s) => (
                            <div
                              key={s.id}
                              className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Interactive Shift Badge (Click/Tap to view time range) */}
                                <button
                                  type="button"
                                  onClick={() => toggleTimeTooltip(s.id)}
                                  className="px-3.5 py-1.5 rounded-full text-xs font-black font-inter bg-[#4d7cfe]/15 hover:bg-[#4d7cfe]/25 text-[#4d7cfe] border border-[#4d7cfe]/30 shrink-0 transition-transform active:scale-95 cursor-pointer"
                                  title="Toca para ver el horario"
                                >
                                  {s.shiftKey}
                                </button>

                                {/* Auto-hiding Time Tooltip / Popup */}
                                {activeTimeTooltipId === s.id && (
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="text-xs font-inter font-bold text-[#4d7cfe] bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 px-2.5 py-1 rounded-full shrink-0 shadow-sm"
                                  >
                                    {formatSimplifiedTime(s.timeLabel)}
                                  </motion.span>
                                )}
                              </div>

                              {/* Action Buttons: Marcar Asistencia / Completado + Reasignar */}
                              <div className="flex items-center gap-2 shrink-0">
                                {s.checkedIn ? (
                                  <div className="flex items-center gap-2">
                                    <span className="h-9 px-3.5 rounded-full text-xs font-inter font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1.5 shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      En turno
                                    </span>
                                    {!s.checkedOut ? (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkCompleted(s.id)}
                                        className="h-9 px-3.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border border-emerald-500/30 rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                        title="Marcar turno como completado"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                                        <span>Completar</span>
                                      </button>
                                    ) : (
                                      <span className="h-9 px-3 rounded-full text-xs font-inter font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30 flex items-center gap-1">
                                        ✓ Completado
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleManualCheckIn(s.id)}
                                    className="h-9 px-4 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-md shadow-blue-500/20 shrink-0"
                                  >
                                    <span>Marcar Asistencia</span>
                                  </button>
                                )}

                                {/* Reasignar Turno Button */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenReassignModal(s.id, s.dayKey, s.shiftKey)}
                                  className="h-9 px-3.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-500 dark:text-purple-400 border border-purple-500/30 rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0 shadow-sm"
                                  title="Reasignar este turno"
                                >
                                  <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                                  <span className="hidden sm:inline">Reasignar</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* SCAN HISTORY SECTION (ONLY when mainView is 'history') */}
              {mainView === 'history' && (
                <motion.div
                  key="history-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full space-y-5"
                >
                  {/* Sleek Line Tabs (Option 1: Distinct from main pill toggle) */}
                  <div className="flex items-center gap-6 border-b border-border/60 pb-2">
                    <button
                      type="button"
                      onClick={() => setHistoryTab('session')}
                      className={cn(
                        "relative pb-2.5 text-xs font-inter transition-all cursor-pointer flex items-center gap-2",
                        historyTab === 'session'
                          ? "text-[#4d7cfe] font-black"
                          : "text-text-dim hover:text-text font-bold"
                      )}
                    >
                      <span>Esta Sesión</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold font-inter leading-none",
                        historyTab === 'session'
                          ? "bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30"
                          : "bg-white/5 text-text-dim border border-border/40"
                      )}>
                        {history.length}
                      </span>
                      {historyTab === 'session' && (
                        <motion.div
                          layoutId="activeHistoryTabLine"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4d7cfe] rounded-full"
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setHistoryTab('db')}
                      className={cn(
                        "relative pb-2.5 text-xs font-inter transition-all cursor-pointer flex items-center gap-2",
                        historyTab === 'db'
                          ? "text-[#4d7cfe] font-black"
                          : "text-text-dim hover:text-text font-bold"
                      )}
                    >
                      <span>Días Anteriores</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold font-inter leading-none",
                        historyTab === 'db'
                          ? "bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30"
                          : "bg-white/5 text-text-dim border border-border/40"
                      )}>
                        {dbHistory.length}
                      </span>
                      {historyTab === 'db' && (
                        <motion.div
                          layoutId="activeHistoryTabLine"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4d7cfe] rounded-full"
                        />
                      )}
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="flex gap-2 w-full">
                    <div className="flex-1 relative flex items-center">
                      <span className="material-symbols-outlined absolute left-4 text-[18px] text-text-dim pointer-events-none">
                        search
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar por voluntario, comité o turno..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/5 dark:bg-[#fff6] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/70 rounded-full pl-11 pr-10 py-2.5 text-xs font-bold font-inter focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 h-[44px]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 text-text-dim hover:text-text p-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      )}
                    </div>

                    {historyTab === 'db' && (
                      <button
                        type="button"
                        onClick={fetchDbHistory}
                        disabled={loadingDbHistory}
                        className="h-[44px] px-4 bg-dark3 hover:bg-dark2 text-text border border-border rounded-full text-xs font-bold font-inter transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
                        title="Actualizar registros de la base de datos"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${loadingDbHistory ? 'animate-spin' : ''}`}>
                          refresh
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Main History Content Container: Grouped by Day Cards (Matching /shifts) */}
                  <div className="space-y-4">

                    {/* Loading State for DB tab */}
                    {historyTab === 'db' && loadingDbHistory && (
                      <div className="bg-dark3 border border-border rounded-[20px] p-12 text-center flex flex-col items-center justify-center">
                        <div className="w-10 h-10 border-2 border-[#4d7cfe] border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-xs font-bold font-inter text-text-dim">Cargando registros históricos...</p>
                      </div>
                    )}

                    {/* Empty state */}
                    {(!loadingDbHistory && filteredList.length === 0) && (
                      <div className="bg-dark3 border border-border rounded-[20px] p-12 text-center flex flex-col items-center justify-center">
                        <div className="w-14 h-14 bg-black/5 dark:bg-white/5 border border-border rounded-full flex items-center justify-center mb-3">
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

                    {/* ACCORDION CARDS BY DAY (Matching /shifts page structure) */}
                    {(!loadingDbHistory && filteredList.length > 0) && (
                      <div className="space-y-4">
                        {groupedHistoryDays.map(dayGroup => {
                          const isDayExpanded = !!expandedHistoryDays[dayGroup.dayKey];
                          const dayIndex = EVENT_DAYS.findIndex(d => d.key.toLowerCase() === dayGroup.dayKey.toLowerCase());
                          const bgColors = [
                            'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                            'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                          ];
                          const cardBg = bgColors[(dayIndex >= 0 ? dayIndex : 0) % bgColors.length];

                          return (
                            <div key={dayGroup.dayKey} className="rounded-[20px] shadow-sm w-full bg-dark2 border border-border overflow-hidden flex flex-col">
                              {/* Day Card Header with Left Stripe */}
                              <div className="flex w-full">
                                <div className={`w-3 shrink-0 ${cardBg} opacity-90`} />
                                <button
                                  type="button"
                                  onClick={() => handleDayCardClick(dayGroup)}
                                  className="flex-1 flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/5 cursor-pointer min-w-0"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <p className="font-inter font-bold text-text text-base capitalize truncate">
                                      {dayGroup.dayKey}
                                    </p>
                                    <span className="text-xs font-bold font-inter text-[#4d7cfe] bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 px-2.5 py-0.5 rounded-full shrink-0">
                                      {dayGroup.totalCount}
                                    </span>
                                    <span className={cn("material-symbols-outlined text-[20px] text-text-dim transition-transform duration-300 ml-1 hidden md:inline-block", isDayExpanded && "rotate-180 text-primary")}>
                                      expand_more
                                    </span>
                                  </div>

                                  {/* Right: T1 T2 T3 T4 Count Indicators */}
                                  <div className="flex items-center shrink-0 ml-auto border-l border-border pl-3 gap-2 sm:gap-4">
                                    {(['T1', 'T2', 'T3', 'T4'] as const).map((t, i) => {
                                      const count = dayGroup.shifts[t].length;
                                      return (
                                        <div key={t} className={`flex flex-col items-center justify-center w-8 sm:w-12 ${i !== 0 ? 'border-l border-border/50 pl-2 sm:pl-4' : ''}`}>
                                          <span className={`text-sm sm:text-base font-extrabold leading-none ${count > 0 ? 'text-[#4d7cfe]' : 'text-text-dim'}`}>
                                            {count}
                                          </span>
                                          <span className="font-inter text-[9px] uppercase mt-1 tracking-widest text-text-dim font-bold">
                                            {t}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </button>
                              </div>

                              {/* Expanded Turnos Grid for Desktop (Desktop only, Mobile uses Bottom Sheet Drawer) */}
                              <div className="hidden md:block">
                                <AnimatePresence initial={false}>
                                  {isDayExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="border-t border-border/50 bg-dark3/40 p-4 sm:p-5 space-y-4"
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {(['T1', 'T2', 'T3', 'T4'] as const).map((t) => {
                                          const items = dayGroup.shifts[t];
                                          const timeInfo = t === 'T1' ? '8:00 AM - 12:00 PM' : t === 'T2' ? '11:00 AM - 3:00 PM' : t === 'T3' ? '2:00 PM - 6:00 PM' : '5:00 PM - 10:00 PM';

                                          return (
                                            <div key={t} className="rounded-sm border border-border/60 p-3.5 bg-dark2 space-y-2">
                                              {/* Turno Header matching /shifts line for line */}
                                              <div className="flex items-start justify-between mb-3 border-b border-border/40 pb-2.5">
                                                <div>
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[14px] text-text-dim">schedule</span>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                                                      Turno {t[1]}
                                                    </p>
                                                  </div>
                                                  <p className="text-[10px] text-text-dim mt-0.5">{timeInfo}</p>
                                                </div>

                                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                                  {items.length} Vol.
                                                </span>
                                              </div>

                                              {/* List of Volunteers or Empty State matching /shifts */}
                                              {items.length === 0 ? (
                                                <p className="text-[11px] text-text-dim italic">Sin voluntarios asignados</p>
                                              ) : (
                                                <div className="space-y-1">
                                                  {items.map(entry => (
                                                    <div
                                                      key={entry.id}
                                                      className={`flex items-center justify-between group border rounded-sm px-2 py-1.5 transition-all ${
                                                        entry.isCompleted
                                                          ? 'opacity-60 bg-gray-500/10 border-gray-500/20 text-text-dim dark:bg-white/5 dark:border-white/10 dark:text-gray-400'
                                                          : entry.type === 'success'
                                                          ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15'
                                                          : entry.type === 'already_checked_in'
                                                          ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15'
                                                          : 'bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/15'
                                                      }`}
                                                    >
                                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                                                          entry.isCompleted ? 'bg-gray-400 dark:bg-gray-600' :
                                                          entry.type === 'success' ? 'bg-emerald-400 animate-pulse' :
                                                          entry.type === 'already_checked_in' ? 'bg-amber-400' :
                                                          'bg-rose-400'
                                                        }`} />
                                                        <div className="flex flex-col min-w-0">
                                                          <span className={`font-inter font-bold text-[12px] truncate ${
                                                            entry.isCompleted ? 'text-gray-400 dark:text-gray-400 font-bold' :
                                                            entry.type === 'success' ? 'text-emerald-400 font-extrabold' :
                                                            entry.type === 'already_checked_in' ? 'text-amber-400 font-extrabold' :
                                                            'text-rose-400 font-extrabold'
                                                          }`}>
                                                            {entry.type === 'error' ? '—' : entry.volunteer}
                                                          </span>
                                                          <span className={`font-inter font-bold text-[9px] leading-tight truncate ${
                                                            entry.isCompleted ? 'text-gray-400 dark:text-gray-500' : 'text-emerald-400/90'
                                                          }`}>
                                                            {entry.isCompleted ? 'Completado' : (entry.type === 'success' ? 'En turno' : entry.type === 'already_checked_in' ? 'Ya marcado' : 'Error')}
                                                            {' · '}
                                                            {formatDateLabel(entry.timestamp)}
                                                          </span>
                                                        </div>
                                                      </div>

                                                      {/* Buttons matching /shifts line 1157-1178 (Icons only on mobile) */}
                                                      <div className="flex items-center gap-1 shrink-0 ml-2">
                                                        <button
                                                          type="button"
                                                          onClick={() => handleHistoryMarkCompleted(entry)}
                                                          disabled={entry.isCompleted}
                                                          className={`px-2 py-0.5 sm:px-2.5 rounded-full font-inter font-bold text-[9px] transition-all flex items-center gap-1 shadow-sm cursor-pointer ${
                                                            entry.isCompleted
                                                              ? 'bg-emerald-500/10 text-emerald-400/60 border border-emerald-500/20 cursor-default'
                                                              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 active:scale-95'
                                                          }`}
                                                          title={entry.isCompleted ? "Turno Completado" : "Completar Turno"}
                                                        >
                                                          <span className="material-symbols-outlined text-[12px]">task_alt</span>
                                                          <span className="hidden sm:inline">{entry.isCompleted ? 'Completado' : 'Completar'}</span>
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => handleHistoryOpenReassign(entry)}
                                                          className="px-2 py-0.5 sm:px-2.5 rounded-full font-inter font-bold text-[9px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                                          title="Reasignar Turno"
                                                        >
                                                          <span className="material-symbols-outlined text-[12px]">sync_alt</span>
                                                          <span className="hidden sm:inline">Reasignar</span>
                                                        </button>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>

      {/* REASSIGN SHIFT MODAL DIALOG */}
      {/* Reasignar Turno Drawer (Matching /shifts page drawer) */}
      <div className={`fixed inset-0 z-[115] flex flex-col justify-end transition-all duration-300 ${reassignTarget ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${reassignTarget ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setReassignTarget(null)}
        />

        <div
          className={`relative w-full md:w-[440px] md:mx-auto bg-dark2 border border-white/10 rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out max-h-[90vh] ${reassignTarget ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />

          <div className="p-6 overflow-y-auto space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-bold text-text mb-1">Reasignar Turno</h3>
              <p className="text-sm font-inter font-bold text-text-dim">Moviendo a {reassignTarget?.volunteerName}</p>
              {reassignTarget?.committee && (
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-inter font-bold bg-[#4d7cfe]/20 text-[#8bb0ff] border border-[#4d7cfe]/30">
                  {reassignTarget.committee}
                </span>
              )}
            </div>

            {reassignSuccessMsg ? (
              <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 rounded-2xl text-xs font-bold font-inter text-center animate-in zoom-in-95">
                ✓ {reassignSuccessMsg}
              </div>
            ) : (
              <div className="space-y-5">
                {/* FECHA DESTINO */}
                <div>
                  <label className="text-[10px] font-bold text-text-dim tracking-widest uppercase mb-3 block">FECHA DESTINO</label>
                  <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto pr-1">
                    {EVENT_DAYS.map((d, index) => {
                      const isSelected = reassignDayKey.toLowerCase() === d.key.toLowerCase();
                      const bgColors = [
                        'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                        'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                      ];
                      const cardBg = bgColors[index % bgColors.length];

                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setReassignDayKey(d.key)}
                          className={`relative overflow-hidden flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all bg-dark3 cursor-pointer ${isSelected
                            ? 'border-text text-text shadow-sm scale-105 z-10'
                            : 'border-border text-text-dim opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cardBg} opacity-90`} />
                          <span className={`font-inter font-bold text-[9px] uppercase tracking-widest ${isSelected ? 'text-text' : 'text-text-dim'}`}>
                            {d.label}
                          </span>
                          <span className="text-sm font-black leading-none mt-1 drop-shadow-sm">{d.dateNum}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* TURNO DESTINO */}
                <div>
                  <label className="text-[10px] font-bold text-text-dim tracking-widest uppercase mb-3 block">TURNO DESTINO</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['T1', 'T2', 'T3', 'T4'].map((t) => {
                      const isSelected = reassignShiftKey === t;

                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setReassignShiftKey(t)}
                          className={`flex flex-col items-center justify-center py-3 rounded-xl border text-sm font-black transition-all cursor-pointer ${
                            isSelected
                            ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-md shadow-blue-500/20 scale-105 z-10'
                            : 'bg-dark3 border-border text-text hover:bg-dark3/80 hover:text-text'
                          }`}
                        >
                          <span>{t}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setReassignTarget(null)}
                    className="flex-1 bg-dark3 hover:bg-dark2 text-text border border-border font-bold text-xs font-inter h-11 rounded-full cursor-pointer transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReassign}
                    disabled={!reassignDayKey || !reassignShiftKey || isReassigning}
                    className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:bg-dark3 disabled:text-text-dim disabled:border-border text-white font-extrabold text-xs font-inter h-11 rounded-full transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isReassigning ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Confirmar Reasignación"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM SHEET DRAWER (Matching /shifts page mobile drawer 100%) */}
      <div className={`fixed inset-0 z-[110] md:hidden flex flex-col justify-end transition-all duration-300 ${mobileDrawerDayGroup ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${mobileDrawerDayGroup ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileDrawerDayGroup(null)}
        />

        <div
          id="history-mobile-drawer"
          className={`relative w-full max-h-[90vh] bg-gradient-to-br from-[#009fd4] to-[#4d7cfe] dark:from-[#0f2027] dark:via-[#203a43] dark:to-[#194c7a] rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${mobileDrawerDayGroup ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ willChange: 'transform' }}
        >
          {/* Drag handle */}
          <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />

          <div
            className="p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain"
            onTouchStart={(e) => {
              const drawer = document.getElementById("history-mobile-drawer");
              if (!drawer) return;
              drawer.dataset.startY = e.touches[0].clientY.toString();
              drawer.style.transition = 'none';
            }}
            onTouchMove={(e) => {
              const drawer = document.getElementById("history-mobile-drawer");
              if (!drawer) return;
              const startY = parseFloat(drawer.dataset.startY || '0');
              const currentY = e.touches[0].clientY;
              const deltaY = currentY - startY;

              if (e.currentTarget.scrollTop <= 0 && deltaY > 0) {
                drawer.style.transform = `translateY(${deltaY}px)`;
                drawer.dataset.swiping = 'true';
              }
            }}
            onTouchEnd={(e) => {
              const drawer = document.getElementById("history-mobile-drawer");
              if (!drawer) return;

              drawer.style.transition = 'transform 0.3s ease-out';

              if (drawer.dataset.swiping === 'true') {
                const startY = parseFloat(drawer.dataset.startY || '0');
                const deltaY = e.changedTouches[0].clientY - startY;

                drawer.dataset.swiping = 'false';

                if (deltaY > 120) {
                  drawer.style.transform = `translateY(100%)`;
                  setTimeout(() => {
                    drawer.style.transform = '';
                    setMobileDrawerDayGroup(null);
                  }, 300);
                } else {
                  drawer.style.transform = `translateY(0)`;
                }
              } else {
                drawer.style.transform = '';
              }
            }}
          >
            {/* Mobile Drawer Header (without X button matching /shifts) */}
            <div className="text-center border-b border-white/15 pb-4">
              <h3 className="text-xl font-bold font-inter text-white capitalize drop-shadow-sm">
                {mobileDrawerDayGroup?.dayKey}
              </h3>
              <p className="text-xs font-inter font-bold text-white/80 mt-0.5">
                {mobileDrawerDayGroup?.totalCount} {mobileDrawerDayGroup?.totalCount === 1 ? 'registro de asistencia' : 'registros de asistencia'}
              </p>
            </div>

            {/* Turnos Cards inside Mobile Drawer matching /shifts */}
            {mobileDrawerDayGroup && (
              <div className="space-y-3 pt-1">
                {(['T1', 'T2', 'T3', 'T4'] as const).map((t) => {
                  const items = mobileDrawerDayGroup.shifts[t];
                  const timeInfo = t === 'T1' ? '8:00 AM - 12:00 PM' : t === 'T2' ? '11:00 AM - 3:00 PM' : t === 'T3' ? '2:00 PM - 6:00 PM' : '5:00 PM - 10:00 PM';

                  return (
                    <div key={t} className="bg-black/30 border border-white/15 backdrop-blur-md rounded-[24px] p-4 shadow-lg flex flex-col h-fit space-y-3">
                      {/* Turno Header */}
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-white/80">schedule</span>
                          <span className="text-white font-black text-xs sm:text-sm">Turno {t[1]}</span>
                          <span className="font-inter text-[11px] text-white/70 font-medium">{timeInfo}</span>
                        </div>
                        <span className="font-inter text-[10px] px-2 py-0.5 rounded-full leading-none flex items-center justify-center shrink-0 border bg-white/15 text-white/90 border-white/20">
                          {items.length} Vol.
                        </span>
                      </div>

                      {/* Volunteers List */}
                      {items.length === 0 ? (
                        <p className="text-[11px] text-white/50 italic text-center py-1">Sin asignaciones</p>
                      ) : (
                        <div className="space-y-1.5">
                          {items.map(entry => (
                            <div
                              key={entry.id}
                              className={`flex items-center justify-between gap-2 p-2 rounded-xl transition-all ${
                                entry.isCompleted
                                  ? 'opacity-60 bg-white/5 border border-white/5 text-white/50'
                                  : 'bg-white/5 hover:bg-white/10 border border-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${
                                  entry.isCompleted ? 'bg-gray-400' :
                                  entry.type === 'success' ? 'bg-emerald-400 animate-pulse' :
                                  entry.type === 'already_checked_in' ? 'bg-amber-400' :
                                  'bg-rose-400'
                                }`} />
                                <div className="flex flex-col min-w-0">
                                  <span className={`font-inter font-bold text-[12px] truncate ${
                                    entry.isCompleted ? 'text-white/60 font-bold' :
                                    entry.type === 'success' ? 'text-emerald-300 font-extrabold' : 'text-white'
                                  }`}>
                                    {entry.type === 'error' ? '—' : entry.volunteer}
                                  </span>
                                  <span className="font-inter font-bold text-[9px] leading-tight text-white/70 truncate">
                                    {entry.isCompleted ? 'Completado' : (entry.type === 'success' ? 'En turno' : entry.type === 'already_checked_in' ? 'Ya marcado' : 'Error')}
                                    {' · '}
                                    {formatDateLabel(entry.timestamp)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={() => handleHistoryMarkCompleted(entry)}
                                  disabled={entry.isCompleted}
                                  className={`w-7 h-7 rounded-full transition-all flex items-center justify-center shrink-0 shadow-sm cursor-pointer ${
                                    entry.isCompleted
                                      ? 'bg-emerald-500/10 text-emerald-300/40 border border-emerald-400/20 cursor-default'
                                      : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/40 active:scale-95'
                                  }`}
                                  title={entry.isCompleted ? "Turno Completado" : "Completar Turno"}
                                >
                                  <span className="material-symbols-outlined text-[14px]">task_alt</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHistoryOpenReassign(entry)}
                                  className="w-7 h-7 rounded-full bg-purple-500/25 text-purple-200 border border-purple-400/40 hover:bg-purple-500/40 transition-all flex items-center justify-center shrink-0 active:scale-95 shadow-sm cursor-pointer"
                                  title="Reasignar Turno"
                                >
                                  <span className="material-symbols-outlined text-[14px]">sync_alt</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
