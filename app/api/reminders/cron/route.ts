import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { sendWhatsAppTemplate, sendWhatsAppText, formatE164Phone } from '@/lib/whatsapp-api';
import { fetchAllRows } from '@/lib/supabase-helpers';
import { getOfficialShiftTime } from '@/lib/dates';

/**
 * Automated Reminders Trigger Route
 * Can be called by Cron jobs or manually for test triggers (e.g. ?testPhone=50588889999)
 */
export async function GET(req: NextRequest) {
  return handleReminders(req);
}

export async function POST(req: NextRequest) {
  return handleReminders(req);
}

async function handleReminders(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const testPhone = searchParams.get('testPhone');
    const templateName = searchParams.get('templateName') || 'recordatorio_turno';
    const isTestMode = Boolean(testPhone);

    const supabase = createClient();

    let volunteers: any[] = [];
    try {
      volunteers = await fetchAllRows(supabase, 'volunteers', 'id, first_name, last_name, phone');
    } catch (e) {
      console.warn("Could not fetch volunteers from DB:", e);
    }

    if (!isTestMode && (!volunteers || volunteers.length === 0)) {
      return NextResponse.json({ error: "Error cargando voluntarios de la base de datos." }, { status: 500 });
    }

    // 2. Fetch shifts (bypassing 1000 row limit)
    let shifts: any[] = [];
    if (!isTestMode) {
      try {
        shifts = await fetchAllRows(supabase, 'shifts', '*');
      } catch (e) {
        console.warn("Could not fetch shifts from DB:", e);
      }
    }

    // Determine target date (72 hours in the future)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const targetDayKey = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const results: any[] = [];

    if (isTestMode && testPhone) {
      // TEST MODE: Send immediate test reminder to specified phone
      const formattedTestPhone = formatE164Phone(testPhone);
      const testVol = (volunteers || []).find(v => v.phone && formatE164Phone(v.phone).endsWith(formattedTestPhone.slice(-8))) || {
        id: null,
        first_name: 'Hermano(a)',
        phone: formattedTestPhone
      };

      const fullName = testVol ? `${testVol.first_name || ''} ${testVol.last_name || ''}`.trim() || 'Hermano(a)' : 'Hermano(a)';
      const commName = (testVol?.committees as any)?.name || (Array.isArray(testVol?.committees) ? (testVol?.committees as any)[0]?.name : 'Servicio');

      const isHelloWorld = templateName === 'hello_world';
      const apiResult = await sendWhatsAppTemplate({
        to: formattedTestPhone,
        templateName: isHelloWorld ? 'hello_world' : 'recordatorio_turno_comite',
        languageCode: isHelloWorld ? 'en_US' : 'es',
        components: isHelloWorld ? undefined : [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: fullName },
              { type: 'text', text: commName },
              { type: 'text', text: 'Turno 1' },
              { type: 'text', text: '7:00 AM - 12:00 PM' },
              { type: 'text', text: targetDayKey }
            ]
          }
        ]
      });

      // Fallback to text message if template is not yet approved in Meta Portal
      let finalResult = apiResult;
      if (!apiResult.success) {
        console.warn("Template failed (may not be approved yet). Trying fallback text message...");
        finalResult = await sendWhatsAppText({
          to: formattedTestPhone,
          text: `Querido(a) hermano(a) ${fullName}, le recordamos su turno de servicio voluntario del comité de ${commName} para el Turno 1 (7:00 AM - 12:00 PM) el día ${targetDayKey}.\n\nAgradecemos profundamente su apoyo.`
        });
      }

      // Log reminder to Supabase
      if (testVol && testVol.id) {
        await supabase.from('reminder_logs').insert([{
          volunteer_id: testVol.id,
          shift_key: 'T1',
          day_key: targetDayKey,
          whatsapp_message_id: finalResult.messageId || null,
          status: finalResult.success ? 'contactado' : 'error',
          sent_at: new Date().toISOString()
        }]);
      }

      results.push({
        volunteer: fullName,
        phone: formattedTestPhone,
        mode: 'test',
        result: finalResult
      });
    } else {
      // PRODUCTION MODE: Process 48-hour shift reminders
      const targetShifts = (shifts || []).filter(s => s.day_key === targetDayKey && s.volunteer_id);

      for (const shift of targetShifts) {
        const vol = volunteers.find(v => v.id === shift.volunteer_id);
        if (!vol || !vol.phone) continue;

        const recipientPhone = formatE164Phone(vol.phone);
        const fullName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || 'Hermano(a)';
        const commName = (vol?.committees as any)?.name || (Array.isArray(vol?.committees) ? (vol?.committees as any)[0]?.name : 'Servicio');
        const shiftLabel = `Turno ${shift.shift_key.replace('T', '')}`;
        const shiftTime = getOfficialShiftTime(shift.day_key, shift.shift_key).timeLabel;

        const apiResult = await sendWhatsAppTemplate({
          to: recipientPhone,
          templateName: 'recordatorio_turno_comite',
          languageCode: 'es',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: fullName },
                { type: 'text', text: commName },
                { type: 'text', text: shiftLabel },
                { type: 'text', text: shiftTime },
                { type: 'text', text: shift.day_key }
              ]
            }
          ]
        });

        if (apiResult.success) {
          await supabase.from('reminder_logs').insert([{
            volunteer_id: vol.id,
            shift_key: shift.shift_key,
            day_key: shift.day_key,
            whatsapp_message_id: apiResult.messageId || null,
            status: 'contactado',
            sent_at: new Date().toISOString()
          }]);
        }

        results.push({
          volunteerId: vol.id,
          volunteerName: fullName,
          phone: recipientPhone,
          result: apiResult
        });
      }
    }

    return NextResponse.json({
      success: true,
      mode: isTestMode ? 'test' : 'production',
      processedCount: results.length,
      details: results
    }, { status: 200 });

  } catch (error: any) {
    console.error("Critical error in Reminders Cron Route:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
