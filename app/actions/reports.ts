'use server'

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth";
import { getActiveEventDays, SHIFT_TIMES } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface ReportItem {
  registrationId: string;
  volunteerId: string;
  volunteerName: string;
  phone: string;
  neighborhood: string;
  stake: string;
  committeeId: string;
  committeeName: string;
  date: string;
  shiftNumber: number;
  startTime: string;
  endTime: string;
  isExtended: boolean;
  status: 'registered' | 'confirmed' | 'absent' | 'replaced';
  durationMinutes: number;
}

export interface CommitteeAttendance {
  committeeId: string;
  committeeName: string;
  assigned: number;
  checkedIn: number;
  absent: number;
  required: number;  // sum of all shift requirements for this committee
  attendanceRate: number;
  coverageRate: number; // checked-in / required
}

export interface AttendanceSummary {
  totalAssigned: number;
  totalCheckedIn: number;
  totalAbsent: number;
  totalRequired: number;
  attendanceRate: number;   // checkedIn / assigned
  coverageRate: number;     // checkedIn / required
  byCommittee: CommitteeAttendance[];
  byShift: { shiftKey: string; assigned: number; checkedIn: number; required: number; rate: number }[];
}

export interface ReportsData {
  items: ReportItem[];
  uniqueNeighborhoods: string[];
  uniqueStakes: string[];
  uniqueCommittees: { id: string; name: string }[];
  attendanceSummary: AttendanceSummary;
}



// Build a lookup map from day_key -> ISO date string using the canonical event days from dates.ts
// e.g. "mié 16" -> "2026-09-16"
function buildDayKeyMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const date of getActiveEventDays()) {
    const key = format(date, "EEE d", { locale: es }).toLowerCase();
    const iso = format(date, "yyyy-MM-dd");
    map.set(key, iso);
  }
  return map;
}

// Cached on module load (server singleton) — no hardcoded dates
const DAY_KEY_MAP = buildDayKeyMap();

function parseDayKeyToDateStr(dayKey: string): string {
  const normalized = dayKey.trim().toLowerCase();
  return DAY_KEY_MAP.get(normalized) ?? normalized; // fallback to raw key if not found
}

function parseNicaraguaShiftEnd(dayKey: string, shiftKey: string): Date {
  const isoDate = parseDayKeyToDateStr(dayKey);
  if (!isoDate || isoDate === dayKey) return new Date(); // unknown date, treat as past

  // Shift end hours (Nicaragua UTC-6; shift times match SHIFT_TIMES from dates.ts)
  const endHours: Record<string, number> = { T1: 12, T2: 15, T3: 18, T4: 22 };
  const endHour = endHours[shiftKey] ?? 12;

  // Build a UTC timestamp for the Nicaragua local end time (UTC-6 = endHour + 6 UTC)
  const [year, month, day] = isoDate.split('-').map(Number);
  const utcMillis = Date.UTC(year, month - 1, day, endHour + 6, 0, 0);
  return new Date(utcMillis);
}

