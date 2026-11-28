// Partial update of a client (ROADMAP_V2.md B-04, fixes F-09): validates the fields that were sent
// and keeps only the ones that really change. Pure (no database): used by PATCH /api/customers/:id
// and by tests/customerPatch.test.js.
//
// Field error codes (the UI translates them): required, tooLong, invalid, invalidEmail, negative.
import { normalizeCustomerCode } from './customerLabel.js';

export const CUSTOMER_TYPES = ['retail', 'wholesale', 'commercial'];
const MAX_CREDIT_LIMIT = 9999999999.99; // DECIMAL(12,2)
// Simple shape check only: something@something.tld, no spaces
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// VIP flag from the request: true / 1 / "1" / "true" / "on" -> 1, other values -> 0,
// not sent -> undefined (keep the current value)
export const parseVipFlag = (value) => {
  if (value === undefined) return undefined;
  return value === true || value === 1 || ['1', 'true', 'on'].includes(String(value).toLowerCase()) ? 1 : 0;
};

// Optional text: trimmed, empty -> null. Returns { value } or { error }.
const optionalText = (maxLength) => (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { value: null };
  if (maxLength && text.length > maxLength) return { error: 'tooLong' };
  return { value: text };
};

// "1 500,50" / "1500.5" / 1500.5 -> 1500.5; empty -> 0
const parseMoney = (raw) => {
  if (typeof raw === 'number') return raw;
  const text = String(raw ?? '').replace(/\s/g, '').replace(',', '.');
  if (!text) return 0;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
};

// One entry per editable column: normalize(raw) -> { value } | { error }, and how to compare
const FIELDS = {
  name: (raw) => {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return { error: 'required' };
    if (text.length > 255) return { error: 'tooLong' };
    return { value: text };
  },
  email: (raw) => {
    const result = optionalText(255)(raw);
    if (result.value && !EMAIL_RE.test(result.value)) return { error: 'invalidEmail' };
    return result;
  },
  phone: optionalText(50),
  address: optionalText(2000),
  city: optionalText(100),
  postal_code: optionalText(20),
  notes: optionalText(5000),
  customer_type: (raw) => {
    const value = String(raw ?? '').trim().toLowerCase();
    return CUSTOMER_TYPES.includes(value) ? { value } : { error: 'invalid' };
  },
  credit_limit: (raw) => {
    const value = parseMoney(raw);
    if (!Number.isFinite(value)) return { error: 'invalid' };
    if (value < 0) return { error: 'negative' };
    if (value > MAX_CREDIT_LIMIT) return { error: 'tooLong' };
    return { value: Math.round(value * 100) / 100 };
  },
  code: (raw) => ({ value: normalizeCustomerCode(raw) ?? null }),
  is_vip: (raw) => ({ value: parseVipFlag(raw) }),
  is_active: (raw) => ({ value: parseVipFlag(raw) }),
};

export const PATCHABLE_FIELDS = Object.keys(FIELDS);

// Current DB value in the same shape as a normalized value, so "unchanged" is detected
const sameValue = (field, next, current) => {
  if (field === 'credit_limit') return Math.abs((Number(current) || 0) - next) < 0.005;
  if (field === 'is_vip' || field === 'is_active') return (Number(current) ? 1 : 0) === next;
  const before = current === undefined || current === null ? null : String(current).trim() || null;
  return before === next;
};

/**
 * @param {object} body request body (only the fields to change)
 * @param {object} [current] stored customer row: fields equal to it are dropped
 * @returns {{ changes: object, errors: Record<string, string>, unknown: string[], received: number }}
 *   `received` = number of known fields in the body (0 -> nothing to update)
 */
export const buildCustomerPatch = (body, current = {}) => {
  const changes = {};
  const errors = {};
  const unknown = [];
  let received = 0;
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  for (const [field, raw] of Object.entries(source)) {
    const normalize = FIELDS[field];
    if (!normalize) {
      unknown.push(field);
      continue;
    }
    if (raw === undefined) continue;
    received += 1;
    const result = normalize(raw);
    if (result.error) {
      errors[field] = result.error;
      continue;
    }
    if (!sameValue(field, result.value, current?.[field])) changes[field] = result.value;
  }
  return { changes, errors, unknown, received };
};
