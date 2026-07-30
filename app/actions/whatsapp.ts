'use server'

import { sendVolunteerWelcomeTemplate } from "@/lib/whatsapp-api";
import { formatE164 } from "@/lib/whatsapp";

export async function sendWelcomeWhatsAppAction(phone: string, name: string, pin: string) {
  try {
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
  } catch (err: any) {
    console.error("Error en sendWelcomeWhatsAppAction:", err);
    return { success: false, error: "Error interno del servidor" };
  }
}

export async function sendTestMetaWhatsAppMessageAction(toPhone: string, testName = 'Kendyr Quintanilla', testPin = '4829') {
  try {
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
  } catch (err: any) {
    console.error("Excepción en sendTestMetaWhatsAppMessageAction:", err);
    return { success: false, error: err.message || "Error interno al enviar prueba de Meta WhatsApp" };
  }
}

export async function sendShiftReminderAction({
  phone,
  volunteerName,
  committeeName,
  shiftName = 'Turno 1',
  shiftHours = '7:00 AM - 12:00 PM',
  shiftDate = '10 de Septiembre del 2026'
}: {
  phone: string;
  volunteerName: string;
  committeeName: string;
  shiftName?: string;
  shiftHours?: string;
  shiftDate?: string;
}) {
  try {
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

    return { success: true, messageId: result.messageId };
  } catch (err: any) {
    console.error("Excepción en sendShiftReminderAction:", err);
    return { success: false, error: err.message || "Error interno al enviar recordatorio de turno" };
  }
}
