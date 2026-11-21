import { getDatabase } from '../config/database.js';
import {
  cleanInvoiceSettings,
  defaultInvoiceSettings,
  httpError,
  INVOICE_SETTINGS_KEYS,
} from '../utils/invoice.js';

// Shop details printed on the VIP invoice, stored as key/value rows in app_settings
// ("invoice.store_name", "invoice.store_phone"...). The API uses the bare keys.
// A key never saved returns its default; a key saved empty stays empty (e.g. hides the phone line).
const PREFIX = 'invoice.';

class Settings {
  // { store_name, store_subtitle, logo_url, store_address, store_phone, thank_you_note }
  static async getInvoiceSettings() {
    const db = getDatabase();
    const rows = await db.all(
      `SELECT name, value FROM app_settings WHERE name IN (${INVOICE_SETTINGS_KEYS.map(() => '?').join(', ')})`,
      INVOICE_SETTINGS_KEYS.map((key) => `${PREFIX}${key}`)
    );
    const settings = defaultInvoiceSettings();
    for (const row of rows) {
      const key = String(row.name).slice(PREFIX.length);
      if (key in settings) settings[key] = row.value ?? '';
    }
    return settings;
  }

  // Partial update: only the known keys present in `values` are saved (trimmed, length-limited).
  // Returns every setting after the save.
  static async saveInvoiceSettings(values) {
    const cleaned = cleanInvoiceSettings(values);
    const entries = Object.entries(cleaned);
    if (entries.length === 0) {
      throw httpError(400, 'No invoice settings to save', 'NO_SETTINGS');
    }

    const db = getDatabase();
    // One statement: every key is saved, or none
    await db.run(
      `INSERT INTO app_settings (name, value)
       VALUES ${entries.map(() => '(?, ?)').join(', ')}
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      entries.flatMap(([key, value]) => [`${PREFIX}${key}`, value])
    );
    return Settings.getInvoiceSettings();
  }
}

export default Settings;
