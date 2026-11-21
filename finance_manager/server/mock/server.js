// finance_manager API without MySQL (FINANCE_PLAN.md §10 "mock API render"): `bun run dev:mock`.
// Same app (app.js), same routes and the same Finance model as server.js; only the models differ:
// in-memory finance tables + generated sales (mock/salesData.js). Nothing is persisted: a restart
// gives the same seeded data back and asks for the PIN again.
//
// Optional environment variables (on top of the usual .env settings: PORT, HOST, CORS_ORIGINS...):
//   MOCK_PIN=1234         PIN already set (otherwise the UI asks to create one)
//   MOCK_SALES_DOWN=1     the sales database is "unreachable" (tests the "Ventes indisponibles" state)
//   MOCK_EMPTY=1          no generated sales and no seeded expenses (empty-state screens)
//   MOCK_TODAY=2026-11-21 freezes "today" (screenshots, demos)
import { createApp } from '../app.js';
import { ConfigError, config, configSummary } from '../config/env.js';
import { hashPin, isValidPin } from '../utils/pin.js';
import { createAttemptLimiter, createSessionStore } from '../utils/sessions.js';
import { createMockModels } from './models.js';

let cfg;
try {
  cfg = config();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const env = process.env;
const frozenToday = env.MOCK_TODAY && /^\d{4}-\d{2}-\d{2}$/.test(env.MOCK_TODAY) ? env.MOCK_TODAY : null;

const started = Date.now();
const mock = await createMockModels({
  today: frozenToday ? () => frozenToday : undefined,
  empty: env.MOCK_EMPTY === '1',
  salesAvailable: env.MOCK_SALES_DOWN !== '1',
  salesAppUrl: cfg.salesAppUrl,
});

if (env.MOCK_PIN) {
  if (!isValidPin(env.MOCK_PIN)) {
    console.error('❌ MOCK_PIN must be 4 to 8 digits');
    process.exit(1);
  }
  await mock.models.settings.setPinHash(hashPin(env.MOCK_PIN));
}

const app = createApp({
  config: cfg,
  models: mock.models,
  sessions: createSessionStore({ idleMinutes: cfg.session.idleMinutes }),
  limiter: createAttemptLimiter(),
  health: { mode: 'mock' },
});

const server = app.listen(cfg.server.port, cfg.server.host, () => {
  console.log('💰 finance_manager API — MOCK (in memory, nothing is saved)');
  for (const line of configSummary(cfg).filter((l) => !l.startsWith('Finance DB') && !l.startsWith('Sales DB'))) {
    console.log(`   ${line}`);
  }
  console.log(
    `   Data        ${mock.stats.sales} sale lines (${mock.stats.from} → ${mock.stats.to}), ${mock.stats.expenses} expenses, ` +
      `today = ${mock.today()} (${Date.now() - started} ms)`
  );
  console.log(`   Sales DB    ${mock.salesAvailable ? 'available' : 'DOWN (MOCK_SALES_DOWN=1)'}`);
  console.log(`   PIN         ${env.MOCK_PIN ? 'preset from MOCK_PIN' : 'not set: the UI asks to create one'}`);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received, closing the mock finance API`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
