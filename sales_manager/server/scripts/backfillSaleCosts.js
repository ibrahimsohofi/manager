// Sale cost backfill (FINANCE_PLAN.md §5.3 "Old sales", Chunk 3). Run from sales_manager/server:
//   node scripts/backfillSaleCosts.js                 dry run: report only, nothing is written
//   node scripts/backfillSaleCosts.js --apply         writes sales.unit_cost (cost_source = 'backfill')
//   node scripts/backfillSaleCosts.js --help          options (--from / --to / --verbose)
// Back up first:  mysqldump -u root -p bricojamal > bricojamal_backup.sql
//
// The rules (purchase price on the sale date, same-day rule, report) live in utils/backfillCost.js. This file
// only does the I/O around them:
//   1. reads the sale lines with `unit_cost IS NULL` (optionally in a --from / --to period)
//   2. asks the products API for each distinct product, once: current purchase_price + price history
//      (sales_manager never needs the products_manager database credentials, §5.3)
//   3. plans the costs, prints the report, and with --apply writes them in ONE transaction.
// Every product is fetched before anything is written: an API failure half-way leaves the database untouched.
// An UPDATE only touches lines whose cost is still NULL, so re-running the script changes nothing, and a cost
// stored at checkout is never overwritten. `updated_at` is kept as it was: a backfill is not an edit of the sale.
//
// Exit code 1 when MySQL or the products API can't be reached, or the write fails (rolled back).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/dbConfig.js';
import { ensureSaleCostColumns } from '../config/saleCostSchema.js';
import {
  coverage,
  formatInt,
  formatMoney,
  formatReport,
  groupUpdates,
  parseArgs,
  planBackfill,
  purchaseChanges,
  USAGE,
} from '../utils/backfillCost.js';
import { parseUnitCost } from '../utils/saleCost.js';

const DEFAULT_PRODUCTS_API_URL = 'http://localhost:5000';
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 6;
const MIRROR_HINT =
  "lancez l'API products_manager (products_manager/backend, port 5000) : le miroir dev:products de sales_manager n'a pas l'historique des prix.";

/** Products API failure (unreachable, wrong URL, no price history). Nothing has been written when it is thrown. */
export class ProductsApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProductsApiError';
  }
}

// ---------- Products API ----------

/**
 * Minimal client of the products_manager API.
 * `getProduct(id)` -> `{ found: false }` (deleted product) or `{ found: true, name, purchase_price, history }`.
 * A 404 only means "product not found" when the API answers it in JSON: an HTML 404 is a missing route
 * (wrong PRODUCTS_API_URL, or the dev:products mirror for the price history) and stops the run.
 * @param {{baseUrl: string, fetchImpl?: typeof fetch, timeoutMs?: number}} options
 */
export const createProductsClient = ({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS }) => {
  const root = String(baseUrl).replace(/\/+$/, '');

  const getJson = async (route) => {
    let response;
    try {
      response = await fetchImpl(`${root}${route}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `pas de réponse en ${timeoutMs / 1000} s` : (error?.cause?.code ?? error?.message);
      throw new ProductsApiError(`API produits injoignable (${root}) : ${reason}`);
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null; // HTML error page (missing route) or empty body
    }
    return { status: response.status, ok: response.ok, body };
  };

  const httpError = (route, reply) =>
    `GET ${route} : HTTP ${reply.status}${reply.body?.error ? ` (${reply.body.error})` : ''}`;

  return {
    baseUrl: root,
    async getProduct(id) {
      const productRoute = `/api/products/${id}`;
      const product = await getJson(productRoute);
      if (product.status === 404 && product.body) return { found: false };
      if (product.status === 404) {
        throw new ProductsApiError(`${httpError(productRoute, product)} sans réponse JSON : vérifiez PRODUCTS_API_URL (${root}).`);
      }
      if (!product.ok || !product.body) throw new ProductsApiError(httpError(productRoute, product));
      const data = product.body.product ?? product.body;

      const historyRoute = `/api/products/${id}/price-history`;
      const history = await getJson(historyRoute);
      // Deleted between the two calls
      if (history.status === 404 && history.body && !history.body.price_history) return { found: false };
      if (!history.ok || !Array.isArray(history.body?.price_history)) {
        const what = history.ok ? "réponse sans 'price_history'" : httpError(historyRoute, history);
        throw new ProductsApiError(`GET ${historyRoute} : ${what}. Pas d'historique des prix : ${MIRROR_HINT}`);
      }
      return {
        found: true,
        name: data.name ?? null,
        purchase_price: data.purchase_price,
        history: history.body.price_history,
      };
    },
  };
};

