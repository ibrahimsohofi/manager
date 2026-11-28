// Supplier ledger: API client, date helpers, formatting and printable statement.
// Sign convention (same as the server): purchases increase what we owe,
// payments and returns decrease it. Positive balance = owed to the supplier.
import { SALES_MANAGER_API } from "../config/integration.js";
import { escapeHtml } from "./print.js";

export const LEDGER_TYPES = ["purchase", "payment", "return"];
export const PAYMENT_METHODS = ["cash", "check", "bank_transfer", "lcn", "other"];

// ==================== Routes (entry page) ====================

export const SUPPLIERS_PATH = "/suppliers";

/** New operation page: /suppliers/:supplierId/notes?type=purchase|payment|return */
export const newEntryPath = (supplierId, type) =>
  `${SUPPLIERS_PATH}/${supplierId}/notes${LEDGER_TYPES.includes(type) ? `?type=${type}` : ""}`;

/** Edit operation page: /suppliers/:supplierId/notes/:entryId/edit */
export const editEntryPath = (supplierId, entryId) =>
  `${SUPPLIERS_PATH}/${supplierId}/notes/${entryId}/edit`;

// ==================== API ====================

const request = async (path, options = {}) => {
  const url = `${SALES_MANAGER_API.BASE_URL}/api/suppliers${path}`;
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

export const ledgerApi = {
  balances: (search) => request(`/ledger/balances${toQuery({ search })}`),
  ledger: (supplierId, filters) =>
    request(`/${supplierId}/ledger${toQuery(filters)}`),
  create: (supplierId, payload) =>
    request(`/${supplierId}/ledger`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (supplierId, entryId, payload) =>
    request(`/${supplierId}/ledger/${entryId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (supplierId, entryId) =>
    request(`/${supplierId}/ledger/${entryId}`, { method: "DELETE" }),
};

// ==================== Dates ====================

const pad = (n) => String(n).padStart(2, "0");

/** Local calendar date YYYY-MM-DD (toISOString would shift to UTC). */
export const localToday = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseLocalDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const addDays = (value, days) => {
  const date = parseLocalDate(value) || new Date();
  date.setDate(date.getDate() + days);
  return localToday(date);
};

/** Whole days from `from` to `to` (positive when `to` is later). */
export const daysBetween = (from, to) => {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

export const PERIOD_PRESETS = ["all", "month", "lastMonth", "quarter", "year", "custom"];

export const periodRange = (preset, now = new Date()) => {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: localToday(new Date(y, m, 1)), to: localToday(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { from: localToday(new Date(y, m - 1, 1)), to: localToday(new Date(y, m, 0)) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: localToday(new Date(y, q, 1)), to: localToday(new Date(y, q + 3, 0)) };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: "", to: "" };
  }
};

/** "Net 30" -> 30, "COD" / "Prepaid" -> 0, unknown -> null */
export const paymentTermsDays = (terms) => {
  if (!terms) return null;
  const match = String(terms).match(/(\d+)/);
  if (match) return Number(match[1]);
  if (/cod|prepaid/i.test(terms)) return 0;
  return null;
};

// ==================== Formatting ====================

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Accepts "1 250,50", "1250.5", numbers. Returns NaN when not a number. */
export const parseAmount = (value) => {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(",", ".");
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
};

export const numberLocale = (lang) => (lang === "ar" ? "ar-MA" : "fr-MA");

export const formatMoney = (value, currency, lang) => {
  const n = new Intl.NumberFormat(numberLocale(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value));
  return currency ? `${n} ${currency}` : n;
};

export const formatDate = (value, lang, options) => {
  const date = parseLocalDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(numberLocale(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
};

export const balanceState = (balance) => {
  const b = round2(balance);
  if (b > 0) return "owed";
  if (b < 0) return "credit";
  return "settled";
};

// ==================== Printable statement (A4) ====================

/**
 * @param {object} ledger - API response { supplier, summary, period, entries }
 * @param {object} opts - { lang, storeName, storeSubtitle, currency, t }
 */
export const buildStatementHtml = (ledger, opts) => {
  const { lang, storeName, storeSubtitle, currency, t } = opts;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const { supplier, summary, period, entries } = ledger;
  const money = (v) => escapeHtml(formatMoney(v, "", lang));
  const date = (v) => escapeHtml(formatDate(v, lang));
  const periodLabel =
    period.from || period.to
      ? `${period.from ? date(period.from) : "…"} — ${period.to ? date(period.to) : "…"}`
      : escapeHtml(t("supplierLedger.statement.allHistory"));

  const rows = entries
    .map((e) => {
      const label = [
        t(`supplierLedger.types.${e.type}`),
        e.reference ? `N° ${e.reference}` : "",
        e.type === "payment" && e.payment_method
          ? t(`supplierLedger.methods.${e.payment_method}`)
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr>
        <td>${date(e.transaction_date)}</td>
        <td><strong>${escapeHtml(label)}</strong>${
          e.description ? `<div class="muted">${escapeHtml(e.description)}</div>` : ""
        }</td>
        <td>${e.due_date ? date(e.due_date) : ""}</td>
        <td class="num">${e.debit ? money(e.debit) : ""}</td>
        <td class="num">${e.credit ? money(e.credit) : ""}</td>
        <td class="num strong">${money(e.running_balance)}</td>
      </tr>`;
    })
    .join("");

  const opening = period.from
    ? `<tr class="carry"><td colspan="5">${escapeHtml(
        t("supplierLedger.table.opening", { date: formatDate(period.from, lang) }),
      )}</td><td class="num strong">${money(period.openingBalance)}</td></tr>`
    : "";

  const closingLabel = period.to
    ? t("supplierLedger.table.closing", { date: formatDate(period.to, lang) })
    : t("supplierLedger.table.closingNow");

  const state = balanceState(summary.balance);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(t("supplierLedger.statement.title"))} — ${escapeHtml(supplier.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #1c1917; font-size: 11px; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1c1917; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0; letter-spacing: .02em; }
  h2 { font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .08em; }
  .muted { color: #78716c; font-size: 10px; }
  .grid { display: flex; gap: 16px; margin-bottom: 14px; }
  .box { flex: 1; border: 1px solid #d6d3d1; border-radius: 6px; padding: 8px 10px; }
  .box .label { color: #78716c; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .box .value { font-size: 14px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: start; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #57534e; border-bottom: 1px solid #1c1917; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #e7e5e4; vertical-align: top; }
  .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 700; }
  tr.carry td { background: #f5f5f4; font-style: italic; }
  tfoot td { border-top: 2px solid #1c1917; border-bottom: 0; font-weight: 700; }
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
      <div class="muted">${escapeHtml(storeSubtitle || "")}</div>
    </div>
    <div style="text-align:end">
      <h2>${escapeHtml(t("supplierLedger.statement.title"))}</h2>
      <div class="muted">${escapeHtml(t("supplierLedger.statement.period"))} : ${periodLabel}</div>
    </div>
  </header>
  <div class="grid">
    <div class="box">
      <div class="label">${escapeHtml(t("supplierLedger.list.supplier"))}</div>
      <div class="value">${escapeHtml(supplier.name)}</div>
      <div class="muted">${escapeHtml(
        [supplier.contact_person, supplier.phone, supplier.city].filter(Boolean).join(" · "),
      )}</div>
    </div>
    <div class="box">
      <div class="label">${escapeHtml(t("supplierLedger.summary.purchases"))}</div>
      <div class="value">${money(summary.totalPurchases)}</div>
    </div>
    <div class="box">
      <div class="label">${escapeHtml(t("supplierLedger.summary.payments"))}</div>
      <div class="value">${money(summary.totalPayments + summary.totalReturns)}</div>
    </div>
    <div class="box">
      <div class="label">${escapeHtml(t(`supplierLedger.balance.${state}`))}</div>
      <div class="value">${money(Math.abs(summary.balance))} ${escapeHtml(currency)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t("supplierLedger.table.date"))}</th>
        <th>${escapeHtml(t("supplierLedger.table.operation"))}</th>
        <th>${escapeHtml(t("supplierLedger.form.dueDate"))}</th>
        <th class="num">${escapeHtml(t("supplierLedger.table.debit"))}</th>
        <th class="num">${escapeHtml(t("supplierLedger.table.credit"))}</th>
        <th class="num">${escapeHtml(t("supplierLedger.table.balance"))}</th>
      </tr>
    </thead>
    <tbody>${opening}${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">${escapeHtml(t("supplierLedger.table.periodTotals"))}</td>
        <td class="num">${money(period.debit)}</td>
        <td class="num">${money(period.credit)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <div class="closing"><div>${escapeHtml(closingLabel)} : ${money(period.closingBalance)} ${escapeHtml(currency)}</div></div>
  <footer>
    <div>${escapeHtml(t("supplierLedger.statement.generated", { date: formatDate(localToday(), lang) }))}</div>
    <div class="sign">${escapeHtml(t("supplierLedger.statement.signature"))}</div>
  </footer>
</body>
</html>`;
};
