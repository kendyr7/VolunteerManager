'use server';

import { getAdminSupabase } from "@/lib/supabase/admin";
import { createActivityLog } from "./activity-actions";
import { broadcastShiftSync, broadcastSessionSync } from "@/lib/services/shift-broadcast.service";
import { requireCapability } from '@/lib/authorization';
import { AttendanceSession, inferShiftsForSession } from '@/lib/session-utils';
import { revalidatePath } from 'next/cache';

/**
 * Formatea una fecha según la zona horaria oficial de Guatemala.
 */
function formatGuatemalaTime(dateInput?: string | Date) {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Acción de Administrador: Deshacer Check-in accidental
 */
export async function undoVolunteerCheckInAction({
  volunteerId,
  dayKey,
  shiftKey,
  actorName,
  actorRole = 'Admin'
}: {
  volunteerId: string;
  dayKey: string;
  shiftKey: string;
  actorName: string;
  actorRole?: string;
}) {
  try {
    const authorization = await requireCapability('manage_permissions');
    actorName = authorization.name;
    actorRole = authorization.role;
    const supabase = await getAdminSupabase();

    // 1. Obtener nombre del voluntario
    const { data: vol } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', volunteerId)
      .single();

    const volName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'Voluntario';

    // 2. Limpiar marcas de entrada en la tabla shifts
    const { data: updatedShift, error } = await supabase
      .from('shifts')
      .update({
        checked_in: false,
        checked_in_at: null
      })
      .eq('volunteer_id', volunteerId)
      .eq('day_key', dayKey)
      .eq('shift_key', shiftKey)
      .select('*')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (updatedShift) {
      broadcastShiftSync({
        eventType: 'UPDATE',
        table: 'shifts',
        record: updatedShift,
      });
    }

    // 3. Registrar auditoría inmutable
    const timeStr = formatGuatemalaTime();
    await createActivityLog({
      userName: actorName,
      userRole: actorRole,
      actionType: 'Deshacer',
      description: `Revirtió la entrada (Check-in) de ${volName}`,
      details: `Turno ${shiftKey} (${dayKey}) revertido a estado Programado a las ${timeStr} (hora de Guatemala).`,
      targetId: volunteerId
    });

    return { success: true, message: `Check-in de ${volName} revertido correctamente.` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado al deshacer check-in' };
  }
}

/**
 * Acción de Administrador: Reabrir turno completado por error
 */
export async function reopenCompletedShiftAction({
  volunteerId,
  dayKey,
  shiftKey,
  actorName,
  actorRole = 'Admin'
}: {
  volunteerId: string;
  dayKey: string;
  shiftKey: string;
  actorName: string;
  actorRole?: string;
}) {
  try {
    const authorization = await requireCapability('manage_permissions');
    actorName = authorization.name;
    actorRole = authorization.role;
    const supabase = await getAdminSupabase();

    const [volResult, shiftResult, sessionResult] = await Promise.all([
      supabase.from('volunteers').select('first_name, last_name').eq('id', volunteerId).maybeSingle(),
      supabase.from('shifts').select('*').eq('volunteer_id', volunteerId).eq('day_key', dayKey),
      supabase.from('attendance_sessions').select('*').eq('volunteer_id', volunteerId).order('started_at', { ascending: false }),
    ]);
    if (volResult.error || shiftResult.error || sessionResult.error) {
      return { success: false, error: 'No se pudo verificar la asistencia actual. No se reabrió el turno.' };
    }
    const shifts = shiftResult.data || [];
    const targetShift = shifts.find((shift: { shift_key: string }) => shift.shift_key === shiftKey);
    if (!volResult.data || !targetShift) return { success: false, error: 'No se encontró el voluntario o el turno indicado.' };
    const volName = `${volResult.data.first_name || ''} ${volResult.data.last_name || ''}`.trim();
    const assignedKeys = shifts.map((shift: { shift_key: string }) => shift.shift_key);
    const sessions: AttendanceSession[] = sessionResult.data || [];
    const related = sessions.filter(session => session.day_key === dayKey &&
      inferShiftsForSession(dayKey, session.started_at, session.ended_at, assignedKeys).some(shift => shift.shiftKey === shiftKey));
    if (related.length > 1) return { success: false, error: 'Hay varias sesiones asociadas a este turno. Revisa la sesión específica antes de reabrirlo.' };
    const originalSession = related[0];
    if (sessions.some(session => session.status === 'open' && session.id !== originalSession?.id)) {
      return { success: false, error: 'El voluntario ya tiene otra sesión abierta. Resuélvela antes de reabrir este turno.' };
    }

    let session = originalSession;
    let didReopenSession = false;
    if (originalSession?.status === 'completed') {
      const { data, error } = await supabase.from('attendance_sessions')
        .update({ status: 'open', ended_at: null, auto_closed: false, updated_at: new Date().toISOString() })
        .eq('id', originalSession.id).eq('volunteer_id', volunteerId)
        .eq('status', 'completed').eq('ended_at', originalSession.ended_at)
        .select('*').maybeSingle();
      if (error || !data) return { success: false, error: error?.message || 'La sesión cambió durante la operación. Actualiza y vuelve a intentar.' };
      session = data as AttendanceSession;
      didReopenSession = true;
    }

    if (!session && !targetShift.checked_in && !targetShift.checked_out && !targetShift.checked_in_at && !targetShift.checked_out_at) {
      return { success: false, error: 'El turno está programado y no tiene una asistencia para reabrir.' };
    }
    // Reopen the actual session, not just its legacy shift flags. Only clear
    // flags on this volunteer's shifts belonging to that same session.
    const relatedKeys = originalSession
      ? inferShiftsForSession(dayKey, originalSession.started_at, originalSession.ended_at, assignedKeys).map(shift => shift.shiftKey)
      : [shiftKey];
    const affectedIds = shifts.filter((shift: { shift_key: string }) => relatedKeys.includes(shift.shift_key)).map((shift: { id: string }) => shift.id);
    const { data: updatedShifts, error: shiftError } = await supabase.from('shifts')
      .update(session ? { checked_out: false, checked_out_at: null } : { checked_out: false, checked_out_at: null, checked_in: true })
      .eq('volunteer_id', volunteerId).eq('day_key', dayKey).in('id', affectedIds).select('*');
    if (shiftError || updatedShifts?.length !== affectedIds.length) {
      if (didReopenSession) {
        // Restore only if this is still the exact session version we reopened.
        // Never overwrite a concurrent checkout or another administrator's edit.
        const rollback = await supabase.from('attendance_sessions')
          .update({ status: originalSession.status, ended_at: originalSession.ended_at, auto_closed: originalSession.auto_closed, updated_at: new Date().toISOString() })
          .eq('id', session.id).eq('volunteer_id', volunteerId).eq('status', 'open').eq('updated_at', session.updated_at)
          .select('*').maybeSingle();
        if (rollback.error || !rollback.data) return { success: false, error: 'La reapertura quedó parcialmente aplicada o cambió en otro dispositivo. Actualiza y revisa la sesión antes de continuar.' };
      }
      return { success: false, error: shiftError?.message || 'No se pudieron actualizar todos los turnos asociados. Actualiza y vuelve a intentar.' };
    }

    if (session) await broadcastSessionSync({ eventType: 'UPDATE', table: 'attendance_sessions', record: session });
    for (const shift of updatedShifts) broadcastShiftSync({ eventType: 'UPDATE', table: 'shifts', record: shift });
    const auditSaved = await createActivityLog({
      userName: actorName,
      userRole: actorRole,
      actionType: 'Deshacer',
      description: `Reabrió ${session ? 'la sesión de asistencia' : 'el turno completado'} de ${volName}`,
      details: JSON.stringify({ sessionId: session?.id, volunteerId, dayKey, shiftKey, affectedShiftIds: affectedIds, previousSession: originalSession, startedAt: session?.started_at || targetShift.checked_in_at, previousShifts: shifts.filter((shift: { id: string }) => affectedIds.includes(shift.id)) }),
      targetId: volunteerId
    });
    for (const route of ['/shifts', '/volunteers', '/check-in', '/dashboard']) revalidatePath(route);
    return {
      success: true,
      session,
      message: `${session ? 'Sesión y turnos asociados' : 'Turno'} de ${volName} reabiertos; se conservó la entrada original.${auditSaved ? '' : ' Aviso: no se pudo guardar la auditoría.'}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado al reabrir turno' };
  }
}

/**
 * Acción de Administrador: Revertir/Deshacer una reasignación accidental
 */
export async function rollbackReassignmentAction({
  volunteerId,
  previousDayKey,
  previousShiftKey,
  currentDayKey,
  currentShiftKey,
  actorName,
  actorRole = 'Admin'
}: {
  volunteerId: string;
  previousDayKey: string;
  previousShiftKey: string;
  currentDayKey: string;
  currentShiftKey: string;
  actorName: string;
  actorRole?: string;
}) {
  try {
    const authorization = await requireCapability('manage_permissions');
    actorName = authorization.name;
    actorRole = authorization.role;
    const supabase = await getAdminSupabase();

    const { data: vol } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', volunteerId)
      .single();

    const volName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'Voluntario';

    // 1. Actualización atómica del turno sin flicker por DELETE + UPSERT
    const { data: updatedShift, error: insErr } = await supabase
      .from('shifts')
      .update({
        day_key: previousDayKey,
        shift_key: previousShiftKey,
        checked_in: false,
        checked_out: false,
        checked_in_at: null,
        checked_out_at: null
      })
      .eq('volunteer_id', volunteerId)
      .eq('day_key', currentDayKey)
      .eq('shift_key', currentShiftKey)
      .select('*')
      .maybeSingle();

    if (insErr || !updatedShift) {
      // Fallback a upsert directo sin eliminar la fila si no existía previamente
      const { data: upsertedShift } = await supabase
        .from('shifts')
        .upsert(
          {
            volunteer_id: volunteerId,
            day_key: previousDayKey,
            shift_key: previousShiftKey,
            checked_in: false,
            checked_out: false
          },
          { onConflict: 'volunteer_id,day_key,shift_key' }
        )
        .select('*')
        .maybeSingle();

      if (upsertedShift) {
        broadcastShiftSync({
          eventType: 'UPDATE',
          table: 'shifts',
          record: upsertedShift,
        });
      }
    } else {
      broadcastShiftSync({
        eventType: 'UPDATE',
        table: 'shifts',
        record: updatedShift,
      });
    }

    if (insErr) {
      return { success: false, error: insErr.message };
    }

    const timeStr = formatGuatemalaTime();
    await createActivityLog({
      userName: actorName,
      userRole: actorRole,
      actionType: 'Deshacer',
      description: `Revirtió la reasignación de turno de ${volName}`,
      details: `Devuelto de ${currentShiftKey} (${currentDayKey}) a su turno original ${previousShiftKey} (${previousDayKey}) a las ${timeStr} (hora de Guatemala).`,
      targetId: volunteerId
    });

    return { success: true, message: `Reasignación de ${volName} revertida a ${previousShiftKey} (${previousDayKey}).` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado al revertir reasignación' };
  }
}
