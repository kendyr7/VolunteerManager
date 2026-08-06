'use server';

import { getAdminSupabase } from "@/lib/supabase/admin";

export type ActivityLog = {
  id: string;
  user_name: string;
  user_role: string;
  action_type: string;
  description: string;
  details: string | null;
  target_id: string | null;
  created_at: string;
};

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

export async function getActivityLogs(limit = 100): Promise<ActivityLog[]> {
  try {
    const supabase = await getAdminSupabase();

    // 1. Try sync
    await syncPastRequestsToActivityLogs();

    // 2. Query activity_logs table
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      return data as ActivityLog[];
    }

    // 3. FALLBACK IF TABLE DOES NOT EXIST YET: Build activity logs from shift_change_requests directly
    const { data: requests } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(first_name, last_name), reviewer:profiles!shift_change_requests_reviewed_by_fkey(full_name)')
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false });

    if (!requests) return [];

    return requests.map((req: any) => {
      const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
      const reviewerName = req.reviewer?.full_name || 'Administrador';
      const isApproved = req.status === 'approved';

      return {
        id: req.id,
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
      };
    });
  } catch (err) {
    console.error("Error in getActivityLogs:", err);
    return [];
  }
}

export async function fetchVolunteerAuditLogsAction(
  volunteerId: string,
  volunteerName: string,
  volunteerPhone?: string,
  volunteerCreatedAt?: string
): Promise<{ success: boolean; logs: ActivityLog[] }> {
  try {
    const logs = await getActivityLogs(1000);

    const cleanVolId = (volunteerId || '').trim();
    const cleanPhone = (volunteerPhone || '').replace(/\D/g, '');

    // Extract individual name tokens (length >= 3)
    const nameTokens = (volunteerName || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .filter(t => t.length >= 3);

    const createdAt = volunteerCreatedAt ? new Date(volunteerCreatedAt).getTime() : null;

    const matched = logs.filter(log => {
      // 1. Direct target_id match
      if (cleanVolId && log.target_id === cleanVolId) return true;

      const descNorm = (log.description || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const detNorm = (log.details || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      // 2. Phone match
      if (cleanPhone && cleanPhone.length >= 8 && (descNorm.includes(cleanPhone) || detNorm.includes(cleanPhone))) {
        return true;
      }

      // 3. Name token match (matches if any name token like "kendyr" or "quintanilla" is present)
      if (nameTokens.length > 0) {
        const matchesCount = nameTokens.filter(token => descNorm.includes(token) || detNorm.includes(token)).length;
        if (matchesCount >= 1) {
          return true;
        }
      }

      // 4. Creation log match
      if (descNorm.includes('creo al voluntario') || descNorm.includes('creo el usuario')) {
        if (createdAt) {
          const timeDiff = Math.abs(new Date(log.created_at).getTime() - createdAt);
          if (timeDiff < 24 * 3600 * 1000) return true;
        }
      }

      return false;
    });

    return { success: true, logs: matched };
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
