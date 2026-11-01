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

const router = express.Router();

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

export default router;
