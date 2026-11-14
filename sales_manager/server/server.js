import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import salesRoutes from './routes/sales.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import integrationRoutes from './routes/integration.js';
import wishlistRoutes from './routes/wishlist.js';
import { errorHandler } from './middleware/errorHandler.js';
import outofstockRoutes from './routes/outofstock.js';
import carnetRoutes from './routes/carnet.js';
import remoteScannerRoutes from './routes/remoteScanner.js';
import { startScannerHttps } from './utils/lanHttps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
// Personal ledger "Carnet" (people, money / goods / services given or received, notes)
app.use('/api/carnet', carnetRoutes);
// Phone as a wireless scanner (pairing, SSE streams, scans). See PHONE_SCANNER_PLAN.md
app.use('/api/remote-scanner', remoteScannerRoutes);

// Phone scanner page, opened on the phone at https://<laptop-ip>:3443/phone/
// Always revalidated so phones pick up a new version without clearing their cache.
app.use('/phone', express.static(path.join(__dirname, 'phone'), {
  index: 'index.html',
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

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
  // Same `app` and same process: HTTP (laptop) and HTTPS (phones) share the scanner sessions.
  startScannerHttps(app);
});
