import express from "express";
import { getAllOutOfStock } from "../controllers/outofstockController.js";
const router = express.Router();
router.get("/",getAllOutOfStock)
export default router;