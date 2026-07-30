import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppText, sendWhatsAppInteractiveButton, formatE164Phone } from '@/lib/whatsapp-api';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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

/**
 * GET Handler: Meta Webhook Verification
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'volunteermanager_verify_token_2026';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log("WhatsApp Webhook Verified Successfully!");
    return new Response(challenge, { status: 200 });
  }

  console.warn("WhatsApp Webhook Verification Failed. Provided Token:", token);
  return new Response('Forbidden', { status: 403 });
}

/**
 * POST Handler: Process Incoming Messages & Button Responses from Meta
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify webhook payload structure
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change || !change.messages || change.messages.length === 0) {
      // Acknowledge non-message webhook events (e.g. status updates)
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const message = change.messages[0];
    const rawFrom = message.from; // Sender phone number e.g. "50588273034"
    const messageType = message.type;
    const wamid = message.id;
    const contextMsgId = message.context?.id; // Original template message ID if reply/button click

    console.log(`Received Meta WhatsApp Webhook message of type "${messageType}" from ${rawFrom} (Context ID: ${contextMsgId || 'none'}):`, JSON.stringify(message));

    const supabase = getAdminClient();
    const formattedSender = formatE164Phone(rawFrom);
    const senderDigits = rawFrom.replace(/\D/g, '');

    // 1. Primary Check: Lookup reminder_logs directly by contextMsgId if available
    let contextLogMatched = false;
    let targetVolId: string | null = null;
    let firstName = 'Voluntario(a)';

    if (contextMsgId) {
      const { data: matchedLog } = await supabase
        .from('reminder_logs')
        .select('*, volunteers(first_name, last_name)')
        .eq('whatsapp_message_id', contextMsgId)
        .maybeSingle();

      if (matchedLog) {
        contextLogMatched = true;
        targetVolId = matchedLog.volunteer_id;
        if (matchedLog.volunteers?.first_name) {
          firstName = matchedLog.volunteers.first_name;
        }

        // Update this exact log to 'confirmado'
        await supabase
          .from('reminder_logs')
          .update({
            status: 'confirmado',
            confirmed_at: new Date().toISOString(),
            raw_payload: message
          })
          .eq('id', matchedLog.id);

        console.log(`Successfully updated reminder_log ${matchedLog.id} to 'confirmado' via context.id ${contextMsgId}`);
      }
    }

    // 2. Secondary Check: Search for volunteer/user by phone number if targetVolId not found yet
    if (!targetVolId) {
      const { data: volunteers } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone');

      const matchedVol = (volunteers || []).find(v => {
        if (!v.phone) return false;
        const vDigits = v.phone.replace(/\D/g, '');
        if (!vDigits || !senderDigits) return false;
        return senderDigits.endsWith(vDigits.slice(-8)) || vDigits.endsWith(senderDigits.slice(-8));
      });

      if (matchedVol) {
        targetVolId = matchedVol.id;
        firstName = matchedVol.first_name || 'Voluntario(a)';
      } else {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone');

        const matchedProf = (profiles || []).find(p => {
          if (!p.phone) return false;
          const pDigits = p.phone.replace(/\D/g, '');
          if (!pDigits || !senderDigits) return false;
          return senderDigits.endsWith(pDigits.slice(-8)) || pDigits.endsWith(senderDigits.slice(-8));
        });

        if (matchedProf) {
          targetVolId = matchedProf.id;
          firstName = (matchedProf.full_name || 'Usuario').split(' ')[0];
        }
      }
    }

    // 3. Check if message is a confirmation button click or confirmation text
    let isConfirmation = false;
    let buttonText = '';

    if (messageType === 'button') {
      buttonText = (message.button?.text || message.button?.payload || '').toLowerCase();
      isConfirmation = true; // Any template quick reply button click counts as confirmation
    } else if (messageType === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        buttonText = (interactive.button_reply?.title || interactive.button_reply?.id || '').toLowerCase();
        isConfirmation = true;
      }
    } else if (messageType === 'text') {
      const textContent = (message.text?.body || '').trim().toLowerCase();
      if (
        textContent.includes('confirm') ||
        textContent.includes('confirmar') ||
        textContent === 'si' ||
        textContent === 'sí' ||
        textContent === 'ok' ||
        textContent === 'listo'
      ) {
        isConfirmation = true;
      }
    }

    // 4. Process Confirmation vs Re-prompt
    if (isConfirmation) {
      console.log(`Confirmation received from ${rawFrom} (${firstName})`);

      if (!contextLogMatched && targetVolId) {
        // Update all recent pending/contacted logs for this volunteer to 'confirmado'
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
          // Insert a new confirmed log if no existing log was found
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

      // Send thank-you confirmation text message via Meta WhatsApp API
      const replyRes = await sendWhatsAppText({
        to: rawFrom,
        text: `¡Muchas gracias por tu respuesta, ${firstName}! Tu asistencia ha sido CONFIRMADA exitosamente. ✨`
      });

      console.log(`Sent thank-you confirmation WhatsApp reply to ${rawFrom}:`, replyRes);
    } else {
      // Re-prompt with Quick Reply button if unknown text
      await sendWhatsAppInteractiveButton({
        to: rawFrom,
        bodyText: `Querido(a) ${firstName}, recibimos tu mensaje. Para confirmar tu turno de servicio voluntario, por favor presiona el botón a continuación:`,
        buttonText: "Confirmar Turno",
        buttonPayload: `confirm_shift_${targetVolId || 'user'}`
      });
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error("Critical error in WhatsApp Webhook Handler:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
