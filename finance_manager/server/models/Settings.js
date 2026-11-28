// Settings of the finance app (FINANCE_PLAN.md §5.5), key / value rows in `app_settings`.
// The PIN hash never leaves this model through `public()`: callers only see `pin_set`.
import { DEFAULT_MARGIN_PCT, cleanSettingsInput, round2 } from '../utils/finance.js';

export const SETTING_KEYS = Object.freeze({
  margin: 'finance.default_margin_pct',
  pin: 'finance.pin_hash',
});

export const marginFrom = (raw) => {
  if (raw === null || raw === undefined || String(raw).trim() === '') return DEFAULT_MARGIN_PCT;
  const n = Number(raw);
  return Number.isFinite(n) ? round2(n) : DEFAULT_MARGIN_PCT;
};

export const createSettingsModel = ({ getPool }) => {
  const read = async (name) => {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT value FROM app_settings WHERE name = ?', [name]);
    return rows[0]?.value ?? null;
  };
  const write = async (name, value) => {
    const pool = await getPool();
    await pool.query(
      'INSERT INTO app_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [name, value]
    );
  };

  const model = {
    async getMargin() {
      return marginFrom(await read(SETTING_KEYS.margin));
    },

    async getPinHash() {
      const value = await read(SETTING_KEYS.pin);
      return value ? String(value) : null;
    },

    /** Sets the first PIN. Returns false when a PIN already exists (two tabs setting it at once). */
    async setPinHashIfEmpty(hash) {
      const pool = await getPool();
      const [inserted] = await pool.query('INSERT IGNORE INTO app_settings (name, value) VALUES (?, ?)', [
        SETTING_KEYS.pin,
        hash,
      ]);
      if (Number(inserted.affectedRows) > 0) return true;
      const [updated] = await pool.query(
        "UPDATE app_settings SET value = ? WHERE name = ? AND (value IS NULL OR value = '')",
        [hash, SETTING_KEYS.pin]
      );
      return Number(updated.affectedRows) > 0;
    },

    async setPinHash(hash) {
      await write(SETTING_KEYS.pin, hash);
    },

    /** What the UI may see. */
    async public() {
      const [margin, pin] = await Promise.all([model.getMargin(), model.getPinHash()]);
      return { default_margin_pct: margin, pin_set: Boolean(pin) };
    },

    async update(body) {
      const input = cleanSettingsInput(body);
      if (input.default_margin_pct !== undefined) {
        await write(SETTING_KEYS.margin, String(input.default_margin_pct));
      }
      return model.public();
    },
  };
  return model;
};
