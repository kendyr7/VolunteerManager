'use server'

import { sendVolunteerWelcomeTemplate } from "@/lib/whatsapp-api";
import { formatE164 } from "@/lib/whatsapp";
import { requireCapability } from "@/lib/authorization";
import { hasCapability } from "@/lib/role-permissions";
import { createActivityLog } from "@/app/actions/activity-actions";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function sendWelcomeWhatsAppAction(phone: string, name: string, pin: string) {
  try {
    await requireCapability('manage_platform_users');
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) {
      return { success: false, error: "Teléfono inválido" };
    }

    const result = await sendVolunteerWelcomeTemplate({
      to: formattedPhone,
      name,
      pin
    });

    if (!result.success) {
      console.error("Error enviando WhatsApp de bienvenida:", result.error);
      return { success: false, error: result.error };
    }

    return { success: true, messageId: result.messageId };
  } catch (err: unknown) {
    console.error("Error en sendWelcomeWhatsAppAction:", err);
    return { success: false, error: "Error interno del servidor" };
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
  phone,
  volunteerName,
  committeeName,
  shiftName = 'Turno 1',
  shiftHours = '7:00 AM - 12:00 PM',
  shiftDate = '10 de Septiembre del 2026'
}: {
  volunteerId: string;
  phone: string;
  volunteerName: string;
  committeeName: string;
  shiftName?: string;
  shiftHours?: string;
  shiftDate?: string;
}) {
  try {
    const authorization = await requireCapability('view_notices');
    if (
      !hasCapability(authorization, 'view_all_volunteers') &&
      authorization.committeeName?.trim().toLowerCase() !== committeeName.trim().toLowerCase()
    ) {
      return { success: false, error: 'Solo puedes enviar avisos a tu comité.' };
    }
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) {
      return { success: false, error: "Teléfono inválido" };
    }

    const { sendShiftReminderTemplate } = await import("@/lib/whatsapp-api");

    const result = await sendShiftReminderTemplate({
      to: formattedPhone,
      volunteerName,
      committeeName,
      shiftName,
      shiftHours,
      shiftDate
    });

    if (!result.success) {
      console.error("Error enviando recordatorio de turno por WhatsApp:", result.error);
      return { success: false, error: result.error };
    }

    const auditCreated = await createActivityLog({
      userName: authorization.name,
      userRole: authorization.role,
      actionType: 'Aviso',
      description: `Envió un recordatorio de turno a ${volunteerName}`,
      details: JSON.stringify({
        context: `${shiftName} · ${shiftDate} · ${shiftHours}`,
        volunteerId,
        committeeName,
        shiftName,
        shiftHours,
        shiftDate,
        messageId: result.messageId || null,
      }),
      targetId: volunteerId,
    });

    return {
      success: true,
      messageId: result.messageId,
      auditWarning: auditCreated ? undefined : 'El mensaje se envió, pero no se pudo registrar en la auditoría.',
    };
  } catch (err: unknown) {
    console.error("Excepción en sendShiftReminderAction:", err);
    return { success: false, error: getErrorMessage(err, "Error interno al enviar recordatorio de turno") };
  }
}
