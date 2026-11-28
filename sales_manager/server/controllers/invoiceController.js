// VIP "Pro Bill" invoices (VIP_INVOICE_PLAN.md). Issued automatically at checkout for VIP
// clients; these routes are for "Réessayer" (issuing failed at checkout) and reprints.
// errorHandler.js ignores err.status, so every handler sends its own status / errorCode.
import Invoice from '../models/Invoice.js';

const sendError = (res, error, fallbackMessage) => {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error(`${fallbackMessage}:`, error);
  res.status(status).json({
    error: status >= 500 ? fallbackMessage : error.message,
    ...(error?.errorCode ? { code: error.errorCode } : {}),
  });
};

// POST /api/invoices/issue { ticket_number } -> 200 { invoice, items, totals, created }
// Idempotent: a ticket that already has an invoice gets the same one back.
export const issueInvoice = async (req, res) => {
  try {
    const { ticket_number: ticketNumber } = req.body || {};
    const result = await Invoice.rebuildFromSales(ticketNumber);
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error, 'Invoice could not be issued');
  }
};

// GET /api/invoices/:number -> 200 { invoice, items, totals }
export const getInvoiceByNumber = async (req, res) => {
  try {
    const document = await Invoice.getByNumber(req.params.number);
    if (!document) {
      return res.status(404).json({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    }
    res.json(document);
  } catch (error) {
    sendError(res, error, 'Failed to fetch invoice');
  }
};
