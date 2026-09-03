import { getAdminSupabase } from '@/lib/supabase/admin';

export interface ShiftSyncBroadcastPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'shifts';
  record: {
    id: string;
    volunteer_id: string;
    day_key: string;
    shift_key: string;
    checked_in?: boolean;
    checked_in_at?: string | null;
    checked_in_by?: string | null;
    checked_out?: boolean;
    checked_out_at?: string | null;
    status?: string | null;
    updated_at?: string;
    created_at?: string;
    [key: string]: any;
  };
  traceId?: string;
}

/**
 * Publishes a Realtime Broadcast event on the 'global_coordinator_realtime' channel
 * in a non-blocking background task so Server Actions return DB success immediately.
 */
export function broadcastShiftSync(payload: ShiftSyncBroadcastPayload): void {
  (async () => {
    try {
      console.log('[SHIFT ACTION] broadcast started:', payload.eventType, payload.record?.id);
      const adminClient = await getAdminSupabase();
      const channel = adminClient.channel('global_coordinator_realtime');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[SHIFT ACTION] broadcast timeout reached');
          try { channel.unsubscribe(); } catch {}
          resolve();
        }, 800);

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            try {
              await channel.send({
                type: 'broadcast',
                event: 'shift_sync',
                payload,
              });
              console.log('[SHIFT ACTION] broadcast completed successfully');
            } catch (e) {
              console.error('[SHIFT ACTION] broadcast error sending message:', e);
            } finally {
              try { await channel.unsubscribe(); } catch {}
              resolve();
            }
          }
        });
      });
    } catch (err) {
      console.error('[SHIFT ACTION] broadcast failed to publish:', err);
    }
  })();
}

export interface SessionSyncBroadcastPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'attendance_sessions';
  record: {
    id: string;
    volunteer_id: string;
    day_key: string;
    started_at: string;
    ended_at?: string | null;
    status: string;
    auto_closed: boolean;
    created_at?: string;
    updated_at?: string;
    [key: string]: any;
  };
  traceId?: string;
}

/**
 * Publishes a Realtime Broadcast event for attendance_sessions on the 'global_coordinator_realtime' channel
 */
export function broadcastSessionSync(payload: SessionSyncBroadcastPayload): void {
  (async () => {
    try {
      console.log('[SESSION ACTION] broadcast started:', payload.eventType, payload.record?.id);
      const adminClient = await getAdminSupabase();
      const channel = adminClient.channel('global_coordinator_realtime');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[SESSION ACTION] broadcast timeout reached');
          try { channel.unsubscribe(); } catch {}
          resolve();
        }, 800);

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            try {
              await channel.send({
                type: 'broadcast',
                event: 'session_sync',
                payload,
              });
              console.log('[SESSION ACTION] broadcast completed successfully');
            } catch (e) {
              console.error('[SESSION ACTION] broadcast error sending message:', e);
            } finally {
              try { await channel.unsubscribe(); } catch {}
              resolve();
            }
          }
        });
      });
    } catch (err) {
      console.error('[SESSION ACTION] broadcast failed to publish:', err);
    }
  })();
}
