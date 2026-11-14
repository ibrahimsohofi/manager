// Personal ledger "Carnet": API client, helpers, WhatsApp reminder and printable statement.
// Sign convention (same as the server, shop owner's point of view):
//   direction "gave"     -> the person owes me more   (+)
//   direction "received" -> I owe the person more     (-)
//   direction "note"     -> reminder only, no effect on the balance
// Goods flagged `to_return` are object loans: tracked until returned, never in the balance.
// balance > 0 : the person owes me      balance < 0 : I owe the person
import { PRODUCTS_MANAGER_API, SALES_MANAGER_API } from "../config/integration.js";
import { escapeHtml } from "./print.js";
import {
  addDays,
  daysBetween,
  formatDate,
  formatMoney,
  localToday,
  parseAmount,
  parseLocalDate,
  round2,
} from "./supplierLedger.js";

export {
  addDays,
  daysBetween,
  formatDate,
  formatMoney,
  localToday,
  parseAmount,
  parseLocalDate,
  round2,
};

export const DIRECTIONS = ["gave", "received", "note"];
export const KINDS = ["money", "goods", "service"];
export const RELATIONS = ["family", "friend", "neighbor", "client", "supplier", "employee", "other"];
export const MAX_AMOUNT = 9999999999.99;

// ==================== Routes ====================

export const CARNET_PATH = "/carnet";
export const contactPath = (id) => `${CARNET_PATH}/${id}`;

// ==================== API ====================

const request = async (path, options = {}) => {
  const url = `${SALES_MANAGER_API.BASE_URL}/api/carnet${path}`;
  const headers = options.body ? { "Content-Type": "application/json" } : {};
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    const error = new Error("network");
    error.code = "network";
    throw error;
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = response.status === 404 ? "not_found" : "server";
    error.details = data?.errors || null;
    throw error;
  }
  return data;
};

const toQuery = (params) => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
};

const json = (method, payload) => ({ method, body: JSON.stringify(payload ?? {}) });

export const carnetApi = {
  list: ({ search, archived } = {}) => request(`/contacts${toQuery({ search, archived })}`),
  account: (id) => request(`/contacts/${id}`),
  createContact: (payload) => request("/contacts", json("POST", payload)),
  updateContact: (id, payload) => request(`/contacts/${id}`, json("PUT", payload)),
  removeContact: (id) => request(`/contacts/${id}`, { method: "DELETE" }),
  createEntry: (id, payload) => request(`/contacts/${id}/entries`, json("POST", payload)),
  updateEntry: (id, entryId, payload) =>
    request(`/contacts/${id}/entries/${entryId}`, json("PUT", payload)),
  removeEntry: (id, entryId) =>
    request(`/contacts/${id}/entries/${entryId}`, { method: "DELETE" }),
  setReturned: (id, entryId, returned, date) =>
    request(`/contacts/${id}/entries/${entryId}/returned`, json("PUT", { returned, date })),
  settle: (id, payload) => request(`/contacts/${id}/settle`, json("POST", payload)),
};

// ==================== Inventory products (products_manager) ====================
// Entry form, kind "goods": pick a product from the inventory by name or by ID.
// Only the product name (and its price as a value) is copied into the entry.

