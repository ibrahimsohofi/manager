import express from 'express';
import cors from 'cors';
import salesRoutes from './routes/sales.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import integrationRoutes from './routes/integration.js';
import wishlistRoutes from './routes/wishlist.js';
import { errorHandler } from './middleware/errorHandler.js';
import outofstockRoutes from './routes/outofstock.js';



const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Allow all origins for development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/sales', salesRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api', wishlistRoutes);
app.use('/api/outofstock',outofstockRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
