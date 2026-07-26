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
 * Get Meta API credentials from environment variables
 */
function getMetaCredentials() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

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
  // Using the approved template name: volunteer_welcome
  // {{1}} = name, {{2}} = combined text including PIN
  
  const pinText = `tu número de celular y el PIN temporal: ${options.pin}`;
  
  return sendWhatsAppTemplate({
    to: options.to,
    templateName: 'volunteer_welcome',
    languageCode: 'es_ES',
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
