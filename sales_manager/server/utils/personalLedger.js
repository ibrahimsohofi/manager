// Personal ledger ("Carnet") helpers: pure functions, no database access.
//
// Every entry is written from the shop owner's point of view:
//   - direction "gave"     : I gave money / goods / a service  -> the person owes me more (+)
//   - direction "received" : the person gave me something       -> I owe the person more (-)
//   - direction "note"     : free text reminder, no effect on the balance
// Goods flagged `to_return` are loans of an object (a drill, a ladder...). They are tracked
// until returned (`settled`) and never change the money balance.
//
// balance > 0 : the person owes me      balance < 0 : I owe the person

export const DIRECTIONS = ["gave", "received", "note"];
export const KINDS = ["money", "goods", "service"];

const MAX_AMOUNT = 9999999999.99;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const pad = (n) => String(n).padStart(2, "0");

/** Local calendar date (YYYY-MM-DD). toISOString() would shift to UTC. */
export const localToday = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const isValidDate = (value) => {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

const toDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date) return localToday(value);
  return String(value).slice(0, 10);
};

const toBool = (value) => value === true || value === 1 || value === "1" || value === "true";

const trimOrNull = (value, max) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

/** True when the entry changes the money balance. */
export const countsInBalance = (entry) =>
  entry.direction !== "note" && !entry.to_return && round2(entry.amount) > 0;

/** Effect of one entry on the balance (+ they owe me, - I owe them). */
export const signedAmount = (entry) => {
  if (!countsInBalance(entry)) return 0;
  return entry.direction === "gave" ? round2(entry.amount) : -round2(entry.amount);
};

export const normalizeEntry = (row) => ({
  ...row,
  id: Number(row.id),
  contact_id: row.contact_id !== undefined ? Number(row.contact_id) : row.contact_id,
  amount: round2(row.amount),
  entry_date: toDateString(row.entry_date),
  due_date: toDateString(row.due_date),
  settled_date: toDateString(row.settled_date),
  to_return: toBool(row.to_return),
  settled: toBool(row.settled),
});

const compareEntries = (a, b) =>
  a.entry_date.localeCompare(b.entry_date) || Number(a.id) - Number(b.id);

/**
 * Summary + per-entry status for the full history of one person.
 * Open debts are found FIFO: repayments settle the oldest amounts first, so the
 * outstanding balance belongs to the most recent entries of the winning side.
 */
export const summarizeEntries = (rows, today = localToday()) => {
  const entries = rows.map(normalizeEntry).sort(compareEntries);

  let totalGave = 0;
  let totalReceived = 0;
  let lastEntryDate = null;
  for (const e of entries) {
    if (countsInBalance(e)) {
      if (e.direction === "gave") totalGave += e.amount;
      else totalReceived += e.amount;
    }
    lastEntryDate = e.entry_date;
  }
  totalGave = round2(totalGave);
  totalReceived = round2(totalReceived);
  const balance = round2(totalGave - totalReceived);

  // FIFO: walk the winning side from the newest entry back, assigning what is still owed
  const status = new Map();
  const openSide = balance > 0 ? "gave" : balance < 0 ? "received" : null;
  let remaining = Math.abs(balance);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (!countsInBalance(e)) continue;
    if (e.direction !== openSide || remaining <= 0) {
      status.set(e.id, { outstanding: 0, status: "paid" });
      continue;
    }
    const outstanding = round2(Math.min(e.amount, remaining));
    remaining = round2(remaining - outstanding);
    status.set(e.id, {
      outstanding,
      status: outstanding >= e.amount ? "open" : "partial",
    });
  }

  let overdueCount = 0;
  let overdueAmount = 0;
  let nextDueDate = null;
  const itemsOut = []; // objects I lent, still with the person
  const itemsIn = []; // objects I borrowed, still with me

  const enriched = entries.map((e) => {
    const info = status.get(e.id) || { outstanding: 0, status: null };
    let isOverdue = false;
    let isOpen = false;
    if (e.to_return && e.direction !== "note") {
      isOpen = !e.settled;
      if (isOpen) (e.direction === "gave" ? itemsOut : itemsIn).push(e.id);
    } else if (countsInBalance(e)) {
      isOpen = info.outstanding > 0;
    }
    if (isOpen && e.due_date) {
      if (e.due_date < today) {
        isOverdue = true;
        overdueCount += 1;
        overdueAmount = round2(overdueAmount + (info.outstanding || 0));
      } else if (!nextDueDate || e.due_date < nextDueDate) {
        nextDueDate = e.due_date;
      }
    }
    return {
      ...e,
      counts: countsInBalance(e),
      signed: signedAmount(e),
      outstanding: info.outstanding,
      debt_status: info.status,
      is_open: isOpen,
      is_overdue: isOverdue,
    };
  });

  return {
    entries: enriched,
    summary: {
      balance,
      totalGave,
      totalReceived,
      entryCount: entries.length,
      lastEntryDate,
      itemsOut: itemsOut.length,
      itemsIn: itemsIn.length,
      overdueCount,
      overdueAmount,
      nextDueDate,
    },
  };
};

