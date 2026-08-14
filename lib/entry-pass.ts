import { createHmac, timingSafeEqual } from 'node:crypto';

export const ENTRY_PASS_VALIDITY_MS = 30 * 60 * 1000;
export const ENTRY_PASS_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type EntryPassPayload = {
  id: string;
  ts: number;
  sig: string;
};

function getEntryPassSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('La variable de entorno JWT_SECRET no está configurada.');
  }
  return secret;
}

function signEntryPass(volunteerId: string, timestamp: number): string {
  return createHmac('sha256', getEntryPassSecret())
    .update(`${volunteerId}:${timestamp}`)
    .digest('hex');
}

export function createEntryPassPayload(
  volunteerId: string,
  timestamp = Date.now(),
): EntryPassPayload {
  return {
    id: volunteerId,
    ts: timestamp,
    sig: signEntryPass(volunteerId, timestamp),
  };
}

export function validateEntryPassQrValue(
  qrValue: string,
  now = Date.now(),
): { success: true; payload: EntryPassPayload } | { success: false; error: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(qrValue);
  } catch {
    return { success: false, error: 'Error al leer el código QR. Formato inválido.' };
  }

  if (!candidate || typeof candidate !== 'object') {
    return { success: false, error: 'Código QR inválido. Formato no compatible.' };
  }

  const { id, ts, sig } = candidate as Partial<EntryPassPayload>;
  if (typeof id !== 'string' || !id || typeof ts !== 'number' || typeof sig !== 'string' || !sig) {
    return { success: false, error: 'Código QR inválido. Formato no compatible.' };
  }

  const expectedSignature = signEntryPass(id, ts);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(sig, 'utf8');
  const hasValidSignature = expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!hasValidSignature) {
    return { success: false, error: 'Código QR no válido o alterado.' };
  }

  const elapsed = now - ts;
  if (elapsed > ENTRY_PASS_VALIDITY_MS || elapsed < -ENTRY_PASS_CLOCK_SKEW_MS) {
    return {
      success: false,
      error: 'El código QR ha expirado. Por favor, solicita al voluntario generar uno nuevo.',
    };
  }

  return { success: true, payload: { id, ts, sig } };
}
