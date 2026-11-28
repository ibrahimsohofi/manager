import express from "express";
import { getInvoiceSettings, saveInvoiceSettings } from "../controllers/settingsController.js";

const router = express.Router();

// Shop details printed on the VIP invoice
router.get("/invoice", getInvoiceSettings);
router.put("/invoice", saveInvoiceSettings);

export default router;