/** Full history of one person with the running balance after each entry (oldest first). */
export const buildTimeline = (rows, today = localToday()) => {
  const { entries, summary } = summarizeEntries(rows, today);
  let running = 0;
  const withBalance = entries.map((e) => {
    running = round2(running + e.signed);
    return { ...e, running_balance: running };
  });
  return { summary, entries: withBalance };
};

/** Totals over the contacts list (each contact already carries its summary). */
export const totalsFor = (contacts) => {
  const totals = {
    owedToMe: 0,
    iOwe: 0,
    net: 0,
    peopleOweMe: 0,
    peopleIOwe: 0,
    itemsOut: 0,
    itemsIn: 0,
    overduePeople: 0,
    contactCount: contacts.length,
  };
  for (const c of contacts) {
    if (c.balance > 0) {
      totals.owedToMe += c.balance;
      totals.peopleOweMe += 1;
    } else if (c.balance < 0) {
      totals.iOwe += -c.balance;
      totals.peopleIOwe += 1;
    }
    totals.itemsOut += c.itemsOut || 0;
    totals.itemsIn += c.itemsIn || 0;
    if (c.overdueCount > 0) totals.overduePeople += 1;
  }
  totals.owedToMe = round2(totals.owedToMe);
  totals.iOwe = round2(totals.iOwe);
  totals.net = round2(totals.owedToMe - totals.iOwe);
  return totals;
};

// ==================== Validation ====================

/** @returns {{ errors: string[], data: object }} */
export const validateContactInput = (body = {}, { partial = false } = {}) => {
  const errors = [];
  const data = {};

  if (!partial || body.name !== undefined) {
    const name = trimOrNull(body.name, 255);
    if (!name) errors.push("Name is required");
    data.name = name;
  }
  if (!partial || body.phone !== undefined) data.phone = trimOrNull(body.phone, 50);
  if (!partial || body.relation !== undefined) data.relation = trimOrNull(body.relation, 100);
  if (!partial || body.notes !== undefined) data.notes = trimOrNull(body.notes);
  if (body.archived !== undefined) data.archived = toBool(body.archived);

  return { errors, data };
};

/** @returns {{ errors: string[], data: object }} */
export const validateEntryInput = (body = {}, today = localToday()) => {
  const errors = [];
  const direction = body.direction;
  if (!DIRECTIONS.includes(direction)) errors.push("Invalid direction (gave, received or note)");

  const isNote = direction === "note";
  const kind = isNote ? "note" : body.kind || "money";
  if (!isNote && !KINDS.includes(kind)) errors.push("Invalid kind (money, goods or service)");

  let amount = 0;
  if (!isNote) {
    const raw = typeof body.amount === "string"
      ? body.amount.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")
      : body.amount;
    amount = raw === "" || raw === null || raw === undefined ? 0 : round2(raw);
    if (!Number.isFinite(Number(raw ?? 0)) || amount < 0) errors.push("Invalid amount");
    else if (amount > MAX_AMOUNT) errors.push("Amount is too large");
    else if (kind === "money" && amount <= 0) errors.push("Amount must be greater than 0");
  }

  const description = trimOrNull(body.description, 500);
  const notes = trimOrNull(body.notes);
  if (isNote && !description && !notes) errors.push("A note cannot be empty");
  if (kind === "goods" && !description) errors.push("Describe the item");

  const entryDate = body.entry_date || today;
  if (!isValidDate(entryDate)) errors.push("Invalid date");

  let dueDate = null;
  if (!isNote && body.due_date) {
    if (!isValidDate(body.due_date)) errors.push("Invalid due date");
    else if (isValidDate(entryDate) && body.due_date < entryDate)
      errors.push("Due date cannot be before the entry date");
    else dueDate = body.due_date;
  }

  const toReturn = kind === "goods" && toBool(body.to_return);
  const settled = toReturn && toBool(body.settled);
  let settledDate = null;
  if (settled) {
    settledDate = isValidDate(body.settled_date) ? body.settled_date : today;
  }

  return {
    errors,
    data: {
      direction,
      kind,
      amount,
      description,
      notes,
      entry_date: entryDate,
      due_date: dueDate,
      to_return: toReturn,
      settled,
      settled_date: settledDate,
    },
  };
};
