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
 * Check if WhatsApp sending is enabled via environment variable.
 * To pause WhatsApp sending, set WHATSAPP_ENABLED=false (or 0, off, disabled) in your environment variables (.env.local or Vercel).
 * Default: true
 */
export function isWhatsAppEnabled(): boolean {
  let enabledVal = process.env.WHATSAPP_ENABLED ?? process.env.NEXT_PUBLIC_WHATSAPP_ENABLED;

  if (enabledVal === undefined && typeof window === 'undefined') {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach((line: string) => {
          const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
          if (match && match[1] === 'WHATSAPP_ENABLED') {
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            enabledVal = val;
          }
        });
      }
    } catch (err) {
      // ignore
    }
  }

  if (enabledVal !== undefined) {
    const norm = enabledVal.trim().toLowerCase();
    if (norm === 'false' || norm === '0' || norm === 'off' || norm === 'disabled') {
      return false;
    }
  }

  return true;
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

function getGraphVersion(): string {
  const configuredVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v20.0';
  return configuredVersion.startsWith('v')
    ? configuredVersion
    : `v${configuredVersion}`;
}

function getMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${getGraphVersion()}/${phoneNumberId}/messages`;
}

function getMediaUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${getGraphVersion()}/${phoneNumberId}/media`;
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
  if (!isWhatsAppEnabled()) {
    console.log("⏸️ WhatsApp message skipped: sending is PAUSED via WHATSAPP_ENABLED=false");
    return { success: false, error: "WhatsApp messaging is temporarily paused by configuration." };
  }

  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in environment" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = getMessagesUrl(phoneNumberId);

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
  if (!isWhatsAppEnabled()) {
    console.log("⏸️ WhatsApp message skipped: sending is PAUSED via WHATSAPP_ENABLED=false");
    return { success: false, error: "WhatsApp messaging is temporarily paused by configuration." };
  }

  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WhatsApp Credentials" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = getMessagesUrl(phoneNumberId);

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
 * Upload an image to Meta and send it by media ID inside the customer-service window.
 */
export async function sendWhatsAppImageBuffer(options: {
  to: string;
  image: Buffer;
  caption?: string;
  filename?: string;
}): Promise<{ success: boolean; messageId?: string; mediaId?: string; error?: string }> {
  if (!isWhatsAppEnabled()) {
    return { success: false, error: 'WhatsApp messaging is temporarily paused by configuration.' };
  }

  const { token, phoneNumberId } = getMetaCredentials();
  if (!token || !phoneNumberId) {
    return { success: false, error: 'Missing WhatsApp Credentials' };
  }

  const uploadForm = new FormData();
  uploadForm.append('messaging_product', 'whatsapp');
  uploadForm.append('type', 'image/png');
  uploadForm.append(
    'file',
    new Blob([Uint8Array.from(options.image)], { type: 'image/png' }),
    options.filename || 'pase-qr.png',
  );

  try {
    const uploadResponse = await fetch(getMediaUrl(phoneNumberId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm,
    });
    const uploadData = await uploadResponse.json();
    const mediaId = uploadData.id as string | undefined;

    if (!uploadResponse.ok || !mediaId) {
      console.error('Meta WhatsApp Media Upload Error:', uploadData);
      return {
        success: false,
        error: uploadData.error?.message || 'Error subiendo la imagen a WhatsApp',
      };
    }

    const sendResponse = await fetch(getMessagesUrl(phoneNumberId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatE164Phone(options.to),
        type: 'image',
        image: {
          id: mediaId,
          caption: options.caption?.slice(0, 1024),
        },
      }),
    });
    const sendData = await sendResponse.json();

    if (!sendResponse.ok) {
      console.error('Meta WhatsApp Image Send Error:', sendData);
      return {
        success: false,
        mediaId,
        error: sendData.error?.message || 'Error enviando la imagen por WhatsApp',
      };
    }

    return {
      success: true,
      mediaId,
      messageId: sendData.messages?.[0]?.id,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error de conexión con WhatsApp',
    };
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
  if (!isWhatsAppEnabled()) {
    console.log("⏸️ WhatsApp message skipped: sending is PAUSED via WHATSAPP_ENABLED=false");
    return { success: false, error: "WhatsApp messaging is temporarily paused by configuration." };
  }

  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WhatsApp Credentials" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = getMessagesUrl(phoneNumberId);

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
 * Send Interactive Multi-Button Message (up to 3 buttons inside 24h window)
 */
