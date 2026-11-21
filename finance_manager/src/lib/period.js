// Periods are a month "YYYY-MM" or a year "YYYY", the same keys the API takes (server/utils/finance.js).

const pad2 = (n) => String(n).padStart(2, "0");

export const isMonthKey = (value) => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const isYearKey = (value) => typeof value === "string" && /^\d{4}$/.test(value);
export const isPeriodKey = (value) => isMonthKey(value) || isYearKey(value);

/** Local calendar date "YYYY-MM-DD" (the shop's day). */
export const todayISO = (now = new Date()) =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

export const currentMonth = () => todayISO().slice(0, 7);
export const currentYear = () => todayISO().slice(0, 4);

export const addMonths = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
};

export const periodKind = (key) => (isYearKey(key) ? "year" : "month");

/** Moves a period by n months or n years. */
export const shiftPeriod = (key, n) => (isYearKey(key) ? String(Number(key) + n) : addMonths(key, n));

/** Month <-> year, keeping the year (and the current month when it is in that year). */
export const togglePeriodKind = (key) => {
  if (isYearKey(key)) {
    const month = currentMonth();
    return month.startsWith(key) ? month : `${key}-12`;
  }
  return key.slice(0, 4);
};

export const yearOf = (key) => String(key).slice(0, 4);

export const isFuturePeriod = (key) => (isYearKey(key) ? key > currentYear() : key > currentMonth());

export const daysInMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Days between two ISO dates (b - a). */
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
