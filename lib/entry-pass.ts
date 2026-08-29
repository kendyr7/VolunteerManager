import { createHmac, timingSafeEqual } from 'node:crypto';

export type EntryPassPayload = {
  v: 1;
  id: string;
  sig: string;
};

function getEntryPassSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('La variable de entorno JWT_SECRET no está configurada.');
  }
  return secret;
}

function signEntryPass(volunteerId: string): string {
  return createHmac('sha256', getEntryPassSecret())
    .update(`entry-pass:v1:${volunteerId}`)
    .digest('hex');
}

export function createEntryPassPayload(volunteerId: string): EntryPassPayload {
  return {
    v: 1,
    id: volunteerId,
    sig: signEntryPass(volunteerId),
  };
}

export function validateEntryPassQrValue(
  qrValue: string,
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

  const { v, id, sig } = candidate as Partial<EntryPassPayload>;
  if (v !== 1 || typeof id !== 'string' || !id || typeof sig !== 'string' || !sig) {
    return { success: false, error: 'Código QR inválido. Formato no compatible.' };
  }

  const expectedSignature = signEntryPass(id);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(sig, 'utf8');
  const hasValidSignature = expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!hasValidSignature) {
    return { success: false, error: 'Código QR no válido o alterado.' };
  }

  return { success: true, payload: { v, id, sig } };
}
