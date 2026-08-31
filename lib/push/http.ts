import 'server-only';
import { requireAuthenticated, AuthorizationError } from '@/lib/authorization';
import { consumeAuthRateLimit } from '@/lib/auth-rate-limit';

export async function requirePushUser() {
  const user = await requireAuthenticated();
  if (user.userType !== 'profile' || !['Admin', 'Editor'].includes(user.role)) {
    throw new AuthorizationError('Las notificaciones operativas son para coordinadores y administradores.');
  }
  return user;
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new AuthorizationError('Origen de solicitud no permitido.');
  }
}

export async function requirePushRateLimit(userId: string, test = false) {
  const result = await consumeAuthRateLimit({ scope: test ? 'push-test' : 'push-settings', identifier: userId,
    limit: test ? 3 : 30, windowSeconds: test ? 300 : 60 });
  if (!result.allowed) throw new Error('Has realizado demasiados intentos. Espera unos minutos.');
}

export function pushHttpError(error: unknown) {
  if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
  console.error('[PUSH API] Operación no disponible.');
  return Response.json({ error: 'No se pudo completar la operación. Verifica la configuración de notificaciones o intenta de nuevo.' }, { status: 503 });
}
