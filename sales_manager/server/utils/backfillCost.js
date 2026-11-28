// Sale cost backfill, pure part (FINANCE_PLAN.md §5.3 "Old sales", Chunk 3).
// No database, no HTTP: scripts/backfillSaleCosts.js feeds it the sale lines and the products, so every rule
// below is unit-testable (tests/backfillSaleCosts.test.js).
//
// Rule (§5.3): the purchase price ON THE SALE DATE is the `old_price` of the first purchase-price change made
// after that date. No such change: the product's current `purchase_price`.
//
// Same-day rule: `sales.date` is a DATE (no time), so a sale is placed at the START of its day. A purchase-price
// change made on the sale day therefore counts as "after the sale": the line gets the price the day started with
// (that change's `old_price`). Days are compared as local calendar days ('YYYY-MM-DD') on the machine running the
// script, which in the shop is the same machine as the products API.
import { parseUnitCost } from './saleCost.js';

const pad2 = (n) => String(n).padStart(2, '0');
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// MySQL DATETIME / TIMESTAMP without a zone ('2026-03-01 10:00:00', or with dateStrings): already local time.
const NAIVE_RE = /^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

const localDayOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * Local calendar day 'YYYY-MM-DD' of a DATE / DATETIME value, or null.
 * Accepts a Date, 'YYYY-MM-DD', a zone-less 'YYYY-MM-DD HH:MM:SS' (taken as is) or an ISO string with a zone
 * (JSON of a mysql2 TIMESTAMP, e.g. '2026-03-01T09:00:00.000Z'), converted to the local day.
 */
export const toLocalDay = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : localDayOf(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (DAY_RE.test(text)) return text;
  const naive = NAIVE_RE.exec(text);
  if (naive) return naive[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : localDayOf(parsed);
};

/** Sort key (ms) of a `changed_at` value. Zone-less strings are read as local time, like toLocalDay. */
const timeOf = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return Number.NaN;
  const text = value.trim();
  if (DAY_RE.test(text)) return new Date(`${text}T00:00:00`).getTime();
  if (NAIVE_RE.test(text)) return new Date(text.replace(' ', 'T')).getTime();
  return new Date(text).getTime();
};

/**
 * Purchase-price changes only (selling-price changes are ignored), oldest first, with their local day.
 * Rows with an unreadable date are dropped. The API returns them newest first: never rely on that order.
 * @param {Array<{price_type: string, old_price: unknown, changed_at: unknown, id?: number}>} history
 */
export const purchaseChanges = (history) =>
  (Array.isArray(history) ? history : [])
    .filter((row) => row && row.price_type === 'purchase')
    .map((row) => ({ ...row, day: toLocalDay(row.changed_at), time: timeOf(row.changed_at) }))
    .filter((row) => row.day !== null && !Number.isNaN(row.time))
    .sort((a, b) => a.time - b.time || (Number(a.id) || 0) - (Number(b.id) || 0));

/**
 * Purchase price of a product on a sale date (§5.3), or null when unknown (0, empty or invalid price).
 * @param {Array} history price_history rows of the product (any order)
 * @param {unknown} currentPurchasePrice products.purchase_price today
 * @param {unknown} saleDate sales.date
 * @returns {number|null}
 */
