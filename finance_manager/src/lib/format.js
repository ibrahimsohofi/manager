// Number and date formatting (FINANCE_PLAN.md §4 #12, §12). Amounts always use fr-MA grouping and Latin
// digits, in both languages; the currency label comes from i18n (fr "DH", ar "د.م."). In Arabic, wrap
// every figure in <bdi> (components/Money.jsx does it) so RTL never reorders the digits and the sign.

const moneyFormat = new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFormatRound = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat("fr-MA", { notation: "compact", maximumFractionDigits: 1 });
const pctFormat = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const intFormat = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 });

const isNum = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

/** "12 345,60" (no currency). `round` drops the cents. null -> "—". */
export const formatAmount = (value, { round = false, sign = false } = {}) => {
  if (!isNum(value)) return "—";
  const n = Number(value);
  const text = (round ? moneyFormatRound : moneyFormat).format(Math.abs(n));
  if (n < 0) return `−${text}`;
  if (sign && n > 0) return `+${text}`;
  return text;
};

/** "12,3 k" for chart axes. */
export const formatCompact = (value) => (isNum(value) ? compactFormat.format(Number(value)) : "—");

/** "31,2 %" ; `sign` adds "+" to positive changes. */
export const formatPct = (value, { sign = false } = {}) => {
  if (!isNum(value)) return "—";
  const n = Number(value);
  const text = pctFormat.format(Math.abs(n));
  const prefix = n < 0 ? "−" : sign && n > 0 ? "+" : "";
  return `${prefix}${text}\u202f%`;
};

export const formatInt = (value) => (isNum(value) ? intFormat.format(Number(value)) : "—");

// ---------- Dates ----------

const localeFor = (lang) => (lang === "ar" ? "ar-MA-u-nu-latn" : "fr-MA");

const cache = new Map();
const dtf = (lang, options) => {
  const key = `${lang}|${JSON.stringify(options)}`;
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(localeFor(lang), { timeZone: "UTC", ...options }));
  return cache.get(key);
};

const utcDate = (iso) => {
  const [y, m = 1, d = 1] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** "novembre 2026" / "نونبر 2026". `short` -> "nov. 2026". */
export const formatMonth = (monthKey, lang, { short = false, withYear = true } = {}) => {
  if (!monthKey) return "—";
  const options = { month: short ? "short" : "long" };
  if (withYear) options.year = "numeric";
  const text = dtf(lang, options).format(utcDate(monthKey));
  return lang === "fr" ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

/** "21 nov." or "21 novembre 2026" (`long`). */
export const formatDate = (isoDate, lang, { long = false, weekday = false } = {}) => {
  if (!isoDate) return "—";
  const options = long ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short" };
  if (weekday) options.weekday = "short";
  return dtf(lang, options).format(utcDate(isoDate));
};

/** "lun." for a day row. */
export const formatWeekday = (isoDate, lang) => dtf(lang, { weekday: "short" }).format(utcDate(isoDate));

/** "Novembre 2026" or "2026". */
export const formatPeriod = (periodKey, lang) =>
  String(periodKey).length === 4 ? String(periodKey) : formatMonth(periodKey, lang);
