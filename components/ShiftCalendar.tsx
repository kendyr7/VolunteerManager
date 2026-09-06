'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { recalculateReliability } from "@/app/actions/attendance";
import { toggleShiftAction } from "@/app/actions/volunteer-actions";
import { VolunteerProfileView, VolunteerProfileData } from "@/components/VolunteerProfileView";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { getVolunteerScheduleAction } from "@/app/actions/volunteer-schedule-actions";
import type { VolunteerScheduleShift } from "@/lib/types/volunteer-schedule";
import type { ShiftAreaDetails } from "@/lib/shift-area";

export type VolunteerInfo = VolunteerProfileData;

interface ShiftCalendarProps {
  volunteerId: string;
  volunteerInfo?: VolunteerInfo;
  initialShifts?: VolunteerScheduleShift[];
  initialSessions?: any[];
}

function areaSlotKey(dayKey: string, shiftKey: string) {
  return `${dayKey}:${shiftKey}`;
}

function parseShifts(data: VolunteerScheduleShift[] = []) {
  const mapped: Record<string, string[]> = {};
  const confirmed: Record<string, string[]> = {};
  const checkedOut: Record<string, string[]> = {};
  const areas: Record<string, ShiftAreaDetails | null> = {};

  data.forEach(s => {
    if (!mapped[s.day_key]) {
      mapped[s.day_key] = [];
    }
    if (!mapped[s.day_key].includes(s.shift_key)) {
      mapped[s.day_key].push(s.shift_key);
    }
    areas[areaSlotKey(s.day_key, s.shift_key)] = s.area_name
      ? { name: s.area_name, description: s.area_description }
      : null;

    if (s.checked_in || s.checked_in_at || s.checked_out || s.checked_out_at) {
      if (!confirmed[s.day_key]) {
        confirmed[s.day_key] = [];
      }
      if (!confirmed[s.day_key].includes(s.shift_key)) {
        confirmed[s.day_key].push(s.shift_key);
      }
    }

    if (s.checked_out || s.checked_out_at) {
      if (!checkedOut[s.day_key]) {
        checkedOut[s.day_key] = [];
      }
      if (!checkedOut[s.day_key].includes(s.shift_key)) {
        checkedOut[s.day_key].push(s.shift_key);
      }
    }
  });

  return { mapped, confirmed, checkedOut, areas };
}