const PRODUCT_TIMEOUT_MS = 8000;
const ID_PREFIX = /^[#@]\s*/;

const offlineError = () => {
  const error = new Error("offline");
  error.code = "offline";
  return error;
};

/** Search text without the "#" / "@" ID prefix, or "" when too short (2+ chars, any digit). */
export const productQuery = (text) => {
  const value = String(text || "")
    .trim()
    .replace(ID_PREFIX, "");
  if (!value) return "";
  return value.length >= 2 || /^\d+$/.test(value) ? value : "";
};

/** Positive integer ID from "125", "#125" or "@125", otherwise null. */
export const parseProductId = (text) => {
  const value = String(text || "")
    .trim()
    .replace(ID_PREFIX, "");
  if (!/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const toProduct = (raw, lang) => {
  const id = Number(raw?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const name = (lang === "ar" ? raw.name_ar : raw.name_fr) || raw.name || `#${id}`;
  const category = (lang === "ar" ? raw.category_ar : raw.category_fr) || raw.category || "";
  const price = Number(raw.selling_price ?? raw.price);
  const stock = Number(raw.remaining_stock ?? raw.stock_quantity);
  return {
    id,
    name: String(name).trim(),
    category: String(category),
    price: Number.isFinite(price) && price >= 0 ? round2(price) : null,
    stock: Number.isFinite(stock) ? stock : null,
  };
};

const productRequest = async (endpoint, signal) => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PRODUCT_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);
  try {
    const response = await fetch(`${PRODUCTS_MANAGER_API.BASE_URL}${endpoint}`, {
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    // Cancelled by the caller (newer search): let it bubble as an AbortError
    if (err?.name === "AbortError" && !timedOut) throw err;
    throw offlineError();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
};

export const productsApi = {
  /** Products matching a name, SKU, barcode or ID (exact ID first). Throws `code: "offline"`. */
  search: async (text, { lang, signal, limit = 8 } = {}) => {
    const q = productQuery(text);
    if (!q) return [];
    const { ok, data } = await productRequest(
      `${PRODUCTS_MANAGER_API.INTEGRATION.SEARCH}?q=${encodeURIComponent(q)}&limit=${limit}`,
      signal,
    );
    if (!ok || !data?.success) throw offlineError();
    return (data.products || []).map((p) => toProduct(p, lang)).filter(Boolean);
  },
  /** Exact product by ID, or null when no product has this ID. Throws `code: "offline"`. */
  byId: async (id, { lang, signal } = {}) => {
    const { ok, status, data } = await productRequest(
      PRODUCTS_MANAGER_API.INTEGRATION.PRODUCT(id),
      signal,
    );
    if (status === 404) return null;
    if (!ok || !data?.success) throw offlineError();
    return toProduct(data.product, lang);
  },
};

// ==================== Balance helpers ====================

/** "owesMe" (balance > 0), "iOwe" (balance < 0) or "settled". */
export const balanceState = (balance) => {
  const b = round2(balance);
  if (b > 0) return "owesMe";
  if (b < 0) return "iOwe";
  return "settled";
};

/** Effect of a (form) entry on the balance. */
export const entryEffect = ({ direction, kind, amount, to_return }) => {
  if (direction === "note" || (kind === "goods" && to_return)) return 0;
  const value = round2(amount);
  if (!(value > 0)) return 0;
  return direction === "gave" ? value : -value;
};

// ==================== People ====================

export const initials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || "" : "";
  return `${first}${last}`.toUpperCase();
};

const AVATAR_TONES = [
  "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:ring-amber-800",
  "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:ring-emerald-800",
  "bg-teal-100 text-teal-800 ring-teal-200 dark:bg-teal-900/50 dark:text-teal-200 dark:ring-teal-800",
  "bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-900/50 dark:text-rose-200 dark:ring-rose-800",
  "bg-orange-100 text-orange-800 ring-orange-200 dark:bg-orange-900/50 dark:text-orange-200 dark:ring-orange-800",
  "bg-lime-100 text-lime-800 ring-lime-200 dark:bg-lime-900/50 dark:text-lime-200 dark:ring-lime-800",
  "bg-cyan-100 text-cyan-800 ring-cyan-200 dark:bg-cyan-900/50 dark:text-cyan-200 dark:ring-cyan-800",
  "bg-stone-200 text-stone-800 ring-stone-300 dark:bg-stone-700 dark:text-stone-100 dark:ring-stone-600",
];

/** Stable color per person (same name -> same color). */
export const avatarTone = (seed) => {
  const s = String(seed || "");
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
};

/** Digits for wa.me / tel: links. Moroccan local numbers (06..., 07..., 05...) get the 212 prefix. */
export const normalizePhone = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `212${digits.slice(1)}`;
  return digits;
};

export const telLink = (phone) => {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  return `tel:${raw.replace(/[^\d+]/g, "")}`;
};

export const whatsappLink = (phone, text) => {
  const digits = normalizePhone(phone);
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
};

/** Relation stored as a free text; known keys are translated. */
export const relationLabel = (relation, t) => {
  if (!relation) return "";
  return RELATIONS.includes(relation) ? t(`carnet.relations.${relation}`) : relation;
};

// ==================== Printable statement (A4) ====================

/**
 * @param {object} account - API response { contact, summary, entries }
 * @param {object} opts - { lang, storeName, currency, t }
 */
export const buildCarnetStatementHtml = (account, opts) => {
  const { lang, storeName, currency, t } = opts;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const { contact, summary, entries } = account;
  const money = (v) => escapeHtml(formatMoney(v, "", lang));
  const date = (v) => escapeHtml(formatDate(v, lang));
  const tc = (key, options) => t(`carnet.${key}`, options);
  const state = balanceState(summary.balance);

  const rows = entries
    .map((e) => {
      const label =
        e.direction === "note"
          ? tc("directions.note")
          : `${tc(`directions.${e.direction}`)} · ${tc(`kinds.${e.kind}`)}${
              e.to_return ? ` · ${tc(e.settled ? "status.returned" : "status.toReturn")}` : ""
            }`;
      const gave = e.counts && e.direction === "gave" ? money(e.amount) : "";
      const received = e.counts && e.direction === "received" ? money(e.amount) : "";
      const value =
        !e.counts && e.amount > 0 && e.direction !== "note"
          ? `<div class="muted">${escapeHtml(tc("print.value"))} : ${money(e.amount)}</div>`
          : "";
      return `<tr>
        <td>${date(e.entry_date)}</td>
        <td><strong>${escapeHtml(label)}</strong>${
          e.description ? `<div>${escapeHtml(e.description)}</div>` : ""
        }${e.notes ? `<div class="muted">${escapeHtml(e.notes)}</div>` : ""}${value}</td>
        <td>${e.due_date ? date(e.due_date) : ""}</td>
        <td class="num">${gave}</td>
        <td class="num">${received}</td>
        <td class="num strong">${money(e.running_balance)}</td>
      </tr>`;
    })
    .join("");

  const openItems = entries.filter((e) => e.to_return && !e.settled);
  const itemsBlock = openItems.length
    ? `<h3>${escapeHtml(tc("print.openItems"))}</h3>
       <ul>${openItems
         .map(
           (e) =>
             `<li><strong>${escapeHtml(e.description || "")}</strong> — ${escapeHtml(
               tc(e.direction === "gave" ? "items.lentShort" : "items.borrowedShort"),
             )} · ${date(e.entry_date)}</li>`,
         )
         .join("")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(tc("print.title"))} — ${escapeHtml(contact.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #1c1917; font-size: 11px; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1c1917; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .08em; }
  h3 { font-size: 12px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .06em; }
  .muted { color: #78716c; font-size: 10px; }
  .grid { display: flex; gap: 12px; margin-bottom: 14px; }
  .box { flex: 1; border: 1px solid #d6d3d1; border-radius: 6px; padding: 8px 10px; }
  .box .label { color: #78716c; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .box .value { font-size: 14px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: start; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #57534e; border-bottom: 1px solid #1c1917; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #e7e5e4; vertical-align: top; }
  .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 700; }
  ul { margin: 0; padding-inline-start: 18px; }
  li { margin: 2px 0; }
  .closing { margin-top: 14px; display: flex; justify-content: flex-end; }
  .closing div { border: 2px solid #1c1917; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 700; }
  footer { margin-top: 36px; display: flex; justify-content: space-between; color: #78716c; font-size: 10px; }
  .sign { width: 180px; border-top: 1px solid #a8a29e; padding-top: 4px; text-align: center; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(storeName)}</h1>
      <div class="muted">${escapeHtml(tc("print.subtitle"))}</div>
    </div>
    <div style="text-align:end">
      <h2>${escapeHtml(tc("print.title"))}</h2>
      <div class="muted">${escapeHtml(tc("print.generated", { date: formatDate(localToday(), lang) }))}</div>
    </div>
  </header>
  <div class="grid">
    <div class="box">
      <div class="label">${escapeHtml(tc("print.person"))}</div>
      <div class="value">${escapeHtml(contact.name)}</div>
      <div class="muted">${escapeHtml(
        [relationLabel(contact.relation, t), contact.phone].filter(Boolean).join(" · "),
      )}</div>
    </div>
    <div class="box">
      <div class="label">${escapeHtml(tc("summary.totalGave"))}</div>
      <div class="value">${money(summary.totalGave)}</div>
    </div>
    <div class="box">
      <div class="label">${escapeHtml(tc("summary.totalReceived"))}</div>
      <div class="value">${money(summary.totalReceived)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(tc("print.date"))}</th>
        <th>${escapeHtml(tc("print.operation"))}</th>
        <th>${escapeHtml(tc("form.dueDate"))}</th>
        <th class="num">${escapeHtml(tc("directions.gave"))}</th>
        <th class="num">${escapeHtml(tc("directions.received"))}</th>
        <th class="num">${escapeHtml(tc("print.balance"))}</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(tc("timeline.empty"))}</td></tr>`}</tbody>
  </table>
  <div class="closing"><div>${escapeHtml(
    tc(`balance.${state}`, { name: contact.name }),
  )}${state === "settled" ? "" : ` : ${money(Math.abs(summary.balance))} ${escapeHtml(currency)}`}</div></div>
  ${itemsBlock}
  <footer>
    <div>${escapeHtml(storeName)}</div>
    <div class="sign">${escapeHtml(tc("print.signature"))}</div>
  </footer>
</body>
</html>`;
};

/** Friendly WhatsApp reminder in the current language. */
export const buildReminderText = (account, { t, lang, currency }) => {
  const { contact, summary, entries } = account;
  const tc = (key, options) => t(`carnet.${key}`, options);
  const lines = [tc("reminder.hello", { name: contact.name.split(/\s+/)[0] })];
  if (summary.balance > 0) {
    lines.push(tc("reminder.owes", { amount: formatMoney(summary.balance, currency, lang) }));
  }
  const lent = entries.filter((e) => e.to_return && !e.settled && e.direction === "gave");
  if (lent.length) {
    lines.push(
      tc("reminder.items", { items: lent.map((e) => e.description).filter(Boolean).join(", ") }),
    );
  }
  lines.push(tc("reminder.thanks"));
  return lines.join("\n");
};