export async function sendWhatsAppInteractiveButtons(options: {
  to: string;
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
  headerText?: string;
  footerText?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isWhatsAppEnabled()) {
    console.log("⏸️ WhatsApp message skipped: sending is PAUSED via WHATSAPP_ENABLED=false");
    return { success: false, error: "WhatsApp messaging is temporarily paused by configuration." };
  }

  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WhatsApp Credentials" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = getMessagesUrl(phoneNumberId);

  const interactiveObj: any = {
    type: 'button',
    body: { text: options.bodyText },
    action: {
      buttons: options.buttons.slice(0, 3).map(b => ({
        type: 'reply',
        reply: {
          id: b.id,
          title: b.title.slice(0, 20) // Meta limit: 20 chars
        }
      }))
    }
  };

  if (options.headerText) {
    interactiveObj.header = { type: 'text', text: options.headerText };
  }
  if (options.footerText) {
    interactiveObj.footer = { text: options.footerText };
  }

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
        interactive: interactiveObj
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Meta WhatsApp Buttons Error:", data);
      return { success: false, error: data.error?.message || "Error enviando botones interactivos" };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Send Interactive List Message ("Ver Opciones" dropdown menu)
 */
export async function sendWhatsAppInteractiveList(options: {
  to: string;
  bodyText: string;
  buttonText?: string;
  headerText?: string;
  footerText?: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isWhatsAppEnabled()) {
    console.log("⏸️ WhatsApp message skipped: sending is PAUSED via WHATSAPP_ENABLED=false");
    return { success: false, error: "WhatsApp messaging is temporarily paused by configuration." };
  }

  const { token, phoneNumberId } = getMetaCredentials();

  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WhatsApp Credentials" };
  }

  const recipientPhone = formatE164Phone(options.to);
  const url = getMessagesUrl(phoneNumberId);

  const interactiveObj: any = {
    type: 'list',
    body: { text: options.bodyText },
    action: {
      button: (options.buttonText || 'Ver Opciones').slice(0, 20),
      sections: options.sections.map(s => ({
        title: s.title.slice(0, 24),
        rows: s.rows.slice(0, 10).map(r => ({
          id: r.id,
          title: r.title.slice(0, 24),
          description: r.description ? r.description.slice(0, 72) : undefined
        }))
      }))
    }
  };

  if (options.headerText) {
    interactiveObj.header = { type: 'text', text: options.headerText };
  }
  if (options.footerText) {
    interactiveObj.footer = { text: options.footerText };
  }

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
        interactive: interactiveObj
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Meta WhatsApp List Error:", data);
      return { success: false, error: data.error?.message || "Error enviando lista interactiva" };
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

/**
 * Send Shift Change Result Template (Resolution: Approved or Rejected)
 * Template Name: resultado_cambio_turno (es)
 * {{1}} = Volunteer Name (e.g. "Juan Carlos")
 * {{2}} = Status / Result ("APROBADA" or "RECHAZADA")
 * {{3}} = Target Shift & Date (e.g. "Turno 1 para el 30 de Agosto")
 * {{4}} = Detail / Reason (e.g. "Tu nuevo turno ha sido registrado" or "limitación de disponibilidad de cupos")
 */
export async function sendShiftChangeResultTemplate(options: {
  to: string;
  volunteerName: string;
  resultStatus: 'APROBADA' | 'RECHAZADA';
  shiftDetails: string;
  reasonOrDetail: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiRes = await sendWhatsAppTemplate({
    to: options.to,
    templateName: 'resultado_cambio_turno',
    languageCode: 'es',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: options.volunteerName },
          { type: 'text', text: options.resultStatus },
          { type: 'text', text: options.shiftDetails },
          { type: 'text', text: options.reasonOrDetail }
        ]
      }
    ]
  });

  // Fallback to text message inside 24h window or if template pending approval
  if (!apiRes.success) {
    const textMsg = options.resultStatus === 'APROBADA'
      ? `¡Hola ${options.volunteerName}! 🎉 Tu petición de cambio de turno (${options.shiftDetails}) ha sido APROBADA. ${options.reasonOrDetail}. ¡Gracias por tu disposición!`
      : `Estimado(a) ${options.volunteerName}. Tu petición de cambio de turno (${options.shiftDetails}) ha sido RECHAZADA debido a ${options.reasonOrDetail}. Agradecemos tu comprensión. 🙏`;

    return sendWhatsAppText({
      to: options.to,
      text: textMsg
    });
  }

  return apiRes;
}
