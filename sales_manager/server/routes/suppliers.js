import express from "express";
import {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierProducts,
  getSupplierStats,
  getSupplierPurchaseHistory,
  searchSuppliers,
  getTopSuppliers,
  getSuppliersWithPendingOrders,
  getSupplierProductCategories
} from "../controllers/supplierController.js";
import {
  getLedgerBalances,
  getSupplierLedger,
  createLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry
} from "../controllers/supplierLedgerController.js";

const router = express.Router();

// Supplier ledger overview (static path, must stay before "/:id")
router.get("/ledger/balances", getLedgerBalances);

// Supplier CRUD routes
router.get("/", getAllSuppliers);
router.get("/search", searchSuppliers);
router.get("/top", getTopSuppliers);
router.get("/pending-orders", getSuppliersWithPendingOrders);
router.get("/:id", getSupplierById);
router.get("/:id/products", getSupplierProducts);
router.get("/:id/stats", getSupplierStats);
router.get("/:id/history", getSupplierPurchaseHistory);
router.get("/:id/categories", getSupplierProductCategories);
router.post("/", createSupplier);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);

// Supplier ledger: purchases, payments, returns + running balance
router.get("/:id/ledger", getSupplierLedger);
router.post("/:id/ledger", createLedgerEntry);
router.put("/:id/ledger/:entryId", updateLedgerEntry);
router.delete("/:id/ledger/:entryId", deleteLedgerEntry);

export default router;
