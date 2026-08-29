'use server'

import { isWhatsAppCapacityError } from "@/lib/whatsapp-api";
import { formatE164 } from "@/lib/whatsapp";
import { generateTemporaryPin } from '@/lib/pin-security';
import { getAuthorizationSnapshot, requireCapability } from "@/lib/authorization";
import { hasCapability } from "@/lib/role-permissions";
import { createActivityLog } from "@/app/actions/activity-actions";
import { getAdminSupabase } from '@/lib/supabase/admin';
import { evaluateWhatsAppRetry } from '@/lib/whatsapp-retry-policy';
import { formatDateShort, getOperationalEventDays, getOfficialShiftTime } from '@/lib/dates';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { buildAndPersistReminderCapacityPlan } from '@/lib/reminder-capacity-service';
import type { ReminderCapacityDay } from '@/lib/reminder-capacity-planner';
import type { PersistedReminderCapacityPlan } from '@/lib/reminder-capacity-service';
import { getShiftAreaName } from '@/lib/shift-area';

export type ReminderDeliveryLog = {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  status: string;
  delivery_status: string | null;
  delivery_updated_at: string | null;
  delivery_error_message: string | null;
  delivery_error_details: string | null;
  sent_at: string;
};

async function requireCredentialDeliveryAuthorization() {
  const authorization = await getAuthorizationSnapshot();
  const allowed = authorization.authenticated && (
    hasCapability(authorization, 'view_notices') ||
    hasCapability(authorization, 'create_volunteer') ||
    hasCapability(authorization, 'import_volunteers') ||
    hasCapability(authorization, 'manage_platform_users')
  );
  if (!allowed) throw new Error('No tienes permiso para enviar credenciales por WhatsApp.');
  return authorization;
}

function canDeliverCredentialsGlobally(authorization: Awaited<ReturnType<typeof getAuthorizationSnapshot>>) {
  return hasCapability(authorization, 'view_all_volunteers') ||
    hasCapability(authorization, 'import_volunteers') ||
    hasCapability(authorization, 'manage_platform_users');
}

export type ReminderCapacityProjectionRow = ReminderCapacityDay;
export type ReminderCapacityProjection = PersistedReminderCapacityPlan;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function getReminderCapacityProjectionAction() {
  try {
    await requireCapability('manage_platform_users');
    const supabase = await getAdminSupabase();
    const projection = await buildAndPersistReminderCapacityPlan(supabase);

    return {
      success: true as const,
      projection,
    };
  } catch (error) {
    console.error('[WHATSAPP] Error calculating reminder capacity projection:', error);
    return {
      success: false as const,
      error: getErrorMessage(error, 'No se pudo calcular la proyección de recordatorios.'),
    };
  }
}

