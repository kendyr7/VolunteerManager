'use client'

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { getAvailableShiftKeys, getOperationalEventDays, formatDateShort, isSimulationEventDay } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntryPassButton } from "@/components/EntryPassButton";
import {
  canCorrectAttendanceTimes,
  canEditVolunteerPersonalInfo,
  canQrCheckin,
  canRegisterMissingAttendance,
  getNormalizedRole,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  createShiftChangeRequestAction,
  fetchVolunteerShiftChangeRequestsAction
} from "@/app/actions/shift-change-actions";
import {
  useVolunteerRescheduleContext,
  isVolunteerShiftCompleted,
  isVolunteerShiftAssigned,
  getVolunteerShiftCapacity,
} from "@/lib/use-volunteer-reschedule-context";
import {
  undoVolunteerCheckInAction,
  reopenCompletedShiftAction
} from "@/app/actions/audit-actions";
import { fetchVolunteerAuditLogsAction, fetchVolunteerShiftRecordsAction } from "@/app/actions/activity-actions";
import { fetchVolunteerAttendanceSessionsAction } from "@/app/actions/attendance";
import { useOptionalCoordinatorData } from "@/lib/coordinator-data-context";
import { useVolunteerStore } from "@/lib/store/use-volunteer-store";
import {
  getUnifiedShiftTimes,
  getUnifiedShiftWorkedMinutes,
  formatUnifiedDuration
} from "@/lib/shift-calculations";
import { getVolunteerProfileMetrics } from "@/lib/services/volunteer-profile.service";
import { AdminSessionCorrectionModal } from "./AdminSessionCorrectionModal";
import { AdminCreateSessionModal } from "./AdminCreateSessionModal";

export interface VolunteerProfileData {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  committee?: string;
  committee_id?: string;
  stake?: string;
  ward?: string;
  phone?: string;
  reliability?: number;
  age?: number;
}

export interface VolunteerProfileViewProps {
  volunteer: VolunteerProfileData;
  mode?: 'volunteer' | 'coordinator';

  // Shift state
  shiftsByDay?: Record<string, string[]>;
  checkedInMap?: Record<string, boolean> | Record<string, string[]>;
  checkedOutMap?: Record<string, boolean> | Record<string, string[]>;
  shiftAreasBySlot?: Record<string, string | null>;

  // Handlers
  onToggleShift?: (dayKey: string, shiftKey: string) => void;

  // Coordinator controls
  isEditingShifts?: boolean;
  canEditShifts?: boolean;
  onStartEditShifts?: () => void;
  onSaveShifts?: () => void;
  onStartEditProfile?: () => void;
  onArchiveProfile?: (vol: VolunteerProfileData) => void;
  onClose?: () => void;
  savedNotice?: boolean;
  isPendingSave?: boolean;

  // Custom Action Buttons override
  customActions?: React.ReactNode;
}

const volunteerAuditLogsCache = new Map<string, any[]>();
const volunteerShiftRecordsCache = new Map<string, any[]>();

