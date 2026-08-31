import 'server-only';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const PUSH_DEVICE_COOKIE = 'vm_push_device';

// Called before issuing a new login session and on logout, including passkeys.
// Do not silently leave a previous account subscribed on a shared browser.
export async function revokePushDevice() {
  const jar = await cookies();
  const deviceId = jar.get(PUSH_DEVICE_COOKIE)?.value;
  if (!deviceId) return;
  const db = await getAdminSupabase();
  const { error } = await db.from('push_subscriptions').delete().eq('device_id', deviceId);
  if (error) throw new Error('No se pudieron desactivar las notificaciones de este dispositivo. Intenta nuevamente.');
  jar.delete(PUSH_DEVICE_COOKIE);
}
