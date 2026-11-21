// Supplier ledger helpers (pure functions, no database access).
//
// Sign convention: a purchase increases what we owe the supplier, a payment or a
// return / credit note decreases it. balance = purchases - payments - returns.
// A positive balance is owed to the supplier; a negative one is a credit in our favour.

export const LEDGER_TYPES = ["purchase", "payment", "return"];
export const PAYMENT_METHODS = ["cash", "check", "bank_transfer", "lcn", "other"];

const MAX_AMOUNT = 9999999999.99;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const pad = (n) => String(n).padStart(2, "0");

// Local calendar date (YYYY-MM-DD). toISOString() would shift to UTC.
export const localToday = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const isValidDate = (value) => {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

// mysql2 may return DATE columns as Date objects when DATE_FORMAT is not used
const toDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date) return localToday(value);
  return String(value).slice(0, 10);
};

export const signedAmount = (type, amount) =>
  type === "purchase" ? round2(amount) : -round2(amount);

const compareEntries = (a, b) =>
  a.transaction_date.localeCompare(b.transaction_date) || Number(a.id) - Number(b.id);

export const normalizeEntry = (row) => ({
  ...row,
  id: Number(row.id),
  supplier_id: row.supplier_id !== undefined ? Number(row.supplier_id) : row.supplier_id,
  amount: round2(row.amount),
  transaction_date: toDateString(row.transaction_date),
  due_date: toDateString(row.due_date),
});

/**
 * FIFO allocation: payments and returns settle the oldest purchases first.
 * Returns per-purchase status plus overdue / next due figures.
 */
export const allocateCredits = (sortedEntries, today = localToday()) => {
  let credit = round2(
    sortedEntries
      .filter((e) => e.type !== "purchase")
      .reduce((sum, e) => sum + e.amount, 0),
  );

  const allocation = new Map();
  let overdueAmount = 0;
  let overdueCount = 0;
  let unpaidCount = 0;
  let nextDueDate = null;
  let nextDueAmount = 0;

  for (const entry of sortedEntries) {
    if (entry.type !== "purchase") continue;
    const paid = round2(Math.min(entry.amount, credit));
    credit = round2(credit - paid);
    const remaining = round2(entry.amount - paid);
    const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    const isOverdue = remaining > 0 && Boolean(entry.due_date) && entry.due_date < today;

    if (remaining > 0) {
      unpaidCount += 1;
      if (isOverdue) {
        overdueAmount = round2(overdueAmount + remaining);
        overdueCount += 1;
      } else if (entry.due_date) {
        if (!nextDueDate || entry.due_date < nextDueDate) {
          nextDueDate = entry.due_date;
          nextDueAmount = remaining;
        } else if (entry.due_date === nextDueDate) {
          nextDueAmount = round2(nextDueAmount + remaining);
        }
      }
    }

    allocation.set(entry.id, { paid_amount: paid, remaining, status, is_overdue: isOverdue });
  }

  return {
    allocation,
    overdueAmount,
    overdueCount,
    unpaidCount,
    nextDueDate,
    nextDueAmount,
    unallocatedCredit: credit,
  };
};

/** Totals for a full (unfiltered) list of entries of one supplier. */
export const summarizeEntries = (rows, today = localToday()) => {
  const entries = rows.map(normalizeEntry).sort(compareEntries);
  let totalPurchases = 0;
  let totalPayments = 0;
  let totalReturns = 0;
  let lastPurchaseDate = null;
  let lastPaymentDate = null;
  let lastEntryDate = null;

  for (const e of entries) {
    if (e.type === "purchase") {
      totalPurchases += e.amount;
      lastPurchaseDate = e.transaction_date;
    } else if (e.type === "payment") {
      totalPayments += e.amount;
      lastPaymentDate = e.transaction_date;
    } else if (e.type === "return") {
      totalReturns += e.amount;
    }
    lastEntryDate = e.transaction_date;
  }

  const alloc = allocateCredits(entries, today);
  return {
    entries,
    alloc,
    summary: {
      totalPurchases: round2(totalPurchases),
      totalPayments: round2(totalPayments),
      totalReturns: round2(totalReturns),
      balance: round2(totalPurchases - totalPayments - totalReturns),
      entryCount: entries.length,
      lastPurchaseDate,
      lastPaymentDate,
      lastEntryDate,
      overdueAmount: alloc.overdueAmount,
      overdueCount: alloc.overdueCount,
      unpaidPurchases: alloc.unpaidCount,
      nextDueDate: alloc.nextDueDate,
      nextDueAmount: alloc.nextDueAmount,
    },
  };
};

