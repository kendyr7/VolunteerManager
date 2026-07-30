/**
 * Meta WhatsApp Cloud API Helper Functions
 */

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: string;
  parameters: Array<{
    type: 'text' | 'image' | 'document' | 'payload';
    text?: string;
    payload?: string;
  }>;
}

import { formatE164, validatePhone8Digits } from './whatsapp';

export { formatE164, validatePhone8Digits };

/**
 * Format phone number to E.164 format without '+' (as required by Meta API recipient parameter)
 * Example: "+505 8888-9999" -> "50588889999"
 */
export function formatE164Phone(phone: string, defaultCountryCode: string = '505'): string {
  if (!phone) return '';
  const e164 = formatE164(phone, defaultCountryCode);
  return e164.replace('+', '');
}

/**
 * Get Meta API credentials from environment variables (with dynamic .env.local fallback on server)
 */
function getMetaCredentials() {
  let token = process.env.WHATSAPP_TOKEN;
  let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if ((!token || !phoneNumberId) && typeof window === 'undefined') {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach((line: string) => {
          const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
          if (match) {
            const key = match[1];
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (key === 'WHATSAPP_TOKEN' && !token) token = val;
            if (key === 'WHATSAPP_PHONE_NUMBER_ID' && !phoneNumberId) phoneNumberId = val;
          }
        });
      }
    } catch (err) {
      console.warn("Could not parse .env.local fallback:", err);
    }
  }

  if (!token || !phoneNumberId) {
    console.warn("WhatsApp API credentials missing (WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID)");
  }

  return { token, phoneNumberId };
}

/**
 * Send WhatsApp Template Message (required for initiating 24h window)
 */
export async function sendWhatsAppTemplate(options: {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: WhatsAppTemplateComponent[];
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in environment" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const body: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'template',
    template: {
      name: options.templateName,
      language: {
        code: options.languageCode || 'es'
      }
    }
  };

  if (options.components && options.components.length > 0) {
    body.template.components = options.components;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Meta WhatsApp Template Error:", data);
      return { success: false, error: data.error?.message || "Error enviando plantilla" };
    }

    const messageId = data.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    console.error("WhatsApp API Network Exception:", err);
    return { success: false, error: err.message || "Error de conexión" };
  }
}

/**
 * Send simple WhatsApp Text Message (inside 24h window)
 */
export async function sendWhatsAppText(options: {
  to: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WhatsApp Credentials" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: options.text }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Meta WhatsApp Text Error:", data);
      return { success: false, error: data.error?.message || "Error enviando mensaje" };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Send Interactive Quick Reply Button Message (inside 24h window)
 */
export async function sendWhatsAppInteractiveButton(options: {
  to: string;
  bodyText: string;
  buttonText: string;
  buttonPayload: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WhatsApp Credentials" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: options.bodyText },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: options.buttonPayload,
                  title: options.buttonText
                }
              }
            ]
          }
        }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Meta WhatsApp Interactive Error:", data);
      return { success: false, error: data.error?.message || "Error enviando botón interactivo" };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Send Welcome Template to a newly created Volunteer
 */
export async function sendVolunteerWelcomeTemplate(options: {
  to: string;
  name: string;
  pin: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Using the approved template name: finalizar_configuracion_cuenta
  // {{1}} = name, {{2}} = "tu PIN de acceso: 4829"

  const pinText = `tu PIN de acceso: ${options.pin}`;

  return sendWhatsAppTemplate({
    to: options.to,
    templateName: 'finalizar_configuracion_cuenta',
    languageCode: 'es',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: options.name },
          { type: 'text', text: pinText }
        ]
      }
    ]
  });
}

/**
 * Send Shift Reminder Template to a Volunteer
 * Approved Template Name: recordatorio_turno_comite (es)
 * {{1}} = Volunteer Full Name (e.g. "Juan Carlos Robles Meza")
 * {{2}} = Committee Name (e.g. "Historia")
 * {{3}} = Shift Name (e.g. "Turno 1")
 * {{4}} = Shift Hours (e.g. "7:00 AM - 12:00 PM")
 * {{5}} = Shift Date (e.g. "10 de Septiembre del 2026")
 */
export async function sendShiftReminderTemplate(options: {
  to: string;
  volunteerName: string;
  committeeName: string;
  shiftName: string;
  shiftHours: string;
  shiftDate: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return sendWhatsAppTemplate({
    to: options.to,
    templateName: 'recordatorio_turno_comite',
    languageCode: 'es',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: options.volunteerName },
          { type: 'text', text: options.committeeName },
          { type: 'text', text: options.shiftName },
          { type: 'text', text: options.shiftHours },
          { type: 'text', text: options.shiftDate }
        ]
      }
    ]
  });
}
