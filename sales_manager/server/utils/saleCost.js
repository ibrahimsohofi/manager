// Cost of a sale line, frozen at checkout (FINANCE_PLAN.md §5.3, Chunk 2).
// The products API returns the purchase price of the day as `sale.unit_cost` (POST /api/integration/sale).
// Pure functions, no database: unit-testable.

const NO_COST = Object.freeze({ unit_cost: null, cost_source: null });

/**
 * A positive amount rounded to cents, otherwise null.
 * null = unknown cost: the finance reports estimate the line with the default margin and list it.
 * 0 is treated as unknown too (the catalogue's "not entered" default), never as a free item.
 */
export const parseUnitCost = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const cost = Number(value);
  return Number.isFinite(cost) && cost > 0 ? Math.round(cost * 100) / 100 : null;
};

/**
 * `{ unit_cost, cost_source }` for Sale.create, from the products API response.
 * An older products API (no `unit_cost` in its reply) gives a NULL cost: the sale is saved normally
 * and the backfill script (Chunk 3) can fill it later.
 */
export const costFromIntegration = (integrationData) => {
  const unitCost = parseUnitCost(integrationData?.sale?.unit_cost);
  return unitCost === null ? { ...NO_COST } : { unit_cost: unitCost, cost_source: 'sale' };
};

export const noCost = () => ({ ...NO_COST });