/**
 * Full ledger for one supplier: running balance on the complete history,
 * then filtered for display (date range, type, text search).
 * openingBalance = balance carried forward before `from`.
 */
export const buildLedger = (rows, options = {}) => {
  const { from, to, type, search, today = localToday() } = options;
  const { entries, alloc, summary } = summarizeEntries(rows, today);

  let running = 0;
  let openingBalance = 0;
  let closingBalance = 0;
  const withBalance = entries.map((e) => {
    running = round2(running + signedAmount(e.type, e.amount));
    if (from && e.transaction_date < from) openingBalance = running;
    if (!to || e.transaction_date <= to) closingBalance = running;
    return {
      ...e,
      debit: e.type === "purchase" ? e.amount : 0,
      credit: e.type === "purchase" ? 0 : e.amount,
      running_balance: running,
      ...(alloc.allocation.get(e.id) || {}),
    };
  });

  const term = typeof search === "string" ? search.trim().toLowerCase() : "";
  const filtered = withBalance.filter((e) => {
    if (from && e.transaction_date < from) return false;
    if (to && e.transaction_date > to) return false;
    if (type && LEDGER_TYPES.includes(type) && e.type !== type) return false;
    if (term) {
      const haystack = [e.reference, e.description, e.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const debit = round2(filtered.reduce((s, e) => s + e.debit, 0));
  const credit = round2(filtered.reduce((s, e) => s + e.credit, 0));

  return {
    summary,
    period: {
      from: from || null,
      to: to || null,
      openingBalance: from ? openingBalance : 0,
      closingBalance,
      debit,
      credit,
      count: filtered.length,
      filtered: Boolean(type || term),
    },
    entries: filtered,
  };
};

const trimOrNull = (value, max) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

/**
 * Validates a create / update payload.
 * @returns {{ errors: string[], data: object }}
 */
export const validateLedgerInput = (body = {}, today = localToday()) => {
  const errors = [];
  const type = body.type;
  if (!LEDGER_TYPES.includes(type)) errors.push("Invalid type (purchase, payment or return)");

  const amount = round2(typeof body.amount === "string" ? body.amount.replace(",", ".") : body.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Amount must be greater than 0");
  else if (amount > MAX_AMOUNT) errors.push("Amount is too large");

  const transactionDate = body.transaction_date || today;
  if (!isValidDate(transactionDate)) errors.push("Invalid transaction date");

  let dueDate = null;
  if (type === "purchase" && body.due_date) {
    if (!isValidDate(body.due_date)) errors.push("Invalid due date");
    else if (isValidDate(transactionDate) && body.due_date < transactionDate)
      errors.push("Due date cannot be before the purchase date");
    else dueDate = body.due_date;
  }

  let paymentMethod = null;
  if (type === "payment") {
    paymentMethod = body.payment_method || "cash";
    if (!PAYMENT_METHODS.includes(paymentMethod)) errors.push("Invalid payment method");
  }

  return {
    errors,
    data: {
      type,
      amount,
      transaction_date: transactionDate,
      due_date: dueDate,
      reference: trimOrNull(body.reference, 100),
      payment_method: paymentMethod,
      description: trimOrNull(body.description, 500),
      notes: trimOrNull(body.notes),
    },
  };
};
