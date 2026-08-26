'use server';

import { getAdminSupabase } from "@/lib/supabase/admin";
import { AuditRepository } from "@/lib/audit/audit-repository";
import { AuditEntryViewModel } from "@/lib/audit/audit-mapper";
import {
  AuthorizationError,
  requireAuthenticated,
  requireCapability,
  requireVolunteerSelfOrCapability,
} from '@/lib/authorization';
import { roleDisplayName } from '@/lib/role-permissions';

export type ActivityLog = AuditEntryViewModel;

export type ActivityLogsResult =
  | { success: true; logs: ActivityLog[] }
  | { success: false; logs: []; error: string; code: 'FORBIDDEN' | 'LOAD_ERROR' };

let historicalImportSyncPromise: Promise<void> | null = null;

function normalizeAuditIdentity(value: string): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function syncHistoricalImportsToVolunteerLogs(): Promise<void> {
  if (historicalImportSyncPromise) return historicalImportSyncPromise;

  historicalImportSyncPromise = (async () => {
    try {
      const supabase = await getAdminSupabase();
      const [{ data: batches }, { data: volunteers }, { data: existingLogs }] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, user_name, user_role, details, created_at')
          .ilike('description', '%Importó masivamente%'),
        supabase
          .from('volunteers')
          .select('id, first_name, last_name, phone'),
        supabase
          .from('activity_logs')
          .select('target_id, details')
          .eq('action_type', 'Creación')
          .not('target_id', 'is', null),
      ]);

      if (!batches?.length || !volunteers?.length) return;

      const volunteersByPhone = new Map<string, typeof volunteers>();
      volunteers.forEach(volunteer => {
        const phoneKey = (volunteer.phone || '').replace(/\D/g, '').slice(-8);
        if (!phoneKey) return;
        const matches = volunteersByPhone.get(phoneKey) || [];
        matches.push(volunteer);
        volunteersByPhone.set(phoneKey, matches);
      });

      const existingKeys = new Set<string>();
      (existingLogs || []).forEach(log => {
        if (!log.details || typeof log.details !== 'string') return;
        try {
          const parsed = JSON.parse(log.details);
          const batchId = parsed?.context?.sourceBatchLogId;
          if (batchId && log.target_id) existingKeys.add(`${batchId}:${log.target_id}`);
        } catch {}
      });

      const rows: Array<Record<string, unknown>> = [];

      batches.forEach(batch => {
        if (!batch.details || typeof batch.details !== 'string') return;
        try {
          const payload = JSON.parse(batch.details);
          if (payload?.type !== 'import_batch' || !Array.isArray(payload.importedUsers)) return;

          payload.importedUsers.forEach((imported: Record<string, string>) => {
            const phoneKey = (imported.phone || '').replace(/\D/g, '').slice(-8);
            const candidates = volunteersByPhone.get(phoneKey) || [];
            if (!candidates.length) return;

            const importedName = normalizeAuditIdentity(`${imported.firstName || ''} ${imported.lastName || ''}`);
            const volunteer = candidates.length === 1
              ? candidates[0]
              : candidates.find(candidate =>
                  normalizeAuditIdentity(`${candidate.first_name || ''} ${candidate.last_name || ''}`) === importedName
                );
            if (!volunteer) return;

            const dedupeKey = `${batch.id}:${volunteer.id}`;
            if (existingKeys.has(dedupeKey)) return;
            existingKeys.add(dedupeKey);

            const fullName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();
            rows.push({
              user_name: batch.user_name || payload.importedBy || 'Administrador',
              user_role: batch.user_role || 'Admin',
              action_type: 'Creación',
              description: `Importó al voluntario "${fullName}"`,
              details: JSON.stringify({
                context: {
                  source: 'Importación Masiva',
                  sourceBatchLogId: batch.id,
                  phone: volunteer.phone,
                  committee: imported.committee || 'Sin comité',
                },
              }),
              target_id: volunteer.id,
              created_at: batch.created_at,
            });
          });
        } catch {}
      });

      for (let index = 0; index < rows.length; index += 500) {
        const { error } = await supabase.from('activity_logs').insert(rows.slice(index, index + 500));
        if (error) console.error('Error backfilling historical import audit logs:', error);
      }
    } catch (err) {
      console.error('Error syncing historical import audit logs:', err);
    }
  })();

  return historicalImportSyncPromise;
}

export async function syncPastRequestsToActivityLogs() {
  try {
    await requireCapability('manage_permissions');
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

export async function getActivityLogs(limit = 500): Promise<ActivityLogsResult> {
  try {
    await requireCapability('view_activity_logs');
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 500)
      : 500;
    await Promise.all([syncPastRequestsToActivityLogs(), syncHistoricalImportsToVolunteerLogs()]);
    return { success: true, logs: await AuditRepository.getGlobalAuditLogs(safeLimit) };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return {
        success: false,
        logs: [],
        error: 'No tienes permiso para consultar el historial de actividades.',
        code: 'FORBIDDEN',
      };
    }
    console.error("Error in getActivityLogs:", err);
    return {
      success: false,
      logs: [],
      error: 'No se pudo cargar el historial de actividades.',
      code: 'LOAD_ERROR',
    };
  }
}

export async function fetchVolunteerAuditLogsAction(
  volunteerId: string,
  volunteerName?: string,
  volunteerPhone?: string,
  volunteerCreatedAt?: string
): Promise<{ success: boolean; logs: ActivityLog[] }> {
  try {
    await requireVolunteerSelfOrCapability('view_volunteer_profile', volunteerId);
    await syncHistoricalImportsToVolunteerLogs();
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
    const actor = await requireAuthenticated();
    const supabase = await getAdminSupabase();

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_name: actor.name || userName,
        user_role: actor.authenticated ? roleDisplayName(actor) : userRole,
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
    const session = await requireCapability('import_volunteers');

    const supabase = await getAdminSupabase();

    const userName = session.name;

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
      user_role: roleDisplayName(session),
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
    await requireVolunteerSelfOrCapability('view_volunteer_profile', volunteerId);
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
