// Personal ledger "Carnet": people + what was given / received, object loans and notes.
import PersonalLedger from '../models/PersonalLedger.js';
import {
  isValidDate,
  localToday,
  validateContactInput,
  validateEntryInput
} from '../utils/personalLedger.js';

const ARCHIVED_FILTERS = ['active', 'archived', 'all'];

const parseId = (value) => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const toBool = (value) => value === true || value === 1 || value === '1' || value === 'true';

const trimOrNull = (value, max) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

const badRequest = (res, errors) =>
  res.status(400).json({ error: errors.join(', '), errors });

// ==================== Contacts ====================

// GET /api/carnet/contacts?search=&archived=active|archived|all
export const listContacts = async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const archived = ARCHIVED_FILTERS.includes(req.query.archived) ? req.query.archived : 'active';
    const data = await PersonalLedger.listContacts({ search: search || undefined, archived });
    res.json(data);
  } catch (error) {
    console.error('Error listing carnet contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

// GET /api/carnet/contacts/:id -> { contact, summary, entries (with running balance) }
export const getContactAccount = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid contact id' });

    const account = await PersonalLedger.getAccount(id);
    if (!account) return res.status(404).json({ error: 'Contact not found' });
    res.json(account);
  } catch (error) {
    console.error('Error getting carnet account:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
};

// POST /api/carnet/contacts
export const createContact = async (req, res) => {
  try {
    const { errors, data } = validateContactInput(req.body);
    if (errors.length) return badRequest(res, errors);

    const contact = await PersonalLedger.createContact(data);
    res.status(201).json(contact);
  } catch (error) {
    console.error('Error creating carnet contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
};

// PUT /api/carnet/contacts/:id (partial update, also used to archive / restore)
export const updateContact = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid contact id' });

    const existing = await PersonalLedger.getContact(id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    const { errors, data } = validateContactInput(req.body, { partial: true });
    if (errors.length) return badRequest(res, errors);

    const contact = await PersonalLedger.updateContact(id, data);
    res.json(contact);
  } catch (error) {
    console.error('Error updating carnet contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

// DELETE /api/carnet/contacts/:id (removes the person and the whole history)
export const deleteContact = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid contact id' });

    const deleted = await PersonalLedger.deleteContact(id);
    if (!deleted) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting carnet contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

// ==================== Entries ====================

// POST /api/carnet/contacts/:id/entries
export const createEntry = async (req, res) => {
  try {
    const contactId = parseId(req.params.id);
    if (!contactId) return res.status(400).json({ error: 'Invalid contact id' });

    const contact = await PersonalLedger.getContact(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { errors, data } = validateEntryInput(req.body, localToday());
    if (errors.length) return badRequest(res, errors);

    const entry = await PersonalLedger.createEntry(contactId, data);
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating carnet entry:', error);
    res.status(500).json({ error: 'Failed to create entry' });
  }
};

// PUT /api/carnet/contacts/:id/entries/:entryId
export const updateEntry = async (req, res) => {
  try {
    const contactId = parseId(req.params.id);
    const entryId = parseId(req.params.entryId);
    if (!contactId || !entryId) return res.status(400).json({ error: 'Invalid id' });

    const existing = await PersonalLedger.getEntry(entryId, contactId);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });

    const { errors, data } = validateEntryInput(req.body, localToday());
    if (errors.length) return badRequest(res, errors);

    const entry = await PersonalLedger.updateEntry(entryId, contactId, data);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (error) {
    console.error('Error updating carnet entry:', error);
    res.status(500).json({ error: 'Failed to update entry' });
  }
};

// PUT /api/carnet/contacts/:id/entries/:entryId/returned  { returned: boolean, date?: YYYY-MM-DD }
export const setEntryReturned = async (req, res) => {
  try {
    const contactId = parseId(req.params.id);
    const entryId = parseId(req.params.entryId);
    if (!contactId || !entryId) return res.status(400).json({ error: 'Invalid id' });

    const existing = await PersonalLedger.getEntry(entryId, contactId);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });
    if (!toBool(existing.to_return)) {
      return res.status(400).json({ error: 'Only items to return can be marked as returned' });
    }

    const returned = toBool(req.body?.returned);
    const date = req.body?.date;
    if (date && !isValidDate(date)) return res.status(400).json({ error: 'Invalid date' });

    const entry = await PersonalLedger.setReturned(entryId, contactId, returned, date || localToday());
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (error) {
    console.error('Error updating carnet item status:', error);
    res.status(500).json({ error: 'Failed to update item status' });
  }
};

// DELETE /api/carnet/contacts/:id/entries/:entryId
export const deleteEntry = async (req, res) => {
  try {
    const contactId = parseId(req.params.id);
    const entryId = parseId(req.params.entryId);
    if (!contactId || !entryId) return res.status(400).json({ error: 'Invalid id' });

    const deleted = await PersonalLedger.deleteEntry(entryId, contactId);
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting carnet entry:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
};

// POST /api/carnet/contacts/:id/settle  { entry_date?, description? }
// Records one money entry that brings the balance back to zero.
export const settleContact = async (req, res) => {
  try {
    const contactId = parseId(req.params.id);
    if (!contactId) return res.status(400).json({ error: 'Invalid contact id' });

    const contact = await PersonalLedger.getContact(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const entryDate = req.body?.entry_date || localToday();
    if (!isValidDate(entryDate)) return res.status(400).json({ error: 'Invalid date' });

    const result = await PersonalLedger.settle(contactId, {
      entry_date: entryDate,
      description: trimOrNull(req.body?.description, 500)
    });
    if (!result.settled) {
      return res.status(409).json({ error: 'Account is already settled', ...result });
    }
    res.status(201).json(result);
  } catch (error) {
    console.error('Error settling carnet account:', error);
    res.status(500).json({ error: 'Failed to settle account' });
  }
};
