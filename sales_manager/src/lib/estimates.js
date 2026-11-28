// Estimates (devis) live in localStorage only (no server table yet).
// Shared by Estimates.jsx (editor + saved list) and QrSale.jsx ("convert to sale").

export const ESTIMATES_KEY = "sales_manager_estimates";
// Estimate whose lines were sent to the till; QrSale marks it as sold when that cart is checked out.
export const ESTIMATE_LINK_KEY = "salesManager.qrEstimate";

const toNumber = (value) => Number(value) || 0;

export const readEstimates = () => {
  try {
    const data = JSON.parse(localStorage.getItem(ESTIMATES_KEY) || "[]");
    return Array.isArray(data) ? data.filter((item) => item && typeof item === "object" && item.number) : [];
  } catch {
    return [];
  }
};

export const writeEstimates = (list) => {
  try {
    localStorage.setItem(ESTIMATES_KEY, JSON.stringify(list));
  } catch {
    // storage full / blocked: the in-memory list still works for this session
  }
};

// Subtotal -> discount (MAD, never below 0) -> VAT (%) on what is left.
export const estimateTotals = (estimate) => {
  const items = Array.isArray(estimate?.items) ? estimate.items : [];
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0);
  const discount = Math.min(Math.max(0, toNumber(estimate?.discount)), subtotal);
  const taxRate = Math.max(0, toNumber(estimate?.tax));
  const taxable = subtotal - discount;
  const tax = taxable * (taxRate / 100);
  return { subtotal, discount, taxRate, tax, total: taxable + tax };
};

// DEV-<year>-<5 digits>. Highest existing sequence + 1, so deleting an estimate never
// hands out a number that is still in use (saving would overwrite that estimate).
export const nextEstimateNumber = (list, year = new Date().getFullYear()) => {
  const prefix = `DEV-${year}-`;
  const highest = list.reduce((max, item) => {
    const number = String(item?.number || "");
    if (!number.startsWith(prefix)) return max;
    const sequence = Number.parseInt(number.slice(prefix.length), 10);
    return Number.isSafeInteger(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(5, "0")}`;
};

export const readEstimateLink = () => {
  try {
    const data = JSON.parse(localStorage.getItem(ESTIMATE_LINK_KEY) || "null");
    return data?.number ? { number: String(data.number) } : null;
  } catch {
    return null;
  }
};

export const writeEstimateLink = (number) => {
  try {
    localStorage.setItem(ESTIMATE_LINK_KEY, JSON.stringify({ number, at: new Date().toISOString() }));
  } catch {
    // ignore: the sale still works, the estimate just won't be marked as sold
  }
};

export const clearEstimateLink = () => {
  try {
    localStorage.removeItem(ESTIMATE_LINK_KEY);
  } catch {
    // ignore
  }
};

// Called by the till after a successful checkout of a cart that came from an estimate.
export const markEstimateConverted = (number, ticketNumber) => {
  const list = readEstimates();
  if (!list.some((item) => item.number === number)) return;
  writeEstimates(
    list.map((item) =>
      item.number === number
        ? { ...item, convertedAt: new Date().toISOString(), ticketNumber: ticketNumber ? String(ticketNumber) : "" }
        : item,
    ),
  );
};