export async function getReminderDeliveryLogsAction() {
  try {
    const authorization = await requireCapability('view_notices');
    const supabase = await getAdminSupabase();
    let query = supabase
      .from('reminder_logs')
      .select('volunteer_id, day_key, shift_key, status, delivery_status, delivery_updated_at, delivery_error_message, delivery_error_details, sent_at')
      .order('sent_at', { ascending: false })
      .limit(5000);

    if (authorization.role !== 'Admin') {
      query = query.eq('sent_by_user_id', authorization.userId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[WHATSAPP] Error loading scoped delivery diagnostics:', error.message);
      return {
        success: false as const,
        error: error.message.includes('sent_by_user_id')
          ? 'Falta aplicar la migración de alcance por remitente en Supabase.'
          : 'No se pudieron cargar los estados de entrega.',
      };
    }

    return {
      success: true as const,
      logs: (data || []) as ReminderDeliveryLog[],
    };
  } catch (error) {
    return {
      success: false as const,
      error: getErrorMessage(error, 'No se pudieron cargar los estados de entrega.'),
    };
  }
}

export async function sendVolunteerCredentialsAction({
  volunteerId,
  forcePinReset = false,
}: {
  volunteerId: string;
  forcePinReset?: boolean;
}) {
  try {
    const authorization = await requireCredentialDeliveryAuthorization();
    const supabase = await getAdminSupabase();

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, pin, committee_id, status, committees(name)')
      .eq('id', volunteerId)
      .maybeSingle();

    if (volunteerError || !volunteer || volunteer.status === 'archived') {
      return { success: false, error: 'No se encontró un voluntario activo.' };
    }

    if (
      !canDeliverCredentialsGlobally(authorization) &&
      authorization.committeeId !== volunteer.committee_id
    ) {
      return { success: false, error: 'Solo puedes enviar credenciales a voluntarios de tu comité.' };
    }

    const volunteerName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim() || volunteer.first_name || 'Voluntario';
    const formattedPhone = formatE164(volunteer.phone || '');
    if (!formattedPhone) {
      return { success: false, error: 'El voluntario no tiene un número de teléfono válido registrado.' };
    }

    let pin = volunteer.pin;
    if (!pin || forcePinReset) {
      pin = generateTemporaryPin();
      const { error: updatePinError } = await supabase
        .from('volunteers')
        .update({ pin, updated_at: new Date().toISOString() })
        .eq('id', volunteerId);

      if (updatePinError) {
        console.error('Error actualizando PIN para voluntario:', updatePinError.message);
        return { success: false, error: 'No se pudo generar el PIN de acceso.' };
      }
    }

    const { sendVolunteerWelcomeTemplate } = await import('@/lib/whatsapp-api');
    const result = await sendVolunteerWelcomeTemplate({
      to: formattedPhone,
      name: volunteer.first_name || volunteerName,
      pin,
    });

    if (!result.success) {
      console.error('Error enviando credenciales por WhatsApp:', result.error);
      return { success: false, error: result.error || 'Meta rechazó el envío del mensaje.' };
    }

    const auditCreated = await createActivityLog({
      userName: authorization.name,
      userRole: authorization.role,
      actionType: 'Aviso',
      description: `Envió credenciales por WhatsApp a ${volunteerName}`,
      details: JSON.stringify({
        volunteerId,
        volunteerName,
        phone: formattedPhone,
        messageId: result.messageId || null,
        forcePinReset,
      }),
      targetId: volunteerId,
    });

    return {
      success: true,
      messageId: result.messageId,
      auditWarning: auditCreated ? undefined : 'El mensaje se envió, pero no se pudo registrar en la auditoría.',
    };
  } catch (err: unknown) {
    console.error('Excepción en sendVolunteerCredentialsAction:', err);
    return { success: false, error: getErrorMessage(err, 'Error interno al enviar credenciales') };
  }
}

export async function sendBulkVolunteerCredentialsAction({
  volunteerIds,
  forcePinReset = false,
}: {
  volunteerIds: string[];
  forcePinReset?: boolean;
}) {
  try {
    const authorization = await requireCredentialDeliveryAuthorization();
    if (!Array.isArray(volunteerIds) || volunteerIds.length === 0) {
      return { success: false, error: 'No se seleccionaron voluntarios.' };
    }

    const supabase = await getAdminSupabase();

    let query = supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, pin, committee_id, status, committees(name)')
      .in('id', volunteerIds)
      .neq('status', 'archived');

    if (!canDeliverCredentialsGlobally(authorization)) {
      query = query.eq('committee_id', authorization.committeeId!);
    }

    const { data: volunteers, error: volsError } = await query;
    if (volsError || !volunteers) {
      return { success: false, error: 'No se pudieron cargar los voluntarios seleccionados.' };
    }

    const { sendVolunteerWelcomeTemplate } = await import('@/lib/whatsapp-api');
    const results: Array<{
      id: string;
      name: string;
      phone: string;
      success: boolean;
      error?: string;
      messageId?: string;
    }> = [];

    let sentCount = 0;
    let failedCount = 0;

    for (const vol of volunteers) {
      const volunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.first_name || 'Voluntario';
      const formattedPhone = formatE164(vol.phone || '');

      if (!formattedPhone) {
        failedCount++;
        results.push({
          id: vol.id,
          name: volunteerName,
          phone: vol.phone || '',
          success: false,
          error: 'Teléfono inválido o ausente',
        });
        continue;
      }

      let pin = vol.pin;
      if (!pin || forcePinReset) {
        pin = generateTemporaryPin();
        await supabase
          .from('volunteers')
          .update({ pin, updated_at: new Date().toISOString() })
          .eq('id', vol.id);
      }

      const sendResult = await sendVolunteerWelcomeTemplate({
        to: formattedPhone,
        name: vol.first_name || volunteerName,
        pin,
      });

      if (sendResult.success) {
        sentCount++;
        results.push({
          id: vol.id,
          name: volunteerName,
          phone: formattedPhone,
          success: true,
          messageId: sendResult.messageId,
        });

        createActivityLog({
          userName: authorization.name,
          userRole: authorization.role,
          actionType: 'Aviso',
          description: `Envió credenciales en lote por WhatsApp a ${volunteerName}`,
          details: JSON.stringify({
            volunteerId: vol.id,
            volunteerName,
            phone: formattedPhone,
            messageId: sendResult.messageId || null,
          }),
          targetId: vol.id,
        }).catch(err => console.error('Error logging bulk credential send audit:', err));
      } else {
        failedCount++;
        results.push({
          id: vol.id,
          name: volunteerName,
          phone: formattedPhone,
          success: false,
          error: sendResult.error || 'Rechazado por WhatsApp',
        });
      }

      if (volunteers.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    return {
      success: true,
      total: volunteers.length,
      sentCount,
      failedCount,
      results,
    };
  } catch (err: unknown) {
    console.error('Excepción en sendBulkVolunteerCredentialsAction:', err);
    return { success: false, error: getErrorMessage(err, 'Error interno al enviar credenciales en lote') };
  }
}

export async function sendTestMetaWhatsAppMessageAction(toPhone: string, testName = 'Kendyr Quintanilla', testPin = '4829') {
  try {
    await requireCapability('manage_platform_users');
    const formattedPhone = formatE164(toPhone);
    if (!formattedPhone) {
      return { success: false, error: "Teléfono de destino inválido" };
    }

    const { sendVolunteerWelcomeTemplate } = await import("@/lib/whatsapp-api");

    const result = await sendVolunteerWelcomeTemplate({
      to: formattedPhone,
      name: testName,
      pin: testPin
    });

    if (!result.success) {
      console.error("Error enviando mensaje de prueba Meta WhatsApp:", result.error);
      return { success: false, error: result.error };
    }

    return { success: true, messageId: result.messageId };
  } catch (err: unknown) {
    console.error("Excepción en sendTestMetaWhatsAppMessageAction:", err);
    return { success: false, error: getErrorMessage(err, "Error interno al enviar prueba de Meta WhatsApp") };
  }
}

export async function sendShiftReminderAction({
  volunteerId,
  dayKey,
  shiftKey,
  mode = 'send',
}: {
  volunteerId: string;
  dayKey: string;
  shiftKey: string;
  mode?: 'send' | 'retry';
}) {
  try {
    const authorization = await requireCapability('view_notices');
    const supabase = await getAdminSupabase();

    if (!['T1', 'T2', 'T3', 'T4'].includes(shiftKey)) {
      return { success: false, error: 'El turno seleccionado no es válido.' };
    }

    const eventDate = getOperationalEventDays().find(
      date => formatDateShort(date).toLowerCase() === dayKey.trim().toLowerCase()
    );
    if (!eventDate) {
      return { success: false, error: 'La fecha seleccionada no pertenece al evento.' };
    }

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone, committee_id, status, committees(name)')
      .eq('id', volunteerId)
      .maybeSingle();
    if (volunteerError || !volunteer || volunteer.status === 'archived') {
      return { success: false, error: 'No se encontró un voluntario activo para este recordatorio.' };
    }

    if (
      !hasCapability(authorization, 'view_all_volunteers') &&
      authorization.committeeId !== volunteer.committee_id
    ) {
      return { success: false, error: 'Solo puedes enviar avisos a tu comité.' };
    }

    const committeeRelation = Array.isArray(volunteer.committees)
      ? volunteer.committees[0]
      : volunteer.committees;
    const volunteerName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();
    const committeeName = committeeRelation?.name || 'Sin comité';
    const formattedPhone = formatE164(volunteer.phone || '');
    if (!formattedPhone) {
      return { success: false, error: "Teléfono inválido" };
    }

    const { data: assignedShift, error: assignedShiftError } = await supabase
      .from('shifts')
      .select('area_id, committee_areas(name)')
      .eq('volunteer_id', volunteerId)
      .eq('day_key', dayKey)
      .eq('shift_key', shiftKey)
      .maybeSingle();
    if (assignedShiftError) {
      return { success: false, error: 'No se pudo comprobar la asignación del turno.' };
    }
    if (!assignedShift) {
      return { success: false, error: 'Este turno ya no está asignado al voluntario.' };
    }
    const areaName = getShiftAreaName(assignedShift);

    let attemptNumber = 1;
    if (mode === 'retry') {
      let retryQuery = supabase
        .from('reminder_logs')
        .select('delivery_status, sent_at')
        .eq('volunteer_id', volunteerId)
        .eq('day_key', dayKey)
        .eq('shift_key', shiftKey)
        .order('sent_at', { ascending: false })
        .limit(4);
      if (authorization.role !== 'Admin') {
        retryQuery = retryQuery.eq('sent_by_user_id', authorization.userId);
      }

      const { data: recentAttempts, error: retryLookupError } = await retryQuery;
      if (retryLookupError) {
        console.error('[WHATSAPP] Error checking retry eligibility:', retryLookupError.message);
        return { success: false, error: 'No se pudo comprobar si el envío puede reintentarse.' };
      }

      const retryDecision = evaluateWhatsAppRetry(recentAttempts || []);
      if (!retryDecision.allowed) {
        if (retryDecision.reason === 'cooldown') {
          return {
            success: false,
            error: `Espera ${retryDecision.retryAfterSeconds} segundos antes de volver a intentarlo.`,
          };
        }
        if (retryDecision.reason === 'attempt_limit') {
          return {
            success: false,
            error: 'Se alcanzó el máximo de tres intentos consecutivos. Revisa el teléfono antes de continuar.',
          };
        }
        return { success: false, error: 'Este recordatorio ya no tiene un fallo pendiente de reintento.' };
      }
      attemptNumber = retryDecision.attemptNumber;
    }

    const shift = getOfficialShiftTime(dayKey, shiftKey);
    const shiftName = shift.name;
    const shiftHours = shift.timeLabel;
    const shiftDate = format(eventDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });

    const { sendShiftReminderTemplate } = await import("@/lib/whatsapp-api");

    const result = await sendShiftReminderTemplate({
      to: formattedPhone,
      volunteerName,
      committeeName,
      shiftName,
      shiftHours,
      shiftDate,
      areaName,
    });

    if (!result.success) {
      console.error("Error enviando recordatorio de turno por WhatsApp:", result.error);
      const failedAt = new Date().toISOString();
      const capacityError = isWhatsAppCapacityError(result);
      const normalizedError = capacityError
        ? `Se superó el límite de WhatsApp. ${result.error || 'Meta rechazó temporalmente el envío.'}`
        : result.error || 'Meta rechazó el envío.';
      const { error: trackingError } = await supabase.from('reminder_logs').insert({
        volunteer_id: volunteerId,
        shift_key: shiftKey,
        day_key: dayKey,
        recipient_phone: formattedPhone,
        sent_by_user_id: authorization.userId,
        whatsapp_message_id: null,
        status: 'error',
        sent_at: failedAt,
        delivery_status: 'failed',
        delivery_updated_at: failedAt,
        failed_at: failedAt,
        delivery_error_code: capacityError ? 'CAPACITY_LIMIT' : result.errorCode || null,
        delivery_error_title: capacityError ? 'Límite de WhatsApp superado' : null,
        delivery_error_message: normalizedError,
        delivery_error_details: result.errorDetails || null,
        raw_payload: { retry: mode === 'retry', attemptNumber },
      });
      if (trackingError) {
        console.error('Error registrando el envío fallido de WhatsApp:', trackingError.message);
      }
      return { success: false, error: normalizedError };
    }

    const sentAt = new Date().toISOString();
    const { error: trackingError } = await supabase.from('reminder_logs').insert({
      volunteer_id: volunteerId,
      shift_key: shiftKey,
      day_key: dayKey,
      recipient_phone: formattedPhone,
      sent_by_user_id: authorization.userId,
      whatsapp_message_id: result.messageId || null,
      status: 'contactado',
      sent_at: sentAt,
      delivery_status: result.messageId ? 'pending' : null,
      delivery_updated_at: sentAt,
      raw_payload: { retry: mode === 'retry', attemptNumber },
    });

    if (trackingError) {
      console.error('Error registrando seguimiento del recordatorio de WhatsApp:', trackingError.message);
    }

    const auditCreated = await createActivityLog({
      userName: authorization.name,
      userRole: authorization.role,
      actionType: 'Aviso',
      description: `${mode === 'retry' ? 'Reintentó' : 'Envió'} un recordatorio de turno a ${volunteerName}`,
      details: JSON.stringify({
        context: `${shiftName} · ${shiftDate} · ${shiftHours}`,
        volunteerId,
        committeeName,
        shiftName,
        shiftHours,
        shiftDate,
        areaName,
        areaStatus: areaName ? 'assigned' : 'pending',
        messageId: result.messageId || null,
        retry: mode === 'retry',
        attemptNumber,
      }),
      targetId: volunteerId,
    });

    return {
      success: true,
      messageId: result.messageId,
      auditWarning: auditCreated ? undefined : 'El mensaje se envió, pero no se pudo registrar en la auditoría.',
      trackingWarning: trackingError ? 'El mensaje se envió, pero no se pudo activar su seguimiento.' : undefined,
    };
  } catch (err: unknown) {
    console.error("Excepción en sendShiftReminderAction:", err);
    return { success: false, error: getErrorMessage(err, "Error interno al enviar recordatorio de turno") };
  }
}