export const purchasePriceOnDate = (history, currentPurchasePrice, saleDate) => {
  const saleDay = toLocalDay(saleDate);
  if (saleDay === null) return null;
  // Changes made on the sale day count as "after the sale" (same-day rule, top of file).
  const nextChange = purchaseChanges(history).find((change) => change.day >= saleDay);
  return parseUnitCost(nextChange ? nextChange.old_price : currentPurchasePrice);
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const addCents = (a, b) => Math.round((a + b) * 100) / 100;

/**
 * Decides the cost of every NULL-cost sale line. Lines with no product (typed by hand), a product that no longer
 * exists or a product without a purchase price keep `unit_cost = NULL` and are counted.
 * @param {{lines: Array<{id: number, date: unknown, product_id: number|null, totalPrice: unknown}>,
 *   products: Map<number, {found: boolean, purchase_price?: unknown, history?: Array}>}} input
 */
export const planBackfill = ({ lines, products }) => {
  const updates = [];
  const stats = {
    scanned: 0,
    scannedRevenue: 0,
    filled: 0,
    filledRevenue: 0,
    noProduct: 0,
    noProductRevenue: 0,
    notFound: 0,
    notFoundRevenue: 0,
    notFoundIds: [],
    noPrice: 0,
    noPriceRevenue: 0,
    noPriceIds: [],
    products: products.size,
  };
  const notFoundIds = new Set();
  const noPriceIds = new Set();
  for (const line of lines) {
    const revenue = money(line.totalPrice);
    stats.scanned += 1;
    stats.scannedRevenue = addCents(stats.scannedRevenue, revenue);
    const productId = line.product_id === null || line.product_id === undefined ? null : Number(line.product_id);
    if (productId === null || !Number.isInteger(productId) || productId <= 0) {
      stats.noProduct += 1;
      stats.noProductRevenue = addCents(stats.noProductRevenue, revenue);
      continue;
    }
    const product = products.get(productId);
    if (!product || !product.found) {
      stats.notFound += 1;
      stats.notFoundRevenue = addCents(stats.notFoundRevenue, revenue);
      notFoundIds.add(productId);
      continue;
    }
    const unitCost = purchasePriceOnDate(product.history, product.purchase_price, line.date);
    if (unitCost === null) {
      stats.noPrice += 1;
      stats.noPriceRevenue = addCents(stats.noPriceRevenue, revenue);
      noPriceIds.add(productId);
      continue;
    }
    updates.push({ id: line.id, unit_cost: unitCost });
    stats.filled += 1;
    stats.filledRevenue = addCents(stats.filledRevenue, revenue);
  }
  stats.notFoundIds = [...notFoundIds].sort((a, b) => a - b);
  stats.noPriceIds = [...noPriceIds].sort((a, b) => a - b);
  return { updates, stats };
};

/**
 * Groups the updates by identical cost, in batches of at most `batchSize` ids:
 * one `UPDATE ... SET unit_cost = ? WHERE id IN (...)` per group.
 * @returns {Array<{unit_cost: number, ids: number[]}>}
 */
export const groupUpdates = (updates, batchSize = 500) => {
  const byCost = new Map();
  for (const { id, unit_cost: cost } of updates) {
    const key = cost.toFixed(2);
    if (!byCost.has(key)) byCost.set(key, []);
    byCost.get(key).push(id);
  }
  const groups = [];
  for (const [key, ids] of byCost) {
    for (let i = 0; i < ids.length; i += batchSize) groups.push({ unit_cost: Number(key), ids: ids.slice(i, i + batchSize) });
  }
  return groups;
};

/**
 * Share of the revenue with a known cost, before and after the backfill (%, one decimal), or null with no revenue.
 * @param {{totalRevenue: unknown, knownRevenue: unknown, filledRevenue: unknown}} input
 */
export const coverage = ({ totalRevenue, knownRevenue, filledRevenue }) => {
  const total = money(totalRevenue);
  if (total <= 0) return { before: null, after: null };
  const pct = (value) => Math.min(100, Math.round((value / total) * 1000) / 10);
  const known = money(knownRevenue);
  return { before: pct(known), after: pct(known + money(filledRevenue)) };
};

// ---------- Terminal report (French, like the apps) ----------

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const formatInt = (value) => groupThousands(String(Math.round(money(value))));
export const formatMoney = (value) => {
  const n = money(value);
  const [int, cents] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${groupThousands(int)},${cents} DH`;
};
const formatPct = (value) => (value === null ? '—' : `${value.toFixed(1).replace('.', ',')} %`);
const listIds = (ids, max = 20) =>
  ids.length <= max ? ids.join(', ') : `${ids.slice(0, max).join(', ')} … (+${ids.length - max})`;

/**
 * Report printed at the end of a run (dry run or --apply).
 * @param {{stats: object, coverage: {before: number|null, after: number|null}, apply: boolean, updated?: number,
 *   from?: string|null, to?: string|null, productsApiUrl?: string, columnsMissing?: boolean}} input
 * @returns {string}
 */
export const formatReport = ({ stats, coverage: cover, apply, updated = 0, from = null, to = null, productsApiUrl, columnsMissing = false }) => {
  const row = (label, count, revenue) =>
    `${label.padEnd(36, '.')} ${formatInt(count).padStart(7)}${revenue === undefined ? '' : `   ${formatMoney(revenue)}`}`;
  const period = from || to ? `du ${from ?? 'début'} au ${to ?? "aujourd'hui"}` : 'toutes les ventes';
  const lines = [
    '',
    `Coût des anciennes ventes (FINANCE_PLAN.md §5.3) — ${apply ? 'ENREGISTREMENT' : 'SIMULATION'}`,
    `Période : ${period}`,
  ];
  if (productsApiUrl) lines.push(`API produits : ${productsApiUrl}`);
  if (columnsMissing) lines.push("Note : sales.unit_cost / cost_source n'existent pas encore (toutes les lignes sont sans coût).");
  lines.push(
    '',
    row('Lignes sans coût analysées ', stats.scanned, stats.scannedRevenue),
    row(`  ${apply ? 'coût trouvé' : 'coût trouvé (à écrire)'} `, stats.filled, stats.filledRevenue),
    row('  sans produit (saisie manuelle) ', stats.noProduct, stats.noProductRevenue),
    row('  produit introuvable ', stats.notFound, stats.notFoundRevenue),
    row("  produit sans prix d'achat ", stats.noPrice, stats.noPriceRevenue),
    row('Produits interrogés ', stats.products)
  );
  if (stats.notFoundIds.length) lines.push(`  Produits introuvables (id) : ${listIds(stats.notFoundIds)}`);
  if (stats.noPriceIds.length) lines.push(`  Sans prix d'achat (id) : ${listIds(stats.noPriceIds)}`);
  lines.push('', `Coût connu pour ${formatPct(cover.before)} du CA -> ${formatPct(cover.after)}`, '');
  if (apply) lines.push(`✅ ${formatInt(updated)} ligne(s) mise(s) à jour (cost_source = 'backfill').`);
  else lines.push("SIMULATION : rien n'a été écrit. Relancez avec --apply pour enregistrer les coûts.");
  lines.push('');
  return lines.join('\n');
};

// ---------- Command line ----------

export const USAGE = `Usage (dans sales_manager/server) :
  node scripts/backfillSaleCosts.js [--apply] [--from=AAAA-MM-JJ] [--to=AAAA-MM-JJ] [--verbose]

Remplit sales.unit_cost des anciennes ventes à partir de l'historique des prix d'achat (FINANCE_PLAN.md §5.3).
Par défaut : simulation (rapport seul, rien n'est écrit).

  --apply        écrit les coûts (cost_source = 'backfill'). Une ligne qui a déjà un coût n'est jamais modifiée,
                 relancer le script ne change donc rien.
  --from, --to   limite aux ventes de cette période (dates incluses)
  --verbose      affiche le coût retenu par produit
  -h, --help     cette aide

Règle : prix d'achat du jour de la vente = ancien prix (old_price) du premier changement de prix d'achat fait après
cette date, sinon le prix d'achat actuel. Une vente n'a pas d'heure (sales.date) : un changement fait le jour même
compte comme "après la vente", la ligne reçoit donc le prix du début de la journée.
Les lignes sans produit (saisies à la main), dont le produit n'existe plus, ou sans prix d'achat restent sans coût :
les rapports financiers les estiment avec la marge par défaut.

Il faut : MySQL (DB_* dans sales_manager/server/.env) et l'API products_manager (PRODUCTS_API_URL, défaut
http://localhost:5000). Le miroir de sales_manager (dev:products) ne suffit pas : il n'a pas l'historique des prix.`;

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{apply: boolean, verbose: boolean, help: boolean, from: string|null, to: string|null}}
 * @throws {Error} on an unknown option or an invalid date
 */
export const parseArgs = (argv) => {
  const options = { apply: false, verbose: false, help: false, from: null, to: null };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--apply') options.apply = true;
    else if (arg === '--verbose' || arg === '-v') options.verbose = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (/^--(from|to)(=|$)/.test(arg)) {
      const [flag, inline] = arg.split('=');
      const value = inline ?? args.shift();
      const key = flag.slice(2);
      if (!value || !DAY_RE.test(value) || toLocalDay(new Date(`${value}T12:00:00`)) !== value) {
        throw new Error(`${flag} attend une date AAAA-MM-JJ (reçu : ${value ?? 'rien'})`);
      }
      options[key] = value;
    } else throw new Error(`Option inconnue : ${arg}`);
  }
  if (options.from && options.to && options.from > options.to) throw new Error('--from doit être avant --to');
  return options;
};
