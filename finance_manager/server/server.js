// finance_manager API (port 3002) on MySQL: own database `finance_manager` + read-only `bricojamal`.
import { createApp } from './app.js';
import { createFinanceDatabase } from './config/database.js';
import { ConfigError, config, configSummary } from './config/env.js';
import { createSalesDatabase } from './config/salesDatabase.js';
import { createExpenseModel } from './models/Expense.js';
import { createCategoryModel } from './models/ExpenseCategory.js';
import { createFinanceModel } from './models/Finance.js';
import { createSalesSource } from './models/SalesSource.js';
import { createSettingsModel } from './models/Settings.js';
import { createStockSource } from './models/StockSource.js';
import { createAttemptLimiter, createSessionStore } from './utils/sessions.js';

let cfg;
try {
  cfg = config();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`❌ ${error.message}`);
    console.error('💡 Fix finance_manager/server/.env (or run `bun run setup-env`).');
    process.exit(1);
  }
  throw error;
}

const financeDb = createFinanceDatabase(cfg.financeDb);
const salesDb = createSalesDatabase(cfg.salesDb);

const categories = createCategoryModel({ getPool: financeDb.getPool });
const expenses = createExpenseModel({ getPool: financeDb.getPool, categories });
const settings = createSettingsModel({ getPool: financeDb.getPool });
const sales = createSalesSource({ getPool: salesDb.getPool });
const finance = createFinanceModel({ sales, expenses, categories, settings, salesAppUrl: cfg.salesAppUrl });
// Stock values + money spent on purchases: read from products_manager over HTTP (FINANCE_PLAN.md §8.1).
const stock = createStockSource({ baseUrl: cfg.productsApiUrl });
const app = createApp({
  config: cfg,
  models: { expenses, categories, settings, sales, finance, stock },
  sessions: createSessionStore({ idleMinutes: cfg.session.idleMinutes }),
  limiter: createAttemptLimiter(),
  health: { financeDb: financeDb.ping, mode: 'mysql' },
});

const server = app.listen(cfg.server.port, cfg.server.host, () => {
  console.log('💰 finance_manager API');
  for (const line of configSummary(cfg)) console.log(`   ${line}`);
  for (const warning of cfg.warnings) console.warn(`⚠️  ${warning}`);
});

// Never blocks the start: the API answers 503 on finance routes until MySQL is reachable.
financeDb.init();
sales.status().then((state) => {
  if (state.available) console.log(`✅ Sales database readable (unit_cost ${state.has_unit_cost ? 'present' : 'missing'})`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received, closing the finance API`);
  server.close();
  await Promise.all([financeDb.close(), salesDb.close()]);
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
