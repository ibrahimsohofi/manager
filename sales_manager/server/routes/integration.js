import express from "express";
import { getAllProducts } from "../controllers/productController.js";

const router = express.Router();

// Integration endpoint for product search - used by wishlist and other features
// This endpoint supports both general product listing and search functionality
router.get("/products/search", async (req, res) => {
  try {
    // Normalize search parameter - support both 'search' and 'q'
    if (req.query.search && !req.query.q) {
      req.query.q = req.query.search;
    }

    // Use getAllProducts which supports search, category filtering, and more
    await getAllProducts(req, res);
  } catch (error) {
    console.error("Error in integration product search:", error);
    res.status(500).json({ error: "Failed to search products" });
  }
});

export default router;
