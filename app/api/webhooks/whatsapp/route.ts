import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  formatDateShort,
  getAvailableShiftKeys,
  getOperationalEventDays,
  getOfficialShiftTime,
  parseDayKeyToDateStr,
} from '@/lib/dates';
import {
  sendWhatsAppText,
  sendWhatsAppImageBuffer,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
  isWhatsAppEnabled
} from '@/lib/whatsapp-api';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  claimInboundEvent,
  markInboundEventFailed,
  markInboundEventProcessed,
  WhatsAppInboxTableMissingError,
} from '@/lib/services/whatsapp-inbound-store';
import {
  persistWhatsAppMessageStatus,
} from '@/lib/services/whatsapp-status-store';
import type { MetaWhatsAppStatus } from '@/lib/services/whatsapp-status-store';
import { createEntryPassPayload } from '@/lib/entry-pass';
import { createQrPngBuffer } from '@/lib/qr-code-image';
import {
  closeWhatsAppConversation,
  touchWhatsAppConversation,
} from '@/lib/services/whatsapp-conversation-store';

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
        statuses?: MetaWhatsAppStatus[];
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

type ShiftRecord = {
  day_key: string;
  shift_key: string;
  area_id?: string | null;
  committee_areas?: { name?: string | null } | Array<{ name?: string | null }> | null;
  checked_in?: boolean | null;
  checked_in_at?: string | null;
  checked_out?: boolean | null;
  checked_out_at?: string | null;
};

function shiftAreaName(shift: ShiftRecord): string | null {
  const area = Array.isArray(shift.committee_areas)
    ? shift.committee_areas[0]
    : shift.committee_areas;
  return area?.name || null;
}

type ScopedAction = {
  volunteerId: string;
  action: string;
  args: string[];
};

const ACTION_PREFIX = 'vm1';
const PAGE_SIZE = 8;
const CHANGE_REASONS: Record<string, string> = {
  work: 'Compromiso laboral o académico',
  health: 'Motivo de salud',
  family: 'Compromiso o emergencia familiar',
  church: 'Asignación o responsabilidad de la Iglesia',
  transport: 'Dificultad de transporte',
  schedule: 'Conflicto con otro horario',
};
const CONVERSATION_CLOSE_PHRASES = new Set([
  'gracias',
  'muchas gracias',
  'eso es todo',
  'finalizar',
  'finalizar conversacion',
  'cerrar',
  'cerrar conversacion',
  'salir',
  'adios',
]);

function encodeAction(volunteerId: string, action: string, ...args: string[]): string {
  return [ACTION_PREFIX, volunteerId, action, ...args.map(encodeURIComponent)].join('|');
}

function parseAction(value: string): ScopedAction | null {
  const [prefix, volunteerId, action, ...encodedArgs] = value.split('|');
  if (prefix !== ACTION_PREFIX || !volunteerId || !action) return null;

  try {
    return {
      volunteerId,
      action,
      args: encodedArgs.map(decodeURIComponent),
    };
  } catch {
    return null;
  }
}

function firstGivenName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'Voluntario';
}

function isConversationClosingText(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!¡¿?]+$/g, '')
    .trim();

  return CONVERSATION_CLOSE_PHRASES.has(normalized);
}

