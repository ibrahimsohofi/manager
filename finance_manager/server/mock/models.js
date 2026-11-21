// Builds the full model set of the finance API in memory: the same object shape server.js passes to
// createApp(). Shared by mock/server.js and the tests, so both run exactly the same code.
import { createFinanceModel } from '../models/Finance.js';
import { todayISO } from '../utils/finance.js';
import {
  createMemoryCategoryModel,
  createMemoryExpenseModel,
  createMemorySettingsModel,
  createMemoryStore,
} from './memoryModels.js';
import { createMemorySalesSource, generateSales, seedExpenses } from './salesData.js';

export const MOCK_SALES_START = '2025-10-20';
export const MOCK_EXPENSES_START = '2025-10';

/**
 * @param {{today?: () => string, empty?: boolean, salesAvailable?: boolean, salesAppUrl?: string|null,
 *   salesSeed?: number, expenseSeed?: number}} options
 */
export const createMockModels = async ({
  today = todayISO,
  empty = false,
  salesAvailable = true,
  salesAppUrl = null,
  salesSeed = 2026,
  expenseSeed = 7,
} = {}) => {
  const day = today();
  const store = createMemoryStore({ today });
  const categories = createMemoryCategoryModel(store);
  const expenses = createMemoryExpenseModel(store, { categories });
  const settings = createMemorySettingsModel(store);

  const lines = empty ? [] : generateSales({ from: MOCK_SALES_START, to: day, seed: salesSeed });
  const sales = createMemorySalesSource(lines, { available: salesAvailable });
  if (!empty) await seedExpenses({ expenses, categories, today: day, startMonth: MOCK_EXPENSES_START, seed: expenseSeed });

  const finance = createFinanceModel({ sales, expenses, categories, settings, salesAppUrl, today });
  return {
    store,
    today,
    salesAvailable,
    models: { expenses, categories, settings, sales, finance },
    stats: {
      sales: lines.length,
      from: lines[0]?.date ?? '-',
      to: lines.at(-1)?.date ?? '-',
      expenses: store.expenses.length,
    },
  };
};
