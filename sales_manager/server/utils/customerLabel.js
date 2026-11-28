// Turns the text typed in the "Client" field of the till into what we store.
//
//   "1234", "N° 1234", "n°1234", "#1234", "No 1234", "Num 1234", "رقم 1234", "C-102",
//   "Client N° 009", "06 12 34 56 78"
//       -> a client number (customers.code) + auto name "Client N° 1234"
//   "Ahmed", "moul taxi", "Ahmed 2", "Ahmed2"
//       -> a plain name
//   "" (nothing typed)
//       -> null: the checkout then creates a new client with the next number ("Client N° 009")
//
// Keep in sync with src/lib/customerLabel.js (display rules used by the frontend).

// Optional "Client" word, then an optional number marker: "Client N° 009", "N° 9", "#9", "رقم 9"
const PREFIX =
  /^(?:(?:client|زبون|عميل)\s*[:#-]?\s*)?(?:#|n\s*[°º]|n[oº]\.?(?=[\s\d:#-])|num(?:[ée]ro)?\.?|رقم)?\s*[:#-]?\s*/iu;
// Prefixed: any single token that contains a digit ("N° A-12", "#B12C").
const PREFIXED_REFERENCE = /^[\p{L}\p{N}][\p{L}\p{N}\-/.]*$/u;
// Bare: digits, optionally led by up to 3 letters ("1234", "C-102", "CL102", "12/7").
const BARE_REFERENCE = /^\p{L}{0,3}[-/.]?\p{N}[\p{N}\-/.]*$/u;
const DIGITS_WITH_SPACES = /^[\p{N}][\p{N}\s.\-/]*$/u;
const MAX_CODE_LENGTH = 50;
const MAX_NAME_LENGTH = 255;

// Auto-generated client numbers are zero-padded: 1 -> "001", 9 -> "009", 1234 -> "1234"
export const AUTO_CODE_DIGITS = 3;
export const formatAutoCode = (value) => String(value).padStart(AUTO_CODE_DIGITS, '0');

export const autoCustomerName = (code) => `Client N° ${code}`;

// True for names the system generated from a number ("Client N° 009", older "Client 009")
export const isAutoCustomerName = (name, code) => {
  const cleanCode = String(code ?? '').trim().toLowerCase();
  if (!cleanCode) return false;
  const cleanName = String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return [`client ${cleanCode}`, `client n° ${cleanCode}`, `client nº ${cleanCode}`].includes(cleanName);
};

/**
 * @param {unknown} label text typed at the till
 * @returns {{ kind: 'code', code: string, name: string } | { kind: 'name', name: string, code: null } | null}
 */
export const parseCustomerLabel = (label) => {
  const text = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  let rest = text.replace(PREFIX, '').trim();
  const hasPrefix = rest !== text;
  // "06 12 34 56 78" / "N° 12 34" -> "0612345678" / "1234"
  if (DIGITS_WITH_SPACES.test(rest)) rest = rest.replace(/\s+/g, '');

  const isReference =
    rest.length > 0 &&
    rest.length <= MAX_CODE_LENGTH &&
    /\p{N}/u.test(rest) &&
    (hasPrefix ? PREFIXED_REFERENCE : BARE_REFERENCE).test(rest);

  if (isReference) {
    return { kind: 'code', code: rest, name: autoCustomerName(rest) };
  }
  return { kind: 'name', name: text.slice(0, MAX_NAME_LENGTH), code: null };
};

// Short all-digit codes ("9", "009") are the same client number: compare them as numbers.
// Long digit strings (phone numbers) are only matched exactly.
export const numericCodeValue = (code) => {
  const text = String(code ?? '').trim();
  return /^\d{1,6}$/.test(text) ? Number(text) : null;
};

// Clean a client number coming from a form (undefined = not sent, null = cleared).
export const normalizeCustomerCode = (value) => {
  if (value === undefined) return undefined;
  const code = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CODE_LENGTH);
  return code || null;
};
