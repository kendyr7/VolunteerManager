'use client'

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchVolunteerRescheduleContextAction,
  type VolunteerRescheduleContext,
  type VolunteerRescheduleContextResult,
} from '@/app/actions/shift-change-actions';

export function useVolunteerRescheduleContext(volunteerId: string) {
  const [loaded, setLoaded] = useState<{
    volunteerId: string;
    context: VolunteerRescheduleContextResult;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!volunteerId) {
      setIsRefreshing(false);
      return null;
    }

    const requestId = ++requestIdRef.current;
    setIsRefreshing(true);
    const result = await fetchVolunteerRescheduleContextAction(volunteerId);
    if (requestId === requestIdRef.current) {
      setLoaded({ volunteerId, context: result });
      setIsRefreshing(false);
    }
    return result;
  }, [volunteerId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      requestIdRef.current += 1;
    };
  }, [refresh, volunteerId]);

  const ctx = loaded?.volunteerId === volunteerId ? loaded.context : null;
  return { context: ctx, isRefreshing, refresh };
}

export function isVolunteerShiftCompleted(
  ctx: VolunteerRescheduleContext | null,
  dayKey: string,
  shiftKey: string
) {
  return !!ctx?.ownShifts.some(
    (s) => s.day_key === dayKey && s.shift_key === shiftKey && s.checked_out
  );
}

export function isVolunteerShiftAssigned(
  ctx: VolunteerRescheduleContext | null,
  dayKey: string,
  shiftKey: string
) {
  return !!ctx?.ownShifts.some(
    (s) => s.day_key === dayKey && s.shift_key === shiftKey
  );
}

export function getVolunteerShiftCapacity(
  ctx: VolunteerRescheduleContext | null,
  dayKey: string,
  shiftKey: string
) {
  const commName = ctx?.committeeName || 'Sin comité';
  const slot = ctx?.capacityByShift[dayKey]?.[shiftKey];
  const maxReq = slot?.required ?? 0;
  const count = slot?.count ?? 0;
  return {
    committeeName: commName,
    count,
    maxReq,
    available: maxReq > 0 ? Math.max(maxReq - count, 0) : null,
    isFull: maxReq > 0 && count >= maxReq,
  };
}
