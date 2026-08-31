import type { NotificationItem } from './policy';

export const NOTIFICATION_TIME_ZONE = 'America/Guatemala';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NOTIFICATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function notificationDayKey(value: string) {
  const parts = dayFormatter.formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function notificationDayStart(value: string) {
  // The app's Guatemala calendar uses UTC-6, without daylight saving time.
  return new Date(`${notificationDayKey(value)}T00:00:00-06:00`).toISOString();
}

export function groupNotifications(items: NotificationItem[], asOf: string) {
  const today = notificationDayKey(asOf);
  const yesterday = notificationDayKey(new Date(Date.parse(asOf) - 86400000).toISOString());
  const groups = new Map<string, { key: string; label: string; items: NotificationItem[] }>();
  for (const item of items) {
    const key = notificationDayKey(item.created_at);
    if (!groups.has(key)) {
      const label = key === today ? 'Hoy' : key === yesterday ? 'Ayer' : new Intl.DateTimeFormat('es-NI', {
        timeZone: NOTIFICATION_TIME_ZONE, day: 'numeric', month: 'long',
        ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}),
      }).format(new Date(item.created_at));
      groups.set(key, { key, label, items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

export function notificationTimeLabel(value: string, asOf: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(value)) / 60000));
  if (notificationDayKey(value) === notificationDayKey(asOf)) {
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    return `hace ${Math.floor(minutes / 60)} h`;
  }
  return new Intl.DateTimeFormat('es-NI', { timeZone: NOTIFICATION_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function notificationTodaySummary(count: number) {
  return `Tienes ${count} ${count === 1 ? 'notificación' : 'notificaciones'} hoy`;
}