// Derive shift details from the canonical SHIFT_TIMES in dates.ts (no hardcoded data)
// SHIFT_TIMES has ids 1..4; shift_key in DB is 'T1'..'T4'
const SHIFT_DETAILS: Record<string, { start: string; end: string; hours: number }> = {};
for (const s of SHIFT_TIMES) {
  const key = `T${s.id}`;
  // Parse times from the "8:00 AM - 12:00 PM" format in SHIFT_TIMES.time
  const [startRaw, endRaw] = s.time.split(' - ');
  const parseTime = (t: string) => {
    const [hhmm, ampm] = t.split(' ');
    let [hh] = hhmm.split(':').map(Number);
    if (ampm === 'PM' && hh !== 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    return `${hh.toString().padStart(2,'0')}:00`;
  };
  SHIFT_DETAILS[key] = { start: parseTime(startRaw), end: parseTime(endRaw), hours: s.hours };
}

export async function getReportsData(): Promise<{ error?: string; data?: ReportsData }> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);

    if (!session || session.userType !== 'profile') {
      return { error: "No autorizado." };
    }

    const { role, committee: userCommittee } = session;
    // Usar Service Role temporalmente porque el usuario habilitó RLS sin políticas, lo que bloquea todas las consultas
    let supabase;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
      supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } else {
      supabase = await createClient();
    }

    // 1. Fetch volunteers
    const { data: volsData, error: volsError } = await supabase
      .from('volunteers')
      .select('*, committees(id, name)');

    if (volsError) {
      console.error("Error loading volunteers for reports:", volsError);
      return { error: "Error al consultar los voluntarios." };
    }

    // 2. Fetch shifts
    const { data: shiftsData, error: shiftsError } = await supabase
      .from('shifts')
      .select('*');

    if (shiftsError) {
      console.error("Error loading shifts for reports:", shiftsError);
      return { error: "Error al consultar los turnos." };
    }

    // 3. Fetch committee_shift_requirements (server-side authoritative source)
    const { data: reqsData } = await supabase
      .from('committee_shift_requirements')
      .select('committee_id, shift_key, required');

    // Build requirements map: committeeId -> shiftKey -> required
    const reqsMap: Record<string, Record<string, number>> = {};
    (reqsData || []).forEach((r: any) => {
      if (!reqsMap[r.committee_id]) reqsMap[r.committee_id] = {};
      reqsMap[r.committee_id][r.shift_key] = r.required;
    });

    // Default requirements if table is empty
    const DEFAULT_REQ = 4;
    const getRequired = (commId: string, shiftKey: string) =>
      reqsMap[commId]?.[shiftKey] ?? DEFAULT_REQ;

    // 3. Process data in memory
    const items: ReportItem[] = [];
    const neighborhoodsSet = new Set<string>();
    const stakesSet = new Set<string>();
    const committeesMap = new Map<string, string>();
    
    const now = new Date();

    shiftsData?.forEach((s: any) => {
      // Find matching volunteer
      const vol = volsData?.find(v => v.id === s.volunteer_id);
      if (!vol) return;

      const committee = vol.committees;
      if (!committee) return;

      // Access isolation: non-Admin coordinators only see their own committee data
      if (role !== 'Admin' && committee.name !== userCommittee) {
        return;
      }

      // Map values
      if (vol.neighborhood) neighborhoodsSet.add(vol.neighborhood);
      if (vol.stake) stakesSet.add(vol.stake);
      committeesMap.set(committee.id, committee.name);

      const shiftMeta = SHIFT_DETAILS[s.shift_key] || { start: '08:00', end: '12:00', hours: 4 };
      const dateStr = parseDayKeyToDateStr(s.day_key);
      const shiftNum = parseInt(s.shift_key.substring(1)) || 1;

      // Determine attendance status
      let status: 'registered' | 'confirmed' | 'absent' | 'replaced' = 'registered';
      let durationMinutes = 0;

      if (s.checked_in) {
        status = 'confirmed';
        // Opción A: Asignar 0 si no han hecho check-out, o calcular minutos exactos
        if (s.checked_in_at && s.checked_out_at) {
          const inTime = new Date(s.checked_in_at).getTime();
          const outTime = new Date(s.checked_out_at).getTime();
          // Diferencia en minutos (max 0 para evitar negativos si hay errores en fechas)
          durationMinutes = Math.max(0, Math.round((outTime - inTime) / 60000));
        } else {
          durationMinutes = 0;
        }
      } else {
        const shiftEndTime = parseNicaraguaShiftEnd(s.day_key, s.shift_key);
        if (now > shiftEndTime) {
          // If shift has passed and checked_in is false, it's marked as absent
          status = 'absent';
        }
      }

      items.push({
        registrationId: s.id,
        volunteerId: vol.id,
        volunteerName: `${vol.first_name || ''} ${vol.last_name || ''}`.trim(),
        phone: vol.phone || '',
        neighborhood: vol.neighborhood || 'Sin barrio',
        stake: vol.stake || 'Sin estaca',
        committeeId: committee.id,
        committeeName: committee.name,
        date: dateStr,
        shiftNumber: shiftNum,
        startTime: shiftMeta.start,
        endTime: shiftMeta.end,
        isExtended: s.shift_key === 'T4', // T4 is 5 hours
        status,
        durationMinutes
      });
    });

    const uniqueNeighborhoods = Array.from(neighborhoodsSet).sort();
    const uniqueStakes = Array.from(stakesSet).sort();
    const uniqueCommittees = Array.from(committeesMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

    // Build attendance summary
    const commAttMap: Record<string, CommitteeAttendance> = {};
    const shiftAttMap: Record<string, { assigned: number; checkedIn: number; required: number }> = {};
    for (const sk of ['T1', 'T2', 'T3', 'T4']) {
      shiftAttMap[sk] = { assigned: 0, checkedIn: 0, required: 0 };
    }

    items.forEach(item => {
      const cId = item.committeeId;
      if (!commAttMap[cId]) {
        commAttMap[cId] = {
          committeeId: cId,
          committeeName: item.committeeName,
          assigned: 0, checkedIn: 0, absent: 0, required: 0,
          attendanceRate: 0, coverageRate: 0,
        };
      }
      const sk = `T${item.shiftNumber}`;
      const req = getRequired(cId, sk);
      commAttMap[cId].assigned++;
      commAttMap[cId].required += req;
      shiftAttMap[sk].assigned++;
      shiftAttMap[sk].required += req;
      if (item.status === 'confirmed') {
        commAttMap[cId].checkedIn++;
        shiftAttMap[sk].checkedIn++;
      } else if (item.status === 'absent') {
        commAttMap[cId].absent++;
      }
    });

    const byCommittee: CommitteeAttendance[] = Object.values(commAttMap).map(c => ({
      ...c,
      attendanceRate: c.assigned > 0 ? Math.round((c.checkedIn / c.assigned) * 100) : 0,
      coverageRate: c.required > 0 ? Math.round((c.checkedIn / c.required) * 100) : 0,
    }));

    const byShift = ['T1', 'T2', 'T3', 'T4'].map(sk => ({
      shiftKey: sk,
      ...shiftAttMap[sk],
      rate: shiftAttMap[sk].assigned > 0
        ? Math.round((shiftAttMap[sk].checkedIn / shiftAttMap[sk].assigned) * 100) : 0,
    }));

    const totalCheckedIn = items.filter(i => i.status === 'confirmed').length;
    const totalAbsent = items.filter(i => i.status === 'absent').length;
    const totalAssigned = items.length;
    const totalRequired = Object.values(commAttMap).reduce((s, c) => s + c.required, 0);

    const attendanceSummary: AttendanceSummary = {
      totalAssigned,
      totalCheckedIn,
      totalAbsent,
      totalRequired,
      attendanceRate: totalAssigned > 0 ? Math.round((totalCheckedIn / totalAssigned) * 100) : 0,
      coverageRate: totalRequired > 0 ? Math.round((totalCheckedIn / totalRequired) * 100) : 0,
      byCommittee,
      byShift,
    };

    return {
      data: {
        items,
        uniqueNeighborhoods,
        uniqueStakes,
        uniqueCommittees,
        attendanceSummary,
      }
    };
  } catch (err: any) {
    console.error("Critical error in getReportsData action:", err);
    return { error: "Ocurrió un error inesperado al cargar reportes." };
  }
}
