// Pure helpers for the VIP "Pro Bill" (no database access, so they can be tested without MySQL).
// Used by models/Invoice.js and models/Settings.js.

export const INVOICE_COUNTER_PREFIX = 'invoice_';
const SEQUENCE_DIGITS = 5;

// QR tickets: "TKT-YYYYMMDD-HHMMSS-XXX" (see generateTicketNumber in salesController.js)
const TICKET_NUMBER_RE = /^TKT-\d{8}-\d{6}-[A-Z0-9]{1,8}$/;
// Invoices: "FAC-2026-00001" (5 digits minimum, more after 99 999 invoices in a year)
const INVOICE_NUMBER_RE = /^FAC-\d{4}-\d{5,}$/;

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Error with an HTTP status for the controllers (`errorCode` is a stable machine-readable reason)
export const httpError = (status, message, errorCode) => {
  const error = new Error(message);
  error.status = status;
  if (errorCode) error.errorCode = errorCode;
  return error;
};

// One counter row per year in app_counters: numbering restarts at 00001 every January
export const invoiceCounterName = (year) => `${INVOICE_COUNTER_PREFIX}${year}`;

export const formatInvoiceNumber = (year, sequence) =>
  `FAC-${year}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;

export const normalizeTicketNumber = (value) => {
  const ticket = String(value ?? '').trim().toUpperCase();
  if (!TICKET_NUMBER_RE.test(ticket)) {
    throw httpError(400, 'Invalid ticket number', 'INVALID_TICKET_NUMBER');
  }
  return ticket;
};

export const normalizeInvoiceNumber = (value) => {
  const number = String(value ?? '').trim().toUpperCase();
  if (!INVOICE_NUMBER_RE.test(number)) {
    throw httpError(400, 'Invalid invoice number', 'INVALID_INVOICE_NUMBER');
  }
  return number;
};

const singleLine = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
};

const optionalInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// One invoice line, from a checkout item ({ productName, totalPrice... }) or a `sales` row.
// Same shape as the checkout response items, so the invoice template reads one format.
export const normalizeLine = (row = {}) => {
  const price = round2(row.price);
  const quantity = Number.parseInt(row.quantity, 10) || 0;
  const total = row.totalPrice ?? row.total_price;
  return {
    sale_id: optionalInt(row.sale_id ?? (row.sale_number ? row.id : null)),
    sale_number: row.sale_number ?? null,
    product_id: optionalInt(row.product_id),
    productName: String(row.productName ?? row.product_name ?? '').trim(),
    category: String(row.category ?? '').trim(),
    price,
    quantity,
    totalPrice: total !== undefined && total !== null ? round2(total) : round2(price * quantity),
  };
};

export const summarizeLines = (lines = []) => ({
  items_count: lines.length,
  total_units: lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
  total_amount: round2(lines.reduce((sum, line) => sum + (Number(line.totalPrice) || 0), 0)),
});

// Client details copied onto the invoice when it is issued: a reprint shows the same
// name / phone / client number even if the profile is edited later.
export const customerSnapshot = (customer) => {
  const code = singleLine(customer?.code, 50) || null;
  const name = singleLine(customer?.name, 255) || (code ? `Client N° ${code}` : '');
  if (!name) {
    throw httpError(422, 'An invoice needs a client', 'INVOICE_REQUIRES_CUSTOMER');
  }
  return {
    customer_id: optionalInt(customer?.id),
    customer_name: name,
    customer_phone: singleLine(customer?.phone, 50) || null,
    customer_code: code,
  };
};

// Database row -> API object
export const normalizeInvoiceRow = (row) =>
  row
    ? {
        id: Number(row.id),
        invoice_number: row.invoice_number,
        ticket_number: row.ticket_number,
        customer_id: row.customer_id === null || row.customer_id === undefined ? null : Number(row.customer_id),
        customer_name: row.customer_name || '',
        customer_phone: row.customer_phone || null,
        customer_code: row.customer_code || null,
        items_count: Number(row.items_count || 0),
        total_units: Number(row.total_units || 0),
        total_amount: round2(row.total_amount),
        payment_method: row.payment_method || null,
        issued_at: row.issued_at instanceof Date ? row.issued_at.toISOString() : row.issued_at || null,
      }
    : null;

// ==================== Invoice settings (shop details) ====================

// Empty store name / subtitle -> the UI shows app.title / app.subtitle in the current language.
// Empty address / phone -> that footer line is hidden. Empty logo -> no logo.
export const INVOICE_SETTINGS_FIELDS = {
  store_name: { max: 120, fallback: '', multiline: false },
  store_subtitle: { max: 160, fallback: '', multiline: false },
  logo_url: { max: 500, fallback: '/sohofibrico_logo.svg', multiline: false },
  store_address: { max: 300, fallback: '', multiline: true },
  store_phone: { max: 60, fallback: '', multiline: false },
  thank_you_note: { max: 500, fallback: 'Merci pour votre confiance.', multiline: true },
};

export const INVOICE_SETTINGS_KEYS = Object.keys(INVOICE_SETTINGS_FIELDS);

export const defaultInvoiceSettings = () =>
  Object.fromEntries(INVOICE_SETTINGS_KEYS.map((key) => [key, INVOICE_SETTINGS_FIELDS[key].fallback]));

// Same-site path ("/logo.png") or http(s) URL only: the value ends up in an <img src>.
const isAllowedLogoUrl = (url) => url === '' || /^\/(?!\/)/.test(url) || /^https?:\/\/[^\s]+$/i.test(url);

const cleanSettingValue = (key, value) => {
  const { max, multiline } = INVOICE_SETTINGS_FIELDS[key];
  if (!multiline) return singleLine(value, max);
  // Keep line breaks (address on 2 lines, longer thank-you note), trim each line
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
};

// Only known keys that are present in `values` are kept (partial update).
export const cleanInvoiceSettings = (values) => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw httpError(400, 'Invoice settings must be an object', 'INVALID_SETTINGS');
  }
  const cleaned = {};
  for (const key of INVOICE_SETTINGS_KEYS) {
    if (values[key] === undefined) continue;
    cleaned[key] = cleanSettingValue(key, values[key] ?? '');
  }
  if (cleaned.logo_url !== undefined && !isAllowedLogoUrl(cleaned.logo_url)) {
    throw httpError(400, 'Logo URL must start with "/" or http(s)://', 'INVALID_LOGO_URL');
  }
  return cleaned;
};
