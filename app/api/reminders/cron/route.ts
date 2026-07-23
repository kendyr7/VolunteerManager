import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { sendWhatsAppTemplate, sendWhatsAppText, formatE164Phone } from '@/lib/whatsapp-api';
import { fetchAllRows } from '@/lib/supabase-helpers';

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

    // 1. Fetch volunteers (bypassing 1000 row limit)
    const volunteers = await fetchAllRows(supabase, 'volunteers', 'id, first_name, last_name, phone, committees(name)');

    if (!volunteers || volunteers.length === 0) {
      return NextResponse.json({ error: "Error cargando voluntarios de la base de datos." }, { status: 500 });
    }

    // 2. Fetch shifts (bypassing 1000 row limit)
    const shifts = await fetchAllRows(supabase, 'shifts', '*');

    // Determine target date (48 hours in the future)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    const targetDayKey = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const results: any[] = [];

    if (isTestMode && testPhone) {
      // TEST MODE: Send immediate test reminder to specified phone
      const formattedTestPhone = formatE164Phone(testPhone);
      const testVol = volunteers.find(v => v.phone && formatE164Phone(v.phone).endsWith(formattedTestPhone.slice(-8))) || volunteers[0];

      const volName = testVol ? `${testVol.first_name}` : 'Hermano(a)';
      const commName = (testVol?.committees as any)?.name || (Array.isArray(testVol?.committees) ? (testVol?.committees as any)[0]?.name : 'Asignado');

      // Send WhatsApp message
      const apiResult = await sendWhatsAppTemplate({
        to: formattedTestPhone,
        templateName: templateName,
        languageCode: 'es',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: volName },
              { type: 'text', text: commName },
              { type: 'text', text: 'Turno 1 (T1)' },
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
          text: `Querido(a) ${volName}, le recordamos su turno de servicio (${commName}) para el ${targetDayKey}. Por favor responde a este mensaje para confirmar tu turno.`
        });
      }

      // Log reminder to Supabase
      if (testVol) {
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
        volunteer: volName,
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
        const volName = vol.first_name || 'Hermano(a)';
        const commName = (vol?.committees as any)?.name || (Array.isArray(vol?.committees) ? (vol?.committees as any)[0]?.name : 'Servicio');

        const apiResult = await sendWhatsAppTemplate({
          to: recipientPhone,
          templateName: templateName,
          languageCode: 'es',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: volName },
                { type: 'text', text: commName },
                { type: 'text', text: `Turno ${shift.shift_key}` },
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
          volunteerName: volName,
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
