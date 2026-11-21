import { getDatabase, pool } from '../config/database.js';
import {
  customerSnapshot,
  formatInvoiceNumber,
  httpError,
  invoiceCounterName,
  normalizeInvoiceNumber,
  normalizeInvoiceRow,
  normalizeLine,
  normalizeTicketNumber,
  round2,
  summarizeLines,
} from '../utils/invoice.js';

// VIP "Pro Bill": one A4 invoice per QR ticket, numbered FAC-<year>-00001, FAC-<year>-00002...
// - The number comes from app_counters (row "invoice_<year>", locked FOR UPDATE until commit),
//   so two tills never get the same one. UNIQUE (invoice_number) backs it up.
// - One invoice per ticket: UNIQUE (ticket_number). Issuing again returns the existing invoice.
// - Call it only after every line of the ticket is saved: a failed sale never uses up a number.
// Lines are not copied: they are the `sales` rows of the ticket ("TKT-...-01", "-02"...).

const MYSQL_DUPLICATE = 'ER_DUP_ENTRY';
const MYSQL_RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const MAX_ATTEMPTS = 3;

// Sales rows of one ticket, in line order. The LIKE uses the sale_number index; the
// SUBSTRING_INDEX check is the same ticket grouping as TICKET_KEY_SQL in Customer.js.
const loadTicketRows = async (ticket) => {
  const db = getDatabase();
  return db.all(
    `SELECT id, sale_number, date, customer_id, product_id, productName, category,
            price, quantity, totalPrice, payment_method, created_at
     FROM sales
     WHERE sale_number LIKE ? AND SUBSTRING_INDEX(sale_number, '-', 4) = ?
     ORDER BY sale_number ASC, id ASC`,
    [`${ticket}-%`, ticket]
  );
};

const findByTicket = async (runner, ticket) => {
  const [rows] = await runner.query('SELECT * FROM invoices WHERE ticket_number = ? LIMIT 1', [ticket]);
  return normalizeInvoiceRow(rows[0]);
};

// Exclusive lock on the year's counter row, held until the transaction ends ([] when missing)
const lockCounter = (connection, counter) =>
  connection.query('SELECT value FROM app_counters WHERE name = ? FOR UPDATE', [counter]);

