import { createClient } from '@/lib/supabase/client';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { useVolunteerStore } from '@/lib/store/use-volunteer-store';

export class SupabaseReconnectManager {
  private static instance: SupabaseReconnectManager | null = null;
  private isRecovering = false;

  private constructor() {
    this.setupTabVisibilityListener();
  }

  public static getInstance(): SupabaseReconnectManager {
    if (!SupabaseReconnectManager.instance) {
      SupabaseReconnectManager.instance = new SupabaseReconnectManager();
    }
    return SupabaseReconnectManager.instance;
  }

  private setupTabVisibilityListener() {
    if (typeof window === 'undefined') return;

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.recoverMissedEvents();
      }
    });

    window.addEventListener('online', () => {
      useRealtimeStore.getState().setStatus('reconnecting');
      void this.recoverMissedEvents();
    });

    window.addEventListener('offline', () => {
      useRealtimeStore.getState().setStatus('disconnected');
    });
  }

  public async recoverMissedEvents() {
    if (this.isRecovering) return;
    const lastSync = useRealtimeStore.getState().lastSyncTimestamp;

    // Si no ha habido sincronización inicial, ignorar
    if (!lastSync || lastSync === 0) return;

    this.isRecovering = true;
    useRealtimeStore.getState().setStatus('reconnecting');

    try {
      const supabase = createClient();
      const lastSyncIso = new Date(lastSync - 5000).toISOString(); // 5s de margen de seguridad

      // Replay Gap: Consultar registros creados/actualizados recientemente
      const { data, error } = await supabase
        .from('volunteers')
        .select('*, committees(name)')
        .gt('created_at', lastSyncIso);

      if (error) {
        console.error('Error recovering missed events (Replay Gap):', error);
      } else if (data && data.length > 0) {
        data.forEach(vol => {
          useVolunteerStore.getState().upsertVolunteer(vol as any);
        });
      }

      useRealtimeStore.getState().setStatus('connected');
      useRealtimeStore.getState().recordHeartbeat();
    } catch (err) {
      console.error('Failed to execute Replay Gap recovery:', err);
    } finally {
      this.isRecovering = false;
    }
  }
}
