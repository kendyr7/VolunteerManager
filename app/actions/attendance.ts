'use server'

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error("La variable de entorno JWT_SECRET no está configurada.");
}

// Parse day key to actual Date representing the end of the shift in Nicaragua timezone (UTC-6)
function parseShiftDateTime(dayKey: string, shiftKey: string): Date {
  const dayNumPart = dayKey.split(' ')[1];
  const dayNum = parseInt(dayNumPart) || 10; // Fallback to 10
  
  let endHour = 12;
  if (shiftKey === 'T2') endHour = 15;
  if (shiftKey === 'T3') endHour = 18;
  if (shiftKey === 'T4') endHour = 22;

  // Nicaragua is UTC-6. So UTC Time = Nicaragua Time + 6 hours.
  // Using Date.UTC guarantees a timezone-independent absolute epoch timestamp.
  const utcMillis = Date.UTC(2026, 8, dayNum, endHour + 6, 0, 0);
  return new Date(utcMillis);
}

// Check if current time is within a shift window (with 45 min buffer before/after) based on America/Managua time
function isCurrentTimeInShiftWindow(dayKey: string, shiftKey: string): boolean {
  // Get current time in America/Managua timezone
  const nicaString = new Date().toLocaleString("en-US", { timeZone: "America/Managua" });
  const nicaNow = new Date(nicaString);
  
  // Format current date to day_key: e.g. "mié 16"
  const currentDayKey = format(nicaNow, "EEE d", { locale: es }).toLowerCase();
  if (dayKey.toLowerCase() !== currentDayKey) {
    return false;
  }

  const currentHour = nicaNow.getHours() + nicaNow.getMinutes() / 60;

  // Window definitions (StartHour - 45 min buffer to EndHour + 45 min buffer)
  let startWindow = 7.25; // T1 starts at 8:00 AM (7:15 AM)
  let endWindow = 12.75; // T1 ends at 12:00 PM (12:45 PM)

  if (shiftKey === 'T2') {
    startWindow = 10.25; // 11:00 AM (10:15 AM)
    endWindow = 15.75;  // 3:00 PM (3:45 PM)
  } else if (shiftKey === 'T3') {
    startWindow = 13.25; // 2:00 PM (1:15 PM)
    endWindow = 18.75;  // 6:00 PM (6:45 PM)
  } else if (shiftKey === 'T4') {
    startWindow = 16.25; // 5:00 PM (4:15 PM)
    endWindow = 22.75;  // 10:00 PM (10:45 PM)
  }

  return currentHour >= startWindow && currentHour <= endWindow;
}

// 1. Generate Dynamic Pass Token
export async function generateEntryPassToken(volunteerId: string) {
  const timestamp = Date.now();
  const hmac = crypto.createHmac("sha256", SECRET!);
  hmac.update(`${volunteerId}:${timestamp}`);
  const signature = hmac.digest("hex");

  return {
    volunteerId,
    timestamp,
    signature
  };
}

// 2. Recalculate Reliability Score
export async function recalculateReliability(volunteerId: string) {
  const supabase = await createClient();

  // Fetch all shifts for the volunteer
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', volunteerId);

  if (error || !shifts || shifts.length === 0) {
    return;
  }

  const now = new Date();
  let numerator = 0;   // Checked in shifts
  let denominator = 0; // Completed shifts (passed or checked in)

  for (const s of shifts) {
    const shiftEndTime = parseShiftDateTime(s.day_key, s.shift_key);

    if (s.checked_in) {
      numerator++;
      denominator++;
    } else if (now > shiftEndTime) {
      // Shift passed, and was not checked in (absent)
      // Note: we can skip replaced shifts if there was status.
      // In this database, shifts table has no status column, only shifts.
      // So if it exists in shifts and time passed without checkin, they missed it.
      denominator++;
    }
  }

  if (denominator > 0) {
    const score = Math.round((numerator / denominator) * 100);
    await supabase
      .from('volunteers')
      .update({ reliability_score: score })
      .eq('id', volunteerId);
  }
}

