'use server'

import { createClient } from '@/lib/supabase/server';
import { sendWhatsAppText, sendShiftChangeResultTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';
import { createActivityLog } from '@/app/actions/activity-actions';
import { broadcastShiftSync } from '@/lib/services/shift-broadcast.service';
import {
  requireCapability,
  requireVolunteerCapability,
  requireVolunteerSelfOrCapability,
} from '@/lib/authorization';
import { hasCapability } from '@/lib/role-permissions';
import { isShiftAvailableForDay } from '@/lib/dates';

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
    const authorization = await requireCapability('view_requests');
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone, committee_id), reviewer:profiles!shift_change_requests_reviewed_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await supabase
        .from('shift_change_requests')
        .select('*, volunteers(id, first_name, last_name, phone, committee_id)')
        .order('created_at', { ascending: false });
      const requests = fallback.data || [];
      return {
        success: true,
        requests: hasCapability(authorization, 'view_all_volunteers')
          ? requests
          : requests.filter((request: any) => request.volunteers?.committee_id === authorization.committeeId),
      };
    }

    const requests = data || [];
    return {
      success: true,
      requests: hasCapability(authorization, 'view_all_volunteers')
        ? requests
        : requests.filter((request: any) => request.volunteers?.committee_id === authorization.committeeId),
    };
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

    // 1. Fetch request details
    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone)')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }
    if (!isShiftAvailableForDay(request.requested_day_key, request.requested_shift_key)) {
      return { success: false, error: 'La jornada del 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).' };
    }
    const reviewer = await requireVolunteerCapability('reschedule_volunteer', request.volunteer_id);
    const reviewerId = reviewer.userId;
    const reviewerName = reviewer.name;
    const reviewerRole = reviewer.role;

    const vol = request.volunteers;
    if (!vol) {
      return { success: false, error: "Voluntario desvinculado" };
    }

    // 2. Fetch and remove old shift
    const { data: oldShift } = await supabase
      .from('shifts')
      .select('id, volunteer_id, day_key, shift_key')
      .eq('volunteer_id', request.volunteer_id)
      .eq('day_key', request.current_day_key)
      .eq('shift_key', request.current_shift_key)
      .maybeSingle();

    await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', request.volunteer_id)
      .eq('day_key', request.current_day_key)
      .eq('shift_key', request.current_shift_key);

    if (oldShift) {
      broadcastShiftSync({
        eventType: 'DELETE',
        table: 'shifts',
        record: oldShift,
      });
    }

    // 3. Insert new shift
    const { data: newShift, error: insErr } = await supabase
      .from('shifts')
      .upsert({
        volunteer_id: request.volunteer_id,
        day_key: request.requested_day_key,
        shift_key: request.requested_shift_key
      }, { onConflict: 'volunteer_id,day_key,shift_key' })
      .select('*')
      .single();

    if (insErr) {
      console.error("Error updating shift for approval:", insErr);
      return { success: false, error: insErr.message };
    }

    if (newShift) {
      broadcastShiftSync({
        eventType: 'INSERT',
        table: 'shifts',
        record: newShift,
      });
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

    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone)')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }
    const reviewer = await requireVolunteerCapability('reschedule_volunteer', request.volunteer_id);
    const reviewerId = reviewer.userId;
    const reviewerName = reviewer.name;
    const reviewerRole = reviewer.role;

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
    if (!isShiftAvailableForDay(params.requestedDayKey, params.requestedShiftKey)) {
      return { success: false, error: 'La jornada del 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).' };
    }
    const normalizedReason = params.reason?.trim() || '';
    if (!normalizedReason) {
      return {
        success: false,
        error: 'Debes describir el motivo de la solicitud de cambio de turno.'
      };
    }

    await requireVolunteerSelfOrCapability('reschedule_volunteer', params.volunteerId);
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

    const { data, error } = await supabase
      .from('shift_change_requests')
      .insert({
        volunteer_id: params.volunteerId,
        current_day_key: params.currentDayKey,
        current_shift_key: params.currentShiftKey,
        requested_day_key: params.requestedDayKey,
        requested_shift_key: params.requestedShiftKey,
        reason: normalizedReason,
        status: 'pending'
      })
      .select()
      .single();

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
    await requireVolunteerSelfOrCapability('view_volunteer_profile', volunteerId);
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

