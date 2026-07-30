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
