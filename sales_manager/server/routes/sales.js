import express from 'express';
import {
  getAllSales,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
  getSalesStats,
  getCategories,
  getAggregatedSales,
  checkoutSale
} from '../controllers/salesController.js';
import { getDatabase } from '../config/database.js';

const router = express.Router();

// Get all sales
router.get('/', getAllSales);

// Get sales statistics (must come before /:id route)
router.get('/stats', getSalesStats);

// Get aggregated sales
router.get('/aggregated', getAggregatedSales);

// Get categories
router.get('/categories', getCategories);

// Get sale by ID
router.get('/:id', getSaleById);

// QR checkout: create a multi-line ticket in one call
router.post('/checkout', checkoutSale);

// Create new sale
router.post('/', createSale);

// Update sale
router.put('/:id', updateSale);

// Delete sale
router.delete('/:id', deleteSale);

// Clear ALL sales data (for development/cleanup)
router.delete('/admin/clear-all', async (req, res) => {
  try {
    const db = getDatabase();

    // Clear all sales data
    await db.execute('DELETE FROM sales');
    await db.execute('ALTER TABLE sales AUTO_INCREMENT = 1');

    console.log('🗑️ All sales data cleared');
    res.json({ message: 'All sales data cleared successfully', count: 0 });
  } catch (error) {
    console.error('Error clearing sales data:', error);
    res.status(500).json({ error: 'Failed to clear sales data' });
  }
});

export default router;
