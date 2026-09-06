export const LEGACY_SCAN_HISTORY_KEY = 'volunteer_manager_scan_history';
export const SCAN_HISTORY_KEY = 'volunteer_manager_scan_history_v2';

interface HistoryRecord {
  id: string;
  timestamp: Date;
  sessionId?: string;
  volunteerId?: string;
  type: string;
}

export function getGuatemalaDate(value: Date | string = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getGuatemalaDayKey(value: Date = new Date()): string {
  const date = getGuatemalaDate(value);
  if (!date) return '';
  const calendarDate = new Date(`${date}T12:00:00Z`);
  const weekdays = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return `${weekdays[calendarDate.getUTCDay()]} ${calendarDate.getUTCDate()}`;
}

function localRecordKey(record: HistoryRecord): string {
  return JSON.stringify([record.id, record.timestamp.toISOString(), record.type]);
}

/** Merge archives without dropping older days, repeated attempts, or unknown fields. */
export function mergeLocalScanHistory<T extends HistoryRecord>(...archives: T[][]): T[] {
  const records = new Map<string, T>();
  for (const archive of archives) {
    for (const record of archive) records.set(localRecordKey(record), record);
  }
  return [...records.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function readLocalScanHistory<T extends HistoryRecord>(storage: Pick<Storage, 'getItem'>): T[] {
  const archives = [LEGACY_SCAN_HISTORY_KEY, SCAN_HISTORY_KEY].map(key => {
    const saved = storage.getItem(key);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error('El historial local no tiene un formato válido. Se conservó sin cambios.');
    return parsed.flatMap(record => {
      if (!record || typeof record.id !== 'string') throw new Error('Registro local inválido; se conservó el archivo original.');
      const timestamp = new Date(record.timestamp);
      if (Number.isNaN(timestamp.getTime())) throw new Error('Fecha local inválida; se conservó el archivo original.');
      return [{ ...record, timestamp } as T];
    });
  });
  return mergeLocalScanHistory<T>(...archives);
}

/** Only writes v2. The original archive stays untouched as a recoverable backup. */
export function persistLocalScanHistory<T extends HistoryRecord>(storage: Pick<Storage, 'getItem' | 'setItem'>, records: T[]): void {
  const archive = mergeLocalScanHistory(readLocalScanHistory<T>(storage), records);
  storage.setItem(SCAN_HISTORY_KEY, JSON.stringify(archive));
}

/** Shared attendance takes precedence in the view; local-only attempts remain local. */
export function mergeTodayScanHistory<T extends HistoryRecord>(shared: T[], local: T[], today = getGuatemalaDate()): T[] {
  const todayShared = shared.filter(record => getGuatemalaDate(record.timestamp) === today);
  const sharedIds = new Set(todayShared.map(record => record.id));
  const sharedSessions = new Set(todayShared.flatMap(record => record.sessionId ? [record.sessionId] : []));
  const localOnly = local.filter(record => {
    if (getGuatemalaDate(record.timestamp) !== today) return false;
    if (record.type === 'error') return true;
    return !sharedIds.has(record.id) && !(record.sessionId && sharedSessions.has(record.sessionId));
  });
  return [...todayShared, ...localOnly].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