/** Runs `fn` on every item, at most `limit` at a time. Stops starting new items after the first failure. */
const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};

// ---------- Database (`db` = mysql2/promise connection: query, execute, beginTransaction, commit, rollback) ----------

const SALE_COLUMNS_SQL = `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME IN ('unit_cost', 'cost_source', 'updated_at')`;

/** Which optional `sales` columns exist: the cost pair (§5.2) and `updated_at` (kept unchanged by the UPDATE). */
export const readSaleColumns = async (db) => {
  const [rows] = await db.query(SALE_COLUMNS_SQL);
  const names = new Set(rows.map((row) => row.name ?? row.COLUMN_NAME));
  return { hasCost: names.has('unit_cost') && names.has('cost_source'), hasUpdatedAt: names.has('updated_at') };
};

/** `date >= ? AND date <= ?` for the --from / --to period (both inclusive), params in that order. */
const periodFilter = ({ from, to }) => {
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push('date >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('date <= ?');
    params.push(to);
  }
  return { clauses, params };
};

const whereOf = (clauses) => (clauses.length ? `WHERE ${clauses.join(' AND ')}` : '');

/** Revenue of the period, and the part of it that already has a cost (coverage "before"). */
const readRevenue = async (db, period, hasCost) => {
  const { clauses, params } = periodFilter(period);
  const known = hasCost ? 'COALESCE(SUM(CASE WHEN unit_cost IS NOT NULL THEN totalPrice ELSE 0 END), 0)' : '0';
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(totalPrice), 0) AS total, ${known} AS known FROM sales ${whereOf(clauses)}`,
    params
  );
  return { total: rows[0]?.total ?? 0, known: rows[0]?.known ?? 0 };
};

/** Sale lines without a cost. Before the columns exist, every line counts as "without a cost". */
const readLinesWithoutCost = async (db, period, hasCost) => {
  const { clauses, params } = periodFilter(period);
  const where = hasCost ? ['unit_cost IS NULL', ...clauses] : clauses;
  const [rows] = await db.query(
    `SELECT id, date, product_id, totalPrice FROM sales ${whereOf(where)} ORDER BY id`,
    params
  );
  return rows;
};

/** Writes the planned costs in one transaction. Returns the number of lines actually updated. */
const writeCosts = async (db, updates, { hasUpdatedAt }) => {
  const keepUpdatedAt = hasUpdatedAt ? ', updated_at = updated_at' : '';
  let updated = 0;
  await db.beginTransaction();
  try {
    for (const group of groupUpdates(updates)) {
      const [result] = await db.query(
        `UPDATE sales SET unit_cost = ?, cost_source = 'backfill'${keepUpdatedAt}
         WHERE unit_cost IS NULL AND id IN (${group.ids.map(() => '?').join(', ')})`,
        [group.unit_cost, ...group.ids]
      );
      updated += Number(result?.affectedRows) || 0;
    }
    await db.commit();
    return updated;
  } catch (error) {
    await db.rollback().catch(() => {});
    throw error;
  }
};

// ---------- Run ----------

const validProductId = (value) => {
  if (value === null || value === undefined) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** `--verbose`: the cost kept for each product, and how many lines get it. */
const formatProductDetails = (lines, products, updates) => {
  const productOfLine = new Map(lines.map((line) => [line.id, validProductId(line.product_id)]));
  const costsByProduct = new Map();
  for (const { id, unit_cost: cost } of updates) {
    const productId = productOfLine.get(id);
    if (!costsByProduct.has(productId)) costsByProduct.set(productId, new Map());
    const counts = costsByProduct.get(productId);
    counts.set(cost, (counts.get(cost) ?? 0) + 1);
  }
  const out = ['', 'Coût retenu par produit :'];
  for (const productId of [...costsByProduct.keys()].sort((a, b) => a - b)) {
    const product = products.get(productId);
    const current = parseUnitCost(product.purchase_price);
    const changes = purchaseChanges(product.history).length;
    const costs = [...costsByProduct.get(productId)]
      .sort(([a], [b]) => a - b)
      .map(([cost, count]) => `${formatMoney(cost)} x ${formatInt(count)}`)
      .join(', ');
    out.push(
      `  #${productId} ${product.name ?? ''} — prix d'achat actuel ${current === null ? '—' : formatMoney(current)}, ` +
        `${changes} changement(s) -> ${costs}`
    );
  }
  return out.join('\n');
};

