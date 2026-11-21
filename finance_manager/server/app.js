// Express app of the finance API. The real server (server.js, MySQL models) and the mock server
// (mock/server.js, in-memory models) only differ by the models they pass here.
import cors from 'cors';
import express from 'express';
import { asyncHandler, corsOptions, errorHandler, noStore, notFound, requireSession } from './middleware/http.js';
import { expensesRouter, financeRouter, settingsRouter } from './routes/api.js';
import { sessionRouter } from './routes/session.js';

/**
 * @param {{config: object, models: {expenses, categories, settings, sales, finance}, sessions: object,
 *   limiter: object, health?: {financeDb?: () => Promise<boolean>, mode?: string}, logger?: Console}} deps
 */
export const createApp = ({ config, models, sessions, limiter, health = {}, logger = console }) => {
  const { expenses, categories, settings, finance } = models;
  const app = express();
  app.disable('x-powered-by');
  // The Vite proxy runs on the same machine: trust it for req.ip (PIN attempt limiter).
  app.set('trust proxy', 'loopback');
  app.use(cors(corsOptions(config.corsOrigins)));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', noStore);

  // No session needed: lets the UI tell "API down" from "locked".
  app.get(
    '/api/health',
    asyncHandler(async (req, res) => {
      const [financeDb, sales] = await Promise.all([
        health.financeDb ? health.financeDb() : Promise.resolve(true),
        finance.salesStatus().catch(() => ({ available: false })),
      ]);
      res.json({
        status: financeDb ? 'ok' : 'degraded',
        mode: health.mode ?? 'mysql',
        finance_db: financeDb,
        sales_db: Boolean(sales.available),
        time: new Date().toISOString(),
      });
    })
  );

  app.use('/api/session', sessionRouter({ settings, sessions, limiter }));

  // Everything below needs the PIN.
  app.use('/api', requireSession(sessions));
  app.use('/api/settings', settingsRouter({ settings, sessions, salesAppUrl: config.salesAppUrl }));
  app.use('/api/expenses', expensesRouter({ expenses, categories }));
  app.use('/api/finance', financeRouter({ finance }));

  app.use('/api', notFound);
  app.use(errorHandler(logger));
  return app;
};
