import { NextRequest, NextResponse } from 'next/server';
import {
  sendWhatsAppText,
  sendWhatsAppInteractiveButton,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
  formatE164Phone
} from '@/lib/whatsapp-api';
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

// Map default committee coordinators
const COMMITTEE_COORDINATORS: Record<string, { name: string; phone: string }> = {
  'Historia': { name: 'Coordinador de Historia', phone: '+505 8888-0001' },
  'Seguridad': { name: 'Coordinador de Seguridad', phone: '+505 8888-0002' },
  'Guía': { name: 'Coordinador de Guías', phone: '+505 8888-0003' },
  'Guías': { name: 'Coordinador de Guías', phone: '+505 8888-0003' },
  'Traducción': { name: 'Coordinador de Traducción', phone: '+505 8888-0004' },
  'Transporte': { name: 'Coordinador de Transporte', phone: '+505 8888-0005' },
  'Primeros Auxilios': { name: 'Coordinador de Primeros Auxilios', phone: '+505 8888-0006' },
};

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
 * POST Handler: Process Incoming Messages & Button/List Responses from Meta
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify webhook payload structure
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change || !change.messages || change.messages.length === 0) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const message = change.messages[0];
    const rawFrom = message.from; // Sender phone number e.g. "50588273034"
    const messageType = message.type;
    const wamid = message.id;
    const contextMsgId = message.context?.id;

    console.log(`Received Meta WhatsApp Webhook message of type "${messageType}" from ${rawFrom}:`, JSON.stringify(message));

    const supabase = getAdminClient();
    const senderDigits = rawFrom.replace(/\D/g, '');

    // 1. Identify Volunteer / User in database
    let targetVol: any = null;
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
        targetVol = matchedLog.volunteers;
        targetVolId = targetVol.id;
        firstName = targetVol.first_name || 'Voluntario(a)';
        committeeName = targetVol.committees?.name || 'Servicio';
      }
    }

    if (!targetVolId) {
      const { data: volunteers } = await supabase
        .from('volunteers')
        .select('id, first_name, last_name, phone, committee_id, committees(name)');

      const matchedVol = (volunteers || []).find(v => {
        if (!v.phone) return false;
        const vDigits = v.phone.replace(/\D/g, '');
        if (!vDigits || !senderDigits) return false;
        return senderDigits.endsWith(vDigits.slice(-8)) || vDigits.endsWith(senderDigits.slice(-8));
      });

      if (matchedVol) {
        targetVol = matchedVol;
        targetVolId = matchedVol.id;
        firstName = matchedVol.first_name || 'Voluntario(a)';
        committeeName = (matchedVol as any).committees?.name || 'Servicio';
      }
    }

    // Extract payload IDs for interactive clicks
    let interactiveId = '';
    let isListReply = false;
    let isButtonReply = false;

    if (messageType === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'list_reply') {
        interactiveId = interactive.list_reply?.id || '';
        isListReply = true;
      } else if (interactive.type === 'button_reply') {
        interactiveId = interactive.button_reply?.id || '';
        isButtonReply = true;
      }
    } else if (messageType === 'button') {
      interactiveId = message.button?.payload || message.button?.text || '';
      isButtonReply = true;
    }

    // 2. Process Interactive Menu Selection & Actions
    if (interactiveId === 'menu_confirm_shift' || interactiveId.startsWith('confirm_date_')) {
      // OPTION 1: Confirmar mi turno
      if (!targetVolId) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola. No encontramos tu número de teléfono registrado como voluntario activo. Por favor contacta al administrador del sistema.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // Fetch assigned shifts for this volunteer
      const { data: userShifts } = await supabase
        .from('shifts')
        .select('*')
        .eq('volunteer_id', targetVolId);

      if (!userShifts || userShifts.length === 0) {
        await sendWhatsAppText({
          to: rawFrom,
          text: `Hola ${firstName}, actualmente no tienes turnos de servicio asignados para confirmar. Por favor contacta a tu coordinador de ${committeeName}.`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // If user selected a specific date (e.g. confirm_date_2026-08-30)
      if (interactiveId.startsWith('confirm_date_')) {
        const selectedDayKey = interactiveId.replace('confirm_date_', '');
        const dayShifts = userShifts.filter(s => s.day_key === selectedDayKey);

        if (dayShifts.length === 1) {
          // Confirm immediately
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
          // Ask which shift for that date
          const buttons = dayShifts.map(s => ({
            id: `confirm_shift_${s.day_key}_${s.shift_key}`,
            title: `Turno ${s.shift_key.replace('T', '')}`
          }));

          await sendWhatsAppInteractiveButtons({
            to: rawFrom,
            bodyText: `¿Qué turno deseas confirmar para la fecha *${selectedDayKey}*?`,
            buttons
          });
        }
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // If user clicked confirm_shift_YYYY-MM-DD_T1
      if (interactiveId.startsWith('confirm_shift_')) {
        const parts = interactiveId.split('_'); // confirm_shift_DAY_SHIFT
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

      // First step: present list/buttons of assigned dates
      const uniqueDays = Array.from(new Set(userShifts.map(s => s.day_key)));
      if (uniqueDays.length === 1) {
        // Single date assigned
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
        // Multiple dates assigned -> ask date first
        const rows = uniqueDays.map(d => ({
          id: `confirm_date_${d}`,
          title: `Fecha ${d}`,
          description: `Confirmar servicio del día ${d}`
        }));

        await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: "Confirmación de Turno",
          bodyText: `Hola ${firstName}, por favor selecciona la fecha que deseas confirmar:`,
          buttonText: "Seleccionar Fecha",
          sections: [{ title: "Tus Fechas Asignadas", rows }]
        });
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
      text += `\n¿Deseas confirmar la asistencia a alguno de estos turnos?`;

      await sendWhatsAppInteractiveButtons({
        to: rawFrom,
        bodyText: text,
        buttons: [
          { id: 'menu_confirm_shift', title: 'Confirmar un Turno' },
          { id: 'menu_reschedule', title: 'Solicitar Cambio' }
        ]
      });

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

      // Step 2: Handle target selection `reschedule_to_CURRENTDAY_CURRENTSHIFT_NEWDAY_NEWSHIFT`
      if (interactiveId.startsWith('reschedule_to_')) {
        const parts = interactiveId.replace('reschedule_to_', '').split('__');
        const currentPart = parts[0]; // DAY_SHIFT
        const requestedPart = parts[1]; // DAY_SHIFT

        const [currDay, currShift] = currentPart.split('_');
        const [reqDay, reqShift] = requestedPart.split('_');

        // Insert shift change request into DB
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
          text: `Tu solicitud de cambio del *${currShift} (${currDay})* al *${reqShift} (${reqDay})* ha sido recibida y se encuentra en revisión.\n\nTe notificaremos por WhatsApp una vez que el administrador/coordinador apruebe o deniegue tu solicitud. 🙏`
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // Step 1: User selected a shift to reschedule from `reschedule_from_DAY_SHIFT`
      if (interactiveId.startsWith('reschedule_from_')) {
        const [currDay, currShift] = interactiveId.replace('reschedule_from_', '').split('_');

        // Present target options (e.g. T1, T2, T3, T4 on next active days)
        const targetRows = [
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-30_T1`, title: '30 Aug - Turno 1', description: '7:00 AM - 12:00 PM' },
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-30_T2`, title: '30 Aug - Turno 2', description: '12:00 PM - 5:00 PM' },
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-31_T1`, title: '31 Aug - Turno 1', description: '7:00 AM - 12:00 PM' },
          { id: `reschedule_to_${currDay}_${currShift}__2026-08-31_T2`, title: '31 Aug - Turno 2', description: '12:00 PM - 5:00 PM' },
        ];

        await sendWhatsAppInteractiveList({
          to: rawFrom,
          headerText: "Solicitar Reagendamiento",
          bodyText: `Has seleccionado cambiar el *${currShift} (${currDay})*. ¿A qué nuevo turno te gustaría cambiarte?`,
          buttonText: "Ver Turnos Nuevos",
          sections: [{ title: "Turnos Disponibles", rows: targetRows }]
        });
        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

      // Step 0: User clicked menu_reschedule -> Ask which of their current shifts to reschedule
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

      await sendWhatsAppInteractiveList({
        to: rawFrom,
        headerText: "Cambio de Turno",
        bodyText: `Hola ${firstName}, ¿cuál de tus turnos actuales deseas cambiar?`,
        buttonText: "Seleccionar Turno",
        sections: [{ title: "Tus Turnos Actuales", rows }]
      });

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

    // 4. Default Fallback: Send Main Interactive Options Menu
    await sendWhatsAppInteractiveList({
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

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error("Critical error in WhatsApp Webhook Handler:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
