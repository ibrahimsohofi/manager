// PIN of the finance app (FINANCE_PLAN.md §4 #13, §5.5). Stored as `scrypt$<salt hex>$<hash hex>`.
// The hash never leaves the server: GET /api/settings only says `pin_set: true/false`.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const PIN_RE = /^\d{4,8}$/;

export const isValidPin = (pin) => typeof pin === 'string' && PIN_RE.test(pin);

export const hashPin = (pin) => {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
};

export const verifyPin = (pin, stored) => {
  if (!isValidPin(pin) || typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
