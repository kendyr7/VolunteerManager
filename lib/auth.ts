import crypto from 'crypto';

export interface SessionData {
  userId: string;
  userType: 'profile' | 'volunteer';
  role: string;
  committee: string;
}

const SECRET = process.env.JWT_SECRET;

export function signSession(data: SessionData): string {
  if (!SECRET) {
    throw new Error("La variable de entorno JWT_SECRET no está configurada.");
  }
  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const signature = hmac.digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): SessionData | null {
  if (!SECRET) {
    throw new Error("La variable de entorno JWT_SECRET no está configurada.");
  }
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(payloadB64);
    const expectedSignature = hmac.digest('base64url');

    if (signature !== expectedSignature) return null;

    const dataJson = Buffer.from(payloadB64, 'base64').toString('utf-8');
    return JSON.parse(dataJson) as SessionData;
  } catch (e) {
    return null;
  }
}