export interface VolunteerRescheduleContext {
  committeeName: string;
  requirementsByCommittee: Record<string, Record<string, number>>;
  assignmentCountsByShift: Record<string, Record<string, Record<string, number>>>;
  ownShifts: {
    day_key: string;
    shift_key: string;
    checked_in: boolean;
    checked_out: boolean;
  }[];
}

export async function fetchVolunteerRescheduleContextAction(
  volunteerId: string
): Promise<{ success: boolean } & VolunteerRescheduleContext> {
  try {
    await requireVolunteerSelfOrCapability('reschedule_volunteer', volunteerId);
    const supabase = getAdminClient();

    const [volRes, committeesRes, reqsRes, shiftsRes, volunteersRes] = await Promise.all([
      supabase
        .from('volunteers')
        .select('id, first_name, last_name, committee_id')
        .eq('id', volunteerId)
        .maybeSingle(),
      supabase
        .from('committees')
        .select('id, name')
        .or('status.is.null,status.neq.archived'),
      supabase
        .from('committee_shift_requirements')
        .select('committee_id, shift_key, required'),
      supabase
        .from('shifts')
        .select(
          'volunteer_id, day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at'
        ),
      supabase.from('volunteers').select('id, committee_id'),
    ]);

    const committeeMap: Record<string, string> = {};
    (committeesRes.data || []).forEach((c: any) => {
      committeeMap[c.id] = c.name;
    });

    const requirementsByCommittee: Record<string, Record<string, number>> = {};
    (reqsRes.data || []).forEach((r: any) => {
      const commName = committeeMap[r.committee_id];
      if (!commName) return;
      if (!requirementsByCommittee[commName]) requirementsByCommittee[commName] = {};
      requirementsByCommittee[commName][r.shift_key] = r.required;
    });

    const volCommitteeMap: Record<string, string> = {};
    (volunteersRes.data || []).forEach((v: any) => {
      volCommitteeMap[v.id] = committeeMap[v.committee_id] || 'Sin comité';
    });

    const assignmentCountsByShift: Record<
      string,
      Record<string, Record<string, number>>
    > = {};
    const ownShifts: VolunteerRescheduleContext['ownShifts'] = [];

    (shiftsRes.data || []).forEach((s: any) => {
      const commName = volCommitteeMap[s.volunteer_id] || 'Sin comité';
      if (!assignmentCountsByShift[s.day_key]) assignmentCountsByShift[s.day_key] = {};
      if (!assignmentCountsByShift[s.day_key][s.shift_key]) assignmentCountsByShift[s.day_key][s.shift_key] = {};
      assignmentCountsByShift[s.day_key][s.shift_key][commName] =
        (assignmentCountsByShift[s.day_key][s.shift_key][commName] || 0) + 1;

      if (s.volunteer_id === volunteerId) {
        ownShifts.push({
          day_key: s.day_key,
          shift_key: s.shift_key,
          checked_in: !!(s.checked_in || s.checked_in_at),
          checked_out: !!(s.checked_out || s.checked_out_at),
        });
      }
    });

    const committeeName = committeeMap[volRes.data?.committee_id] || 'Sin comité';

    return {
      success: true,
      committeeName,
      requirementsByCommittee,
      assignmentCountsByShift,
      ownShifts,
    };
  } catch (err: any) {
    console.error('Error in fetchVolunteerRescheduleContextAction:', err);
    return {
      success: false,
      committeeName: '',
      requirementsByCommittee: {},
      assignmentCountsByShift: {},
      ownShifts: [],
    };
  }
}
