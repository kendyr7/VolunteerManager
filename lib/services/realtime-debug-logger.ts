/**
 * Realtime Debug Logger & Instrumentation Bus
 * Provides visual observability across all 7 pipeline stages:
 * UI Mutation -> DB Update -> Supabase Realtime -> WebSocket -> Queue -> Zustand -> React UI
 */

export interface DebugLogItem {
  id: string;
  traceId?: string;
  clientSessionId: string;
  timestamp: number;
  stage: 'MUTATION_START' | 'DB_SUCCESS' | 'DB_ERROR' | 'REALTIME_RECEIVED' | 'QUEUE_FLUSH' | 'ZUSTAND_UPDATE' | 'UI_UPDATE';
  table?: 'volunteers' | 'shifts';
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE' | 'MUTATION';
  volunteerId?: string;
  volunteerName?: string;
  details?: string;
  latencyMs?: {
    db?: number;
    realtime?: number;
    ui?: number;
    total?: number;
  };
  payload?: any;
  oldValue?: any;
  newValue?: any;
}

export const REALTIME_DEBUG_ENABLED =
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_REALTIME_DEBUG === 'true';

type LogListener = (logs: DebugLogItem[]) => void;
type HighlightListener = (entityId: string, table: 'volunteers' | 'shifts') => void;
type ConnectionStatusListener = (status: string) => void;

class RealtimeDebugLogger {
  private logs: DebugLogItem[] = [];
  private logListeners: Set<LogListener> = new Set();
  private highlightListeners: Set<HighlightListener> = new Set();
  private connectionStatusListeners: Set<ConnectionStatusListener> = new Set();
  private clientSessionId: string;
  private currentConnectionStatus: string = 'CONNECTING';

  constructor() {
    if (!REALTIME_DEBUG_ENABLED) {
      this.clientSessionId = 'DISABLED';
      return;
    }

    // Generate unique 4-character hex client ID per browser session tab
    if (typeof window !== 'undefined' && window.sessionStorage) {
      let storedId = window.sessionStorage.getItem('rt_debug_client_id');
      if (!storedId) {
        storedId = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
        window.sessionStorage.setItem('rt_debug_client_id', storedId);
      }
      this.clientSessionId = storedId;
    } else {
      this.clientSessionId = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    }
  }

  public getClientSessionId(): string {
    return this.clientSessionId;
  }

  public getConnectionStatus(): string {
    return this.currentConnectionStatus;
  }

  public debug(...values: unknown[]) {
    if (REALTIME_DEBUG_ENABLED) console.log(...values);
  }

  public setConnectionStatus(status: string) {
    if (!REALTIME_DEBUG_ENABLED) return;
    this.currentConnectionStatus = status;
    this.connectionStatusListeners.forEach(fn => fn(status));
  }

  public subscribeConnectionStatus(fn: ConnectionStatusListener): () => void {
    if (!REALTIME_DEBUG_ENABLED) return () => undefined;
    this.connectionStatusListeners.add(fn);
    fn(this.currentConnectionStatus);
    return () => this.connectionStatusListeners.delete(fn);
  }

  public getLogs(): DebugLogItem[] {
    return this.logs;
  }

  public subscribeLogs(fn: LogListener): () => void {
    if (!REALTIME_DEBUG_ENABLED) return () => undefined;
    this.logListeners.add(fn);
    fn(this.logs);
    return () => this.logListeners.delete(fn);
  }

  public subscribeHighlight(fn: HighlightListener): () => void {
    this.highlightListeners.add(fn);
    return () => this.highlightListeners.delete(fn);
  }

  public triggerHighlight(entityId: string, table: 'volunteers' | 'shifts') {
    this.highlightListeners.forEach(fn => fn(entityId, table));
  }

  public clearLogs() {
    this.logs = [];
    this.notifyLogListeners();
  }

  public addLog(item: Omit<DebugLogItem, 'id' | 'clientSessionId' | 'timestamp'>) {
    if (!REALTIME_DEBUG_ENABLED) return;
    const fullItem: DebugLogItem = {
      ...item,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      clientSessionId: this.clientSessionId,
      timestamp: Date.now(),
    };

    this.logs = [fullItem, ...this.logs].slice(0, 100); // Keep last 100 logs
    this.notifyLogListeners();
  }

  private notifyLogListeners() {
    this.logListeners.forEach(fn => fn(this.logs));
  }

  // --- Helper Generators ---
  public generateTraceId(): string {
    if (!REALTIME_DEBUG_ENABLED) return 'RT-DISABLED';
    return `RT-${Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`;
  }
}

export const realtimeDebugLogger = new RealtimeDebugLogger();
