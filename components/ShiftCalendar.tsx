'use client'

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { recalculateReliability } from "@/app/actions/attendance";
import { toggleShiftAction } from "@/app/actions/volunteer-actions";
import { VolunteerProfileView, VolunteerProfileData } from "@/components/VolunteerProfileView";
import { AnimatedLogo } from "@/components/ui/animated-logo";

export interface VolunteerInfo extends VolunteerProfileData {}

interface ShiftCalendarProps {
  volunteerId: string;
  volunteerInfo?: VolunteerInfo;
  initialShifts?: any[];
}

function parseShifts(data: any[] = []) {
  const mapped: Record<string, string[]> = {};
  const confirmed: Record<string, string[]> = {};
  const checkedOut: Record<string, string[]> = {};

  data.forEach(s => {
    if (!mapped[s.day_key]) {
      mapped[s.day_key] = [];
    }
    if (!mapped[s.day_key].includes(s.shift_key)) {
      mapped[s.day_key].push(s.shift_key);
    }

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

  return { mapped, confirmed, checkedOut };
}

export function ShiftCalendar({ volunteerId, volunteerInfo, initialShifts = [] }: ShiftCalendarProps) {
  const supabase = createClient();

  const initialParsed = parseShifts(initialShifts);
  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>(initialParsed.mapped);
  const [checkedInShifts, setCheckedInShifts] = useState<Record<string, string[]>>(initialParsed.confirmed);
  const [checkedOutShifts, setCheckedOutShifts] = useState<Record<string, string[]>>(initialParsed.checkedOut);
  const [loading, setLoading] = useState(!volunteerInfo && initialShifts.length === 0);
  const [isPending, startTransition] = useTransition();
  const [volunteerData, setVolunteerData] = useState<VolunteerInfo | undefined>(volunteerInfo);

  // Load shifts for this volunteer
  const loadShifts = async () => {
    try {
      if (!volunteerData) {
        const { data: vol } = await supabase
          .from('volunteers')
          .select('*, committees(name)')
          .eq('id', volunteerId)
          .maybeSingle();

        if (vol) {
          const fullName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim();
          setVolunteerData({
            id: vol.id,
            name: fullName,
            first_name: vol.first_name || '',
            last_name: vol.last_name || '',
            committee: (vol.committees as any)?.name || 'Sin comité',
            stake: vol.stake || '',
            ward: vol.neighborhood || '',
            phone: vol.phone || '',
            reliability: vol.reliability_score ?? 100,
            age: vol.age || undefined,
          });
        }
      }

      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('volunteer_id', volunteerId);

      if (error) {
        console.error("Error loading volunteer shifts:", error);
        return;
      }

      if (data) {
        const { mapped, confirmed, checkedOut } = parseShifts(data);
        setShiftsByDay(mapped);
        setCheckedInShifts(confirmed);
        setCheckedOutShifts(checkedOut);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [volunteerId]);

  // Toggle shift on click
  const handleToggleShift = (dayKey: string, shiftKey: string) => {
    // If the shift is already checked-in or checked-out, do not allow toggling
    const isCheckedIn = (checkedInShifts[dayKey] || []).includes(shiftKey);
    const isCheckedOut = (checkedOutShifts[dayKey] || []).includes(shiftKey);
    if (isCheckedIn || isCheckedOut) return;

    startTransition(async () => {
      const active = (shiftsByDay[dayKey] || []).includes(shiftKey);
      const result = await toggleShiftAction(volunteerId, dayKey, shiftKey, !active);

      if (!result.success) {
        console.error("Error updating shift:", result.error);
        return;
      }

      if (active) {
        setShiftsByDay(prev => {
          const current = prev[dayKey] || [];
          return {
            ...prev,
            [dayKey]: current.filter(s => s !== shiftKey)
          };
        });
      } else {
        setShiftsByDay(prev => {
          const current = prev[dayKey] || [];
          return {
            ...prev,
            [dayKey]: [...current, shiftKey]
          };
        });
      }
      
      // Recalculate reliability score
      await recalculateReliability(volunteerId);
    });
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
      {isPending && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-text border border-emerald-500/20 font-bold px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs animate-pulse">
          <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
          Guardando cambios...
        </div>
      )}

      <VolunteerProfileView
        volunteer={volunteerData}
        mode="volunteer"
        shiftsByDay={shiftsByDay}
        checkedInMap={checkedInShifts}
        checkedOutMap={checkedOutShifts}
        onToggleShift={handleToggleShift}
      />
    </div>
  );
}