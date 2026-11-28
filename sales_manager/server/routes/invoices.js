import express from "express";
import { getInvoiceByNumber, issueInvoice } from "../controllers/invoiceController.js";

const router = express.Router();

// Issue (or return) the invoice of a saved ticket: retry after a failed checkout issuance
router.post("/issue", issueInvoice);
// Full invoice for printing / reprint: FAC-2026-00001
router.get("/:number", getInvoiceByNumber);

export default router;
