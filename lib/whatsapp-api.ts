/**
 * Meta WhatsApp Cloud API Helper Functions
 */

import {
  buildInteractiveFallbackText,
  limitWhatsAppText,
  planWhatsAppInteractiveBody,
  prepareWhatsAppButtons,
  prepareWhatsAppListSections,
  WHATSAPP_MESSAGE_LIMITS,
  whatsappTextLength,
} from './whatsapp-interactive-safety';
import { formatE164, validatePhone8Digits } from './whatsapp';

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

export type WhatsAppSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  errorDetails?: string;
  httpStatus?: number;
  fallbackUsed?: boolean;
  degradedReason?: 'interactive_body_split' | 'interactive_body_truncated' | 'interactive_api_rejected';
};

type MetaErrorPayload = {
  error?: {
    message?: string;
    code?: string | number;
    error_data?: { details?: string };
    error_user_msg?: string;
  };
};

function metaErrorDetails(data: MetaErrorPayload, fallback: string, httpStatus: number): WhatsAppSendResult {
  return {
    success: false,
    error: data?.error?.message || fallback,
    errorCode: data?.error?.code ? String(data.error.code) : undefined,
    errorDetails: data?.error?.error_data?.details || data?.error?.error_user_msg,
    httpStatus,
  };
}

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
}): Promise<WhatsAppSendResult> {
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
      return {
        success: false,
        error: data.error?.message || "Error enviando plantilla",
        errorCode: data.error?.code ? String(data.error.code) : undefined,
        errorDetails: data.error?.error_data?.details || data.error?.error_user_msg,
        httpStatus: res.status,
      };
    }

    const messageId = data.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    console.error("WhatsApp API Network Exception:", err);
    return { success: false, error: err.message || "Error de conexión" };
  }
}

export function isWhatsAppCapacityError(result: WhatsAppSendResult): boolean {
  if (result.success) return false;
  const knownRateLimitCodes = new Set(['80007', '130429', '131048', '131049']);
  const normalizedMessage = `${result.error || ''} ${result.errorDetails || ''}`.toLowerCase();
  return result.httpStatus === 429
    || Boolean(result.errorCode && knownRateLimitCodes.has(result.errorCode))
    || /messaging limit|rate limit|too many requests|límite de mensajes|limite de mensajes/.test(normalizedMessage);
}

/**
 * Send simple WhatsApp Text Message (inside 24h window)
 */
