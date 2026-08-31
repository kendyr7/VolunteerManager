import 'server-only';
import { AuthorizationError } from '@/lib/authorization';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requirePushUser } from '@/lib/push/http';
import { loadPermissions } from '@/lib/push/service';
import { notificationScopes } from './policy';

export async function notificationAccess() {
  const user = await requirePushUser();
  const db = await getAdminSupabase();
  const { data: profile, error } = await db.from('profiles').select('id,role,coordinator_type,committee_id,status').eq('id', user.userId!).maybeSingle();
  if (error) throw error;
  if (!profile || !['Admin', 'Editor'].includes(profile.role) || ['archived', 'inactive'].includes(profile.status)) throw new AuthorizationError();
  // Unlike a cached client role, these permissions reflect the current database.
  const scopes = notificationScopes(profile, await loadPermissions(db));
  return { db, profileId: profile.id as string, scopes };
}

export function notificationError(error: unknown) {
  if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
  const code = (error as { code?: string } | null)?.code;
  const message = ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code || '')
    ? 'Falta activar el centro de notificaciones en Supabase. Aplica la migración 20261026000000_notification_inbox.sql.'
    : 'No se pudieron cargar las notificaciones. Intenta nuevamente.';
  return Response.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
