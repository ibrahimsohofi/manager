// Shop details printed on the VIP invoice (name, subtitle, logo, address, phone, thank-you note).
// errorHandler.js ignores err.status, so every handler sends its own status / errorCode.
import Settings from '../models/Settings.js';

const sendError = (res, error, fallbackMessage) => {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error(`${fallbackMessage}:`, error);
  res.status(status).json({
    error: status >= 500 ? fallbackMessage : error.message,
    ...(error?.errorCode ? { code: error.errorCode } : {}),
  });
};

// GET /api/settings/invoice -> { store_name, store_subtitle, logo_url, store_address, store_phone, thank_you_note }
export const getInvoiceSettings = async (req, res) => {
  try {
    res.json(await Settings.getInvoiceSettings());
  } catch (error) {
    sendError(res, error, 'Failed to load invoice settings');
  }
};

// PUT /api/settings/invoice { ...any of the keys above } -> every setting after the save
export const saveInvoiceSettings = async (req, res) => {
  try {
    res.json(await Settings.saveInvoiceSettings(req.body));
  } catch (error) {
    sendError(res, error, 'Failed to save invoice settings');
  }
};