/**
 * Whole backfill run on an open connection. Dry run unless `options.apply`.
 * @param {{db: object, products: {getProduct: (id: number) => Promise<object>}, options: object,
 *   logger?: Console, productsApiUrl?: string, concurrency?: number}} input
 * @returns {Promise<{stats: object, coverage: object, updated: number, columnsMissing: boolean, report: string}>}
 */
export const runBackfill = async ({
  db,
  products,
  options,
  logger = console,
  productsApiUrl,
  concurrency = DEFAULT_CONCURRENCY,
}) => {
  const period = { from: options.from ?? null, to: options.to ?? null };
  let columns = await readSaleColumns(db);

  // Same idempotent step as the API start (database.js). Only with --apply: a dry run never changes the schema.
  if (options.apply && !columns.hasCost) {
    logger.log('🔄 sales.unit_cost / cost_source manquent : ajout (comme au démarrage de l’API)...');
    await ensureSaleCostColumns(db, { logger });
    columns = await readSaleColumns(db);
    if (!columns.hasCost) throw new Error("Impossible d'ajouter sales.unit_cost / cost_source : rien n'a été écrit.");
  }
  const columnsMissing = !columns.hasCost;

  const revenue = await readRevenue(db, period, columns.hasCost);
  const lines = await readLinesWithoutCost(db, period, columns.hasCost);

  const productIds = [...new Set(lines.map((line) => validProductId(line.product_id)).filter((id) => id !== null))].sort(
    (a, b) => a - b
  );
  if (productIds.length > 0) {
    logger.log(`🔄 ${formatInt(lines.length)} ligne(s) sans coût, ${formatInt(productIds.length)} produit(s) à interroger...`);
  }
  const fetched = await mapLimit(productIds, concurrency, (id) => products.getProduct(id));
  const productMap = new Map(productIds.map((id, index) => [id, fetched[index]]));

  const { updates, stats } = planBackfill({ lines, products: productMap });
  const cover = coverage({ totalRevenue: revenue.total, knownRevenue: revenue.known, filledRevenue: stats.filledRevenue });

  if (options.verbose && updates.length > 0) logger.log(formatProductDetails(lines, productMap, updates));

  let updated = 0;
  if (options.apply && updates.length > 0) {
    updated = await writeCosts(db, updates, columns);
  }

  const report = formatReport({
    stats,
    coverage: cover,
    apply: Boolean(options.apply),
    updated,
    from: period.from,
    to: period.to,
    productsApiUrl,
    columnsMissing,
  });
  logger.log(report);
  return { stats, coverage: cover, updated, columnsMissing, report };
};

// ---------- Command line ----------

const main = async (argv) => {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`❌ ${error.message}\n\n${USAGE}`);
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const productsApiUrl = (process.env.PRODUCTS_API_URL || DEFAULT_PRODUCTS_API_URL).replace(/\/+$/, '');
  const target = `${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`;
  if (options.apply) {
    console.log(`Sauvegarde conseillée avant : mysqldump -u ${dbConfig.user} -p ${dbConfig.database} > ${dbConfig.database}_backup.sql`);
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: Number(dbConfig.port) || 3306,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      charset: dbConfig.charset,
      // sales.date as 'YYYY-MM-DD': no time zone shift between MySQL and the price history days
      dateStrings: ['DATE'],
      connectTimeout: 5000,
    });
  } catch (error) {
    // mysql2 can throw an error with an empty message (ECONNREFUSED on `localhost`, AggregateError)
    const reason =
      error.message ||
      error.errors?.map((inner) => inner.message).find(Boolean) ||
      (error.code === 'ECONNREFUSED' ? "rien n'écoute : MySQL n'est pas démarré ou pas joignable" : 'connexion impossible');
    console.error(`❌ MySQL : ${error.code ? `${error.code}: ` : ''}${reason} (${target})`);
    console.error('💡 Vérifiez que MySQL tourne et les réglages DB_* du .env');
    return 1;
  }

  try {
    await runBackfill({
      db: connection,
      products: createProductsClient({ baseUrl: productsApiUrl }),
      options,
      productsApiUrl,
    });
    return 0;
  } catch (error) {
    console.error(`❌ ${error.code ? `${error.code}: ` : ''}${error.message}`);
    console.error("Rien n'a été écrit (les coûts ne sont enregistrés qu'à la fin, en une seule transaction).");
    return 1;
  } finally {
    await connection.end().catch(() => {});
  }
};

// Run only as a command (`node scripts/backfillSaleCosts.js`), not when imported by the tests.
const isCommand = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCommand) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
