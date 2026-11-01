import express from "express";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
  getCustomerPurchaseHistory,
  searchCustomers,
  getCustomerTypes,
  getTopCustomers,
  getInactiveCustomers,
  addCustomerPayment,
  getCustomerPayments,
  getCustomerTotalPaid,
  deleteCustomerPayment,
  addCustomerProduct,
  getCustomerProducts,
  getCustomerProductsTotal,
  updateCustomerProduct,
  deleteCustomerProduct
} from "../controllers/customerController.js";

const router = express.Router();

// Customer CRUD routes
router.get("/", getAllCustomers);
router.get("/search", searchCustomers);
router.get("/types", getCustomerTypes);
router.get("/top", getTopCustomers);
router.get("/inactive", getInactiveCustomers);
router.get("/:id", getCustomerById);
router.get("/:id/stats", getCustomerStats);
router.get("/:id/history", getCustomerPurchaseHistory);
router.post("/", createCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

// Customer payments routes
router.post("/:id/payments", addCustomerPayment);
router.get("/:id/payments", getCustomerPayments);
router.get("/:id/payments/total", getCustomerTotalPaid);
router.delete("/:id/payments/:paymentId", deleteCustomerPayment);

// Customer products routes
router.post("/:id/products", addCustomerProduct);
router.get("/:id/products", getCustomerProducts);
router.get("/:id/products/total", getCustomerProductsTotal);
router.put("/:id/products/:productId", updateCustomerProduct);
router.delete("/:id/products/:productId", deleteCustomerProduct);

export default router;
