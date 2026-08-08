import { useVolunteerStore } from '@/lib/store/use-volunteer-store';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';
import { mergeRealtimeRecord } from '@/lib/utils/realtime-merge';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface PendingRealtimeEvent {
  eventType: RealtimeEventType;
  table?: 'volunteers' | 'shifts';
  payload: any;
  timestamp: number;
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

  public enqueue(eventType: RealtimeEventType, payload: any, table: 'volunteers' | 'shifts' = 'volunteers') {
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

    console.log('[REALTIME QUEUE] received & queued:', {
      eventType,
      table,
      id,
      neighborhood: data.neighborhood || data.ward,
      updated_at: data.updated_at,
    });

    this.queue.set(id, {
      eventType,
      table,
      payload: mergedData,
      timestamp: incomingTs,
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
    console.log('[REALTIME QUEUE] flush started, batch size:', eventsToProcess.length);
    this.queue.clear();

    const processed: PendingRealtimeEvent[] = [];

    eventsToProcess.forEach(evt => {
      let applied = false;
      if (evt.table === 'shifts') {
        if (evt.eventType === 'DELETE') {
          applied = useVolunteerStore.getState().deleteShift(evt.payload.id);
        } else {
          applied = useVolunteerStore.getState().upsertShift(evt.payload);
        }
      } else {
        if (evt.eventType === 'DELETE') {
          applied = useVolunteerStore.getState().deleteVolunteer(evt.payload.id);
        } else {
          applied = useVolunteerStore.getState().upsertVolunteer(evt.payload);
        }
      }

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
