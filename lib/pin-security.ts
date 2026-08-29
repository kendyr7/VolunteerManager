import 'server-only';

import { randomInt } from 'node:crypto';

function isWeakPin(pin: string): boolean {
  if (pin === '1234' || /^(\d)\1+$/.test(pin)) return true;

  let ascending = true;
  let descending = true;
  for (let index = 0; index < pin.length - 1; index += 1) {
    const difference = pin.charCodeAt(index + 1) - pin.charCodeAt(index);
    if (difference !== 1) ascending = false;
    if (difference !== -1) descending = false;
  }

  return ascending || descending;
}

/** Generates a temporary PIN without exposing it to client components. */
export function generateTemporaryPin(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pin = randomInt(0, 10_000).toString().padStart(4, '0');
    if (!isWeakPin(pin)) return pin;
  }

  throw new Error('No se pudo generar un PIN temporal seguro.');
}
