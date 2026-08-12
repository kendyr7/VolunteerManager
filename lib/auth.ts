import crypto from 'crypto';

export interface SessionData {
  userId: string;
  userType: 'profile' | 'volunteer';
  role: string;
  committee: string;
  userName?: string;
}

export const SESSION_DURATION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * SESSION_DURATION_DAYS;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("La variable de entorno JWT_SECRET no está configurada.");
  }
  return secret;
}

function base64urlEncode(str: string | Buffer): string {
  const buf = typeof str === 'string' ? Buffer.from(str, 'utf8') : str;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function signSession(data: SessionData, expiresInDays = SESSION_DURATION_DAYS): string {
  const secret = getSecret();
  
  const header = { alg: "HS256", typ: "JWT" };
  
  // Expiración: 30 días (ampliado para evitar cierres de sesión intempestivos)
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (expiresInDays * 24 * 60 * 60);

  // Payload estándar compatible con Supabase (RLS)
  const payload = {
    role: "authenticated",
    aud: "authenticated",
    sub: data.userId,     // auth.uid()
    iat,
    exp,
    // Claims personalizados
    userType: data.userType,
    app_role: data.role,  // para diferenciar del role de Supabase
    committee: data.committee
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${encodedHeader}.${encodedPayload}`);
  const signature = base64urlEncode(hmac.digest());
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionData | null {
  const secret = getSecret();
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [encodedHeader, encodedPayload, signature] = parts;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${encodedHeader}.${encodedPayload}`);
    const expectedSignature = base64urlEncode(hmac.digest());

    if (signature !== expectedSignature) return null;

    const payloadJson = Buffer.from(encodedPayload, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    
    // Validar expiración
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: payload.sub,
      userType: payload.userType,
      role: payload.app_role,
      committee: payload.committee
    };
  } catch {
    return null;
  }
}

export function getNormalizedRole(): string {
  if (typeof window === 'undefined') return 'Lector';
  const role = localStorage.getItem('mock_role') || 'Lector';
  const normalized = role.toLowerCase().trim();
  if (normalized === 'coordinador') return 'Editor';
  if (normalized === 'voluntario') return 'Lector';
  if (normalized === 'admin' || normalized === 'administrador') return 'Admin';
  return role;
}
