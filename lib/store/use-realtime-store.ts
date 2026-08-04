import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimeMetrics {
  eventsProcessed: number;
  eventsMerged: number;
  queueSize: number;
  avgBatchTimeMs: number;
}

interface RealtimeStoreState {
  status: ConnectionStatus;
  initialSyncCompleted: boolean;
  lastSyncTimestamp: number;
  lastHeartbeatTimestamp: number;
  latencyMs: number;
  metrics: RealtimeMetrics;

  // Acciones
  setStatus: (status: ConnectionStatus) => void;
  setInitialSyncCompleted: (completed: boolean) => void;
  recordHeartbeat: (latencyMs?: number) => void;
  recordSync: () => void;
  updateMetrics: (update: Partial<RealtimeMetrics>) => void;
}

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  status: 'disconnected',
  initialSyncCompleted: false,
  lastSyncTimestamp: 0,
  lastHeartbeatTimestamp: 0,
  latencyMs: 0,
  metrics: {
    eventsProcessed: 0,
    eventsMerged: 0,
    queueSize: 0,
    avgBatchTimeMs: 0,
  },

  setStatus: (status: ConnectionStatus) => set({ status }),

  setInitialSyncCompleted: (completed: boolean) =>
    set({ initialSyncCompleted: completed, lastSyncTimestamp: Date.now() }),

  recordHeartbeat: (latencyMs = 0) =>
    set({
      lastHeartbeatTimestamp: Date.now(),
      latencyMs,
      status: 'connected',
    }),

  recordSync: () => set({ lastSyncTimestamp: Date.now() }),

  updateMetrics: (update: Partial<RealtimeMetrics>) =>
    set((state) => ({
      metrics: { ...state.metrics, ...update },
    })),
}));
