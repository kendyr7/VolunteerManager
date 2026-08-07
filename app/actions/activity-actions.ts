'use server';

import { getAdminSupabase } from "@/lib/supabase/admin";
import { AuditRepository } from "@/lib/audit/audit-repository";
import { AuditEntryViewModel } from "@/lib/audit/audit-mapper";

export type ActivityLog = AuditEntryViewModel;

export async function syncPastRequestsToActivityLogs() {
  try {
    const supabase = await getAdminSupabase();

    // Fetch all reviewed requests (approved or rejected)
    const { data: requests, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(first_name, last_name), reviewer:profiles!shift_change_requests_reviewed_by_fkey(full_name)')
      .in('status', ['approved', 'rejected']);

    if (reqErr || !requests || requests.length === 0) return;

    // Fetch existing target_ids from activity_logs
    const { data: existingLogs } = await supabase
      .from('activity_logs')
      .select('target_id')
      .not('target_id', 'is', null);

    const loggedTargetIds = new Set((existingLogs || []).map(l => l.target_id));

    const newLogsToInsert = [];
    for (const req of requests) {
      if (!loggedTargetIds.has(req.id)) {
        const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
        const reviewerName = req.reviewer?.full_name || 'Administrador';
        const isApproved = req.status === 'approved';

        newLogsToInsert.push({
          user_name: reviewerName,
          user_role: 'Admin',
          action_type: 'Reasignación',
          description: isApproved
            ? `Aprobó solicitud de cambio de turno de ${volName}`
            : `Rechazó solicitud de cambio de turno de ${volName}`,
          details: isApproved
            ? `De ${req.current_shift_key} (${req.current_day_key}) a ${req.requested_shift_key} (${req.requested_day_key})`
            : `Motivo: ${req.rejection_reason || 'limitación de disponibilidad de cupos'}`,
          target_id: req.id,
          created_at: req.reviewed_at || req.created_at || new Date().toISOString()
        });
      }
    }

    if (newLogsToInsert.length > 0) {
      await supabase.from('activity_logs').insert(newLogsToInsert);
    }
  } catch (err) {
    // Ignore error if table activity_logs does not exist yet
  }
}

export async function getActivityLogs(limit = 500): Promise<ActivityLog[]> {
  try {
    await syncPastRequestsToActivityLogs();
    return await AuditRepository.getGlobalAuditLogs(limit);
  } catch (err) {
    console.error("Error in getActivityLogs:", err);
    return [];
  }
}

export async function fetchVolunteerAuditLogsAction(
  volunteerId: string,
  volunteerName?: string,
  volunteerPhone?: string,
  volunteerCreatedAt?: string
): Promise<{ success: boolean; logs: ActivityLog[] }> {
  try {
    const logs = await AuditRepository.getVolunteerAuditLogs(volunteerId);
    return { success: true, logs };
  } catch (err) {
    console.error("Error in fetchVolunteerAuditLogsAction:", err);
    return { success: false, logs: [] };
  }
}

export async function createActivityLog({
  userName,
  userRole,
  actionType,
  description,
  details,
  targetId
}: {
  userName: string;
  userRole: string;
  actionType: string;
  description: string;
  details?: string;
  targetId?: string;
}): Promise<boolean> {
  try {
    const supabase = await getAdminSupabase();

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_name: userName,
        user_role: userRole,
        action_type: actionType,
        description,
        details: details || null,
        target_id: targetId || null
      });

    if (error) {
      console.error("Error creating activity log:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error in createActivityLog:", err);
    return false;
  }
}

export async function logImportActivityAction(
  importedUsers: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    committeeName?: string;
    pin?: string;
  }>,
  customUserName?: string
): Promise<boolean> {
  try {
    const { getCurrentUserSession } = await import('@/lib/auth-helpers');
    const session = await getCurrentUserSession();

    const supabase = await getAdminSupabase();

    const userName = customUserName || session.userName || 'Administrador';

    const payload = {
      type: 'import_batch',
      totalCount: importedUsers.length,
      importedBy: userName,
      importedUsers: importedUsers.map(u => ({
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        committee: u.committeeName || '',
        pin: u.pin || ''
      }))
    };

    const { error } = await supabase.from('activity_logs').insert({
      user_name: userName,
      user_role: session.userRole || 'Admin',
      action_type: 'Creación',
      description: `Importó masivamente ${importedUsers.length} voluntario(s)`,
      details: JSON.stringify(payload)
    });

    if (error) {
      console.error("Error logging import activity:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error in logImportActivityAction:", err);
    return false;
  }
}

export async function fetchVolunteerShiftRecordsAction(volunteerId: string): Promise<{ success: boolean; shiftRecords: any[] }> {
  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', volunteerId);

    if (error) {
      console.error("Error fetching volunteer shift records:", error);
      return { success: false, shiftRecords: [] };
    }

    return { success: true, shiftRecords: data || [] };
  } catch (err) {
    console.error("Error in fetchVolunteerShiftRecordsAction:", err);
    return { success: false, shiftRecords: [] };
  }
}
