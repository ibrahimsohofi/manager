import Supplier from '../models/Supplier.js';
import SupplierLedger from '../models/SupplierLedger.js';
import {
  LEDGER_TYPES,
  buildLedger,
  isValidDate,
  localToday,
  validateLedgerInput
} from '../utils/supplierLedger.js';

const parseId = (value) => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET /api/suppliers/ledger/balances?search=
export const getLedgerBalances = async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const data = await SupplierLedger.getBalances({ search: search || undefined });
    res.json(data);
  } catch (error) {
    console.error('Error getting supplier balances:', error);
    res.status(500).json({ error: 'Failed to fetch supplier balances' });
  }
};

// GET /api/suppliers/:id/ledger?from=&to=&type=&search=
export const getSupplierLedger = async (req, res) => {
  try {
    const supplierId = parseId(req.params.id);
    if (!supplierId) return res.status(400).json({ error: 'Invalid supplier id' });

    const supplier = await Supplier.getById(supplierId);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const { from, to, type, search } = req.query;
    if (from && !isValidDate(from)) return res.status(400).json({ error: 'Invalid "from" date' });
    if (to && !isValidDate(to)) return res.status(400).json({ error: 'Invalid "to" date' });
    if (type && !LEDGER_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const rows = await SupplierLedger.getEntries(supplierId);
    const ledger = buildLedger(rows, { from, to, type, search, today: localToday() });
    res.json({ supplier, ...ledger });
  } catch (error) {
    console.error('Error getting supplier ledger:', error);
    res.status(500).json({ error: 'Failed to fetch supplier ledger' });
  }
};

// POST /api/suppliers/:id/ledger
export const createLedgerEntry = async (req, res) => {
  try {
    const supplierId = parseId(req.params.id);
    if (!supplierId) return res.status(400).json({ error: 'Invalid supplier id' });

    const supplier = await Supplier.getById(supplierId);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const { errors, data } = validateLedgerInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', '), errors });

    const entry = await SupplierLedger.create(supplierId, data);
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating supplier ledger entry:', error);
    res.status(500).json({ error: 'Failed to create ledger entry' });
  }
};

// PUT /api/suppliers/:id/ledger/:entryId
export const updateLedgerEntry = async (req, res) => {
  try {
    const supplierId = parseId(req.params.id);
    const entryId = parseId(req.params.entryId);
    if (!supplierId || !entryId) return res.status(400).json({ error: 'Invalid id' });

    const existing = await SupplierLedger.getEntry(entryId, supplierId);
    if (!existing) return res.status(404).json({ error: 'Ledger entry not found' });

    const { errors, data } = validateLedgerInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', '), errors });

    const entry = await SupplierLedger.update(entryId, supplierId, data);
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
    res.json(entry);
  } catch (error) {
    console.error('Error updating supplier ledger entry:', error);
    res.status(500).json({ error: 'Failed to update ledger entry' });
  }
};

// DELETE /api/suppliers/:id/ledger/:entryId
export const deleteLedgerEntry = async (req, res) => {
  try {
    const supplierId = parseId(req.params.id);
    const entryId = parseId(req.params.entryId);
    if (!supplierId || !entryId) return res.status(400).json({ error: 'Invalid id' });

    const deleted = await SupplierLedger.delete(entryId, supplierId);
    if (!deleted) return res.status(404).json({ error: 'Ledger entry not found' });
    res.json({ message: 'Ledger entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier ledger entry:', error);
    res.status(500).json({ error: 'Failed to delete ledger entry' });
  }
};
