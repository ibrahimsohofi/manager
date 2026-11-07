import { getDatabase, pool } from '../config/database.js';
import { buildTimeline, localToday, summarizeEntries, totalsFor } from '../utils/personalLedger.js';

const CONTACT_COLUMNS = `
  id, name, phone, relation, notes, archived, created_at, updated_at
`;

// Dates formatted in SQL so the API always returns plain YYYY-MM-DD strings
const ENTRY_COLUMNS = `
  id, contact_id, direction, kind, amount, description, notes,
  DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date,
  DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
  to_return, settled,
  DATE_FORMAT(settled_date, '%Y-%m-%d') AS settled_date,
  created_at, updated_at
`;

const normalizeContact = (row) =>
  row ? { ...row, id: Number(row.id), archived: Boolean(Number(row.archived)) } : null;

class PersonalLedger {
  // ==================== Contacts ====================

  /**
   * Contacts with their account summary.
   * @param {object} opts - { search, archived: "active" | "archived" | "all" }
   */
  static async listContacts({ search, archived = 'active' } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (archived === 'active') where.push('archived = 0');
    else if (archived === 'archived') where.push('archived = 1');
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR relation LIKE ? OR notes LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    const contacts = await db.all(
      `SELECT ${CONTACT_COLUMNS} FROM ledger_contacts
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY name ASC`,
      params
    );

    // Small volumes: one pass over all entries is cheaper than one query per person
    const rows = await db.all(`SELECT ${ENTRY_COLUMNS} FROM ledger_entries`);
    const byContact = new Map();
    for (const row of rows) {
      const key = Number(row.contact_id);
      if (!byContact.has(key)) byContact.set(key, []);
      byContact.get(key).push(row);
    }

    const today = localToday();
    const list = contacts.map((row) => {
      const contact = normalizeContact(row);
      return { ...contact, ...summarizeEntries(byContact.get(contact.id) || [], today).summary };
    });

    // Totals always computed on active people (archived ones are closed accounts)
    const totals = totalsFor(list.filter((c) => !c.archived));
    return { contacts: list, totals };
  }

  static async getContact(id) {
    const db = getDatabase();
    const row = await db.get(`SELECT ${CONTACT_COLUMNS} FROM ledger_contacts WHERE id = ?`, [id]);
    return normalizeContact(row);
  }

  static async createContact(data) {
    const db = getDatabase();
    const result = await db.run(
      'INSERT INTO ledger_contacts (name, phone, relation, notes) VALUES (?, ?, ?, ?)',
      [data.name, data.phone ?? null, data.relation ?? null, data.notes ?? null]
    );
    return PersonalLedger.getContact(result.insertId);
  }

  static async updateContact(id, data) {
    const db = getDatabase();
    const fields = [];
    const params = [];
    for (const key of ['name', 'phone', 'relation', 'notes', 'archived']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === 'archived' ? (data[key] ? 1 : 0) : data[key]);
      }
    }
    if (fields.length) {
      await db.run(
        `UPDATE ledger_contacts SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...params, id]
      );
    }
    return PersonalLedger.getContact(id);
  }

  static async deleteContact(id) {
    const db = getDatabase();
    // Entries are removed by ON DELETE CASCADE; explicit delete keeps FK-less tables clean too
    await db.run('DELETE FROM ledger_entries WHERE contact_id = ?', [id]);
    const result = await db.run('DELETE FROM ledger_contacts WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // ==================== Entries ====================

  static async getEntries(contactId) {
    const db = getDatabase();
    return db.all(
      `SELECT ${ENTRY_COLUMNS} FROM ledger_entries
       WHERE contact_id = ?
       ORDER BY entry_date ASC, id ASC`,
      [contactId]
    );
  }

  /** Contact + summary + full timeline with running balance. */
  static async getAccount(contactId) {
    const contact = await PersonalLedger.getContact(contactId);
    if (!contact) return null;
    const rows = await PersonalLedger.getEntries(contactId);
    return { contact, ...buildTimeline(rows, localToday()) };
  }

  static async getEntry(id, contactId) {
    const db = getDatabase();
    return db.get(
      `SELECT ${ENTRY_COLUMNS} FROM ledger_entries WHERE id = ? AND contact_id = ?`,
      [id, contactId]
    );
  }

  static async createEntry(contactId, data) {
    const db = getDatabase();
    const result = await db.run(
      `INSERT INTO ledger_entries
         (contact_id, direction, kind, amount, description, notes, entry_date,
          due_date, to_return, settled, settled_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contactId, data.direction, data.kind, data.amount, data.description, data.notes,
        data.entry_date, data.due_date, data.to_return ? 1 : 0, data.settled ? 1 : 0,
        data.settled_date
      ]
    );
    await PersonalLedger.touchContact(contactId);
    return PersonalLedger.getEntry(result.insertId, contactId);
  }

  static async updateEntry(id, contactId, data) {
    const db = getDatabase();
    const result = await db.run(
      `UPDATE ledger_entries
       SET direction = ?, kind = ?, amount = ?, description = ?, notes = ?, entry_date = ?,
           due_date = ?, to_return = ?, settled = ?, settled_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND contact_id = ?`,
      [
        data.direction, data.kind, data.amount, data.description, data.notes, data.entry_date,
        data.due_date, data.to_return ? 1 : 0, data.settled ? 1 : 0, data.settled_date,
        id, contactId
      ]
    );
    if (result.affectedRows === 0) return null;
    await PersonalLedger.touchContact(contactId);
    return PersonalLedger.getEntry(id, contactId);
  }

  /** Object loans: mark returned / not returned. */
  static async setReturned(id, contactId, returned, date) {
    const db = getDatabase();
    const result = await db.run(
      `UPDATE ledger_entries
       SET settled = ?, settled_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND contact_id = ? AND to_return = 1`,
      [returned ? 1 : 0, returned ? date : null, id, contactId]
    );
    if (result.affectedRows === 0) return null;
    return PersonalLedger.getEntry(id, contactId);
  }

  static async deleteEntry(id, contactId) {
    const db = getDatabase();
    const result = await db.run(
      'DELETE FROM ledger_entries WHERE id = ? AND contact_id = ?',
      [id, contactId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Settle the account: one money entry in the opposite direction of the balance.
   * Runs in a transaction with a row lock so two clicks cannot settle twice.
   */
  static async settle(contactId, { entry_date, description }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM ledger_contacts WHERE id = ? FOR UPDATE', [contactId]);
      const [rows] = await connection.execute(
        `SELECT ${ENTRY_COLUMNS} FROM ledger_entries WHERE contact_id = ?`,
        [contactId]
      );
      const { summary } = summarizeEntries(rows, localToday());
      if (summary.balance === 0) {
        await connection.rollback();
        return { settled: false, balance: 0 };
      }
      // They owe me -> I received the money; I owe them -> I gave the money
      const direction = summary.balance > 0 ? 'received' : 'gave';
      const amount = Math.abs(summary.balance);
      const [result] = await connection.execute(
        `INSERT INTO ledger_entries
           (contact_id, direction, kind, amount, description, entry_date)
         VALUES (?, ?, 'money', ?, ?, ?)`,
        [contactId, direction, amount, description, entry_date]
      );
      await connection.execute(
        'UPDATE ledger_contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [contactId]
      );
      await connection.commit();
      const entry = await PersonalLedger.getEntry(result.insertId, contactId);
      return { settled: true, balance: summary.balance, entry };
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  static async touchContact(contactId) {
    const db = getDatabase();
    await db.run('UPDATE ledger_contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [contactId]);
  }
}

export default PersonalLedger;