// 3. Process Check-in via QR Scan or manual selection
export async function checkInVolunteer(qrValueString: string, coordinatorId: string, manualShiftId?: string) {
  const supabase = await createClient();

  let volunteerId = "";
  
  if (manualShiftId) {
    try {
      // Manual override check-in for a specific shift ID
      const { data: shift, error: shiftErr } = await supabase
        .from('shifts')
        .select('volunteer_id')
        .eq('id', manualShiftId)
        .single();

      if (shiftErr || !shift) {
        return { error: "No se encontró el turno seleccionado." };
      }
      volunteerId = shift.volunteer_id;

      const FALLBACK_ID = '99999999-9999-9999-9999-999999999999';
      const updatePayload: Record<string, unknown> = {
        checked_in: true,
        checked_in_at: new Date().toISOString(),
      };
      if (coordinatorId && coordinatorId !== FALLBACK_ID) {
        updatePayload.checked_in_by = coordinatorId;
      }

      const { error: updateErr } = await supabase
        .from('shifts')
        .update(updatePayload)
        .eq('id', manualShiftId);

      if (updateErr) {
        console.error("Error updating manual check-in:", updateErr);
        return { error: "Error al registrar la asistencia en la base de datos." };
      }

      // Recalculamos la fiabilidad en segundo plano sin bloquear el flujo principal del Check-In
      recalculateReliability(volunteerId).catch(err => 
        console.error("Error en segundo plano al recalcular fiabilidad (manual):", err)
      );

      // Fetch volunteer details to return
      const { data: vol } = await supabase
        .from('volunteers')
        .select('*, committees(name)')
        .eq('id', volunteerId)
        .single();

      return {
        success: true,
        message: "Asistencia registrada manualmente.",
        volunteer: vol ? `${vol.first_name} ${vol.last_name}` : "Voluntario",
        committee: vol?.committees?.name || "Sin comité"
      };
    } catch (manualErr) {
      console.error("Unexpected error in manual check-in:", manualErr);
      return { error: "Error inesperado al registrar la asistencia." };
    }
  }

  // standard QR scan flow
  try {
    const payload = JSON.parse(qrValueString);
    const { id, ts, sig } = payload;

    if (!id || !ts || !sig) {
      return { error: "Código QR inválido. Formato no compatible." };
    }

    // Verify signature
    const hmac = crypto.createHmac("sha256", SECRET!);
    hmac.update(`${id}:${ts}`);
    const expectedSig = hmac.digest("hex");

    if (sig !== expectedSig) {
      return { error: "Código QR no válido o alterado." };
    }

    // Verify expiration (30 minutes)
    const elapsed = Date.now() - ts;
    if (elapsed > 30 * 60 * 1000 || elapsed < -5 * 60 * 1000) { // 30 min expiration, with 5 min grace for clock skew
      return { error: "El código QR ha expirado. Por favor, solicite al voluntario actualizar su pantalla." };
    }

    volunteerId = id;
  } catch (e) {
    return { error: "Error al leer el código QR. Formato inválido." };
  }

  // Fetch volunteer details
  const { data: volunteer, error: volError } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .eq('id', volunteerId)
    .single();

  if (volError || !volunteer) {
    return { error: "Voluntario no encontrado en el sistema." };
  }

  // Fetch all scheduled shifts for the volunteer
  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', volunteerId);

  if (shiftsError || !shifts || shifts.length === 0) {
    return {
      error: `El voluntario ${volunteer.first_name} ${volunteer.last_name} no tiene turnos programados en el sistema.`
    };
  }

  // Filter shifts for today (based on America/Managua time)
  const nicaString = new Date().toLocaleString("en-US", { timeZone: "America/Managua" });
  const nicaNow = new Date(nicaString);
  const todayKey = format(nicaNow, "EEE d", { locale: es }).toLowerCase();
  
  const todayShifts = shifts.filter(s => s.day_key.toLowerCase() === todayKey);

  // Try to find a shift that is currently in its time window
  const activeShift = todayShifts.find(s => isCurrentTimeInShiftWindow(s.day_key, s.shift_key));

  if (activeShift) {
    // Check if already checked in
    if (activeShift.checked_in) {
      return {
        alreadyCheckedIn: true,
        message: "Este turno ya tiene asistencia registrada.",
        volunteer: `${volunteer.first_name} ${volunteer.last_name}`,
        committee: volunteer.committees?.name || "Sin comité",
        shiftDetail: `${activeShift.day_key} - ${activeShift.shift_key}`
      };
    }

      const FALLBACK_ID = '99999999-9999-9999-9999-999999999999';
      const autoPayload: Record<string, unknown> = {
        checked_in: true,
        checked_in_at: new Date().toISOString(),
      };
      if (coordinatorId && coordinatorId !== FALLBACK_ID) {
        autoPayload.checked_in_by = coordinatorId;
      }

      const { error: checkinErr } = await supabase
        .from('shifts')
        .update(autoPayload)
        .eq('id', activeShift.id);

    if (checkinErr) {
      return { error: "Error al registrar la asistencia en base de datos." };
    }

    // Recalculamos la fiabilidad en segundo plano sin bloquear el flujo principal del Check-In
    recalculateReliability(volunteerId).catch(err => 
      console.error("Error en segundo plano al recalcular fiabilidad (QR):", err)
    );

    return {
      success: true,
      volunteer: `${volunteer.first_name} ${volunteer.last_name}`,
      committee: volunteer.committees?.name || "Sin comité",
      shiftDetail: `${activeShift.day_key} - ${activeShift.shift_key}`
    };
  }

  // If no shift is active right now, return the list of their shifts so the coordinator can select manually
  // Map shifts to show details
  const formattedShifts = shifts.map(s => {
    let timeLabel = "8:00 AM - 12:00 PM";
    if (s.shift_key === 'T2') timeLabel = "11:00 AM - 3:00 PM";
    if (s.shift_key === 'T3') timeLabel = "2:00 PM - 6:00 PM";
    if (s.shift_key === 'T4') timeLabel = "5:00 PM - 10:00 PM";

    return {
      id: s.id,
      dayKey: s.day_key,
      shiftKey: s.shift_key,
      timeLabel,
      checkedIn: s.checked_in,
      checkedInAt: s.checked_in_at
    };
  });

  return {
    requiresManualSelection: true,
    volunteer: `${volunteer.first_name} ${volunteer.last_name}`,
    committee: volunteer.committees?.name || "Sin comité",
    shifts: formattedShifts
  };
}

// 4. Process Check-out (Turno Completado)
export async function checkOutVolunteer(shiftId: string) {
  const supabase = await createClient();

  // Try updating checked_out
  const { error } = await supabase
    .from('shifts')
    .update({
      checked_out: true,
      checked_out_at: new Date().toISOString(),
    })
    .eq('id', shiftId);

  if (error) {
    console.error("Error in checkOutVolunteer:", error);
    // Fallback: update checked_in to false
    const { error: fallbackErr } = await supabase
      .from('shifts')
      .update({
        checked_in: false,
      })
      .eq('id', shiftId);

    if (fallbackErr) {
      return { error: "No se pudo realizar el checkout del voluntario." };
    }
  }

  return { success: true, message: "Turno completado exitosamente." };
}