function volunteerFullName(volunteer: VolunteerRecord): string {
  return `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim() || 'Voluntario';
}

function sortShifts(shifts: ShiftRecord[]): ShiftRecord[] {
  return [...shifts].sort((a, b) => {
    const dateComparison = parseDayKeyToDateStr(a.day_key).localeCompare(parseDayKeyToDateStr(b.day_key));
    return dateComparison || a.shift_key.localeCompare(b.shift_key);
  });
}

function formatShiftLine(shift: ShiftRecord): string {
  const official = getOfficialShiftTime(shift.day_key, shift.shift_key);
  return `• *${shift.day_key}* · ${official.name} (${official.timeLabel})\n  📍 ${shiftAreaName(shift) || 'Área pendiente'}`;
}

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

function extractMessageStatuses(payload: MetaWebhookPayload): MetaWhatsAppStatus[] {
  if (payload.object !== 'whatsapp_business_account') return [];

  return (payload.entry || []).flatMap(entry =>
    (entry.changes || []).flatMap(change =>
      change.field === 'messages' ? (change.value?.statuses || []) : []
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

async function writeWhatsAppVolunteerAudit(
  supabase: ReturnType<typeof getAdminClient>,
  input: {
    volunteerId: string;
    volunteerName: string;
    actionType: string;
    description: string;
    wamid: string;
    context: Record<string, unknown>;
  },
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('activity_logs')
    .select('id')
    .eq('target_id', input.volunteerId)
    .eq('action_type', input.actionType)
    .ilike('details', `%${input.wamid}%`)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error('[WHATSAPP WEBHOOK] Could not check the volunteer activity audit.', {
      wamid: input.wamid,
      volunteerId: input.volunteerId,
      error: lookupError.message,
    });
    return;
  }
  if (existing) return;

  const { error } = await supabase.from('activity_logs').insert({
    user_name: input.volunteerName,
    user_role: 'Voluntario',
    action_type: input.actionType,
    description: input.description,
    details: JSON.stringify({
      context: {
        source: 'WhatsApp',
        wamid: input.wamid,
        ...input.context,
      },
    }),
    target_id: input.volunteerId,
  });

  if (error) {
    console.error('[WHATSAPP WEBHOOK] Could not write volunteer activity audit.', {
      wamid: input.wamid,
      volunteerId: input.volunteerId,
      error: error.message,
    });
  }
}

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
    const incomingActionId = messageType === 'interactive'
      ? message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || ''
      : messageType === 'button'
        ? message.button?.payload || message.button?.text || ''
        : '';
    let scopedAction = parseAction(incomingActionId);

    if (!rawFrom || !messageType || !wamid) {
      console.warn('[WHATSAPP WEBHOOK] Ignoring malformed message without sender, type or wamid.');
      return NextResponse.json({ status: 'ignored', reason: 'malformed_message' }, { status: 200 });
    }

    console.log(`📩 Received Meta WhatsApp Webhook message of type "${messageType}" from ${rawFrom} (Context ID: ${contextMsgId || 'none'})`);

    const supabase = getAdminClient();
    const senderDigits = rawFrom.replace(/\D/g, '');

    if (messageType === 'text' && isConversationClosingText(message.text?.body || '')) {
      try {
        await closeWhatsAppConversation(supabase, senderDigits, 'closing_phrase');
      } catch (sessionError) {
        console.error('[WHATSAPP WEBHOOK] Could not persist conversation closure.', {
          senderPhone: senderDigits,
          error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        });
      }
      await sendWhatsAppText({
        to: rawFrom,
        text: 'Con gusto. Hemos finalizado esta atención. Cuando necesites algo más, vuelve a escribirnos. 👋',
      });
      return NextResponse.json({ status: 'success', conversation: 'closed' }, { status: 200 });
    }

    let restartedConversation = false;
    try {
      restartedConversation = await touchWhatsAppConversation(supabase, senderDigits) === 'restarted';
    } catch (sessionError) {
      console.error('[WHATSAPP WEBHOOK] Could not update conversation inactivity timeout.', {
        senderPhone: senderDigits,
        error: sessionError instanceof Error ? sessionError.message : String(sessionError),
      });
    }

    if (restartedConversation) scopedAction = null;

    // 1. Identify Volunteer / User in database
    let targetVolId: string | null = null;
    let firstName = 'Voluntario(a)';
    let selectedVolunteerName = 'Voluntario';
    let selectedCommitteeId: string | null = null;
    let committeeName = 'Servicio';
    let selectedSharedProfileByNumber = false;

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
          firstName = firstGivenName(matchedVolunteer.first_name);
          selectedVolunteerName = volunteerFullName(matchedVolunteer);
          selectedCommitteeId = matchedVolunteer.committee_id || null;
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

      const selectedByAction = scopedAction
        ? matchedVols.find(volunteer => volunteer.id === scopedAction.volunteerId)
        : null;

      if (selectedByAction) {
        targetVolId = selectedByAction.id;
        firstName = firstGivenName(selectedByAction.first_name);
        selectedVolunteerName = volunteerFullName(selectedByAction);
        selectedCommitteeId = selectedByAction.committee_id || null;
        committeeName = getVolunteerCommitteeName(selectedByAction);
      } else if (matchedVols.length === 1) {
        targetVolId = matchedVols[0].id;
        firstName = firstGivenName(matchedVols[0].first_name);
        selectedVolunteerName = volunteerFullName(matchedVols[0]);
        selectedCommitteeId = matchedVols[0].committee_id || null;
        committeeName = getVolunteerCommitteeName(matchedVols[0]);
      } else if (matchedVols.length > 1) {
        // Verificar si el mensaje de texto es un número de opción (1, 2, 3...)
        const rawText = (message.text?.body || '').trim();
        const selectedIndex = parseInt(rawText, 10) - 1;

        if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < matchedVols.length) {
          const selectedVol = matchedVols[selectedIndex];
          targetVolId = selectedVol.id;
          firstName = firstGivenName(selectedVol.first_name);
          selectedVolunteerName = volunteerFullName(selectedVol);
          selectedCommitteeId = selectedVol.committee_id || null;
          committeeName = getVolunteerCommitteeName(selectedVol);
          selectedSharedProfileByNumber = true;
        } else {
          // Desambiguar: Enviar menú de selección de perfil vía WhatsApp
          const profileRows = matchedVols.slice(0, 10).map(v => ({
            id: encodeAction(v.id, 'home'),
            title: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
            description: `Comité: ${getVolunteerCommitteeName(v)}`,
          }));
          const profileResult = await sendWhatsAppInteractiveList({
            to: rawFrom,
            headerText: 'Selecciona una persona',
            bodyText: 'Este número está asociado a varios voluntarios. ¿De quién deseas consultar o gestionar los turnos?',
            buttonText: 'Elegir persona',
            sections: [{ title: 'Perfiles asociados', rows: profileRows }],
          });

          if (profileResult.success) {
            return NextResponse.json({ status: 'success' }, { status: 200 });
          }

          const profileList = matchedVols.map((v, i) => `${i + 1}. ${v.first_name} ${v.last_name || ''}`).join('\n');
          await sendWhatsAppText({
            to: rawFrom,
            text: `Este número está asociado a varios voluntarios:\n\n${profileList}\n\nResponde únicamente con el número de la persona que deseas consultar.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }
      }
    }

    // Extract payload IDs or typed numbers
    let interactiveId = '';

    if (restartedConversation) {
      // Ignore actions from a menu whose 30-minute session already expired.
      // The default branch below will present a fresh menu.
      interactiveId = '';
    } else if (scopedAction) {
      const [arg1 = '', arg2 = '', arg3 = '', arg4 = '', arg5 = ''] = scopedAction.args;
      if (scopedAction.action === 'confirm') interactiveId = 'menu_confirm_shift';
      else if (scopedAction.action === 'confirm_page') interactiveId = `confirm_page_${arg1}`;
      else if (scopedAction.action === 'confirm_day') interactiveId = `confirm_date_${arg1}`;
      else if (scopedAction.action === 'confirm_shift') interactiveId = `confirm_shift_${arg1}_${arg2}`;
      else if (scopedAction.action === 'view') interactiveId = 'menu_view_shifts';
      else if (scopedAction.action === 'reschedule') interactiveId = 'menu_reschedule';
      else if (scopedAction.action === 'reschedule_source_page') interactiveId = `reschedule_source_page_${arg1}`;
      else if (scopedAction.action === 'reschedule_from') interactiveId = `reschedule_from_${arg1}_${arg2}`;
      else if (scopedAction.action === 'reschedule_day') interactiveId = `reschedule_day_${arg1}__${arg2}__${arg3}`;
      else if (scopedAction.action === 'reschedule_target_date') interactiveId = `reschedule_target_date_${arg1}__${arg2}__${arg3}`;
      else if (scopedAction.action === 'reschedule_to') interactiveId = `reschedule_to_${arg1}__${arg2}__${arg3}__${arg4}`;
      else if (scopedAction.action === 'reschedule_reason') interactiveId = `reschedule_reason_${arg1}__${arg2}__${arg3}__${arg4}__${arg5}`;
      else if (scopedAction.action === 'contact') interactiveId = 'menu_contact_coordinator';
      else if (scopedAction.action === 'qr') interactiveId = 'menu_generate_qr';
      else if (scopedAction.action === 'end') interactiveId = 'menu_end_session';
    } else if (messageType === 'interactive') {
      const interactive = message.interactive;
      if (interactive?.type === 'list_reply') {
        interactiveId = interactive.list_reply?.id || '';
      } else if (interactive?.type === 'button_reply') {
        interactiveId = interactive.button_reply?.id || '';
      }
    } else if (messageType === 'button') {
      interactiveId = message.button?.payload || message.button?.text || '';
    } else if (messageType === 'text' && !selectedSharedProfileByNumber) {
      const textContent = (message.text?.body || '').trim().toLowerCase();
      if (textContent === '1' || textContent.includes('confirmar mi turno') || textContent === 'confirmar') {
        interactiveId = 'menu_confirm_shift';
      } else if (textContent === '2' || textContent.includes('ver mis turnos') || textContent.includes('mis turnos')) {
        interactiveId = 'menu_view_shifts';
      } else if (textContent === '3' || textContent.includes('solicitar cambio') || textContent.includes('reagendar')) {
        interactiveId = 'menu_reschedule';
      } else if (textContent === '4' || textContent.includes('contactar coordinador') || textContent.includes('coordinador')) {
        interactiveId = 'menu_contact_coordinator';
      } else if (textContent === '5' || textContent.includes('codigo qr') || textContent.includes('código qr') || textContent === 'qr') {
        interactiveId = 'menu_generate_qr';
      } else if (textContent === '6' || textContent.includes('finalizar conversacion') || textContent.includes('finalizar conversación')) {
        interactiveId = 'menu_end_session';
      }
    }

    // 2. Process Actions
    if (interactiveId === 'menu_end_session') {
      try {
        await closeWhatsAppConversation(supabase, senderDigits, 'user_requested');
      } catch (sessionError) {
        console.error('[WHATSAPP WEBHOOK] Could not persist conversation closure.', {
          senderPhone: senderDigits,
          error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        });
      }
      await sendWhatsAppText({
        to: rawFrom,
        text: `Gracias${targetVolId ? `, ${firstName}` : ''}. Hemos finalizado esta atención. Cuando necesites algo más, vuelve a escribirnos. 👋`,
      });
      return NextResponse.json({ status: 'success', conversation: 'closed' }, { status: 200 });
    }

    if (interactiveId === 'menu_generate_qr') {
      if (!targetVolId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: 'No encontramos un perfil activo asociado a este número para generar el pase QR.',
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const passPayload = createEntryPassPayload(targetVolId);
      const qrImage = createQrPngBuffer(JSON.stringify(passPayload));
      const imageResult = await sendWhatsAppImageBuffer({
        to: rawFrom,
        image: qrImage,
        filename: `pase-qr-${targetVolId}.png`,
        caption: `🎟️ *Pase QR de ${selectedVolunteerName}*\n\nMuéstralo al coordinador al llegar. Este código es personal y vence en 30 minutos.`,
      });

      if (!imageResult.success) {
        console.error('[WHATSAPP WEBHOOK] Could not send volunteer QR image.', {
          volunteerId: targetVolId,
          error: imageResult.error,
        });
        await sendWhatsAppText({
          to: rawFrom,
          text: `${firstName}, no pudimos generar tu imagen QR en este momento. Inténtalo nuevamente o abre tu perfil en la plataforma.`,
        });
        return NextResponse.json({ status: 'success', qr: 'failed' }, { status: 200 });
      }

      await writeWhatsAppVolunteerAudit(supabase, {
        volunteerId: targetVolId,
        volunteerName: selectedVolunteerName,
        actionType: 'Pase QR',
        description: 'Generó su pase QR desde WhatsApp',
        wamid,
        context: {
          channel: 'WhatsApp',
          expiresInMinutes: 30,
          whatsappMessageId: imageResult.messageId || null,
        },
      });

      return NextResponse.json({ status: 'success', qr: 'sent' }, { status: 200 });
    }

    if (interactiveId === 'menu_confirm_shift' || interactiveId.startsWith('confirm_')) {
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
        .select('day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at, area_id, committee_areas(name)')
        .eq('volunteer_id', targetVolId);

      if (!userShifts || userShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, actualmente no tienes turnos de servicio asignados para confirmar.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const assignedShifts = sortShifts(userShifts as ShiftRecord[]);

      if (interactiveId.startsWith('confirm_date_')) {
        const selectedDayKey = interactiveId.replace('confirm_date_', '');
        const dayShifts = assignedShifts.filter(s => s.day_key === selectedDayKey);

        if (dayShifts.length === 1) {
          const shift = dayShifts[0];
          const shiftInfo = getOfficialShiftTime(selectedDayKey, shift.shift_key);
          await sendWhatsAppInteractiveButtons({
            to: rawFrom,
            bodyText: `${firstName}, vas a confirmar:\n\n*${selectedDayKey}* · ${shiftInfo.name}\n${shiftInfo.timeLabel}\n📍 ${shiftAreaName(shift) || 'Área pendiente'}`,
            buttons: [{
              id: encodeAction(targetVolId, 'confirm_shift', shift.day_key, shift.shift_key),
              title: 'Sí, confirmar',
            }],
          });
        } else {
          const rows = dayShifts.map(s => ({
            id: encodeAction(targetVolId, 'confirm_shift', s.day_key, s.shift_key),
            title: getOfficialShiftTime(s.day_key, s.shift_key).name,
            description: getOfficialShiftTime(s.day_key, s.shift_key).timeLabel,
          }));

          const btnRes = await sendWhatsAppInteractiveList({
            to: rawFrom,
            bodyText: `¿Qué turno deseas confirmar para la fecha *${selectedDayKey}*?`,
            buttonText: 'Elegir turno',
            sections: [{ title: 'Turnos asignados', rows }],
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

        const selectedShift = assignedShifts.find(shift => shift.day_key === dayKey && shift.shift_key === shiftKey);
        if (!selectedShift) {
          await sendWhatsAppText({
            to: rawFrom,
            text: `${firstName}, ese turno ya no aparece entre tus asignaciones. Abre nuevamente “Confirmar asistencia” para ver la información actualizada.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }

        const confirmedAt = new Date().toISOString();
        const { data: existingReminder, error: reminderLookupError } = await supabase
          .from('reminder_logs')
          .select('id')
          .eq('volunteer_id', targetVolId)
          .eq('day_key', dayKey)
          .eq('shift_key', shiftKey)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reminderLookupError) {
          throw new Error(`Unable to find the WhatsApp reminder: ${reminderLookupError.message}`);
        }

        let confirmationError: { message: string } | null = null;
        if (existingReminder) {
          const result = await supabase.from('reminder_logs').update({
            status: 'confirmado',
            confirmed_at: confirmedAt,
            raw_payload: message,
          }).eq('id', existingReminder.id);
          confirmationError = result.error;
        } else {
          const result = await supabase.from('reminder_logs').insert({
            volunteer_id: targetVolId,
            shift_key: shiftKey,
            day_key: dayKey,
            whatsapp_message_id: wamid || null,
            status: 'confirmado',
            confirmed_at: confirmedAt,
            raw_payload: message
          });
          confirmationError = result.error;
        }

        if (confirmationError) {
          throw new Error(`Unable to save the WhatsApp confirmation: ${confirmationError.message}`);
        }

        const shiftInfo = getOfficialShiftTime(dayKey, shiftKey);
        await writeWhatsAppVolunteerAudit(supabase, {
          volunteerId: targetVolId,
          volunteerName: selectedVolunteerName,
          actionType: 'Confirmación',
          description: `Confirmó por WhatsApp su asistencia para ${dayKey} · ${shiftKey}`,
          wamid,
          context: {
            summary: `${dayKey} · ${shiftKey} · ${shiftInfo.timeLabel}`,
            channel: 'WhatsApp',
            dayKey,
            shiftKey,
            shiftName: shiftInfo.name,
            shiftHours: shiftInfo.timeLabel,
          },
        });
        await sendWhatsAppText({
          to: rawFrom,
          text: `Gracias, ${firstName}. Confirmamos tu asistencia para *${dayKey}*, ${shiftInfo.name} (${shiftInfo.timeLabel}).\n📍 ${shiftAreaName(selectedShift) || 'Área pendiente'} ✅`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // Initial date selection
      const uniqueDays = Array.from(new Set(assignedShifts.map(s => s.day_key)));
      if (uniqueDays.length === 1) {
        const dayKey = uniqueDays[0];
        const dayShifts = assignedShifts.filter(s => s.day_key === dayKey);

        if (dayShifts.length === 1) {
          const shift = dayShifts[0];
          const shiftInfo = getOfficialShiftTime(dayKey, shift.shift_key);
          await sendWhatsAppInteractiveButtons({
            to: rawFrom,
            bodyText: `${firstName}, vas a confirmar:\n\n*${dayKey}* · ${shiftInfo.name}\n${shiftInfo.timeLabel}\n📍 ${shiftAreaName(shift) || 'Área pendiente'}`,
            buttons: [{
              id: encodeAction(targetVolId, 'confirm_shift', shift.day_key, shift.shift_key),
              title: 'Sí, confirmar',
            }],
          });
        } else {
          await sendWhatsAppInteractiveList({
            to: rawFrom,
            bodyText: `${firstName}, tienes varios turnos el *${dayKey}*. Selecciona cuál deseas confirmar:`,
            buttonText: 'Elegir turno',
            sections: [{ title: 'Turnos asignados', rows: dayShifts.map(s => ({
              id: encodeAction(targetVolId, 'confirm_shift', s.day_key, s.shift_key),
              title: getOfficialShiftTime(s.day_key, s.shift_key).name,
              description: getOfficialShiftTime(s.day_key, s.shift_key).timeLabel,
            })) }],
          });
        }
      } else {
        const requestedConfirmPage = interactiveId.startsWith('confirm_page_')
          ? Number(interactiveId.replace('confirm_page_', ''))
          : 0;
        const confirmTotalPages = Math.ceil(uniqueDays.length / PAGE_SIZE);
        const confirmPage = Number.isFinite(requestedConfirmPage)
          ? Math.min(Math.max(requestedConfirmPage, 0), confirmTotalPages - 1)
          : 0;
        const rows = uniqueDays
          .slice(confirmPage * PAGE_SIZE, (confirmPage + 1) * PAGE_SIZE)
          .map(d => ({
          id: encodeAction(targetVolId, 'confirm_day', d),
          title: `Fecha ${d}`,
          description: `Confirmar servicio del día ${d}`
          }));

        if (confirmPage < confirmTotalPages - 1) {
          rows.push({
            id: encodeAction(targetVolId, 'confirm_page', String(confirmPage + 1)),
            title: 'Más fechas',
            description: `Página ${confirmPage + 2} de ${confirmTotalPages}`,
          });
        } else if (confirmPage > 0) {
          rows.push({
            id: encodeAction(targetVolId, 'confirm_page', String(confirmPage - 1)),
            title: 'Fechas anteriores',
            description: `Página ${confirmPage} de ${confirmTotalPages}`,
          });
        }

        const listRes = await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: "Confirmación de Turno",
          bodyText: `Hola ${firstName}, por favor selecciona la fecha que deseas confirmar:`,
          buttonText: "Seleccionar Fecha",
          sections: [{ title: `Fechas ${confirmPage + 1}/${confirmTotalPages}`, rows }]
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
        .select('day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at, area_id, committee_areas(name)')
        .eq('volunteer_id', targetVolId)
        .order('day_key', { ascending: true });

      if (!userShifts || userShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, actualmente no tienes turnos de servicio asignados.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const assignedShifts = sortShifts(userShifts as ShiftRecord[]);
      let text = `📅 *Turnos de ${firstName}*\n*Comité:* ${committeeName}\n\n`;
      text += assignedShifts.map(formatShiftLine).join('\n');
      text += `\n\nPuedes confirmar uno de estos turnos o solicitar un cambio.`;

      const btnRes = await sendWhatsAppInteractiveButtons({
        to: rawFrom,
        bodyText: text,
        buttons: [
          { id: encodeAction(targetVolId, 'confirm'), title: 'Confirmar turno' },
          { id: encodeAction(targetVolId, 'reschedule'), title: 'Solicitar cambio' }
        ]
      });

      if (!btnRes.success) {
        text += `\n\nResponde *1* para confirmar un turno o *3* para solicitar cambio.`;
        await sendWhatsAppText({ to: rawFrom, text });
      }

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    if (interactiveId === 'menu_reschedule' || interactiveId.startsWith('reschedule_')) {
      // OPTION 3: Solicitar cambio de turno
      if (!targetVolId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola. No encontramos tu número registrado como voluntario activo.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('reschedule_reason_')) {
        const [currDay, currShift, reqDay, reqShift, reasonCode] = interactiveId
          .replace('reschedule_reason_', '')
          .split('__');
        const reason = CHANGE_REASONS[reasonCode];
        const validEventDays = new Set(getOperationalEventDays().map(formatDateShort));
        const validShiftKeys = new Set(['T1', 'T2', 'T3', 'T4']);

        if (!reason || !validEventDays.has(reqDay) || !validShiftKeys.has(reqShift)) {
          await sendWhatsAppText({ to: rawFrom, text: 'Selecciona uno de los motivos disponibles para continuar.' });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }

        const [{ data: sourceShift }, { data: requestedShift }, { data: existingRequest }] = await Promise.all([
          supabase.from('shifts').select('day_key, shift_key, checked_out, checked_out_at')
            .eq('volunteer_id', targetVolId).eq('day_key', currDay).eq('shift_key', currShift).maybeSingle(),
          supabase.from('shifts').select('day_key, shift_key')
            .eq('volunteer_id', targetVolId).eq('day_key', reqDay).eq('shift_key', reqShift).maybeSingle(),
          supabase.from('shift_change_requests').select('id')
            .eq('volunteer_id', targetVolId).eq('current_day_key', currDay)
            .eq('current_shift_key', currShift).eq('status', 'pending').maybeSingle(),
        ]);

        if (!sourceShift || sourceShift.checked_out || sourceShift.checked_out_at) {
          await sendWhatsAppText({
            to: rawFrom,
            text: `${firstName}, el turno original ya no está disponible para solicitar un cambio.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }
        if (requestedShift || (currDay === reqDay && currShift === reqShift)) {
          await sendWhatsAppText({
            to: rawFrom,
            text: `${firstName}, ya tienes asignado el turno solicitado. Selecciona otra fecha u horario.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }
        if (existingRequest) {
          await sendWhatsAppText({
            to: rawFrom,
            text: `${firstName}, ya existe una solicitud pendiente para cambiar *${currDay} · ${currShift}*.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }

        const { data: createdRequest, error: requestError } = await supabase
          .from('shift_change_requests')
          .insert({
            volunteer_id: targetVolId,
            current_day_key: currDay,
            current_shift_key: currShift,
            requested_day_key: reqDay,
            requested_shift_key: reqShift,
            reason,
            status: 'pending'
          })
          .select('id')
          .single();

        if (requestError) {
          console.error('[WHATSAPP WEBHOOK] Error creating shift change request:', requestError.message);
          throw new Error(`Unable to create the shift change request: ${requestError.message}`);
        }

        await writeWhatsAppVolunteerAudit(supabase, {
          volunteerId: targetVolId,
          volunteerName: selectedVolunteerName,
          actionType: 'Solicitud',
          description: `Envió por WhatsApp una solicitud de cambio de turno`,
          wamid,
          context: {
            summary: `${currDay} · ${currShift} → ${reqDay} · ${reqShift}`,
            channel: 'WhatsApp',
            requestId: createdRequest.id,
            currentDayKey: currDay,
            currentShiftKey: currShift,
            requestedDayKey: reqDay,
            requestedShiftKey: reqShift,
            reason,
          },
        });
        await sendWhatsAppText({
          to: rawFrom,
          text: `Listo, ${firstName}. Enviamos tu solicitud:\n\n*Actual:* ${currDay} · ${currShift}\n*Solicitado:* ${reqDay} · ${reqShift}\n*Motivo:* ${reason}\n\nLa solicitud quedó en revisión, igual que si la hubieras enviado desde tu portal. ✅`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('reschedule_to_')) {
        const [currDay, currShift, reqDay, reqShift] = interactiveId
          .replace('reschedule_to_', '')
          .split('__');
        const reasonRows = Object.entries(CHANGE_REASONS).map(([code, reason]) => ({
          id: encodeAction(targetVolId, 'reschedule_reason', currDay, currShift, reqDay, reqShift, code),
          title: reason,
          description: 'Usar este motivo en la solicitud',
        }));

        await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: 'Motivo del cambio',
          bodyText: `Para completar la solicitud de *${currDay} · ${currShift}* a *${reqDay} · ${reqShift}*, selecciona el motivo principal:`,
          buttonText: 'Elegir motivo',
          sections: [{ title: 'Motivos disponibles', rows: reasonRows }],
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('reschedule_from_') || interactiveId.startsWith('reschedule_day_')) {
        const isPagedAction = interactiveId.startsWith('reschedule_day_');
        const values = interactiveId
          .replace(isPagedAction ? 'reschedule_day_' : 'reschedule_from_', '')
          .split(isPagedAction ? '__' : '_');
        const [currDay, currShift] = values;
        const requestedPage = Number(isPagedAction ? values[2] : 0);
        const eventDayKeys = getOperationalEventDays().map(formatDateShort);
        const totalPages = Math.ceil(eventDayKeys.length / PAGE_SIZE);
        const page = Number.isFinite(requestedPage)
          ? Math.min(Math.max(requestedPage, 0), totalPages - 1)
          : 0;
        const pageDays = eventDayKeys.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const targetRows = pageDays.map(dayKey => ({
          id: encodeAction(targetVolId, 'reschedule_target_date', currDay, currShift, dayKey),
          title: dayKey,
          description: 'Ver horarios disponibles',
        }));

        if (page < totalPages - 1) {
          targetRows.push({
            id: encodeAction(targetVolId, 'reschedule_day', currDay, currShift, String(page + 1)),
            title: 'Más fechas',
            description: `Página ${page + 2} de ${totalPages}`,
          });
        } else if (page > 0) {
          targetRows.push({
            id: encodeAction(targetVolId, 'reschedule_day', currDay, currShift, String(page - 1)),
            title: 'Fechas anteriores',
            description: `Página ${page} de ${totalPages}`,
          });
        }

        await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: 'Nueva fecha',
          bodyText: `Seleccionaste cambiar *${currDay} · ${currShift}*. Ahora elige la nueva fecha deseada:`,
          buttonText: 'Elegir fecha',
          sections: [{ title: `Fechas ${page + 1}/${totalPages}`, rows: targetRows }]
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      if (interactiveId.startsWith('reschedule_target_date_')) {
        const [currDay, currShift, reqDay] = interactiveId
          .replace('reschedule_target_date_', '')
          .split('__');
        const { data: assignedTargets } = await supabase
          .from('shifts')
          .select('shift_key')
          .eq('volunteer_id', targetVolId)
          .eq('day_key', reqDay);
        const alreadyAssigned = new Set((assignedTargets || []).map(item => item.shift_key));
        const targetRows = getAvailableShiftKeys(reqDay)
          .filter(shiftKey => !(currDay === reqDay && currShift === shiftKey) && !alreadyAssigned.has(shiftKey))
          .map(shiftKey => {
            const official = getOfficialShiftTime(reqDay, shiftKey);
            return {
              id: encodeAction(targetVolId, 'reschedule_to', currDay, currShift, reqDay, shiftKey),
              title: official.name,
              description: official.timeLabel,
            };
          });

        if (targetRows.length === 0) {
          await sendWhatsAppText({
            to: rawFrom,
            text: `${firstName}, ya tienes asignados todos los horarios disponibles para *${reqDay}*. Selecciona otra fecha.`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }

        await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: 'Nuevo turno',
          bodyText: `Selecciona el horario que deseas solicitar para *${reqDay}*:`,
          buttonText: 'Elegir horario',
          sections: [{ title: 'Horarios', rows: targetRows }],
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const { data: userShifts } = await supabase
        .from('shifts')
        .select('day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at')
        .eq('volunteer_id', targetVolId);

      const changeableShifts = sortShifts((userShifts || []) as ShiftRecord[])
        .filter(shift => !shift.checked_out && !shift.checked_out_at);

      if (changeableShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, no tienes turnos pendientes que puedan cambiarse.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const requestedSourcePage = interactiveId.startsWith('reschedule_source_page_')
        ? Number(interactiveId.replace('reschedule_source_page_', ''))
        : 0;
      const sourceTotalPages = Math.ceil(changeableShifts.length / PAGE_SIZE);
      const sourcePage = Number.isFinite(requestedSourcePage)
        ? Math.min(Math.max(requestedSourcePage, 0), sourceTotalPages - 1)
        : 0;
      const rows = changeableShifts
        .slice(sourcePage * PAGE_SIZE, (sourcePage + 1) * PAGE_SIZE)
        .map(s => ({
          id: encodeAction(targetVolId, 'reschedule_from', s.day_key, s.shift_key),
          title: `${s.day_key} · ${s.shift_key}`,
          description: getOfficialShiftTime(s.day_key, s.shift_key).timeLabel,
        }));

      if (sourcePage < sourceTotalPages - 1) {
        rows.push({
          id: encodeAction(targetVolId, 'reschedule_source_page', String(sourcePage + 1)),
          title: 'Más turnos',
          description: `Página ${sourcePage + 2} de ${sourceTotalPages}`,
        });
      } else if (sourcePage > 0) {
        rows.push({
          id: encodeAction(targetVolId, 'reschedule_source_page', String(sourcePage - 1)),
          title: 'Turnos anteriores',
          description: `Página ${sourcePage} de ${sourceTotalPages}`,
        });
      }

      const listRes = await sendWhatsAppInteractiveList({
        to: rawFrom,
        headerText: "Cambio de Turno",
        bodyText: `${firstName}, ¿cuál de tus turnos deseas cambiar?`,
        buttonText: "Seleccionar Turno",
        sections: [{ title: "Tus Turnos Actuales", rows }]
      });

      if (!listRes.success) {
        const shiftsText = changeableShifts.map(formatShiftLine).join('\n');
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, ¿cuál de tus turnos actuales deseas cambiar?\n\n${shiftsText}`
        });
      }

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    if (interactiveId === 'menu_contact_coordinator') {
      // OPTION 4: Contactar a mi coordinador
      if (!selectedCommitteeId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `${firstName}, tu perfil no tiene un comité activo asignado. Solicita a un administrador que revise tu información.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const { data: coordinators, error: coordinatorError } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .eq('role', 'Editor')
        .eq('coordinator_type', 'committee')
        .eq('committee_id', selectedCommitteeId)
        .or('status.is.null,status.eq.active')
        .order('full_name');

      if (coordinatorError) {
        throw new Error(`Unable to load committee coordinators: ${coordinatorError.message}`);
      }

      if (!coordinators?.length) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `${firstName}, todavía no hay un coordinador activo con contacto asignado para *${committeeName}*. Un administrador debe configurarlo desde Usuarios.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      const contacts = coordinators
        .map(coordinator => `• *${coordinator.full_name || 'Coordinador'}:* ${coordinator.phone || 'Sin teléfono registrado'}`)
        .join('\n');

      await sendWhatsAppText({
        to: rawFrom,
        text: `Hola ${firstName}, tu comité asignado es *${committeeName}*.\n\n👤 *${coordinators.length === 1 ? 'Contacto de tu coordinador' : 'Contactos de tus coordinadores'}:*\n${contacts}\n\nPuedes escribirles directamente si necesitas ayuda.`
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
      if (targetVolId && contextMsgId) {
        const { data: reminder } = await supabase
          .from('reminder_logs')
          .select('id, day_key, shift_key')
          .eq('volunteer_id', targetVolId)
          .eq('whatsapp_message_id', contextMsgId)
          .maybeSingle();

        if (reminder) {
          const { data: assignedShift } = await supabase
            .from('shifts')
            .select('day_key, shift_key')
            .eq('volunteer_id', targetVolId)
            .eq('day_key', reminder.day_key)
            .eq('shift_key', reminder.shift_key)
            .maybeSingle();

          if (!assignedShift) {
            await sendWhatsAppText({
              to: rawFrom,
              text: `${firstName}, ese recordatorio corresponde a un turno que ya no está asignado. Abre “Consultar mis turnos” para ver tu horario actualizado.`
            });
            return NextResponse.json({ status: 'success' }, { status: 200 });
          }

          const { error: confirmationError } = await supabase
            .from('reminder_logs')
            .update({
              status: 'confirmado',
              confirmed_at: new Date().toISOString(),
              raw_payload: message
            })
            .eq('id', reminder.id);

          if (confirmationError) {
            throw new Error(`Unable to save the WhatsApp confirmation: ${confirmationError.message}`);
          }

          const shiftInfo = getOfficialShiftTime(reminder.day_key, reminder.shift_key);
          await writeWhatsAppVolunteerAudit(supabase, {
            volunteerId: targetVolId,
            volunteerName: selectedVolunteerName,
            actionType: 'Confirmación',
            description: `Confirmó por WhatsApp su asistencia para ${reminder.day_key} · ${reminder.shift_key}`,
            wamid,
            context: {
              summary: `${reminder.day_key} · ${reminder.shift_key} · ${shiftInfo.timeLabel}`,
              channel: 'WhatsApp',
              reminderId: reminder.id,
              dayKey: reminder.day_key,
              shiftKey: reminder.shift_key,
              shiftName: shiftInfo.name,
              shiftHours: shiftInfo.timeLabel,
            },
          });
          await sendWhatsAppText({
            to: rawFrom,
            text: `Gracias, ${firstName}. Confirmamos tu asistencia para *${reminder.day_key}*, ${shiftInfo.name} (${shiftInfo.timeLabel}). ✅`
          });
          return NextResponse.json({ status: 'success' }, { status: 200 });
        }
      }

      await sendWhatsAppText({
        to: rawFrom,
        text: `${firstName}, no pudimos identificar un turno específico en ese mensaje. Abre el menú y selecciona “Confirmar asistencia” para elegir el turno correcto.`
      });

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    // 4. Default Fallback: Send Main Interactive Options Menu (or text menu fallback)
    if (!targetVolId) {
      await sendWhatsAppText({
        to: rawFrom,
        text: 'No encontramos un perfil activo asociado a este número. Verifica el teléfono registrado o contacta a un coordinador.'
      });
      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    const mainListRes = await sendWhatsAppInteractiveList({
      to: rawFrom,
      headerText: 'Tus opciones',
      bodyText: `Hola ${firstName}, ¿cómo podemos ayudarte el día de hoy? Selecciona una opción para continuar.`,
      buttonText: 'Mostrar menú',
      sections: [
        {
          title: "Menú Principal",
          rows: [
            {
              id: encodeAction(targetVolId, 'confirm'),
              title: 'Confirmar asistencia',
              description: 'Confirma uno de tus turnos asignados'
            },
            {
              id: encodeAction(targetVolId, 'view'),
              title: 'Consultar mis turnos',
              description: 'Mira tus fechas y horarios actuales'
            },
            {
              id: encodeAction(targetVolId, 'reschedule'),
              title: 'Solicitar un cambio',
              description: 'Envía una solicitud con su motivo'
            },
            {
              id: encodeAction(targetVolId, 'contact'),
              title: 'Contactar coordinador',
              description: 'Consulta el contacto de tu comité'
            },
            {
              id: encodeAction(targetVolId, 'qr'),
              title: 'Generar mi código QR',
              description: 'Recibe la imagen de tu pase de entrada'
            },
            {
              id: encodeAction(targetVolId, 'end'),
              title: 'Finalizar conversación',
              description: 'Cierra esta atención por WhatsApp'
            }
          ]
        }
      ]
    });

    if (!mainListRes.success) {
      console.warn("Main Interactive List failed, sending plain text fallback:", mainListRes.error);
      await sendWhatsAppText({
        to: rawFrom,
        text: `Hola ${firstName}, ¿cómo podemos ayudarte el día de hoy?\n\n1. Confirmar asistencia\n2. Consultar mis turnos\n3. Solicitar un cambio\n4. Contactar a mi coordinador\n5. Generar mi código QR\n6. Finalizar conversación`
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
  const messageStatuses = extractMessageStatuses(payload);
  if (messages.length === 0 && messageStatuses.length === 0) {
    return NextResponse.json({ status: 'ignored', processed: 0 }, { status: 200 });
  }

  const inboxClient = getAdminClient();
  let statusUpdates = 0;
  let unmatchedStatuses = 0;
  let ignoredStatuses = 0;
  let statusFailures = 0;

  for (const messageStatus of messageStatuses) {
    try {
      const result = await persistWhatsAppMessageStatus(inboxClient, messageStatus);
      if (result.state === 'updated') statusUpdates += 1;
      else if (result.state === 'unmatched') unmatchedStatuses += 1;
      else ignoredStatuses += 1;
    } catch (statusError) {
      statusFailures += 1;
      console.error('[WHATSAPP WEBHOOK] Outbound status processing failed.', {
        wamid: messageStatus.id || null,
        status: messageStatus.status || null,
        error: statusError instanceof Error ? statusError.message : String(statusError),
      });
    }
  }

  let processed = 0;
  let failed = 0;
  let duplicates = 0;
  let deferred = 0;
  let exhausted = 0;

  for (const message of messages) {
    const wamid = typeof message.id === 'string' ? message.id : '';
    const senderPhone = typeof message.from === 'string' ? message.from : '';
    const messageType = typeof message.type === 'string' ? message.type : 'unknown';

    if (!wamid || !senderPhone) {
      console.error('[WHATSAPP WEBHOOK] Incoming message is missing its id or sender.', {
        hasWamid: Boolean(wamid),
        hasSender: Boolean(senderPhone),
        messageType,
      });
      failed += 1;
      continue;
    }

    try {
      const claim = await claimInboundEvent(inboxClient, {
        wamid,
        senderPhone,
        messageType,
        payload: message,
      });

      if (claim.state === 'processed') {
        duplicates += 1;
        continue;
      }

      if (claim.state === 'busy' || claim.state === 'retry_later') {
        deferred += 1;
        continue;
      }

      if (claim.state === 'exhausted') {
        exhausted += 1;
        console.error('[WHATSAPP WEBHOOK] Incoming message exhausted all processing attempts.', {
          wamid,
        });
        continue;
      }

      const result = await processIncomingMessage(message);
      if (result.ok) {
        await markInboundEventProcessed(inboxClient, claim.eventId, result.status);
        processed += 1;
        continue;
      }

      let failureMessage = `Message handler returned HTTP ${result.status}.`;
      try {
        const responseBody = (await result.clone().json()) as { error?: unknown };
        if (typeof responseBody.error === 'string' && responseBody.error.trim()) {
          failureMessage = responseBody.error.trim();
        }
      } catch {
        // A non-JSON handler response can still be retried safely.
      }

      await markInboundEventFailed(
        inboxClient,
        claim.eventId,
        claim.attemptCount,
        failureMessage,
        result.status,
      );
      failed += 1;
    } catch (messageError) {
      if (messageError instanceof WhatsAppInboxTableMissingError) {
        console.warn(
          '[WHATSAPP WEBHOOK] Durable inbox migration is pending; processing without database idempotency.',
        );
        const fallbackResult = await processIncomingMessage(message);
        if (fallbackResult.ok) processed += 1;
        else failed += 1;
        continue;
      }

      const errorMessage = messageError instanceof Error ? messageError.message : String(messageError);
      console.error('[WHATSAPP WEBHOOK] Durable inbox processing failed.', {
        wamid,
        error: errorMessage,
      });
      failed += 1;
    }
  }

  const retryNeeded = failed > 0 || deferred > 0 || statusFailures > 0;

  if (retryNeeded || exhausted > 0) {
    console.error('[WHATSAPP WEBHOOK] One or more incoming messages were not completed.', {
      received: messages.length,
      processed,
      failed,
      duplicates,
      deferred,
      exhausted,
      statusReceived: messageStatuses.length,
      statusUpdates,
      unmatchedStatuses,
      ignoredStatuses,
      statusFailures,
    });
  }

  const response = NextResponse.json({
    status: retryNeeded ? 'retry' : exhausted > 0 ? 'completed_with_exhausted' : 'success',
    received: messages.length,
    processed,
    failed,
    duplicates,
    deferred,
    exhausted,
    statusReceived: messageStatuses.length,
    statusUpdates,
    unmatchedStatuses,
    ignoredStatuses,
    statusFailures,
  }, { status: retryNeeded ? 503 : 200 });

  if (retryNeeded) {
    response.headers.set('Retry-After', '15');
  }

  return response;
}