export function VolunteerProfileView({
  volunteer,
  mode = 'volunteer',
  shiftsByDay: externalShiftsByDay,
  checkedInMap: externalCheckedInMap,
  checkedOutMap: externalCheckedOutMap,
  shiftAreasBySlot,
  onToggleShift: externalOnToggleShift,
  isEditingShifts = false,
  canEditShifts = true,
  onStartEditShifts,
  onSaveShifts,
  onStartEditProfile,
  savedNotice = false,
  isPendingSave = false,
  customActions,
}: VolunteerProfileViewProps) {
  const coordinatorData = useOptionalCoordinatorData();
  const { refresh } = coordinatorData ?? {};
  const [permTick, setPermTick] = useState(0);

  useEffect(() => {
    const handlePermissionsChange = () => setPermTick(v => v + 1);
    window.addEventListener("storage", handlePermissionsChange);
    window.addEventListener("permissions-changed", handlePermissionsChange);
    return () => {
      window.removeEventListener("storage", handlePermissionsChange);
      window.removeEventListener("permissions-changed", handlePermissionsChange);
    };
  }, []);

  const isAdmin = getNormalizedRole() === 'Admin';
  const mayViewQr = canQrCheckin();
  const mayCorrectAttendance = canCorrectAttendanceTimes();
  const mayRegisterMissingAttendance = canRegisterMissingAttendance();
  const mayEditPersonalInfo = canEditVolunteerPersonalInfo(volunteer.committee_id);

  const [showLegend, setShowLegend] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'requests' | 'audit'>('schedule');
  const [auditViewMode, setAuditViewMode] = useState<'timeline' | 'logs'>('timeline');

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [fetchedDbRecords, setFetchedDbRecords] = useState<any[]>([]);
  const [fetchedSessions, setFetchedSessions] = useState<any[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  const storeShifts = useVolunteerStore((s) => s.shiftsByVolunteerMap.get(volunteer.id)) || [];
  const hasStoreEntry = useVolunteerStore((s) => s.shiftsByVolunteerMap.has(volunteer.id));

  const dbShiftRecords = useMemo(() => {
    console.log('[RT-TRACE][VIEW_SHIFTS_MEMO]', {
      volunteerId: volunteer.id,
      hasStoreEntry,
      storeShiftsCount: storeShifts?.length ?? 0,
      timestamp: new Date().toISOString()
    });
    if (hasStoreEntry) {
      return storeShifts;
    }
    const fromCoordinator = (coordinatorData?.shiftsData || []).filter((s: any) => s.volunteer_id === volunteer.id);
    if (fromCoordinator.length > 0) return fromCoordinator;
    return fetchedDbRecords;
  }, [hasStoreEntry, storeShifts, coordinatorData?.shiftsData, fetchedDbRecords, volunteer.id]);

  // Permisos y Usuario
  const userRole = typeof window !== 'undefined' ? localStorage.getItem('mock_role') || 'Admin' : 'Admin';
  const userName = typeof window !== 'undefined' ? localStorage.getItem('mock_user_name') || 'Administrador' : 'Administrador';

  // Auditoría State
  const [auditMessage, setAuditMessage] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isProcessingAudit, setIsProcessingAudit] = useState(false);

  // Fallback Local Shift State if not provided externally
  const [localShiftsByDay, setLocalShiftsByDay] = useState<Record<string, string[]>>({});
  const [localCheckedInMap, setLocalCheckedInMap] = useState<Record<string, boolean>>({});
  const [localCheckedOutMap, setLocalCheckedOutMap] = useState<Record<string, boolean>>({});
  const [localEditingShifts, setLocalEditingShifts] = useState(false);

  const shiftsByDay = externalShiftsByDay || localShiftsByDay;

  const EVENT_DAYS_RAW = useMemo(() => getOperationalEventDays(), []);
  const EVENT_DAYS = useMemo(() => {
    const defaultDays = EVENT_DAYS_RAW.map(date => ({
      date,
      key: formatDateShort(date),
      label: formatDateShort(date).split(' ')[0],
      dateNum: formatDateShort(date).split(' ')[1],
    }));

    const existingKeys = new Set(defaultDays.map(d => d.key));
    const extraKeys: string[] = [];

    dbShiftRecords.forEach(r => {
      if (r.day_key && !existingKeys.has(r.day_key)) {
        existingKeys.add(r.day_key);
        extraKeys.push(r.day_key);
      }
    });

    Object.keys(shiftsByDay).forEach(key => {
      if (shiftsByDay[key]?.length > 0 && !existingKeys.has(key)) {
        existingKeys.add(key);
        extraKeys.push(key);
      }
    });

    const extraDays = extraKeys.map(key => {
      const parts = key.split(' ');
      return {
        date: new Date(),
        key,
        label: (parts[0] || key).substring(0, 3),
        dateNum: parts[1] || '',
      };
    });

    return [...defaultDays, ...extraDays];
  }, [EVENT_DAYS_RAW, dbShiftRecords, shiftsByDay]);

  useEffect(() => {
    if (!externalShiftsByDay && typeof window !== 'undefined') {
      try {
        const storedShifts = localStorage.getItem(`vol_shifts_${volunteer.id}`);
        if (storedShifts) {
          setLocalShiftsByDay(JSON.parse(storedShifts));
        } else {
          setLocalShiftsByDay({
            [EVENT_DAYS[0]?.key || "Jue 10"]: ["T1"],
            [EVENT_DAYS[2]?.key || "Sáb 12"]: ["T2"]
          });
        }

        const storedCheckIn = localStorage.getItem(`vol_checkin_${volunteer.id}`);
        if (storedCheckIn) {
          setLocalCheckedInMap(JSON.parse(storedCheckIn));
        }

        const storedCheckOut = localStorage.getItem(`completed_shifts_map`);
        if (storedCheckOut) {
          const map = JSON.parse(storedCheckOut);
          const userOut: Record<string, boolean> = {};
          Object.keys(map).forEach(key => {
            if (key.startsWith(`${volunteer.id}-`)) {
              const subKey = key.replace(`${volunteer.id}-`, '');
              userOut[subKey] = true;
            }
          });
          setLocalCheckedOutMap(userOut);
        }
      } catch (e) {
        console.error("Error loading volunteer local state:", e);
      }
    }
  }, [volunteer.id, externalShiftsByDay, EVENT_DAYS]);

  const isShiftCheckedOut = useCallback((dayKey: string, shiftKey: string): boolean => {
    const dbRec = dbShiftRecords.find(r => r.day_key === dayKey && r.shift_key === shiftKey);
    if (dbRec && (dbRec.checked_out || dbRec.checked_out_at || dbRec.status === 'completed')) return true;

    // Check relevant audit logs for this specific shift sorted by newest first
    const relevantLogs = auditLogs.filter((l: any) => {
      const desc = (l.description || '').toLowerCase();
      const det = (l.details || '').toLowerCase();
      const matchDay = desc.includes(dayKey.toLowerCase()) || det.includes(dayKey.toLowerCase());
      const matchShift = desc.includes(shiftKey.toLowerCase()) || det.includes(shiftKey.toLowerCase());
      return matchDay && matchShift;
    });

    if (relevantLogs.length > 0) {
      // If there is any completed / checkout adjustment log in history, restoring / undoing accidental reopen keeps it completed
      const hasCheckoutInHistory = relevantLogs.some((l: any) => {
        const d = (l.description || '').toLowerCase();
        return d.includes('check-out') || d.includes('salida') || d.includes('ajustó hora de salida') || d.includes('completó');
      });

      if (hasCheckoutInHistory) {
        return true;
      }
    }

    const map = externalCheckedOutMap || localCheckedOutMap;
    if (!map) return false;
    const arrayVal = (map as Record<string, string[]>)[dayKey];
    if (Array.isArray(arrayVal)) {
      return arrayVal.includes(shiftKey);
    }
    return (
      !!(map as Record<string, boolean>)[`${volunteer.id}-${dayKey}-${shiftKey}`] ||
      !!(map as Record<string, boolean>)[`${dayKey}-${shiftKey}`]
    );
  }, [dbShiftRecords, auditLogs, externalCheckedOutMap, localCheckedOutMap, volunteer.id]);

  const isShiftCheckedIn = useCallback((dayKey: string, shiftKey: string): boolean => {
    if (isShiftCheckedOut(dayKey, shiftKey)) return false;

    const dbRec = dbShiftRecords.find(r => r.day_key === dayKey && r.shift_key === shiftKey);
    if (dbRec) {
      if (!dbRec.checked_in && !dbRec.checked_in_at && dbRec.status !== 'confirmed') {
        return false;
      }
      if (dbRec.checked_in || dbRec.checked_in_at || dbRec.status === 'confirmed') {
        return true;
      }
    }

    const relevantLogs = auditLogs.filter((l: any) => {
      const desc = (l.description || '').toLowerCase();
      const det = (l.details || '').toLowerCase();
      const matchDay = desc.includes(dayKey.toLowerCase()) || det.includes(dayKey.toLowerCase());
      const matchShift = desc.includes(shiftKey.toLowerCase()) || det.includes(shiftKey.toLowerCase());
      return matchDay && matchShift;
    });

    if (relevantLogs.length > 0) {
      const latestLog = relevantLogs[0];
      const desc = (latestLog.description || '').toLowerCase();

      if (desc.includes('revirtió la entrada') || desc.includes('revertido a estado programado') || desc.includes('deshacer')) {
        return false;
      }

      if (desc.includes('check-in') || desc.includes('escaneó') || desc.includes('llegada') || desc.includes('entrada') || desc.includes('registró asistencia')) {
        return true;
      }
    }

    const map = externalCheckedInMap || localCheckedInMap;
    if (!map) return false;
    const arrayVal = (map as Record<string, string[]>)[dayKey];
    if (Array.isArray(arrayVal)) {
      return arrayVal.includes(shiftKey);
    }
    return (
      !!(map as Record<string, boolean>)[`${volunteer.id}-${dayKey}-${shiftKey}`] ||
      !!(map as Record<string, boolean>)[`${dayKey}-${shiftKey}`]
    );
  }, [dbShiftRecords, auditLogs, isShiftCheckedOut, externalCheckedInMap, localCheckedInMap, volunteer.id]);

  // Contexto de validación para reagendamiento (turnos propios + capacidad por comité)
  const rescheduleCtx = useVolunteerRescheduleContext(volunteer.id);

  // Reagendamiento State
  const [activeShiftTooltipKey, setActiveShiftTooltipKey] = useState<string | null>(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const [sourceDayKey, setSourceDayKey] = useState<string>("");
  const [sourceShiftKey, setSourceShiftKey] = useState<string>("");
  const [targetDayKey, setTargetDayKey] = useState<string>("");
  const [targetShiftKey, setTargetShiftKey] = useState<string>("");
  const [requestReason, setRequestReason] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const sourceShiftCompleted = !!(sourceDayKey && sourceShiftKey && isVolunteerShiftCompleted(rescheduleCtx, sourceDayKey, sourceShiftKey));

  const targetShiftStatus = {
    isSource: sourceDayKey === targetDayKey && sourceShiftKey === targetShiftKey,
    isCompleted: !!(targetDayKey && targetShiftKey && isVolunteerShiftCompleted(rescheduleCtx, targetDayKey, targetShiftKey)),
    isAssigned: !!(targetDayKey && targetShiftKey && isVolunteerShiftAssigned(rescheduleCtx, targetDayKey, targetShiftKey)),
  };

  const targetCapacity = targetDayKey && targetShiftKey
    ? getVolunteerShiftCapacity(rescheduleCtx, targetDayKey, targetShiftKey)
    : { committeeName: '', count: 0, maxReq: 0, isFull: false };

  const staleOpenSession = useMemo(() => {
    const openSess = fetchedSessions.find((s: any) => s.status === 'open');
    if (!openSess) return null;
    const nicaString = new Date().toLocaleString("en-US", { timeZone: "America/Managua" });
    const nicaNow = new Date(nicaString);
    const currentDayKey = format(nicaNow, "EEE d", { locale: es }).toLowerCase();
    const sessDayKey = (openSess.day_key || openSess.dayKey || '').toLowerCase();
    if (sessDayKey && sessDayKey !== currentDayKey) {
      return openSess;
    }
    return null;
  }, [fetchedSessions]);

  const isSourceDayFullyCompleted = (dayKey: string) => {
    const shifts = shiftsByDay[dayKey] || [];
    return shifts.length > 0 && shifts.every(t => isVolunteerShiftCompleted(rescheduleCtx, dayKey, t));
  };

  const loadRequests = async () => {
    if (!volunteer.id) return;
    setLoadingRequests(true);
    const res = await fetchVolunteerShiftChangeRequestsAction(volunteer.id);
    if (res.success && res.requests) {
      setAllRequests(res.requests);
    }
    setLoadingRequests(false);
  };

  const loadAuditLogs = async () => {
    if (!volunteer.id) return;
    setLoadingAuditLogs(true);
    const fullName = volunteer.first_name
      ? `${volunteer.first_name} ${volunteer.last_name || ''}`.trim()
      : volunteer.name;
    const [auditRes, shiftRecordsRes, sessionsRes] = await Promise.all([
      fetchVolunteerAuditLogsAction(
        volunteer.id,
        fullName,
        volunteer.phone,
        (volunteer as any).created_at
      ),
      fetchVolunteerShiftRecordsAction(volunteer.id),
      fetchVolunteerAttendanceSessionsAction(volunteer.id)
    ]);

    if (auditRes.success && auditRes.logs) {
      setAuditLogs(auditRes.logs);
    }
    if (shiftRecordsRes.success && shiftRecordsRes.shiftRecords) {
      setFetchedDbRecords(shiftRecordsRes.shiftRecords);
    }
    if (sessionsRes.success && sessionsRes.sessions) {
      setFetchedSessions(sessionsRes.sessions);
    }
    setLoadingAuditLogs(false);
  };

  useEffect(() => {
    loadRequests();
  }, [volunteer.id]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab, volunteer.id]);

  const pendingRequests = useMemo(() => {
    return allRequests.filter((r: any) => r.status === 'pending');
  }, [allRequests]);

  const formatDurationMinutes = useCallback((totalMins: number) => {
    return formatUnifiedDuration(totalMins);
  }, []);

  const getShiftTimesFormatted = useCallback((dayKey: string, shiftKey: string) => {
    return getUnifiedShiftTimes(dayKey, shiftKey, dbShiftRecords, auditLogs);
  }, [dbShiftRecords, auditLogs]);

  const getShiftWorkedMinutes = useCallback((dayKey: string, shiftKey: string) => {
    if (!isShiftCheckedOut(dayKey, shiftKey)) return 0;
    return getUnifiedShiftWorkedMinutes(dayKey, shiftKey, dbShiftRecords, auditLogs);
  }, [isShiftCheckedOut, dbShiftRecords, auditLogs]);

  const totalCompletedMinutes = useMemo(() => {
    let count = 0;
    const countedKeys = new Set<string>();

    // 1. Check dbShiftRecords directly
    dbShiftRecords.forEach((rec: any) => {
      const key = `${rec.day_key}-${rec.shift_key}`;
      if (rec.checked_out || rec.checked_out_at || rec.status === 'completed') {
        countedKeys.add(key);
        count += getShiftWorkedMinutes(rec.day_key, rec.shift_key);
      }
    });

    // 2. Check auditLogs for checkout / output adjustments
    auditLogs.forEach((log: any) => {
      const desc = (log.description || '').toLowerCase();
      if (desc.includes('salida') || desc.includes('check-out') || desc.includes('completó') || desc.includes('ajustó hora de salida')) {
        EVENT_DAYS.forEach(d => {
          getAvailableShiftKeys(d.key).forEach(t => {
            const key = `${d.key}-${t}`;
            if (!countedKeys.has(key)) {
              if (desc.includes(d.key.toLowerCase()) && desc.includes(t.toLowerCase())) {
                countedKeys.add(key);
                count += getShiftWorkedMinutes(d.key, t);
              }
            }
          });
        });
      }
    });

    // 3. Fallback for shiftsByDay
    Object.entries(shiftsByDay).forEach(([dayKey, shifts]) => {
      shifts.forEach((shiftKey) => {
        const key = `${dayKey}-${shiftKey}`;
        if (!countedKeys.has(key) && isShiftCheckedOut(dayKey, shiftKey)) {
          countedKeys.add(key);
          count += getShiftWorkedMinutes(dayKey, shiftKey);
        }
      });
    });

    return count;
  }, [dbShiftRecords, auditLogs, shiftsByDay, EVENT_DAYS, isShiftCheckedOut, getShiftWorkedMinutes]);

  const volunteerTimeline = useMemo(() => {
    return auditLogs.map((log: any) => ({
      id: log.id,
      timestamp: log.timestamp || Date.now(),
      timeOrDate: log.formattedDate || '',
      title: log.title || 'Evento registrado',
      subtitle: log.subtitle || '',
      authorName: log.actorName || 'Coordinación',
      authorRole: log.actorRole || 'Admin',
      badge: log.badgeText || '✓',
      badgeStyle: log.badgeStyle || 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-bold',
      colorBg: log.colorClass || 'bg-emerald-500',
      parsedChanges: log.parsedChanges || null,
    }));
  }, [auditLogs]);

  const assignedDayKeys = Object.keys(shiftsByDay).filter(d => (shiftsByDay[d] || []).length > 0);

  const handleSendRescheduleRequest = async () => {
    if (!sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey) return;
    if (!requestReason.trim()) {
      setSubmitError("Por favor ingresa la razón o motivo por el cual solicitas el cambio.");
      return;
    }

    if (sourceShiftCompleted) {
      setSubmitError("No se puede solicitar un cambio para un turno que ya ha sido completado.");
      return;
    }

    if (targetShiftStatus.isSource) {
      setSubmitError("El turno solicitado es el mismo que tu turno actual.");
      return;
    }

    if (targetShiftStatus.isCompleted) {
      setSubmitError("Ya tienes un turno completado en esta fecha y horario.");
      return;
    }

    if (targetShiftStatus.isAssigned) {
      setSubmitError("Ya tienes un turno asignado en esta fecha y horario.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const res = await createShiftChangeRequestAction({
      volunteerId: volunteer.id,
      currentDayKey: sourceDayKey,
      currentShiftKey: sourceShiftKey,
      requestedDayKey: targetDayKey,
      requestedShiftKey: targetShiftKey,
      reason: requestReason.trim(),
    });

    if (res.success) {
      setSubmitSuccess("✓ Solicitud enviada exitosamente. El coordinador la revisará en breve.");
      await loadRequests();
      setTimeout(() => {
        setIsRescheduleModalOpen(false);
        setSubmitSuccess(null);
        setSourceDayKey("");
        setSourceShiftKey("");
        setTargetDayKey("");
        setTargetShiftKey("");
        setRequestReason("");
      }, 2000);
    } else {
      setSubmitError(res.error || "Ocurrió un error al enviar la solicitud.");
    }
    setIsSubmitting(false);
  };



  // Reversión exclusiva para Admins: Deshacer Check-in
  const handleUndoCheckIn = async (dayKey: string, shiftKey: string) => {
    if (!isAdmin) return;
    setIsProcessingAudit(true);
    setAuditMessage(null);

    const res = await undoVolunteerCheckInAction({
      volunteerId: volunteer.id,
      dayKey,
      shiftKey,
      actorName: userName,
      actorRole: userRole
    });

    if (res.success) {
      setLocalCheckedInMap(prev => ({ ...prev, [`${dayKey}-${shiftKey}`]: false }));
      setFetchedDbRecords(prev => prev.map(rec => {
        if (rec.day_key === dayKey && rec.shift_key === shiftKey) {
          return { ...rec, checked_in: false, checked_in_at: null, checked_out: false, checked_out_at: null };
        }
        return rec;
      }));

      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('vol_checkin_' + volunteer.id);
          if (stored) {
            const map = JSON.parse(stored);
            delete map[`${volunteer.id}-${dayKey}-${shiftKey}`];
            delete map[`${dayKey}-${shiftKey}`];
            localStorage.setItem('vol_checkin_' + volunteer.id, JSON.stringify(map));
          }
        } catch (e) {}
      }

      setAuditMessage({ type: 'success', msg: res.message || 'Check-in revertido correctamente.' });
      await loadAuditLogs();
      await refresh?.(true);
    } else {
      setAuditMessage({ type: 'error', msg: res.error || 'Error al revertir check-in' });
    }
    setIsProcessingAudit(false);
  };

  // Reversión exclusiva para Admins: Reabrir Turno Completado
  const handleReopenShift = async (dayKey: string, shiftKey: string) => {
    if (!isAdmin) return;
    setIsProcessingAudit(true);
    setAuditMessage(null);

    const res = await reopenCompletedShiftAction({
      volunteerId: volunteer.id,
      dayKey,
      shiftKey,
      actorName: userName,
      actorRole: userRole
    });

    if (res.success) {
      setLocalCheckedOutMap(prev => ({ ...prev, [`${dayKey}-${shiftKey}`]: false }));
      setLocalCheckedInMap(prev => ({ ...prev, [`${dayKey}-${shiftKey}`]: true }));
      setFetchedDbRecords(prev => prev.map(rec => {
        if (rec.day_key === dayKey && rec.shift_key === shiftKey) {
          return { ...rec, checked_in: true, checked_out: false, checked_out_at: null };
        }
        return rec;
      }));

      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('completed_shifts_map');
          if (stored) {
            const map = JSON.parse(stored);
            delete map[`${volunteer.id}-${dayKey}-${shiftKey}`];
            delete map[`${dayKey}-${shiftKey}`];
            localStorage.setItem('completed_shifts_map', JSON.stringify(map));
          }
        } catch (e) {}
      }

      setAuditMessage({ type: 'success', msg: res.message || 'Turno reabierto correctamente.' });
      await loadAuditLogs();
      await refresh?.(true);
    } else {
      setAuditMessage({ type: 'error', msg: res.error || 'Error al reabrir turno' });
    }
    setIsProcessingAudit(false);
  };

  const handleToggleShift = (dayKey: string, shiftKey: string) => {
    if (externalOnToggleShift) {
      externalOnToggleShift(dayKey, shiftKey);
    } else if (localEditingShifts) {
      setLocalShiftsByDay(prev => {
        const current = prev[dayKey] || [];
        const updated = current.includes(shiftKey)
          ? current.filter(s => s !== shiftKey)
          : [...current, shiftKey];
        return { ...prev, [dayKey]: updated };
      });
    }
  };

  // KPIs
  const totalTurnos = Object.entries(shiftsByDay).reduce(
    (acc, [dayKey, shifts]) => acc + (isSimulationEventDay(dayKey) ? 0 : shifts.length),
    0
  );
  const diasCubiertos = Object.entries(shiftsByDay).filter(([dayKey, shifts]) =>
    !isSimulationEventDay(dayKey) && shifts.length > 0
  ).length;
  const reliabilityScore = volunteer.reliability ?? 100;
  const nameParts = (volunteer.name || `${volunteer.first_name || ''} ${volunteer.last_name || ''}`).trim().split(/\s+/).filter(Boolean);

  const profileMetrics = useMemo(() => {
    return getVolunteerProfileMetrics(volunteer.id, dbShiftRecords, auditLogs, fetchedSessions);
  }, [volunteer.id, dbShiftRecords, auditLogs, fetchedSessions]);

  const kpiHoursDisplay = useMemo(() => {
    return {
      value: profileMetrics.kpiValue,
      label: profileMetrics.kpiLabel,
    };
  }, [profileMetrics]);

  return (
    <div className="flex flex-col w-full max-w-full overflow-x-hidden relative">
      {/* Mensaje de auditoría */}
      {auditMessage && (
        <div className={cn(
          "mb-4 p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between animate-in fade-in",
          auditMessage.type === 'success'
            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
            : "bg-rose-500/15 border-rose-500/30 text-rose-300"
        )}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              {auditMessage.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{auditMessage.msg}</span>
          </div>
          <button onClick={() => setAuditMessage(null)} className="text-text-dim hover:text-text">✕</button>
        </div>
      )}

      {/* Stale Open Session Alert Banner (Día Anterior) */}
      {staleOpenSession && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-amber-400">warning</span>
            </div>
            <div>
              <span className="font-bold text-amber-300 block text-xs">⚠ Salida pendiente (Día anterior o turno finalizado)</span>
              <span className="text-text-dim text-[11px] block mt-0.5">
                Entrada: {format(new Date(staleOpenSession.started_at), 'hh:mm a')} ({staleOpenSession.day_key}) · Salida: No registrada
              </span>
            </div>
          </div>
          {mayCorrectAttendance ? (
            <button
              onClick={() => setIsCorrectionModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-[11px] shrink-0 shadow transition-transform active:scale-95"
            >
              Corregir salida
            </button>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] shrink-0 font-bold uppercase">
              Pendiente
            </Badge>
          )}
        </div>
      )}

      {/* Admin Session Correction Modal */}
      {isCorrectionModalOpen && staleOpenSession && (
        <AdminSessionCorrectionModal
          isOpen={isCorrectionModalOpen}
          onClose={() => setIsCorrectionModalOpen(false)}
          session={staleOpenSession}
          volunteerName={`${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim()}
          assignedShiftKeys={dbShiftRecords.filter(r => r.day_key === staleOpenSession.day_key).map(r => r.shift_key)}
          onSuccess={async () => {
            const res = await fetchVolunteerAttendanceSessionsAction(volunteer.id);
            if (res?.success && res.sessions) setFetchedSessions(res.sessions);
            await refresh?.(true);
          }}
        />
      )}

      {/* Admin Create Missing Session Button (If Admin) */}
      {mayRegisterMissingAttendance && (
        <div className="mb-4 flex justify-center">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="min-h-[44px] w-full justify-center rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.97] sm:w-auto"
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">more_time</span>
              Registrar asistencia / entrada faltante
            </span>
          </button>
        </div>
      )}

      {/* Admin Create Session Modal */}
      {isCreateModalOpen && (
        <AdminCreateSessionModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          volunteerId={volunteer.id}
          volunteerName={`${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim()}
          assignedShiftRecords={dbShiftRecords}
          onSuccess={async () => {
            const res = await fetchVolunteerAttendanceSessionsAction(volunteer.id);
            if (res?.success && res.sessions) setFetchedSessions(res.sessions);
            await refresh?.(true);
          }}
        />
      )}

      {/* Pending Shift Change Banner */}
      {pendingRequests.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-amber-400">schedule</span>
            </div>
            <div>
              <span className="font-bold text-amber-300 block text-xs">Solicitud de reagendamiento pendiente</span>
              <span className="text-text-dim text-[11px]">
                {pendingRequests[0].current_shift_key} ({pendingRequests[0].current_day_key}) ➔ {pendingRequests[0].requested_shift_key} ({pendingRequests[0].requested_day_key})
              </span>
            </div>
          </div>
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] shrink-0 font-bold">
            En revisión
          </Badge>
        </div>
      )}

      {/* 1. Encabezado con Nombre Grande y Badges */}
      <div className="text-center mt-2 mb-6 px-4">
        <div className="flex flex-col items-center justify-center leading-[1.25] font-black text-[26px] sm:text-[30px] text-text tracking-tight">
          {nameParts.length >= 4 ? (
            <>
              <span>{nameParts.slice(0, 2).join(' ')}</span>
              <span className="text-text/90">{nameParts.slice(2).join(' ')}</span>
            </>
          ) : (
            <span>{nameParts.join(' ')}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {volunteer.age != null && volunteer.age > 0 && volunteer.age < 18 && (mode === 'coordinator' || userRole !== 'Lector') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30 shadow-sm animate-pulse">
              <span className="material-symbols-outlined text-[13px]">child_care</span>
              Menor de edad ({volunteer.age} años)
            </span>
          )}
          {Boolean(volunteer.committee || (volunteer as any).committeeName || (volunteer as any).committees?.name) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">groups</span>
              {volunteer.committee || (volunteer as any).committeeName || (volunteer as any).committees?.name}
            </span>
          )}
          {volunteer.stake && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/25 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">account_balance</span>
              {volunteer.stake}
            </span>
          )}
          {(volunteer.ward || (volunteer as any).neighborhood) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-inter font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">location_on</span>
              {volunteer.ward || (volunteer as any).neighborhood}
            </span>
          )}
        </div>
      </div>

      {/* 2. Top Stats Row */}
      <div className="flex items-center mb-6 py-3 border-y border-border w-full">
        <div className="flex flex-col items-center flex-1 border-r border-border">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">{totalTurnos}</span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Turnos</span>
        </div>
        <div className="flex flex-col items-center flex-1 border-r border-border">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">{kpiHoursDisplay.value}</span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold uppercase">{kpiHoursDisplay.label}</span>
        </div>
        <div className="flex flex-col items-center flex-1 border-r border-border">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">
            {reliabilityScore}
            <span className="text-[15px] font-bold text-text-dim ml-0.5">%</span>
          </span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Confia.</span>
        </div>
        <div className="flex flex-col items-center flex-1">
          <span className="text-drawer-kpi-value font-black text-text drop-shadow-sm">{volunteer.age || '-'}</span>
          <span className="text-drawer-kpi-label text-text-dim mt-1.5 font-inter font-extrabold">Edad</span>
        </div>
      </div>

      {/* 3. Acciones de Botones */}
      <div className="mb-6 px-1 flex flex-col gap-3">
        {customActions ? (
          customActions
        ) : mode === 'volunteer' ? (
          <div className="grid grid-cols-2 gap-3">
            <EntryPassButton
              volunteerId={volunteer.id}
              volunteerName={volunteer.name}
              committeeName={volunteer.committee || ''}
            />
            <Button
              variant="outline"
              className="h-10 px-3 gap-2 text-text border-border bg-dark3 hover:bg-dark font-bold text-xs rounded-full shadow-sm active:scale-95 transition-all truncate flex items-center justify-center cursor-pointer"
              onClick={() => setIsRescheduleModalOpen(true)}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0 text-[#4d7cfe]">published_with_changes</span>
              <span>REAGENDAR TURNO</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mayViewQr && (
              <EntryPassButton
                volunteerId={volunteer.id}
                volunteerName={volunteer.name}
                committeeName={volunteer.committee || ''}
                className="w-full mb-1"
              />
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-11 px-1.5 gap-1.5 text-text border-border bg-dark3 hover:bg-dark font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all truncate cursor-pointer"
                onClick={() => window.open(`https://wa.me/${(volunteer.phone || '').replace(/\s+/g, '')}`, '_blank')}
              >
                <span className="material-symbols-outlined text-[17px] shrink-0 text-[#25D366]">message</span>
                <span>WHATSAPP</span>
              </Button>
              <Button
                variant="outline"
                className="h-11 px-1.5 gap-1.5 text-text border-border bg-dark3 hover:bg-dark font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all truncate cursor-pointer"
                onClick={() => window.location.href = `tel:${(volunteer.phone || '').replace(/\s+/g, '')}`}
              >
                <span className="material-symbols-outlined text-[17px] shrink-0 text-blue-500">call</span>
                <span>LLAMAR</span>
              </Button>
              {mayEditPersonalInfo && <Button
                variant="outline"
                className="h-11 px-1.5 gap-1.5 text-text border-border bg-dark3 hover:bg-dark font-bold text-[11px] sm:text-xs rounded-xl shadow-sm active:scale-95 transition-all truncate cursor-pointer"
                onClick={onStartEditProfile}
              >
                <span className="material-symbols-outlined text-[17px] shrink-0 text-[#4d7cfe]">edit_square</span>
                <span>EDITAR</span>
              </Button>}
            </div>
          </div>
        )}
      </div>

       {/* Pestaña opcional de Navegación (Cronograma, Solicitudes, Auditoría) Distribuida al 100% del Ancho */}
      {mode === 'coordinator' && (
        <div className={cn(
          "w-full grid gap-1.5 p-1.5 bg-dark3/50 border border-border/80 rounded-2xl mb-5 shadow-sm text-center",
          "grid-cols-3"
        )}>
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={cn(
              "w-full py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === 'schedule'
                ? "bg-[#4d7cfe] text-white shadow-md font-black"
                : "text-text-dim hover:text-text hover:bg-dark2/60"
            )}
          >
            <span>Cronograma</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={cn(
              "w-full py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === 'requests'
                ? "bg-[#4d7cfe] text-white shadow-md font-black"
                : "text-text-dim hover:text-text hover:bg-dark2/60"
            )}
          >
            <span>Solicitudes</span>
            {allRequests.length > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full font-bold transition-colors shrink-0",
                activeTab === 'requests'
                  ? "bg-white/25 text-white"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              )}>
                {allRequests.length}
              </span>
            )}
          </button>

          {mode === 'coordinator' && (
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={cn(
                "w-full py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                activeTab === 'audit'
                  ? "bg-[#4d7cfe] text-white shadow-md font-black"
                  : "text-text-dim hover:text-text hover:bg-dark2/60"
              )}
            >
              <span>Auditoría</span>
              {auditLogs.length > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 text-[10px] rounded-full font-bold transition-colors shrink-0",
                  activeTab === 'audit'
                    ? "bg-white/25 text-white"
                    : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                )}>
                  {auditLogs.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* 4. Cronograma Stylized Day Cards */}
      {mode !== 'coordinator' || activeTab === 'schedule' ? (
        <div className="w-full">
          <div className="flex items-center justify-between px-1 mb-4">
            <div className="flex items-center gap-2 relative">
              <p className="text-drawer-label text-text font-bold">Cronograma</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLegend(prev => !prev)}
                  className="text-text-dim hover:text-text transition-colors p-0.5 rounded-full flex items-center justify-center focus:outline-none cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">info</span>
                </button>

                {showLegend && (
                  <div className="absolute left-0 top-full mt-2 w-56 p-3 bg-dark2 border border-border rounded-xl shadow-xl z-50 text-xs text-text space-y-2 animate-in fade-in zoom-in-95">
                    <p className="font-bold text-text-dim text-[11px] border-b border-border pb-1">Leyenda de Estados</p>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-[#4d7cfe]/15 border border-[#4d7cfe]/35 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[12px] text-[#4d7cfe]">check</span>
                      </span>
                      <span>Programado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[12px] text-emerald-500">check</span>
                      </span>
                      <span>Asistió (Check-in)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-500/15 border border-slate-500/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[12px] text-slate-500">check</span>
                      </span>
                      <span>Completado (Out)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {canEditShifts && (onStartEditShifts || !externalOnToggleShift) && (
              <div>
                {(isEditingShifts || localEditingShifts) ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      console.log('[SHIFT SAVE] Guardar button clicked in VolunteerProfileView');
                      if (onSaveShifts) onSaveShifts();
                      setLocalEditingShifts(false);
                    }}
                    disabled={isPendingSave}
                    className="h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">save</span>
                    <span>{isPendingSave ? 'Guardando...' : 'Guardar'}</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (onStartEditShifts) onStartEditShifts();
                      setLocalEditingShifts(true);
                    }}
                    className="h-8 px-2.5 text-xs font-bold text-[#4d7cfe] hover:bg-[#4d7cfe]/10 rounded-full transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    <span>Editar Turnos</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          {savedNotice && (
            <div className="mb-3 px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl text-center animate-in fade-in">
              ¡Turnos actualizados correctamente!
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {EVENT_DAYS.map((d, index) => {
              const dayKey = d.key;
              const assignedListFromProps = shiftsByDay[dayKey] || [];
              const assignedListFromDb = dbShiftRecords.filter(r => r.day_key === dayKey).map(r => r.shift_key);
              const assignedList = Array.from(new Set([...assignedListFromProps, ...assignedListFromDb]));
              const dayAbbr = d.label.substring(0, 3);
              const bgColors = [
                'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
              ];
              const cardBg = bgColors[index % bgColors.length];

              return (
                <div
                  key={dayKey}
                  className="relative overflow-hidden rounded-xl border border-border bg-dark2 shadow-sm transition-all"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-2 ${cardBg} opacity-90 rounded-l-xl`} />

                  <div className="flex items-center justify-between p-3 sm:p-4">
                  <div className="flex items-center gap-3 pl-2">
                    <div className="flex flex-col items-center justify-center min-w-[36px]">
                      <span className="font-inter font-black text-xs uppercase tracking-widest text-text-dim leading-none">
                        {dayAbbr}
                      </span>
                      <span className="text-lg font-black text-text leading-none mt-1">{d.dateNum}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-border" />
                    {isSimulationEventDay(dayKey) && (
                      <div className="hidden sm:flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Simulación</span>
                        <span className="text-[10px] font-bold text-text-dim">9:00 AM – 2:00 PM</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {getAvailableShiftKeys(dayKey).map((t) => {
                      const active = assignedList.includes(t);
                      const inCheck = isShiftCheckedIn(dayKey, t);
                      const outCheck = isShiftCheckedOut(dayKey, t);

                      const canClick = isEditingShifts || localEditingShifts;

                      let statusStyle = "bg-dark3/50 border-border/50 text-text-dim/40";
                      let iconContent: React.ReactNode = <span className="text-[13px] font-bold text-text-dim/40">-</span>;
                      let labelColor = "text-text-dim/40";

                      if (outCheck) {
                        statusStyle = "bg-slate-500/15 border-slate-500/30 text-slate-500 shadow-sm";
                        iconContent = <span className="material-symbols-outlined text-[15px] text-slate-500">check</span>;
                        labelColor = "text-slate-500 font-bold";
                      } else if (inCheck) {
                        statusStyle = "bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981] shadow-sm";
                        iconContent = <span className="material-symbols-outlined text-[15px] text-[#10b981]">check</span>;
                        labelColor = "text-[#10b981] font-bold";
                      } else if (active) {
                        statusStyle = "bg-[#4d7cfe]/15 border-[#4d7cfe]/35 text-[#4d7cfe] font-bold shadow-sm";
                        iconContent = <span className="material-symbols-outlined text-[15px] text-[#4d7cfe]">check</span>;
                        labelColor = "text-[#4d7cfe] font-bold";
                      }

                      const times = getShiftTimesFormatted(dayKey, t);
                      const baseTitleText = outCheck
                        ? `Turno ${t} Completado | Entrada: ${times.startTime} · Salida: ${times.endTime}`
                        : inCheck
                        ? `Turno ${t} en servicio (Check-in activo)`
                        : active
                        ? `Turno ${t} Programado`
                        : `Turno ${t} Disponible`;
                      const areaName = shiftAreasBySlot?.[`${dayKey}:${t}`] || null;
                      const titleText = active
                        ? `${baseTitleText} · Área: ${areaName || 'pendiente'}`
                        : baseTitleText;

                      const tooltipKey = `${dayKey}-${t}`;
                      const isTooltipOpen = activeShiftTooltipKey === tooltipKey;

                      return (
                        <div key={t} className="flex flex-col items-center relative group">
                          <button
                            type="button"
                            onClick={(e) => {
                              if (outCheck) {
                                e.stopPropagation();
                                setActiveShiftTooltipKey(prev => prev === tooltipKey ? null : tooltipKey);
                              } else if (canClick) {
                                handleToggleShift(dayKey, t);
                              }
                            }}
                            className={cn(
                              "flex flex-col items-center justify-center w-10 sm:w-13 h-11 rounded-lg border transition-all cursor-pointer",
                              statusStyle,
                              (canClick || outCheck) && "hover:bg-dark hover:border-border active:scale-95"
                            )}
                            title={titleText}
                          >
                            <div className="h-4 flex items-center justify-center">
                              {iconContent}
                            </div>
                            <span className={cn("font-inter text-[10px] uppercase tracking-wider mt-0.5", labelColor)}>
                              {t}
                            </span>
                          </button>

                          {/* Micro-Tooltip inteligente adaptado a los bordes de la pantalla (Hover Desktop + Touch/Tap Móvil) */}
                          {outCheck && (
                            <div
                              className={cn(
                                "absolute bottom-full mb-2 flex-col z-[100] transition-all duration-200",
                                isTooltipOpen ? "flex" : "hidden group-hover:flex",
                                t === 'T4' || t === 'T3' ? 'right-0 items-end' : t === 'T1' ? 'left-0 items-start' : 'left-1/2 -translate-x-1/2 items-center'
                              )}
                            >
                              <div className="bg-[#18181b] border border-slate-700/90 text-white text-[10px] sm:text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow-2xl whitespace-nowrap flex items-center gap-1.5 border-t-2 border-t-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                                <span><strong className="text-slate-300 font-bold">Entrada:</strong> {times.startTime}</span>
                                <span className="text-slate-500">·</span>
                                <span><strong className="text-slate-300 font-bold">Salida:</strong> {times.endTime}</span>
                              </div>
                              <div
                                className={cn(
                                  "w-2 h-2 bg-[#18181b] border-r border-b border-slate-700/90 rotate-45 -mt-1",
                                  t === 'T4' || t === 'T3' ? 'mr-4' : t === 'T1' ? 'ml-4' : ''
                                )}
                              />
                            </div>
                          )}

                          {/* Acciones de Reversión Exclusivas para Admin (Espacio de altura fija para evitar desalineación) */}
                          {isAdmin && mode === 'coordinator' && (
                            <div className="h-4 mt-1 flex items-center justify-center shrink-0">
                              {outCheck ? (
                                <button
                                  type="button"
                                  disabled={isProcessingAudit}
                                  onClick={() => handleReopenShift(dayKey, t)}
                                  title="Reabrir turno completado"
                                  className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-[8px] font-bold transition-all cursor-pointer shadow-sm"
                                >
                                  Reabrir
                                </button>
                              ) : inCheck ? (
                                <button
                                  type="button"
                                  disabled={isProcessingAudit}
                                  onClick={() => handleUndoCheckIn(dayKey, t)}
                                  title="Deshacer entrada"
                                  className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 text-[8px] font-bold transition-all cursor-pointer shadow-sm"
                                >
                                  Deshacer
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </div>

                  {mode === 'volunteer' && assignedList.length > 0 && (
                    <div className="ml-2 flex flex-wrap gap-2 border-t border-border bg-dark3/45 px-3 py-2.5 sm:px-4">
                      {assignedList.map((shiftKey) => {
                        const areaName = shiftAreasBySlot?.[`${dayKey}:${shiftKey}`] || null;
                        return (
                          <span
                            key={shiftKey}
                            className={cn(
                              'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
                              areaName ? 'bg-[#4d7cfe]/15 text-[#4d7cfe]' : 'bg-dark2 text-text-dim'
                            )}
                          >
                            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">location_on</span>
                            {shiftKey} · {areaName || 'Área pendiente'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'requests' && mode === 'coordinator' ? (
        /* Pestaña de Solicitudes */
        <div className="space-y-4">
          {loadingRequests ? (
            <div className="py-6 text-center text-text-dim text-xs font-bold">Cargando solicitudes...</div>
          ) : allRequests.length === 0 ? (
            <div className="p-6 text-center text-text-dim border border-dashed border-border rounded-xl text-xs font-bold">
              No hay solicitudes de reagendamiento registradas para este voluntario.
            </div>
          ) : (
            <div className="space-y-2.5">
              {allRequests.map((r: any) => (
                <div key={r.id} className="p-3.5 bg-dark2 border border-border rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-text">
                      {r.current_shift_key} ({r.current_day_key}) ➔ {r.requested_shift_key} ({r.requested_day_key})
                    </span>
                    <Badge className={cn(
                      "text-[9px] uppercase font-bold px-2 py-0.5 rounded-full",
                      r.status === 'approved' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                      r.status === 'rejected' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                      "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    )}>
                      {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                    </Badge>
                  </div>
                  {r.reason && <p className="text-text-dim text-[11px]">Motivo: {r.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'audit' && (isAdmin || mode === 'coordinator') ? (
        <div className="space-y-4">
          {/* Encabezado de Auditoría */}
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-extrabold text-text uppercase tracking-wider">Historial de Auditoría</span>
            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold px-2.5 py-0.5">
              Registro de Actividad
            </Badge>
          </div>

          {loadingAuditLogs ? (
            <div className="py-6 text-center text-text-dim text-xs font-bold">Cargando historial de auditoría...</div>
          ) : volunteerTimeline.length === 0 ? (
            <div className="p-6 text-center text-text-dim border border-dashed border-border rounded-xl text-xs font-bold">
              No hay eventos ni cambios registrados para este voluntario.
            </div>
          ) : (
            <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
              {volunteerTimeline.map((item) => (
                <div key={item.id} className="relative flex flex-col p-3.5 bg-dark2 border border-border/80 rounded-2xl shadow-sm hover:border-border transition-all space-y-2">
                  <div className={`absolute -left-[19px] top-4 w-3.5 h-3.5 rounded-full border-2 border-dark2 ${item.colorBg}`} />
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-text-dim bg-dark3 border border-border px-1.5 py-0.5 rounded">
                        {item.timeOrDate}
                      </span>
                      <span className="font-extrabold text-xs text-text">{item.title}</span>
                    </div>
                    {item.badge && (
                      <span className={cn("px-2 py-0.5 text-[10px] font-extrabold rounded-full border shrink-0", item.badgeStyle)}>
                        {item.badge}
                      </span>
                    )}
                  </div>

                  {item.parsedChanges && item.parsedChanges.length > 0 ? (
                    <div className="mt-1.5 p-3 rounded-xl bg-dark3/80 border border-border/70 space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-dim/80 block mb-1">
                        Cambios realizados:
                      </span>
                      {item.parsedChanges.map((change: any, cIdx: number) => (
                        <div key={cIdx} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0 gap-2">
                          <span className="font-bold text-text-dim text-[11px] shrink-0">{change.label || change.field}</span>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end min-w-0">
                            <span className="px-2 py-0.5 rounded-md bg-dark2 text-text-dim border border-border text-[11px] line-through opacity-70 truncate max-w-[120px]">
                              {String(change.oldValue ?? 'Sin datos')}
                            </span>
                            <span className="text-text-dim text-[10px] shrink-0">➔</span>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold truncate max-w-[140px]">
                              {String(change.newValue ?? 'Sin datos')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : item.subtitle ? (
                    <p className="text-[11px] text-text-dim font-medium leading-snug">{item.subtitle}</p>
                  ) : null}

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-text-dim font-inter">
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-dim/60 font-semibold">Realizado por:</span>
                      <span className="font-bold text-text">{item.authorName || 'Coordinador'}</span>
                      {item.authorRole && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-dark3 border border-border text-text-dim uppercase">
                          {item.authorRole}
                        </span>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-[14px] text-emerald-500/70">verified</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* REAGENDAMIENTO MODAL PARA VOLUNTARIO */}
      {isRescheduleModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-dark2 border border-border rounded-3xl p-6 w-full max-w-md space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4d7cfe]">published_with_changes</span>
                Solicitar Reagendamiento
              </h3>
              <button
                type="button"
                onClick={() => setIsRescheduleModalOpen(false)}
                className="text-text-dim hover:text-text text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {submitSuccess ? (
              <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-2xl text-center">
                {submitSuccess}
              </div>
            ) : (
              <div className="space-y-4">
                {submitError && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-xl">
                    {submitError}
                  </div>
                )}

                {sourceShiftCompleted && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-rose-400 shrink-0">block</span>
                    <div>
                      <p className="text-rose-200 font-extrabold text-xs mb-0.5">Turno Origen Completado</p>
                      <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                        Este turno ya fue completado y finalizado. No es posible solicitar un cambio para un turno en estado completado.
                      </p>
                    </div>
                  </div>
                )}

                {/* Paso 1: Seleccionar turno origen */}
                <div>
                  <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                    1. Selecciona el turno asignado que deseas cambiar:
                  </label>
                  {assignedDayKeys.length === 0 ? (
                    <p className="text-xs text-amber-400 italic">No tienes turnos asignados actualmente.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 gap-2">
                        {EVENT_DAYS.map((d, index) => {
                          const hasShifts = (shiftsByDay[d.key] || []).length > 0;
                          const dayCompleted = isSourceDayFullyCompleted(d.key);
                          const isSelected = sourceDayKey === d.key;
                          const bgColors = [
                            'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                            'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                          ];
                          const cardBg = bgColors[index % bgColors.length];

                          return (
                            <button
                              key={d.key}
                              type="button"
                              disabled={!hasShifts || dayCompleted}
                              onClick={() => {
                                setSourceDayKey(d.key);
                                setSourceShiftKey("");
                              }}
                              className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-xl border transition-all bg-dark3 cursor-pointer ${
                                !hasShifts || dayCompleted
                                  ? 'opacity-30 border-border cursor-not-allowed'
                                  : isSelected
                                  ? 'border-[#4d7cfe] text-[#4d7cfe] shadow-md bg-[#4d7cfe]/10'
                                  : 'border-border text-text-dim hover:text-text'
                              }`}
                            >
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${cardBg}`} />
                              <span className="text-[9px] uppercase font-bold tracking-wider">{d.label.substring(0, 3)}</span>
                              <span className="text-sm font-black">{d.dateNum}</span>
                            </button>
                          );
                        })}
                      </div>

                      {sourceDayKey && (
                        <div className="animate-in fade-in">
                          <span className="text-[10px] text-text-dim uppercase font-bold block mb-1.5">Turno del {sourceDayKey}:</span>
                          <div className="grid grid-cols-4 gap-2">
                            {(shiftsByDay[sourceDayKey] || []).map((t) => {
                              const isSelected = sourceShiftKey === t;
                              const isCompleted = isVolunteerShiftCompleted(rescheduleCtx, sourceDayKey, t);
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  disabled={isCompleted}
                                  onClick={() => setSourceShiftKey(t)}
                                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                                    isCompleted
                                      ? 'bg-dark2 border-border text-text-dim/40 cursor-not-allowed opacity-40'
                                      : isSelected
                                      ? 'bg-rose-500 border-rose-500 text-white shadow-md cursor-pointer'
                                      : 'bg-dark3 border-border text-text hover:bg-dark3/80 cursor-pointer'
                                  }`}
                                >
                                  <span>{t}</span>
                                  {isCompleted && <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Completado</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Paso 2: Seleccionar turno destino */}
                {sourceDayKey && sourceShiftKey && (
                  <div className="space-y-4 pt-3 border-t border-border animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                        2. Selecciona la nueva fecha deseada:
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {EVENT_DAYS.map((d, index) => {
                          const isSelected = targetDayKey === d.key;
                          const bgColors = [
                            'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                            'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                          ];
                          const cardBg = bgColors[index % bgColors.length];

                          return (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => {
                                setTargetDayKey(d.key);
                                setTargetShiftKey('');
                              }}
                              className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-xl border transition-all bg-dark3 cursor-pointer ${
                                isSelected
                                  ? 'border-[#4d7cfe] text-[#4d7cfe] shadow-md bg-[#4d7cfe]/10'
                                  : 'border-border text-text-dim hover:text-text'
                              }`}
                            >
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${cardBg}`} />
                              <span className="text-[9px] uppercase font-bold tracking-wider">{d.label.substring(0, 3)}</span>
                              <span className="text-sm font-black">{d.dateNum}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {targetDayKey && (
                      <div className="animate-in fade-in">
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-2">
                          Nuevo turno para {targetDayKey}:
                        </label>
                        <div className={`grid gap-2 ${getAvailableShiftKeys(targetDayKey).length === 1 ? 'grid-cols-1' : 'grid-cols-4'}`}>
                          {getAvailableShiftKeys(targetDayKey).map((t) => {
                            const isSameShift = sourceDayKey === targetDayKey && sourceShiftKey === t;
                            const isSelected = targetShiftKey === t;
                            const tCompleted = isVolunteerShiftCompleted(rescheduleCtx, targetDayKey, t);
                            const tAssigned = !isSameShift && isVolunteerShiftAssigned(rescheduleCtx, targetDayKey, t);
                            const capInfo = getVolunteerShiftCapacity(rescheduleCtx, targetDayKey, t);
                            const isFull = capInfo.isFull;
                            const isBtnDisabled = isSameShift || tCompleted || tAssigned;
                            return (
                              <button
                                key={t}
                                type="button"
                                disabled={isBtnDisabled}
                                onClick={() => setTargetShiftKey(t)}
                                className={`py-2 rounded-xl border text-xs font-bold transition-all relative ${
                                  isBtnDisabled
                                    ? 'bg-dark2 border-border text-text-dim/40 cursor-not-allowed opacity-40'
                                    : isFull
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 cursor-pointer'
                                    : isSelected
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md cursor-pointer'
                                    : 'bg-dark3 border-border text-text hover:bg-dark3/80 cursor-pointer'
                                }`}
                              >
                                <span>{t}</span>
                                {isSameShift ? (
                                  <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Actual</span>
                                ) : tCompleted ? (
                                  <span className="block text-[8px] text-text-dim/60 font-normal leading-none">Completado</span>
                                ) : tAssigned ? (
                                  <span className="block text-[8px] text-amber-400 font-bold leading-none">Asignado</span>
                                ) : isFull ? (
                                  <span className="block text-[8px] text-amber-400 font-bold leading-none">Lleno ({capInfo.count}/{capInfo.maxReq})</span>
                                ) : (
                                  <span className="block text-[8px] text-text-dim/70 font-normal leading-none">
                                    {capInfo.maxReq > 0 ? `${capInfo.count} / ${capInfo.maxReq}` : `${capInfo.count} asig.`}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Paso 3: Razón o Motivo */}
                    {targetShiftKey && (
                      <div className="space-y-1.5 pt-2 border-t border-border animate-in fade-in">
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block">
                          3. Motivo o razón del cambio:
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Explica brevemente el motivo por el cual necesitas reagendar tu turno (ej: compromiso laboral, asunto de salud...)"
                          value={requestReason}
                          onChange={(e) => setRequestReason(e.target.value)}
                          className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe] font-medium placeholder:text-text-dim"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Advertencias de validación del turno destino */}
                {targetShiftStatus.isSource && (
                  <div className="p-3.5 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-inter font-bold flex items-center gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-purple-400 shrink-0">info</span>
                    <span>Este es el turno actual origen. Selecciona otro horario o día para solicitar el cambio.</span>
                  </div>
                )}
                {!targetShiftStatus.isSource && targetShiftStatus.isCompleted && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-rose-400 shrink-0">block</span>
                    <div>
                      <p className="text-rose-200 font-extrabold text-xs mb-0.5">Turno Ya Completado</p>
                      <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                        Ya completaste este turno previamente. No es posible solicitar un cambio hacia un turno ya completado.
                      </p>
                    </div>
                  </div>
                )}
                {!targetShiftStatus.isSource && !targetShiftStatus.isCompleted && targetShiftStatus.isAssigned && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                    <div>
                      <p className="text-amber-200 font-extrabold text-xs mb-0.5">Turno Ya Asignado</p>
                      <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                        Ya cuentas con este turno activo asignado. Elige un horario o día distinto.
                      </p>
                    </div>
                  </div>
                )}
                {!targetShiftStatus.isSource && !targetShiftStatus.isCompleted && !targetShiftStatus.isAssigned && targetCapacity.isFull && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                    <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                    <div>
                      <p className="text-amber-200 font-extrabold text-xs mb-0.5">Capacidad Máxima Alcanzada</p>
                      <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                        El turno <strong className="text-white">{targetShiftKey}</strong> del <strong className="text-white">{targetDayKey}</strong> ya alcanzó la meta requerida para <strong className="text-white">{targetCapacity.committeeName}</strong> ({targetCapacity.count}/{targetCapacity.maxReq}). Puedes enviar la solicitud y el coordinador decidirá si te sobreasigna.
                      </p>
                    </div>
                  </div>
                )}

                {/* Botón de Enviar */}
                <div className="pt-4 border-t border-border flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsRescheduleModalOpen(false)}
                    className="flex-1 h-11 rounded-full text-xs font-bold border-border text-text bg-dark3 hover:bg-dark cursor-pointer"
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    disabled={!sourceDayKey || !sourceShiftKey || !targetDayKey || !targetShiftKey || !requestReason.trim() || isSubmitting || sourceShiftCompleted || targetShiftStatus.isSource || targetShiftStatus.isCompleted || targetShiftStatus.isAssigned}
                    onClick={handleSendRescheduleRequest}
                    className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:bg-dark3 disabled:text-text-dim disabled:border-border text-white rounded-full h-11 text-xs font-bold shadow-lg active:scale-95 transition-all cursor-pointer"
                  >
                    {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
