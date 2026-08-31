import 'server-only';
import { createECDH } from 'node:crypto';

export function getPushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (process.env.PUSH_ENABLED !== 'true' || !publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  try {
    const privateBytes = Buffer.from(privateKey, 'base64url');
    if (privateBytes.length !== 32 || Buffer.from(publicKey, 'base64url').length !== 65) return null;
    const pair = createECDH('prime256v1');
    pair.setPrivateKey(privateBytes);
    if (pair.getPublicKey().toString('base64url') !== publicKey) return null;
    if (!new URL(subject).pathname) return null;
  } catch { return null; }
  return { publicKey, privateKey, subject };
}
