import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getOfficialShiftTime } from '@/lib/dates';
import {
  sendWhatsAppText,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
  isWhatsAppEnabled
} from '@/lib/whatsapp-api';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type MetaWhatsAppMessage = {
  id?: string;
  from?: string;
  type?: string;
  context?: { id?: string };
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  [key: string]: unknown;
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messages?: MetaWhatsAppMessage[];
      };
    }>;
  }>;
};

type VolunteerRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  status?: string | null;
  committee_id?: string | null;
  committees?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function getVolunteerRecord(value: unknown): VolunteerRecord | null {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== 'object' || !('id' in record)) return null;
  return record as VolunteerRecord;
}

function getVolunteerCommitteeName(volunteer: VolunteerRecord): string {
  const committee = Array.isArray(volunteer.committees)
    ? volunteer.committees[0]
    : volunteer.committees;
  return committee?.name || 'Servicio';
}

function isValidMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');

  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function extractMessages(payload: MetaWebhookPayload): MetaWhatsAppMessage[] {
  if (payload.object !== 'whatsapp_business_account') return [];

  return (payload.entry || []).flatMap(entry =>
    (entry.changes || []).flatMap(change =>
      change.field === 'messages' ? (change.value?.messages || []) : []
    )
  );
}

function getAdminClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Map default committee coordinators
const COMMITTEE_COORDINATORS: Record<string, { name: string; phone: string }> = {
  'Historia': { name: 'Kendyr Quintanilla', phone: '+50588273034' },
  'Servicio': { name: 'Coordinación Servicio', phone: '+50588273034' },
  'Logística': { name: 'Coordinación Logística', phone: '+50588273034' }
};

/**
 * GET Handler: Verification for Meta Webhooks Setup
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('[WHATSAPP WEBHOOK] Missing WHATSAPP_VERIFY_TOKEN configuration.');
    return new Response('Webhook not configured', { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[WHATSAPP WEBHOOK] Webhook verified successfully.');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[WHATSAPP WEBHOOK] Webhook verification failed.');
  return new Response('Forbidden', { status: 403 });
}

/**
 * Process one incoming message. Keeping this isolated lets a single Meta webhook
 * batch contain multiple entries, changes and messages without dropping any.
 */
