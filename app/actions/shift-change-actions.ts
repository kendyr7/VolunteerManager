'use server'

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { sendWhatsAppText, sendShiftChangeResultTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';
import { verifySessionToken } from '@/lib/auth';
import { createActivityLog } from '@/app/actions/activity-actions';

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

export async function fetchAllShiftChangeRequestsAction() {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone), reviewer:profiles!shift_change_requests_reviewed_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await supabase
        .from('shift_change_requests')
        .select('*, volunteers(id, first_name, last_name, phone)')
        .order('created_at', { ascending: false });
      return { success: true, requests: fallback.data || [] };
    }

    return { success: true, requests: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchPendingShiftChangeRequestsAction() {
  return fetchAllShiftChangeRequestsAction();
}

export async function approveShiftChangeRequestAction(requestId: string) {
  try {
    const supabase = getAdminClient();

    // 0. Identify reviewer profile from session token
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);

    let reviewerId: string | null = null;
    let reviewerName = 'Administrador';
    let reviewerRole = 'Admin';

    if (session && session.userId) {
      reviewerId = session.userId;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.userId)
        .maybeSingle();

      if (profile && profile.full_name) {
        reviewerName = profile.full_name;
        reviewerRole = profile.role || 'Coordinador';
      }
    }

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

    // 4. Update request status with reviewer UUID
    await supabase
      .from('shift_change_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId
      })
      .eq('id', requestId);

    // 5. Create activity log entry for system history
    const volunteerFullName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim();
    await createActivityLog({
      userName: reviewerName,
      userRole: reviewerRole,
      actionType: 'Reasignación',
      description: `Aprobó solicitud de cambio de turno de ${volunteerFullName}`,
      details: `De ${request.current_shift_key} (${request.current_day_key}) a ${request.requested_shift_key} (${request.requested_day_key})`,
      targetId: requestId
    });

    // 6. Send notification to volunteer via WhatsApp
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

    // 0. Identify reviewer profile from session token
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);

    let reviewerId: string | null = null;
    let reviewerName = 'Administrador';
    let reviewerRole = 'Admin';

    if (session && session.userId) {
      reviewerId = session.userId;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.userId)
        .maybeSingle();

      if (profile && profile.full_name) {
        reviewerName = profile.full_name;
        reviewerRole = profile.role || 'Coordinador';
      }
    }

    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone)')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }

    const rejectionDetail = reason || 'limitación de disponibilidad de cupos en el turno solicitado';

    // Update request status with reviewer UUID
    await supabase
      .from('shift_change_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejectionDetail,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId
      })
      .eq('id', requestId);

    // Create activity log entry for system history
    const vol = request.volunteers;
    const volunteerFullName = `${vol?.first_name || ''} ${vol?.last_name || ''}`.trim() || 'Voluntario';
    await createActivityLog({
      userName: reviewerName,
      userRole: reviewerRole,
      actionType: 'Reasignación',
      description: `Rechazó solicitud de cambio de turno de ${volunteerFullName}`,
      details: `Motivo del rechazo: ${rejectionDetail}`,
      targetId: requestId
    });

    // Send notification to volunteer via WhatsApp
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

export async function createShiftChangeRequestAction(params: {
  volunteerId: string;
  currentDayKey: string;
  currentShiftKey: string;
  requestedDayKey: string;
  requestedShiftKey: string;
  reason?: string;
}) {
  try {
    const supabase = getAdminClient();

    // Check if there is already a pending request for this volunteer & shift
    const { data: existing } = await supabase
      .from('shift_change_requests')
      .select('*')
      .eq('volunteer_id', params.volunteerId)
      .eq('current_day_key', params.currentDayKey)
      .eq('current_shift_key', params.currentShiftKey)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `Ya tienes una solicitud pendiente para cambiar tu turno del ${params.currentDayKey} (${params.currentShiftKey}).`
      };
    }

    let { data, error } = await supabase
      .from('shift_change_requests')
      .insert({
        volunteer_id: params.volunteerId,
        current_day_key: params.currentDayKey,
        current_shift_key: params.currentShiftKey,
        requested_day_key: params.requestedDayKey,
        requested_shift_key: params.requestedShiftKey,
        reason: params.reason || '',
        status: 'pending'
      })
      .select()
      .single();

    if (error && (error.message?.includes('reason') || error.code === 'PGRST204')) {
      const fallback = await supabase
        .from('shift_change_requests')
        .insert({
          volunteer_id: params.volunteerId,
          current_day_key: params.currentDayKey,
          current_shift_key: params.currentShiftKey,
          requested_day_key: params.requestedDayKey,
          requested_shift_key: params.requestedShiftKey,
          status: 'pending'
        })
        .select()
        .single();

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("Error creating shift change request:", error);
      return { success: false, error: error.message };
    }

    return { success: true, request: data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchVolunteerShiftChangeRequestsAction(volunteerId: string) {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('shift_change_requests')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, requests: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
