import express from 'express';
import {
  getCustomerWishlist,
  getWishlistItem,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  getWishlistStats,
  convertWishlistToSale
} from '../controllers/wishlistController.js';

const router = express.Router();

// Customer wishlist routes
router.get('/customers/:customerId/wishlist', getCustomerWishlist);
router.get('/customers/:customerId/wishlist/stats', getWishlistStats);
router.post('/customers/:customerId/wishlist', addWishlistItem);
router.post('/customers/:customerId/wishlist/convert', convertWishlistToSale);

// Individual wishlist item routes
router.get('/wishlist/:id', getWishlistItem);
router.put('/wishlist/:id', updateWishlistItem);
router.delete('/wishlist/:id', deleteWishlistItem);

export default router;
