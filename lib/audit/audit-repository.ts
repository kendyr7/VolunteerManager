import { getAdminSupabase } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase-helpers';
import { AuditMapper, AuditEntryViewModel } from './audit-mapper';

export class AuditRepository {
  private static async getLookupMaps() {
    const supabase = await getAdminSupabase();

    const [vols, shifts, reqs, sessions] = await Promise.all([
      fetchAllRows(supabase, 'volunteers', 'id, first_name, last_name, phone'),
      fetchAllRows(supabase, 'shifts', 'id, volunteer_id, day_key, shift_key'),
      fetchAllRows(supabase, 'shift_change_requests', 'id, volunteer_id, status'),
      fetchAllRows(supabase, 'attendance_sessions', 'id, volunteer_id'),
    ]);

    const volunteersMap = new Map<string, any>();
    (vols || []).forEach((v) => volunteersMap.set(v.id, v));

    const shiftsMap = new Map<string, any>();
    (shifts || []).forEach((s) => shiftsMap.set(s.id, s));

    const requestsMap = new Map<string, any>();
    (reqs || []).forEach((r) => requestsMap.set(r.id, r));

    const sessionsMap = new Map<string, any>();
    (sessions || []).forEach((s) => sessionsMap.set(s.id, s));

    return { volunteersMap, shiftsMap, requestsMap, sessionsMap };
  }

  /**
   * Fetches all global audit logs normalized into unified AuditEntryViewModels.
   */
  static async getGlobalAuditLogs(limit = 500): Promise<AuditEntryViewModel[]> {
    try {
      const supabase = await getAdminSupabase();
      const { volunteersMap, shiftsMap, requestsMap, sessionsMap } = await this.getLookupMaps();

      const { data: rawLogs, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !rawLogs) {
        console.error('Error in AuditRepository.getGlobalAuditLogs:', error);
        return [];
      }

      return rawLogs.map((log) =>
        AuditMapper.toViewModel(log, shiftsMap, requestsMap, volunteersMap, sessionsMap)
      );
    } catch (err) {
      console.error('Exception in AuditRepository.getGlobalAuditLogs:', err);
      return [];
    }
  }

  /**
   * Fetches audit logs for a specific volunteer, resolved O(1) via AuditMapper.
   * Both VolunteerProfileView and Settings consume this exact same ViewModel format.
   */
  static async getVolunteerAuditLogs(volunteerId: string, limit = 500): Promise<AuditEntryViewModel[]> {
    try {
      if (!volunteerId) return [];
      const cleanVolId = volunteerId.trim();
      const supabase = await getAdminSupabase();
      const { volunteersMap, shiftsMap, requestsMap, sessionsMap } = await this.getLookupMaps();
      const relevantTargetIds = new Set<string>([cleanVolId]);

      shiftsMap.forEach((shift, shiftId) => {
        if (shift.volunteer_id === cleanVolId) relevantTargetIds.add(shiftId);
      });
      requestsMap.forEach((request, requestId) => {
        if (request.volunteer_id === cleanVolId) relevantTargetIds.add(requestId);
      });
      sessionsMap.forEach((session, sessionId) => {
        if (session.volunteer_id === cleanVolId) relevantTargetIds.add(sessionId);
      });

      const { data: rawLogs, error } = await supabase
        .from('activity_logs')
        .select('*')
        .in('target_id', Array.from(relevantTargetIds))
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !rawLogs) {
        console.error('Error in AuditRepository.getVolunteerAuditLogs:', error);
        return [];
      }

      return rawLogs
        .map(log => AuditMapper.toViewModel(log, shiftsMap, requestsMap, volunteersMap, sessionsMap))
        .filter(log => log.resolvedVolunteerId === cleanVolId);
    } catch (err) {
      console.error('Exception in AuditRepository.getVolunteerAuditLogs:', err);
      return [];
    }
  }
}
