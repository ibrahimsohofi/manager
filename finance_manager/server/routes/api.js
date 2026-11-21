// Routes behind the PIN session (FINANCE_PLAN.md §7). Only GET / POST / PUT / DELETE (§4 #10).
import { Router } from 'express';
import { asyncHandler } from '../middleware/http.js';
import { cleanExpenseFilters, parseId } from '../utils/finance.js';

/** GET / PUT /api/settings */
export const settingsRouter = ({ settings, sessions, salesAppUrl }) => {
  const router = Router();
  const view = async () => ({
    ...(await settings.public()),
    idle_minutes: sessions.idleMinutes,
    sales_app_url: salesAppUrl,
  });
  router.get(
    '/',
    asyncHandler(async (req, res) => res.json(await view()))
  );
  router.put(
    '/',
    asyncHandler(async (req, res) => {
      await settings.update(req.body ?? {});
      res.json(await view());
    })
  );
  return router;
};

/** /api/expenses, /api/expenses/categories, /api/expenses/pending */
export const expensesRouter = ({ expenses, categories }) => {
  const router = Router();

  // ---------- Categories (before /:id) ----------
  router.get(
    '/categories',
    asyncHandler(async (req, res) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      res.json({ rows: await categories.list({ includeArchived }) });
    })
  );
  router.post(
    '/categories',
    asyncHandler(async (req, res) => res.status(201).json(await categories.create(req.body ?? {})))
  );
  router.put(
    '/categories/:id',
    asyncHandler(async (req, res) => res.json(await categories.update(parseId(req.params.id), req.body ?? {})))
  );
  router.delete(
    '/categories/:id',
    asyncHandler(async (req, res) => res.json(await categories.remove(parseId(req.params.id))))
  );

  // ---------- Bills still to pay ----------
  router.get(
    '/pending',
    asyncHandler(async (req, res) => res.json(await expenses.pending({ limit: req.query.limit })))
  );

  // ---------- Expenses ----------
  router.get(
    '/',
    asyncHandler(async (req, res) => res.json(await expenses.list(cleanExpenseFilters(req.query))))
  );
  router.post(
    '/',
    asyncHandler(async (req, res) => res.status(201).json(await expenses.create(req.body ?? {})))
  );
  router.get(
    '/:id',
    asyncHandler(async (req, res) => res.json(await expenses.get(parseId(req.params.id))))
  );
  router.put(
    '/:id',
    asyncHandler(async (req, res) => res.json(await expenses.update(parseId(req.params.id), req.body ?? {})))
  );
  router.put(
    '/:id/pay',
    asyncHandler(async (req, res) => res.json(await expenses.pay(parseId(req.params.id), req.body ?? {})))
  );
  router.put(
    '/:id/restore',
    asyncHandler(async (req, res) => res.json(await expenses.restore(parseId(req.params.id))))
  );
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => res.json(await expenses.remove(parseId(req.params.id))))
  );
  return router;
};

/** /api/finance/* */
export const financeRouter = ({ finance }) => {
  const router = Router();
  router.get(
    '/sales-status',
    asyncHandler(async (req, res) => res.json(await finance.salesStatus({ refresh: req.query.refresh === '1' })))
  );
  router.get(
    '/summary',
    asyncHandler(async (req, res) => res.json(await finance.summary(req.query.period)))
  );
  router.get(
    '/monthly',
    asyncHandler(async (req, res) => res.json(await finance.monthly(req.query.year)))
  );
  router.get(
    '/yearly',
    asyncHandler(async (req, res) => res.json(await finance.yearly()))
  );
  router.get(
    '/daily',
    asyncHandler(async (req, res) => res.json(await finance.daily(req.query.period)))
  );
  router.get(
    '/expenses-by-category',
    asyncHandler(async (req, res) => res.json(await finance.expensesByCategory(req.query.period)))
  );
  router.get(
    '/unknown-cost-lines',
    asyncHandler(async (req, res) =>
      res.json(await finance.unknownCostLines(req.query.period, { page: req.query.page, limit: req.query.limit }))
    )
  );
  return router;
};
