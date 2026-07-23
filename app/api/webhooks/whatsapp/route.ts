import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { sendWhatsAppText, sendWhatsAppInteractiveButton, formatE164Phone } from '@/lib/whatsapp-api';

/**
 * GET Handler: Meta Webhook Verification
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'antigravity_verify_token_2026';

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
    const rawFrom = message.from; // Sender phone number e.g. "50588889999"
    const messageType = message.type;
    const wamid = message.id;

    const supabase = createClient();

    // 1. Find volunteer by phone number
    const formattedSender = formatE164Phone(rawFrom);
    const { data: volunteers } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone');

    // Matching last 8 digits of phone for reliability
    const targetVol = (volunteers || []).find(v => {
      if (!v.phone) return false;
      const cleanVPhone = formatE164Phone(v.phone);
      return cleanVPhone.endsWith(formattedSender.slice(-8));
    });

    if (!targetVol) {
      console.log(`Received message from unknown phone: ${rawFrom}`);
      return NextResponse.json({ status: 'unknown_sender' }, { status: 200 });
    }

    // 2. Check if message is a confirmation button click or confirmation text
    let isConfirmation = false;
    let buttonPayload = '';

    if (messageType === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        buttonPayload = interactive.button_reply?.id || '';
        const title = (interactive.button_reply?.title || '').toLowerCase();
        if (buttonPayload.includes('confirm') || title.includes('confirmar')) {
          isConfirmation = true;
        }
      }
    } else if (messageType === 'button') {
      const btnPayload = (message.button?.payload || '').toLowerCase();
      const btnText = (message.button?.text || '').toLowerCase();
      if (btnPayload.includes('confirm') || btnText.includes('confirmar')) {
        isConfirmation = true;
      }
    } else if (messageType === 'text') {
      const textContent = (message.text?.body || '').trim().toLowerCase();
      if (textContent.includes('confirm') || textContent.includes('confirmar') || textContent === 'si' || textContent === 'sí') {
        isConfirmation = true;
      }
    }

    // 3. Process Confirmation vs Re-prompt
    if (isConfirmation) {
      // Find latest pending reminder log for this volunteer
      const { data: pendingLogs } = await supabase
        .from('reminder_logs')
        .select('*')
        .eq('volunteer_id', targetVol.id)
        .eq('status', 'contactado')
        .order('sent_at', { ascending: false })
        .limit(1);

      const latestLog = pendingLogs?.[0];

      if (latestLog) {
        await supabase
          .from('reminder_logs')
          .update({
            status: 'confirmado',
            confirmed_at: new Date().toISOString(),
            raw_payload: message
          })
          .eq('id', latestLog.id);
      } else {
        // Create confirmed log entry if none pending
        await supabase.from('reminder_logs').insert([{
          volunteer_id: targetVol.id,
          shift_key: 'T1',
          day_key: new Date().toISOString().split('T')[0],
          whatsapp_message_id: wamid,
          status: 'confirmado',
          confirmed_at: new Date().toISOString(),
          raw_payload: message
        }]);
      }

      // Send confirmation thank-you message via WhatsApp
      await sendWhatsAppText({
        to: rawFrom,
        text: `¡Gracias por confirmar tu turno, ${targetVol.first_name}! Tu asistencia ha sido registrada con éxito.`
      });
    } else {
      // User wrote something else -> Re-prompt with Quick Reply button
      await sendWhatsAppInteractiveButton({
        to: rawFrom,
        bodyText: `Querido(a) ${targetVol.first_name}, recibimos tu mensaje. Para confirmar tu turno de servicio voluntario, por favor presiona el botón a continuación:`,
        buttonText: "Confirmar Turno",
        buttonPayload: `confirm_shift_${targetVol.id}`
      });
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error("Critical error in WhatsApp Webhook Handler:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
