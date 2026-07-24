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