export function ShiftCalendar({ volunteerId, volunteerInfo, initialShifts = [], initialSessions = [] }: ShiftCalendarProps) {
  const supabase = useMemo(() => createClient(), []);

  const initialParsed = parseShifts(initialShifts);
  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(initialParsed.mapped);
  const [checkedInShifts, setCheckedInShifts] = useState<Record<string, string[]>>(initialParsed.confirmed);
  const [checkedOutShifts, setCheckedOutShifts] = useState<Record<string, string[]>>(initialParsed.checkedOut);
  const [shiftAreasBySlot, setShiftAreasBySlot] = useState<Record<string, ShiftAreaDetails | null>>(initialParsed.areas);
  const [loading, setLoading] = useState(!volunteerInfo && initialShifts.length === 0);
  const [pendingShiftKeys, setPendingShiftKeys] = useState<Set<string>>(() => new Set());
  const pendingShiftKeysRef = useRef(new Set<string>());
  const volunteerData = volunteerInfo;

  const setShiftAssigned = useCallback((dayKey: string, shiftKey: string, assigned: boolean) => {
    setShiftsByDay(prev => {
      const current = prev[dayKey] || [];
      const next = assigned
        ? (current.includes(shiftKey) ? current : [...current, shiftKey])
        : current.filter(s => s !== shiftKey);
      return { ...prev, [dayKey]: next };
    });

    setShiftAreasBySlot(current => {
      const next = { ...current };
      if (assigned) next[areaSlotKey(dayKey, shiftKey)] = next[areaSlotKey(dayKey, shiftKey)] ?? null;
      else delete next[areaSlotKey(dayKey, shiftKey)];
      return next;
    });
  }, []);

  // Load shifts for this volunteer
  const loadShifts = useCallback(async () => {
    try {
      const result = await getVolunteerScheduleAction(volunteerId);
      if (result.success) {
        const { mapped, confirmed, checkedOut, areas } = parseShifts(result.shifts);
        setShiftsByDay(mapped);
        setCheckedInShifts(confirmed);
        setCheckedOutShifts(checkedOut);
        setShiftAreasBySlot(areas);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [volunteerId]);

  useEffect(() => {
    loadShifts();

    const reconcileWhileVisible = () => {
      if (document.visibilityState === 'visible') void loadShifts();
    };
    const reconciliationTimer = window.setInterval(reconcileWhileVisible, 10_000);

    const channel = supabase
      .channel(`volunteer_calendar_${volunteerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `volunteer_id=eq.${volunteerId}` },
        () => {
          loadShifts();
        }
      )
      .on(
        'broadcast',
        { event: 'shift_sync' },
        (eventPayload) => {
          const payload = eventPayload?.payload;
          if (payload?.table === 'shifts' && payload?.record?.volunteer_id === volunteerId) {
            loadShifts();
          }
        }
      )
      .on(
        'broadcast',
        { event: 'session_sync' },
        (eventPayload) => {
          const payload = eventPayload?.payload;
          if (payload?.table === 'attendance_sessions' && payload?.record?.volunteer_id === volunteerId) {
            void loadShifts();
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(reconciliationTimer);
      supabase.removeChannel(channel);
    };
  }, [loadShifts, supabase, volunteerId]);

  // Toggle shift on click
  const handleToggleShift = async (dayKey: string, shiftKey: string) => {
    // If the shift is already checked-in or checked-out, do not allow toggling
    const isCheckedIn = (checkedInShifts[dayKey] || []).includes(shiftKey);
    const isCheckedOut = (checkedOutShifts[dayKey] || []).includes(shiftKey);
    if (isCheckedIn || isCheckedOut) return;

    const slotKey = areaSlotKey(dayKey, shiftKey);
    if (pendingShiftKeysRef.current.has(slotKey)) return;

    const active = (shiftsByDay[dayKey] || []).includes(shiftKey);
    const shouldAssign = !active;
    pendingShiftKeysRef.current.add(slotKey);
    setPendingShiftKeys(new Set(pendingShiftKeysRef.current));
    setShiftAssigned(dayKey, shiftKey, shouldAssign);

    try {
      const result = await toggleShiftAction(volunteerId, dayKey, shiftKey, shouldAssign);

      if (!result.success) {
        setShiftAssigned(dayKey, shiftKey, active);
        console.error("Error updating shift:", result.error);
        return;
      }

      // Recalculate reliability score
      void recalculateReliability(volunteerId);
    } catch (error) {
      setShiftAssigned(dayKey, shiftKey, active);
      console.error("Error updating shift:", error);
    } finally {
      pendingShiftKeysRef.current.delete(slotKey);
      setPendingShiftKeys(new Set(pendingShiftKeysRef.current));
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  if (!volunteerData) return null;

  return (
    <div className="flex flex-col gap-4 w-full pb-16">
      {pendingShiftKeys.size > 0 && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-text border border-emerald-500/20 font-bold px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs animate-pulse">
          <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
          Guardando cambios...
        </div>
      )}

      <VolunteerProfileView
        volunteer={volunteerData}
        mode="volunteer"
        attendanceSessions={initialSessions}
        shiftsByDay={shiftsByDay}
        checkedInMap={checkedInShifts}
        checkedOutMap={checkedOutShifts}
        shiftAreasBySlot={shiftAreasBySlot}
        pendingShiftKeys={pendingShiftKeys}
        onToggleShift={handleToggleShift}
      />
    </div>
  );
}
