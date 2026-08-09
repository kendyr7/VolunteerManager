import { useVolunteerStore } from '@/lib/store/use-volunteer-store';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface PendingRealtimeEvent {
  eventType: RealtimeEventType;
  table?: 'volunteers' | 'shifts';
  payload: any;
  timestamp: number;
  traceId?: string;
}

export class RealtimeEventQueue {
  private queue = new Map<string, PendingRealtimeEvent>();
  private rafId: number | null = null;
  private totalEnqueued = 0;
  private totalMerged = 0;
  private totalProcessed = 0;
  private onBatchProcessed?: (processedEvents: PendingRealtimeEvent[]) => void;

  constructor(onBatchProcessed?: (processedEvents: PendingRealtimeEvent[]) => void) {
    this.onBatchProcessed = onBatchProcessed;
  }

  public enqueue(eventType: RealtimeEventType, payload: any, table: 'volunteers' | 'shifts' = 'volunteers', traceId?: string) {
    const id = payload.id || (payload.new && payload.new.id) || (payload.old && payload.old.id);
    if (!id) return;

    this.totalEnqueued++;
    const data = payload.new || payload.old || payload;
    const incomingTs = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();

    const existing = this.queue.get(id);
    let mergedData = data;

    if (existing) {
      this.totalMerged++;
      if (existing.timestamp > incomingTs) {
        this.updateTelemetry();
        return;
      }
      mergedData = mergeRealtimeRecord(existing.payload, data);
    }

    console.log('[RT-TRACE][QUEUE_ENQUEUE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      traceId: traceId || 'RT-UNKNOWN',
      queueSize: this.queue.size + 1,
      table,
      eventType,
      recordId: id,
      timestamp: new Date().toISOString()
    });

    this.queue.set(id, {
      eventType,
      table,
      payload: mergedData,
      timestamp: incomingTs,
      traceId,
    });

    this.updateTelemetry();
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.flush();
    });
  }

  private flush() {
    const startTime = performance.now();
    this.rafId = null;
    if (this.queue.size === 0) return;

    const eventsToProcess = Array.from(this.queue.values());
    const traceIds = eventsToProcess.map(e => e.traceId).filter(Boolean);

    console.log('[RT-TRACE][QUEUE_FLUSH_START]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      batchSize: eventsToProcess.length,
      traceIds,
      timestamp: new Date().toISOString()
    });

    realtimeDebugLogger.addLog({
      stage: 'QUEUE_FLUSH',
      details: `Flushed batch of ${eventsToProcess.length} event(s)`,
    });
    this.queue.clear();

    const processed: PendingRealtimeEvent[] = [];

    eventsToProcess.forEach(evt => {
      console.log('[RT-TRACE][QUEUE_PROCESS]', {
        clientId: realtimeDebugLogger.getClientSessionId(),
        traceId: evt.traceId || 'RT-UNKNOWN',
        table: evt.table,
        eventType: evt.eventType,
        recordId: evt.payload?.id,
        timestamp: new Date().toISOString()
      });

      console.log('[RT-TRACE][ZUSTAND_BEFORE]', {
        clientId: realtimeDebugLogger.getClientSessionId(),
        traceId: evt.traceId || 'RT-UNKNOWN',
        table: evt.table,
        eventType: evt.eventType,
        recordId: evt.payload?.id,
        timestamp: new Date().toISOString()
      });

      let applied = false;
      if (evt.table === 'shifts') {
        if (evt.eventType === 'DELETE') {
          applied = useVolunteerStore.getState().deleteShift(evt.payload.id, evt.traceId);
        } else {
          applied = useVolunteerStore.getState().upsertShift(evt.payload, evt.traceId);
        }
      } else {
        if (evt.eventType === 'DELETE') {
          applied = useVolunteerStore.getState().deleteVolunteer(evt.payload.id, evt.traceId);
        } else {
          applied = useVolunteerStore.getState().upsertVolunteer(evt.payload, evt.traceId);
        }
      }

      const volFound = evt.table === 'volunteers' ? !!useVolunteerStore.getState().volunteersMap.get(evt.payload?.id) : undefined;
      const shiftFound = evt.table === 'shifts' ? !!useVolunteerStore.getState().shiftsMap.get(evt.payload?.id) : undefined;

      console.log('[RT-TRACE][ZUSTAND_AFTER]', {
        clientId: realtimeDebugLogger.getClientSessionId(),
        traceId: evt.traceId || 'RT-UNKNOWN',
        table: evt.table,
        eventType: evt.eventType,
        recordId: evt.payload?.id,
        applied,
        volunteerFound: volFound,
        shiftFound,
        volunteersMapSize: useVolunteerStore.getState().volunteersMap.size,
        shiftsMapSize: useVolunteerStore.getState().shiftsMap.size,
        timestamp: new Date().toISOString()
      });

      // Always pass non-stale processed events to batch listener for UI reconciliation
      if (applied || evt.eventType === 'UPDATE' || evt.eventType === 'INSERT') {
        processed.push(evt);
      }
    });

    this.totalProcessed += eventsToProcess.length;
    const duration = performance.now() - startTime;

    useRealtimeStore.getState().updateMetrics({
      eventsProcessed: this.totalProcessed,
      eventsMerged: this.totalMerged,
      queueSize: 0,
      avgBatchTimeMs: Math.round(duration * 100) / 100,
    });

    if (this.onBatchProcessed && processed.length > 0) {
      this.onBatchProcessed(processed);
    }
  }

  private updateTelemetry() {
    useRealtimeStore.getState().updateMetrics({
      queueSize: this.queue.size,
      eventsMerged: this.totalMerged,
    });
  }

  public clear() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.queue.clear();
    this.updateTelemetry();
  }
}
