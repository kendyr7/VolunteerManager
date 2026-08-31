import 'server-only';

import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';

type RateLimitOptions = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  signal?: AbortSignal;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function hashIdentifier(scope: string, identifier: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está configurado para proteger los límites de autenticación.');
  }

  return createHmac('sha256', secret)
    .update(`${scope}:${identifier.trim().toLowerCase()}`)
    .digest('hex');
}

export function getClientIp(requestHeaders: Headers): string {
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim();

  return firstForwardedIp || requestHeaders.get('x-real-ip')?.trim() || 'unknown';
}

export async function getServerActionClientIp(): Promise<string> {
  return getClientIp(await headers());
}

export async function consumeAuthRateLimit({
  scope,
  identifier,
  limit,
  windowSeconds,
  signal,
}: RateLimitOptions): Promise<RateLimitResult> {
  const supabase = await getAdminSupabase();
  const bucketKey = hashIdentifier(scope, identifier);
  const request = supabase.rpc('consume_auth_rate_limit', {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;

  if (error) {
    console.error('[AUTH_RATE_LIMIT] Could not consume rate-limit bucket:', error.message);
    throw new Error('El control de seguridad de acceso no está disponible.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== 'boolean') {
    throw new Error('El control de seguridad devolvió una respuesta inválida.');
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
  };
}

export async function clearAuthRateLimit(scope: string, identifier: string): Promise<void> {
  const supabase = await getAdminSupabase();
  const { error } = await supabase
    .from('auth_rate_limits')
    .delete()
    .eq('bucket_key', hashIdentifier(scope, identifier));

  if (error) {
    console.error('[AUTH_RATE_LIMIT] Could not clear rate-limit bucket:', error.message);
  }
}

export function rateLimitMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}