// The actual issuance, on a connection that is already inside a transaction.
const issueOnConnection = async (connection, { ticket, snapshot, totals, paymentMethod, now }) => {
  const year = now.getFullYear();
  const counter = invoiceCounterName(year);

  // Counter first: it serializes every issuance of the year, including two calls for the
  // same ticket (the second one then finds the invoice of the first one below).
  // Lock first, create only when missing: an INSERT IGNORE on an existing row takes a shared
  // lock that FOR UPDATE then has to upgrade, and two tills doing that at once deadlock.
  let [counterRows] = await lockCounter(connection, counter);
  if (counterRows.length === 0) {
    // First invoice of the year (a race here deadlocks at worst, retried by issueForTicket)
    await connection.query('INSERT IGNORE INTO app_counters (name, value) VALUES (?, 0)', [counter]);
    [counterRows] = await lockCounter(connection, counter);
  }

  const existing = await findByTicket(connection, ticket);
  if (existing) return { invoice: existing, created: false };

  // Skip numbers already used (e.g. an invoice inserted by hand)
  let next = (Number(counterRows[0]?.value) || 0) + 1;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const [taken] = await connection.query(
      'SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1',
      [formatInvoiceNumber(year, next)]
    );
    if (taken.length === 0) break;
    next += 1;
  }
  const invoiceNumber = formatInvoiceNumber(year, next);

  await connection.query('UPDATE app_counters SET value = ? WHERE name = ?', [next, counter]);
  const [result] = await connection.query(
    `INSERT INTO invoices (
       invoice_number, ticket_number, customer_id, customer_name, customer_phone, customer_code,
       items_count, total_units, total_amount, payment_method, issued_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceNumber, ticket, snapshot.customer_id, snapshot.customer_name, snapshot.customer_phone,
      snapshot.customer_code, totals.items_count, totals.total_units, totals.total_amount,
      paymentMethod, now,
    ]
  );
  const [rows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [result.insertId]);
  return { invoice: normalizeInvoiceRow(rows[0]), created: true };
};

class Invoice {
  /**
   * Issue the invoice of a QR ticket (or return the one it already has).
   * Usage: issueForTicket(data) -> own transaction, or issueForTicket(connection, data) -> runs on
   * the caller's connection / transaction (the caller commits).
   * data: { ticket_number, customer: { id, name, phone, code }, items?, totals?, payment_method?, now? }
   * Totals are computed from `items` when given, otherwise taken from `totals`.
   * @returns {Promise<{ invoice: object, created: boolean }>}
   */
  static async issueForTicket(connectionOrData, maybeData) {
    const external = maybeData !== undefined ? connectionOrData : null;
    const data = (maybeData !== undefined ? maybeData : connectionOrData) || {};

    const ticket = normalizeTicketNumber(data.ticket_number);
    const snapshot = customerSnapshot(data.customer);
    const lines = Array.isArray(data.items) ? data.items.map(normalizeLine) : [];
    const totals = lines.length > 0
      ? summarizeLines(lines)
      : {
          items_count: Number.parseInt(data.totals?.items_count, 10) || 0,
          total_units: Number.parseInt(data.totals?.total_units, 10) || 0,
          total_amount: round2(data.totals?.total_amount),
        };
    const paymentMethod = data.payment_method ? String(data.payment_method).slice(0, 20) : null;
    const now = data.now instanceof Date && !Number.isNaN(data.now.getTime()) ? data.now : new Date();
    const input = { ticket, snapshot, totals, paymentMethod, now };

    if (external) return issueOnConnection(external, input);

    if (!pool) throw new Error('Database not initialized');
    for (let attempt = 1; ; attempt++) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await issueOnConnection(connection, input);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback().catch(() => {});
        if (error.code === MYSQL_DUPLICATE) {
          // Same ticket issued at the same moment by another call: return that invoice
          const existing = await findByTicket(pool, ticket);
          if (existing) return { invoice: existing, created: false };
          // Number taken outside the counter (should not happen with the lock): take the next one
          if (attempt < MAX_ATTEMPTS) continue;
        }
        // First invoice of the year from two tills at once can deadlock on the new counter row
        if (MYSQL_RETRYABLE.has(error.code) && attempt < MAX_ATTEMPTS) continue;
        throw error;
      } finally {
        connection.release();
      }
    }
  }

  // Invoice row of a ticket, or null
  static async getByTicket(ticketNumber) {
    if (!pool) throw new Error('Database not initialized');
    return findByTicket(pool, normalizeTicketNumber(ticketNumber));
  }

  // Lines of a ticket (from `sales`), in the checkout item shape
  static async getTicketLines(ticketNumber) {
    const rows = await loadTicketRows(normalizeTicketNumber(ticketNumber));
    return rows.map(normalizeLine);
  }

  // Full document for printing: { invoice, items, totals } or null
  static async getByNumber(invoiceNumber) {
    const db = getDatabase();
    const number = normalizeInvoiceNumber(invoiceNumber);
    const row = await db.get('SELECT * FROM invoices WHERE invoice_number = ? LIMIT 1', [number]);
    const invoice = normalizeInvoiceRow(row);
    if (!invoice) return null;

    const items = (await loadTicketRows(invoice.ticket_number)).map(normalizeLine);
    // Sales lines deleted since: keep the totals saved when the invoice was issued
    const totals = items.length > 0
      ? summarizeLines(items)
      : { items_count: invoice.items_count, total_units: invoice.total_units, total_amount: invoice.total_amount };
    return { invoice, items, totals };
  }

  /**
   * Issue (or return) the invoice of an already saved ticket, from its `sales` rows.
   * Used by "Réessayer" when issuing failed at checkout, and for reprints.
   * An existing invoice is always returned. A new one needs the ticket's client to be VIP
   * unless `requireVip` is false.
   * @returns {Promise<{ invoice, items, totals, created: boolean }>}
   */
  static async rebuildFromSales(ticketNumber, { requireVip = true } = {}) {
    const ticket = normalizeTicketNumber(ticketNumber);
    const rows = await loadTicketRows(ticket);
    if (rows.length === 0) {
      throw httpError(404, `Ticket ${ticket} not found`, 'TICKET_NOT_FOUND');
    }
    const items = rows.map(normalizeLine);
    const totals = summarizeLines(items);

    const existing = await Invoice.getByTicket(ticket);
    if (existing) return { invoice: existing, items, totals, created: false };

    const customerId = rows.find((row) => row.customer_id)?.customer_id;
    if (!customerId) {
      throw httpError(422, 'This ticket has no client - an invoice needs a client', 'INVOICE_REQUIRES_CUSTOMER');
    }
    const customer = await getDatabase().get(
      'SELECT id, name, phone, code, is_vip FROM customers WHERE id = ?',
      [customerId]
    );
    if (!customer) {
      throw httpError(422, `Client #${customerId} not found`, 'INVOICE_REQUIRES_CUSTOMER');
    }
    if (requireVip && Number(customer.is_vip) !== 1) {
      throw httpError(422, 'This client is not VIP', 'CUSTOMER_NOT_VIP');
    }

    const { invoice, created } = await Invoice.issueForTicket({
      ticket_number: ticket,
      customer,
      items,
      payment_method: rows[0].payment_method,
    });
    return { invoice, items, totals, created };
  }
}

export default Invoice;
