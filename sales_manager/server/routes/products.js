import express from "express";
import {
  getAllProducts,
  getProductById,
  getProductBySku,
  getProductByBarcode,
  createProduct,
  updateProduct,
  updateProductStock,
  deleteProduct,
  getLowStockProducts,
  getProductCategories,
  getInventoryStats,
  searchProducts,
  getProductPriceHistory,
  getAllPriceHistory
} from "../controllers/productController.js";

const router = express.Router();

// Product CRUD routes
router.get("/", getAllProducts);
router.get("/search", searchProducts);
router.get("/categories", getProductCategories);
router.get("/stats", getInventoryStats);
router.get("/low-stock", getLowStockProducts);
router.get("/price-history", getAllPriceHistory);
router.get("/sku/:sku", getProductBySku);
router.get("/barcode/:barcode", getProductByBarcode);
router.get("/:id", getProductById);
router.get("/:id/price-history", getProductPriceHistory);
router.post("/", createProduct);
router.put("/:id", updateProduct);
router.put("/:id/stock", updateProductStock);
router.delete("/:id", deleteProduct);

export default router;
