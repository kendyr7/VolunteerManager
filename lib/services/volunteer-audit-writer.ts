/**
 * VolunteerAuditWriter
 *
 * Responsible ONLY for writing audit entries into `activity_logs`.
 * It is intentionally isolated from mutation logic.
 *
 * CONSISTENCY POLICY (approved in implementation_plan.md):
 * If the primary volunteer mutation succeeds but the audit INSERT fails due to
 * a transient infrastructure error, the mutation is NOT reverted. The failure
 * is logged via console.error for later investigation. This helper NEVER
 * throws — it absorbs all errors silently from the caller's perspective.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { VolunteerFieldDiff } from './volunteer-diff-builder';

export type AuditActionType =
  | 'Creación'
  | 'Edición'
  | 'Archivado'
  | 'Restaurado'
  | 'Seguridad';

export interface AuditActor {
  name: string;
  role: string;
}

/** Payload for a profile-edit audit entry (uses `changes` array). */
export interface WriteEditAuditPayload {
  actionType: 'Edición' | 'Archivado' | 'Restaurado';
  volunteerId: string;
  description: string;
  actor: AuditActor;
  changes: VolunteerFieldDiff[];
  operationId?: string;
}

/** Payload for creation / status / pin events (uses `context` object). */
export interface WriteContextAuditPayload {
  actionType: Exclude<AuditActionType, 'Edición' | 'Archivado' | 'Restaurado'>;
  volunteerId: string | null;
  description: string;
  actor: AuditActor;
  context: Record<string, any>;
  operationId?: string;
}

export type WriteAuditPayload = WriteEditAuditPayload | WriteContextAuditPayload;

export class VolunteerAuditWriter {
  /**
   * Inserts one or multiple audit entries into `activity_logs`.
   * Never throws — errors are swallowed and logged via console.error.
   */
  static async write(payload: WriteAuditPayload | WriteAuditPayload[]): Promise<void> {
    try {
      const items = Array.isArray(payload) ? payload : [payload];
      if (items.length === 0) return;

      const supabase = await getAdminSupabase();

      const rows = items.map((item) => {
        const isDiffType = item.actionType === 'Edición' || item.actionType === 'Archivado' || item.actionType === 'Restaurado';
        const details: Record<string, any> = isDiffType
          ? { changes: (item as WriteEditAuditPayload).changes }
          : { context: (item as WriteContextAuditPayload).context };

        if (item.operationId) {
          details.operationId = item.operationId;
        }

        return {
          user_name:   item.actor.name,
          user_role:   item.actor.role,
          action_type: item.actionType,
          description: item.description,
          details:     JSON.stringify(details),
          target_id:   item.volunteerId ?? null,
        };
      });

      const { error } = await supabase.from('activity_logs').insert(rows);

      if (error) {
        console.error(
          '[VolunteerAuditWriter] Failed to insert audit log(s). Count:',
          items.length,
          'Error:',
          error
        );
      }
    } catch (err) {
      // Absorb: per policy, audit failure must NOT propagate to the caller.
      console.error(
        '[VolunteerAuditWriter] Unexpected exception writing audit log(s). Exception:',
        err
      );
    }
  }
}
