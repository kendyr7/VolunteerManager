import { useVolunteerStore } from '@/lib/store/use-volunteer-store';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface PendingRealtimeEvent {
  eventType: RealtimeEventType;
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

  public enqueue(eventType: RealtimeEventType, payload: any) {
    const id = payload.id || (payload.new && payload.new.id) || (payload.old && payload.old.id);
    if (!id) return;

    this.totalEnqueued++;
    const data = payload.new || payload.old || payload;
    const incomingTs = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();

    // Event Coalescing: Si ya existe un evento para este ID en la cola actual,
    // se retiene únicamente el más reciente basado en timestamp.
    const existing = this.queue.get(id);
    if (existing) {
      this.totalMerged++;
      if (existing.timestamp >= incomingTs) {
        this.updateTelemetry();
        return;
      }
    }

    this.queue.set(id, {
      eventType,
      payload: data,
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
    this.queue.clear();

    const processed: PendingRealtimeEvent[] = [];

    eventsToProcess.forEach(evt => {
      if (evt.eventType === 'DELETE') {
        const applied = useVolunteerStore.getState().deleteVolunteer(evt.payload.id);
        if (applied) processed.push(evt);
      } else {
        const applied = useVolunteerStore.getState().upsertVolunteer(evt.payload);
        if (applied) processed.push(evt);
      }
    });

    this.totalProcessed += processed.length;
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