export async function sendWhatsAppText(options: {
  to: string;
  text: string;
}): Promise<WhatsAppSendResult> {
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
  const safeText = limitWhatsAppText(
    options.text,
    WHATSAPP_MESSAGE_LIMITS.textBody,
    'Mensaje no disponible.',
  );

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
        text: { body: safeText }
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
}): Promise<WhatsAppSendResult> {
  return sendWhatsAppInteractiveButtons({
    to: options.to,
    bodyText: options.bodyText,
    buttons: [{ id: options.buttonPayload, title: options.buttonText }],
  });
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
}): Promise<WhatsAppSendResult> {
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
  const bodyPlan = planWhatsAppInteractiveBody(options.bodyText);
  const buttons = prepareWhatsAppButtons(options.buttons);
  let supplementalDelivered = false;

  if (bodyPlan.supplementalText) {
    const supplementalResult = await sendWhatsAppText({
      to: options.to,
      text: bodyPlan.supplementalText,
    });
    supplementalDelivered = supplementalResult.success;
  }

  if (buttons.length === 0) {
    return sendWhatsAppText({
      to: options.to,
      text: limitWhatsAppText(options.bodyText, WHATSAPP_MESSAGE_LIMITS.textBody, 'Escribe tu solicitud para continuar.'),
    });
  }

  const interactiveObj: any = {
    type: 'button',
    body: {
      text: bodyPlan.supplementalText && !supplementalDelivered
        ? limitWhatsAppText(options.bodyText, WHATSAPP_MESSAGE_LIMITS.interactiveBody, 'Selecciona una opción para continuar.')
        : bodyPlan.bodyText,
    },
    action: {
      buttons: buttons.map(b => ({
        type: 'reply',
        reply: {
          id: b.id,
          title: b.title,
        }
      }))
    }
  };

  if (options.headerText) {
    interactiveObj.header = {
      type: 'text',
      text: limitWhatsAppText(options.headerText, WHATSAPP_MESSAGE_LIMITS.interactiveHeader),
    };
  }
  if (options.footerText) {
    interactiveObj.footer = {
      text: limitWhatsAppText(options.footerText, WHATSAPP_MESSAGE_LIMITS.interactiveFooter),
    };
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
      const metaError = metaErrorDetails(data, 'Error enviando botones interactivos', res.status);
      console.error('Meta WhatsApp Buttons Error:', {
        error: data.error,
        bodyLength: whatsappTextLength(options.bodyText),
        preparedBodyLength: whatsappTextLength(interactiveObj.body.text),
        buttonCount: buttons.length,
      });
      const fallbackResult = await sendWhatsAppText({
        to: options.to,
        text: buildInteractiveFallbackText(
          supplementalDelivered
            ? 'No pudimos mostrar los botones interactivos.'
            : options.bodyText,
          buttons.map(button => button.title),
        ),
      });
      if (fallbackResult.success) {
        return {
          ...fallbackResult,
          fallbackUsed: true,
          degradedReason: 'interactive_api_rejected',
        };
      }
      return metaError;
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      ...(bodyPlan.supplementalText
        ? {
            fallbackUsed: true,
            degradedReason: supplementalDelivered
              ? 'interactive_body_split' as const
              : 'interactive_body_truncated' as const,
          }
        : {}),
    };
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
}): Promise<WhatsAppSendResult> {
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
  const bodyPlan = planWhatsAppInteractiveBody(options.bodyText);
  const sections = prepareWhatsAppListSections(options.sections);
  let supplementalDelivered = false;

  if (bodyPlan.supplementalText) {
    const supplementalResult = await sendWhatsAppText({
      to: options.to,
      text: bodyPlan.supplementalText,
    });
    supplementalDelivered = supplementalResult.success;
  }

  if (sections.length === 0) {
    return sendWhatsAppText({
      to: options.to,
      text: limitWhatsAppText(options.bodyText, WHATSAPP_MESSAGE_LIMITS.textBody, 'Escribe tu solicitud para continuar.'),
    });
  }

  const interactiveObj: any = {
    type: 'list',
    body: {
      text: bodyPlan.supplementalText && !supplementalDelivered
        ? limitWhatsAppText(options.bodyText, WHATSAPP_MESSAGE_LIMITS.interactiveBody, 'Selecciona una opción para continuar.')
        : bodyPlan.bodyText,
    },
    action: {
      button: limitWhatsAppText(
        options.buttonText || 'Ver Opciones',
        WHATSAPP_MESSAGE_LIMITS.listButtonTitle,
        'Ver opciones',
      ),
      sections: sections.map(s => ({
        title: s.title,
        rows: s.rows.map(r => ({
          id: r.id,
          title: r.title,
          description: r.description,
        }))
      }))
    }
  };

  if (options.headerText) {
    interactiveObj.header = {
      type: 'text',
      text: limitWhatsAppText(options.headerText, WHATSAPP_MESSAGE_LIMITS.interactiveHeader),
    };
  }
  if (options.footerText) {
    interactiveObj.footer = {
      text: limitWhatsAppText(options.footerText, WHATSAPP_MESSAGE_LIMITS.interactiveFooter),
    };
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
      const metaError = metaErrorDetails(data, 'Error enviando lista interactiva', res.status);
      console.error('Meta WhatsApp List Error:', {
        error: data.error,
        bodyLength: whatsappTextLength(options.bodyText),
        preparedBodyLength: whatsappTextLength(interactiveObj.body.text),
        sectionCount: sections.length,
        rowCount: sections.reduce((total, section) => total + section.rows.length, 0),
      });
      const fallbackResult = await sendWhatsAppText({
        to: options.to,
        text: buildInteractiveFallbackText(
          supplementalDelivered
            ? 'No pudimos mostrar la lista interactiva.'
            : options.bodyText,
          sections.flatMap(section => section.rows.map(row => row.title)),
        ),
      });
      if (fallbackResult.success) {
        return {
          ...fallbackResult,
          fallbackUsed: true,
          degradedReason: 'interactive_api_rejected',
        };
      }
      return metaError;
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      ...(bodyPlan.supplementalText
        ? {
            fallbackUsed: true,
            degradedReason: supplementalDelivered
              ? 'interactive_body_split' as const
              : 'interactive_body_truncated' as const,
          }
        : {}),
    };
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
 *
 * Area status is appended to {{2}} so the existing Meta-approved template
 * remains compatible without adding a sixth parameter.
 */
export async function sendShiftReminderTemplate(options: {
  to: string;
  volunteerName: string;
  committeeName: string;
  shiftName: string;
  shiftHours: string;
  shiftDate: string;
  areaName?: string | null;
}): Promise<WhatsAppSendResult> {
  const serviceAssignment = options.areaName
    ? `${options.committeeName} · Área: ${options.areaName}`
    : `${options.committeeName} · Sin área asignada`;

  return sendWhatsAppTemplate({
    to: options.to,
    templateName: 'recordatorio_turno_comite',
    languageCode: 'es',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: options.volunteerName },
          { type: 'text', text: serviceAssignment },
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
