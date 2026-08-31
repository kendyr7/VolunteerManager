import { cookies } from 'next/headers';
import { PUSH_DEVICE_COOKIE } from '@/lib/push/device';
import { sendWebPush } from '@/lib/push/service';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requirePushUser, requireSameOrigin, requirePushRateLimit, pushHttpError } from '@/lib/push/http';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePushUser();
    await requirePushRateLimit(user.userId!, true);
    const deviceId = (await cookies()).get(PUSH_DEVICE_COOKIE)?.value;
    if (!deviceId) return Response.json({ error: 'Activa primero las notificaciones.' }, { status: 409 });
    const db = await getAdminSupabase();
    const { data: subscription, error } = await db.from('push_subscriptions').select('*')
      .eq('device_id', deviceId).eq('profile_id', user.userId!).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!subscription) return Response.json({ error: 'Activa nuevamente este dispositivo.' }, { status: 409 });
    try {
      await sendWebPush(subscription, { title: 'Notificaciones activadas',
        body: 'Este dispositivo está listo para recibir avisos operativos de Volunteer Manager.',
        url: '/settings?section=notifications', tag: 'push-test' });
    } catch (error) {
      if ([404, 410].includes(Number((error as { statusCode?: number }).statusCode))) {
        await db.from('push_subscriptions').delete().eq('id', subscription.id);
        return Response.json({ error: 'La suscripción venció. Desactiva y vuelve a activar las notificaciones.' }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ success: true });
  } catch (error) { return pushHttpError(error); }
}
