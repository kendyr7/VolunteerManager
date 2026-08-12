'use server';

import { getAdminSupabase } from "@/lib/supabase/admin";
import { createActivityLog } from "./activity-actions";
import { broadcastShiftSync } from "@/lib/services/shift-broadcast.service";
import { requireCapability } from '@/lib/authorization';

/**
 * Formatea una fecha según la zona horaria oficial de Nicaragua (America/Managua, UTC-6)
 */
function formatNicaraguaTime(dateInput?: string | Date) {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleString('es-NI', {
    timeZone: 'America/Managua',
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
    const timeStr = formatNicaraguaTime();
    await createActivityLog({
      userName: actorName,
      userRole: actorRole,
      actionType: 'Deshacer',
      description: `Revirtió la entrada (Check-in) de ${volName}`,
      details: `Turno ${shiftKey} (${dayKey}) revertido a estado Programado a las ${timeStr} (Hora Nicaragua).`,
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

    const { data: vol } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', volunteerId)
      .single();

    const volName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'Voluntario';

    // Limpiar marcas de salida y mantener checked_in activo
    const { data: updatedShift, error } = await supabase
      .from('shifts')
      .update({
        checked_out: false,
        checked_out_at: null,
        checked_in: true
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

    const timeStr = formatNicaraguaTime();
    await createActivityLog({
      userName: actorName,
      userRole: actorRole,
      actionType: 'Deshacer',
      description: `Reabrió el turno completado de ${volName}`,
      details: `Turno ${shiftKey} (${dayKey}) devuelto a estado 'En Turno' a las ${timeStr} (Hora Nicaragua).`,
      targetId: volunteerId
    });

    return { success: true, message: `Turno de ${volName} reabierto correctamente.` };
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

    const timeStr = formatNicaraguaTime();
    await createActivityLog({
      userName: actorName,
      userRole: actorRole,
      actionType: 'Deshacer',
      description: `Revirtió la reasignación de turno de ${volName}`,
      details: `Devuelto de ${currentShiftKey} (${currentDayKey}) a su turno original ${previousShiftKey} (${previousDayKey}) a las ${timeStr} (Hora Nicaragua).`,
      targetId: volunteerId
    });

    return { success: true, message: `Reasignación de ${volName} revertida a ${previousShiftKey} (${previousDayKey}).` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado al revertir reasignación' };
  }
}
