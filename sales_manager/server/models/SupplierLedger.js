import { getDatabase } from '../config/database.js';
import { localToday, round2, summarizeEntries } from '../utils/supplierLedger.js';

// Dates formatted in SQL so the API always returns plain YYYY-MM-DD strings
const SELECT_COLUMNS = `
  id, supplier_id, type, amount,
  DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date,
  DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
  reference, payment_method, description, notes, created_at, updated_at
`;

class SupplierLedger {
  // All entries of one supplier, oldest first
  static async getEntries(supplierId) {
    const db = getDatabase();
    return db.all(
      `SELECT ${SELECT_COLUMNS}
       FROM supplier_transactions
       WHERE supplier_id = ?
       ORDER BY transaction_date ASC, id ASC`,
      [supplierId]
    );
  }

  static async getEntry(id, supplierId) {
    const db = getDatabase();
    return db.get(
      `SELECT ${SELECT_COLUMNS} FROM supplier_transactions WHERE id = ? AND supplier_id = ?`,
      [id, supplierId]
    );
  }

  static async create(supplierId, data) {
    const db = getDatabase();
    const result = await db.run(
      `INSERT INTO supplier_transactions
         (supplier_id, type, amount, transaction_date, due_date, reference,
          payment_method, description, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplierId, data.type, data.amount, data.transaction_date, data.due_date,
        data.reference, data.payment_method, data.description, data.notes
      ]
    );
    return SupplierLedger.getEntry(result.insertId, supplierId);
  }

  static async update(id, supplierId, data) {
    const db = getDatabase();
    const result = await db.run(
      `UPDATE supplier_transactions
       SET type = ?, amount = ?, transaction_date = ?, due_date = ?, reference = ?,
           payment_method = ?, description = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND supplier_id = ?`,
      [
        data.type, data.amount, data.transaction_date, data.due_date, data.reference,
        data.payment_method, data.description, data.notes, id, supplierId
      ]
    );
    if (result.affectedRows === 0) return null;
    return SupplierLedger.getEntry(id, supplierId);
  }

  static async delete(id, supplierId) {
    const db = getDatabase();
    const result = await db.run(
      'DELETE FROM supplier_transactions WHERE id = ? AND supplier_id = ?',
      [id, supplierId]
    );
    return result.affectedRows > 0;
  }

  // Active suppliers with their account summary (balance, overdue, last movement)
  static async getBalances({ search } = {}) {
    const db = getDatabase();
    let query = `
      SELECT id, name, contact_person, phone, city, payment_terms
      FROM suppliers
      WHERE is_active = 1
    `;
    const params = [];
    if (search) {
      query += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR city LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    query += ' ORDER BY name ASC';
    const suppliers = await db.all(query, params);

    // Small shops: one pass over all movements is cheaper than N queries
    const rows = await db.all(
      `SELECT id, supplier_id, type, amount,
              DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date,
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
       FROM supplier_transactions
       ORDER BY transaction_date ASC, id ASC`
    );
    const bySupplier = new Map();
    for (const row of rows) {
      const key = Number(row.supplier_id);
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key).push(row);
    }

    const today = localToday();
    const list = suppliers.map((supplier) => ({
      ...supplier,
      ...summarizeEntries(bySupplier.get(Number(supplier.id)) || [], today).summary
    }));

    const totals = list.reduce(
      (acc, s) => {
        acc.totalPurchases += s.totalPurchases;
        acc.totalPayments += s.totalPayments;
        acc.totalReturns += s.totalReturns;
        acc.overdueAmount += s.overdueAmount;
        if (s.balance > 0) {
          acc.totalOwed += s.balance;
          acc.suppliersWithBalance += 1;
        } else if (s.balance < 0) {
          acc.totalCredit += -s.balance;
        }
        if (s.overdueAmount > 0) acc.suppliersOverdue += 1;
        return acc;
      },
      {
        totalPurchases: 0, totalPayments: 0, totalReturns: 0, totalOwed: 0,
        totalCredit: 0, overdueAmount: 0, suppliersWithBalance: 0, suppliersOverdue: 0
      }
    );
    for (const key of ['totalPurchases', 'totalPayments', 'totalReturns', 'totalOwed', 'totalCredit', 'overdueAmount']) {
      totals[key] = round2(totals[key]);
    }

    return { suppliers: list, totals };
  }
}

export default SupplierLedger;
