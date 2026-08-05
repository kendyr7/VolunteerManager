'use client'

import { useEffect, useState } from 'react';
import {
  fetchVolunteerRescheduleContextAction,
  type VolunteerRescheduleContext,
} from '@/app/actions/shift-change-actions';

export function useVolunteerRescheduleContext(volunteerId: string) {
  const [ctx, setCtx] = useState<VolunteerRescheduleContext | null>(null);

  useEffect(() => {
    let active = true;
    if (!volunteerId) {
      setCtx(null);
      return;
    }
    setCtx(null);
    (async () => {
      const res = await fetchVolunteerRescheduleContextAction(volunteerId);
      if (active) setCtx(res);
    })();
    return () => {
      active = false;
    };
  }, [volunteerId]);

  return ctx;
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
  const maxReq = ctx?.requirementsByCommittee[commName]?.[shiftKey] ?? 0;
  const count = ctx?.assignmentCountsByShift[dayKey]?.[shiftKey]?.[commName] ?? 0;
  return {
    committeeName: commName,
    count,
    maxReq,
    isFull: maxReq > 0 && count >= maxReq,
  };
}