async function processIncomingMessage(message: MetaWhatsAppMessage) {
  try {
    const rawFrom = message.from; // Sender phone number e.g. "50588273034"
    const messageType = message.type;
    const wamid = message.id;
    const contextMsgId = message.context?.id;

    if (!rawFrom || !messageType) {
      console.warn('[WHATSAPP WEBHOOK] Ignoring malformed message without sender or type.');
      return NextResponse.json({ status: 'ignored', reason: 'malformed_message' }, { status: 200 });
    }

    console.log(`📩 Received Meta WhatsApp Webhook message of type "${messageType}" from ${rawFrom} (Context ID: ${contextMsgId || 'none'})`);

    const supabase = getAdminClient();
    const senderDigits = rawFrom.replace(/\D/g, '');

    // 1. Identify Volunteer / User in database
    let targetVolId: string | null = null;
    let firstName = 'Voluntario(a)';
    let committeeName = 'Servicio';

    if (contextMsgId) {
      const { data: matchedLog } = await supabase
        .from('reminder_logs')
        .select('*, volunteers(id, first_name, last_name, phone, committee_id, committees(name))')
        .eq('whatsapp_message_id', contextMsgId)
        .maybeSingle();

      if (matchedLog && matchedLog.volunteers) {
        const matchedVolunteer = getVolunteerRecord(matchedLog.volunteers);
        if (matchedVolunteer) {
          targetVolId = matchedVolunteer.id;
          firstName = matchedVolunteer.first_name || 'Voluntario(a)';
          committeeName = getVolunteerCommitteeName(matchedVolunteer);
        }
      }
    }

    if (!targetVolId) {
      const { data: volunteers } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone, status, committee_id, committees(name)')
        .neq('status', 'archived');

      const matchedVols = ((volunteers || []) as VolunteerRecord[]).filter(v => {
        if (!v.phone) return false;
        const vDigits = v.phone.replace(/\D/g, '');
        if (!vDigits || !senderDigits) return false;
        return senderDigits.endsWith(vDigits.slice(-8)) || vDigits.endsWith(senderDigits.slice(-8));
      });

      if (matchedVols.length === 1) {
        targetVolId = matchedVols[0].id;
        firstName = matchedVols[0].first_name || 'Voluntario(a)';
        committeeName = getVolunteerCommitteeName(matchedVols[0]);
      } else if (matchedVols.length > 1) {
        // Verificar si el mensaje de texto es un número de opción (1, 2, 3...)
        const rawText = (message.text?.body || '').trim();
        const selectedIndex = parseInt(rawText, 10) - 1;

        if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < matchedVols.length) {
          const selectedVol = matchedVols[selectedIndex];
          targetVolId = selectedVol.id;
          firstName = selectedVol.first_name || 'Voluntario(a)';
          committeeName = getVolunteerCommitteeName(selectedVol);
        } else {
          // Desambiguar: Enviar menú de selección de perfil vía WhatsApp
          const profileList = matchedVols.map((v, i) => `${i + 1}. ${v.first_name} ${v.last_name || ''}`).join('\n');
          await sendWhatsAppText({
            to: rawFrom,
            text: `Hola 👋 Encontramos varios perfiles asociados a este número de WhatsApp:\n\n${profileList}\n\nPor favor responde únicamente con el número de tu perfil (ej: 1 o 2) para continuar.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }
      }
    }

    // Extract payload IDs or typed numbers
    let interactiveId = '';

    if (messageType === 'interactive') {
      const interactive = message.interactive;
      if (interactive?.type === 'list_reply') {
        interactiveId = interactive.list_reply?.id || '';
      } else if (interactive?.type === 'button_reply') {
        interactiveId = interactive.button_reply?.id || '';
      }
    } else if (messageType === 'button') {
      interactiveId = message.button?.payload || message.button?.text || '';
    } else if (messageType === 'text') {
      const textContent = (message.text?.body || '').trim().toLowerCase();
      if (textContent === '1' || textContent.includes('confirmar mi turno') || textContent === 'confirmar') {
        interactiveId = 'menu_confirm_shift';
      } else if (textContent === '2' || textContent.includes('ver mis turnos') || textContent.includes('mis turnos')) {
        interactiveId = 'menu_view_shifts';
      } else if (textContent === '3' || textContent.includes('solicitar cambio') || textContent.includes('reagendar')) {
        interactiveId = 'menu_reschedule';
      } else if (textContent === '4' || textContent.includes('contactar coordinador') || textContent.includes('coordinador')) {
        interactiveId = 'menu_contact_coordinator';
      }
    }

    // 2. Process Actions
    if (interactiveId === 'menu_confirm_shift' || interactiveId.startsWith('confirm_date_') || interactiveId.startsWith('confirm_shift_')) {
      // OPTION 1: Confirmar mi turno
      if (!targetVolId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola. No encontramos tu número de teléfono registrado como voluntario activo. Por favor contacta al administrador.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const { data: userShifts } = await supabase
        .from('shifts')
        .select('*')
        .eq('volunteer_id', targetVolId);

      if (!userShifts || userShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, actualmente no tienes turnos de servicio asignados para confirmar.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('confirm_date_')) {
        const selectedDayKey = interactiveId.replace('confirm_date_', '');
        const dayShifts = userShifts.filter(s => s.day_key === selectedDayKey);

        if (dayShifts.length === 1) {
          const shiftKey = dayShifts[0].shift_key;
          await supabase.from('reminder_logs').upsert({
            volunteer_id: targetVolId,
            shift_key: shiftKey,
            day_key: selectedDayKey,
            status: 'confirmado',
            confirmed_at: new Date().toISOString(),
            raw_payload: message
          });

          await sendWhatsAppText({
            to: rawFrom,
            text: `¡Muchas gracias, ${firstName}! Tu asistencia para el *${shiftKey}* del día *${selectedDayKey}* ha sido CONFIRMADA exitosamente. 🙏✨`
          });
        } else {
          const buttons = dayShifts.map(s => ({
            id: `confirm_shift_${s.day_key}_${s.shift_key}`,
            title: `Turno ${s.shift_key.replace('T', '')}`
          }));

          const btnRes = await sendWhatsAppInteractiveButtons({
            to: rawFrom,
            bodyText: `¿Qué turno deseas confirmar para la fecha *${selectedDayKey}*?`,
            buttons
          });

          if (!btnRes.success) {
            const optionsText = dayShifts.map(s => `• ${s.shift_key}`).join('\n');
            await sendWhatsAppText({
              to: rawFrom,
              text: `¿Qué turno deseas confirmar para el *${selectedDayKey}*?\n\n${optionsText}`
            });
          }
        }
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('confirm_shift_')) {
        const parts = interactiveId.split('_');
        const dayKey = parts[2];
        const shiftKey = parts[3];

        await supabase.from('reminder_logs').upsert({
          volunteer_id: targetVolId,
          shift_key: shiftKey,
          day_key: dayKey,
          status: 'confirmado',
          confirmed_at: new Date().toISOString(),
          raw_payload: message
        });

        await sendWhatsAppText({
          to: rawFrom,
          text: `¡Muchas gracias, ${firstName}! Tu asistencia para el *${shiftKey}* del día *${dayKey}* ha sido CONFIRMADA exitosamente. 🙏✨`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // Initial date selection
      const uniqueDays = Array.from(new Set(userShifts.map(s => s.day_key)));
      if (uniqueDays.length === 1) {
        const dayKey = uniqueDays[0];
        const dayShifts = userShifts.filter(s => s.day_key === dayKey);
        const shiftKey = dayShifts[0].shift_key;

        await supabase.from('reminder_logs').upsert({
          volunteer_id: targetVolId,
          shift_key: shiftKey,
          day_key: dayKey,
          status: 'confirmado',
          confirmed_at: new Date().toISOString(),
          raw_payload: message
        });

        await sendWhatsAppText({
          to: rawFrom,
          text: `¡Muchas gracias, ${firstName}! Tu asistencia para el *${shiftKey}* del día *${dayKey}* ha sido CONFIRMADA exitosamente. 🙏✨`
        });
      } else {
        const rows = uniqueDays.map(d => ({
          id: `confirm_date_${d}`,
          title: `Fecha ${d}`,
          description: `Confirmar servicio del día ${d}`
        }));

        const listRes = await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: "Confirmación de Turno",
          bodyText: `Hola ${firstName}, por favor selecciona la fecha que deseas confirmar:`,
          buttonText: "Seleccionar Fecha",
          sections: [{ title: "Tus Fechas Asignadas", rows }]
        });

        if (!listRes.success) {
          const textDays = uniqueDays.map(d => `• ${d}`).join('\n');
          await sendWhatsAppText({
            to: rawFrom,
            text: `Hola ${firstName}, por favor escribe cuál fecha deseas confirmar:\n\n${textDays}`
          });
        }
      }

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    if (interactiveId === 'menu_view_shifts') {
      // OPTION 2: Ver mis turnos
      if (!targetVolId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola. No encontramos tu número de teléfono registrado como voluntario activo.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const { data: userShifts } = await supabase
        .from('shifts')
        .select('*')
        .eq('volunteer_id', targetVolId)
        .order('day_key', { ascending: true });

      if (!userShifts || userShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, actualmente no tienes turnos de servicio asignados.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      let text = `📋 *Tus Turnos Asignados (${firstName})*\n*Comité:* ${committeeName}\n\n`;
      userShifts.forEach(s => {
        text += `• *Fecha:* ${s.day_key} | *${s.shift_key}*\n`;
      });
      text += `\n¿Deseas confirmar tu asistencia a alguno de estos turnos?`;

      const btnRes = await sendWhatsAppInteractiveButtons({
        to: rawFrom,
        bodyText: text,
        buttons: [
          { id: 'menu_confirm_shift', title: 'Confirmar un Turno' },
          { id: 'menu_reschedule', title: 'Solicitar Cambio' }
        ]
      });

      if (!btnRes.success) {
        text += `\n\nResponde *1* para confirmar un turno o *3* para solicitar cambio.`;
        await sendWhatsAppText({ to: rawFrom, text });
      }

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    if (interactiveId === 'menu_reschedule' || interactiveId.startsWith('reschedule_from_')) {
      // OPTION 3: Solicitar cambio de turno
      if (!targetVolId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola. No encontramos tu número registrado como voluntario activo.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('reschedule_to_')) {
        const parts = interactiveId.replace('reschedule_to_', '').split('__');
        const currentPart = parts[0];
        const requestedPart = parts[1];

        const [currDay, currShift] = currentPart.split('_');
        const [reqDay, reqShift] = requestedPart.split('_');

        await supabase.from('shift_change_requests').insert({
          volunteer_id: targetVolId,
          current_day_key: currDay,
          current_shift_key: currShift,
          requested_day_key: reqDay,
          requested_shift_key: reqShift,
          status: 'pending'
        });

        await sendWhatsAppText({
          to: rawFrom,
          text: `Tu solicitud de cambio del *${currShift} (${currDay})* al *${reqShift} (${reqDay})* ha sido recibida y se encuentra en revisión.\n\nTe notificaremos por WhatsApp una vez que el administrador apruebe o deniegue tu solicitud. 🙏`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('reschedule_from_')) {
        const [currDay, currShift] = interactiveId.replace('reschedule_from_', '').split('_');

        const targetRows = [
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-30_T1`, title: '30 Aug - Turno 1', description: getOfficialShiftTime('2026-08-30', 'T1').timeLabel },
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-30_T2`, title: '30 Aug - Turno 2', description: getOfficialShiftTime('2026-08-30', 'T2').timeLabel },
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-31_T1`, title: '31 Aug - Turno 1', description: getOfficialShiftTime('2026-08-31', 'T1').timeLabel },
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-31_T2`, title: '31 Aug - Turno 2', description: getOfficialShiftTime('2026-08-31', 'T2').timeLabel },
        ];

        const listRes = await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: "Solicitar Reagendamiento",
          bodyText: `Has seleccionado cambiar el *${currShift} (${currDay})*. ¿A qué nuevo turno te gustaría cambiarte?`,
          buttonText: "Ver Turnos Nuevos",
          sections: [{ title: "Turnos Disponibles", rows: targetRows }]
        });

        if (!listRes.success) {
          await sendWhatsAppText({
            to: rawFrom,
            text: `Has seleccionado cambiar el *${currShift} (${currDay})*. Escribe la fecha y turno al que deseas cambiarte.`
          });
        }
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const { data: userShifts } = await supabase
        .from('shifts')
        .select('*')
        .eq('volunteer_id', targetVolId);

      if (!userShifts || userShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, no tienes turnos asignados actualmente para solicitar cambio.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const rows = userShifts.map(s => ({
        id: `reschedule_from_${s.day_key}_${s.shift_key}`,
        title: `${s.shift_key} (${s.day_key})`,
        description: `Solicitar cambio para este turno`
      }));

      const listRes = await sendWhatsAppInteractiveList({
        to: rawFrom,
        headerText: "Cambio de Turno",
        bodyText: `Hola ${firstName}, ¿cuál de tus turnos actuales deseas cambiar?`,
        buttonText: "Seleccionar Turno",
        sections: [{ title: "Tus Turnos Actuales", rows }]
      });

      if (!listRes.success) {
        const shiftsText = userShifts.map(s => `• ${s.shift_key} (${s.day_key})`).join('\n');
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, ¿cuál de tus turnos actuales deseas cambiar?\n\n${shiftsText}`
        });
      }

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    if (interactiveId === 'menu_contact_coordinator') {
      // OPTION 4: Contactar a mi coordinador
      const coordInfo = COMMITTEE_COORDINATORS[committeeName] || {
        name: `Coordinador de ${committeeName}`,
        phone: '+505 8888-0000'
      };

      await sendWhatsAppText({
        to: rawFrom,
        text: `Hola ${firstName}, tu comité asignado es *${committeeName}*.\n\n👤 *Contacto de tu Coordinador:*\n• *Nombre:* ${coordInfo.name}\n• *Teléfono:* ${coordInfo.phone}\n\nPuedes escribirle directamente si necesitas asistencia especial. ¡Estamos para servirte! 🙏`
      });

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    // 3. Direct Template Quick Reply / Confirmation Handling
    let isDirectConfirmation = false;
    if (messageType === 'button') {
      isDirectConfirmation = true;
    } else if (messageType === 'text') {
      const textContent = (message.text?.body || '').trim().toLowerCase();
      if (
        textContent.includes('confirm') ||
        textContent === 'si' ||
        textContent === 'sí' ||
        textContent === 'ok' ||
        textContent === 'listo'
      ) {
        isDirectConfirmation = true;
      }
    }

    if (isDirectConfirmation) {
      if (targetVolId) {
        const { data: pendingLogs } = await supabase
          .from('reminder_logs')
          .select('*')
          .eq('volunteer_id', targetVolId)
          .order('sent_at', { ascending: false })
          .limit(5);

        if (pendingLogs && pendingLogs.length > 0) {
          const logIds = pendingLogs.map(l => l.id);
          await supabase
            .from('reminder_logs')
            .update({
              status: 'confirmado',
              confirmed_at: new Date().toISOString(),
              raw_payload: message
            })
            .in('id', logIds);
        } else {
          await supabase.from('reminder_logs').insert([{
            volunteer_id: targetVolId,
            shift_key: 'T1',
            day_key: new Date().toISOString().split('T')[0],
            whatsapp_message_id: wamid,
            status: 'confirmado',
            confirmed_at: new Date().toISOString(),
            raw_payload: message
          }]);
        }
      }

      await sendWhatsAppText({
        to: rawFrom,
        text: `¡Muchas gracias por tu respuesta, ${firstName}! Tu asistencia ha sido CONFIRMADA exitosamente. ✨`
      });

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    // 4. Default Fallback: Send Main Interactive Options Menu (or text menu fallback)
    const mainListRes = await sendWhatsAppInteractiveList({
      to: rawFrom,
      headerText: "Asistencia Voluntariado",
      bodyText: `Hola ${firstName}, bienvenido(a) al centro de atención por WhatsApp. ¿En qué podemos ayudarte hoy?`,
      buttonText: "Ver Opciones",
      sections: [
        {
          title: "Menú Principal",
          rows: [
            {
              id: "menu_confirm_shift",
              title: "1. Confirmar mi turno",
              description: "Seleccionar fecha y confirmar asistencia"
            },
            {
              id: "menu_view_shifts",
              title: "2. Ver mis turnos",
              description: "Consultar lista de turnos programados"
            },
            {
              id: "menu_reschedule",
              title: "3. Solicitar cambio",
              description: "Pedir cambio de fecha o turno"
            },
            {
              id: "menu_contact_coordinator",
              title: "4. Contactar coordinador",
              description: "Obtener datos del coordinador de tu comité"
            }
          ]
        }
      ]
    });

    if (!mainListRes.success) {
      console.warn("Main Interactive List failed, sending plain text fallback:", mainListRes.error);
      await sendWhatsAppText({
        to: rawFrom,
        text: `Hola ${firstName}, bienvenido(a) al centro de atención por WhatsApp. Por favor escribe el número de la opción que deseas:\n\n1. Confirmar mi turno\n2. Ver mis turnos\n3. Solicitar cambio de turno\n4. Contactar a mi coordinador`
      });
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: unknown) {
    console.error("Critical error in WhatsApp Webhook Handler:", error);
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST Handler: validate and process incoming messages and button/list responses from Meta.
 */
export async function POST(req: NextRequest) {
  if (!isWhatsAppEnabled()) {
    console.log('[WHATSAPP WEBHOOK] Incoming message processing is paused via WHATSAPP_ENABLED=false.');
    return NextResponse.json({ status: 'paused' }, { status: 200 });
  }

  const rawBody = await req.text();
  const appSecret = process.env.META_APP_SECRET;

  if (appSecret) {
    const signature = req.headers.get('x-hub-signature-256');
    if (!isValidMetaSignature(rawBody, signature, appSecret)) {
      console.warn('[WHATSAPP WEBHOOK] Rejected request with an invalid Meta signature.');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else {
    console.warn('[WHATSAPP WEBHOOK] META_APP_SECRET is not configured; signature validation is disabled.');
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    console.warn('[WHATSAPP WEBHOOK] Rejected request with invalid JSON.');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages = extractMessages(payload);
  if (messages.length === 0) {
    return NextResponse.json({ status: 'ignored', processed: 0 }, { status: 200 });
  }

  let processed = 0;
  let failed = 0;

  for (const message of messages) {
    const result = await processIncomingMessage(message);
    if (result.ok) processed += 1;
    else failed += 1;
  }

  if (failed > 0) {
    console.error(`[WHATSAPP WEBHOOK] ${failed} of ${messages.length} incoming messages failed to process.`);
  }

  // Acknowledge the batch so Meta does not retry already-processed messages.
  return NextResponse.json({
    status: failed === 0 ? 'success' : 'partial',
    received: messages.length,
    processed,
    failed
  }, { status: 200 });
}
