'use server'

import { createClient } from '@/lib/supabase/server';
import { sendWhatsAppText, sendShiftChangeResultTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';

function getAdminClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return createClient();
}

export async function fetchPendingShiftChangeRequestsAction() {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone, committee_id, committees(name))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching shift change requests:", error);
      return { success: false, error: error.message };
    }

    return { success: true, requests: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function approveShiftChangeRequestAction(requestId: string) {
  try {
    const supabase = getAdminClient();

    // 1. Fetch request details
    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone)')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }

    const vol = request.volunteers;
    if (!vol) {
      return { success: false, error: "Voluntario desvinculado" };
    }

    // 2. Remove old shift
    await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', request.volunteer_id)
      .eq('day_key', request.current_day_key)
      .eq('shift_key', request.current_shift_key);

    // 3. Insert new shift
    const { error: insErr } = await supabase
      .from('shifts')
      .upsert({
        volunteer_id: request.volunteer_id,
        day_key: request.requested_day_key,
        shift_key: request.requested_shift_key
      }, { onConflict: 'volunteer_id,day_key,shift_key' });

    if (insErr) {
      console.error("Error updating shift for approval:", insErr);
      return { success: false, error: insErr.message };
    }

    // 4. Update request status
    await supabase
      .from('shift_change_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId);

    // 5. Send notification to volunteer via WhatsApp template / text
    const volunteerName = (vol.first_name || 'Voluntario').split(' ')[0];
    const formattedPhone = formatE164(vol.phone);

    if (formattedPhone) {
      await sendShiftChangeResultTemplate({
        to: formattedPhone,
        volunteerName,
        resultStatus: 'APROBADA',
        shiftDetails: `${request.requested_shift_key} del ${request.requested_day_key}`,
        reasonOrDetail: 'tu nuevo turno ha sido actualizado en el sistema'
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in approveShiftChangeRequestAction:", err);
    return { success: false, error: err.message };
  }
}

export async function rejectShiftChangeRequestAction(requestId: string, reason?: string) {
  try {
    const supabase = getAdminClient();

    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone)')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }

    const rejectionDetail = reason || 'limitación de disponibilidad de cupos en el turno solicitado';

    // Update request status
    await supabase
      .from('shift_change_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejectionDetail,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId);

    // Send notification to volunteer via WhatsApp
    const vol = request.volunteers;
    if (vol && vol.phone) {
      const volunteerName = (vol.first_name || 'Voluntario').split(' ')[0];
      const formattedPhone = formatE164(vol.phone);

      if (formattedPhone) {
        await sendShiftChangeResultTemplate({
          to: formattedPhone,
          volunteerName,
          resultStatus: 'RECHAZADA',
          shiftDetails: `${request.requested_shift_key} del ${request.requested_day_key}`,
          reasonOrDetail: rejectionDetail
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in rejectShiftChangeRequestAction:", err);
    return { success: false, error: err.message };
  }
}
