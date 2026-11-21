// Generated sales for the mock API: same methods and result shapes as models/SalesSource.js, without MySQL.
// The numbers look like the real `bricojamal` dump (about 30 cheap lines a day: Droguerie, Électricité,
// Peinture, Sanitaire, Outillage, Quincaillerie) and are deterministic: same seed, same sales.
import { SALES_UNAVAILABLE } from '../models/SalesSource.js';
import { addMonths, round2 } from '../utils/finance.js';

/** Small deterministic PRNG (mulberry32). Returns numbers in [0, 1). */
export const createRandom = (seed = 2026) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// [id, name, category, price, purchase price (null = never entered -> unknown cost), max quantity]
const CATALOGUE = [
  [84, 'RAPIDFER 1 kg ATLAS', 'Peinture', 30, 21, 2],
  [85, 'RAPIDFER 500 g ATLAS', 'Peinture', 20, 13.5, 2],
  [165, 'BOMBE DE PEINTURE DOREE STD', 'Peinture', 20, 13, 2],
  [53, 'KHAYAL BLANC 2.5 KG ATLAS', 'Peinture', 210, 158, 1],
  [92, 'ROULEAU ABRASIF JAUNE 100 MANGOUST', 'Peinture', 7, 4.2, 3],
  [171, 'PINCEAU PLAT 50 MM', 'Peinture', 12, 7, 2],
  [178, 'DILUANT SYNTHETIQUE 1 L', 'Peinture', 25, 17, 2],
  [190, 'ROULEAU PEINTURE 180 MM', 'Peinture', 35, 22, 1],
  [2878, 'GRATOIR 3,5', 'Peinture', 10, 6, 1],
  [643, 'AMPOULE E27 100W JAUNE INGELEC', 'Électricité', 5, 3, 4],
  [463, 'RALLONGE 3 PRISES 1,5m (2P+T) INGELEC', 'Électricité', 40, 27, 1],
  [1093, 'SORTIE DE FIL BLANC TICHKA INGELEC', 'Électricité', 8, 4.8, 3],
  [1082, 'SWITCH 5P', 'Électricité', 40, 26, 1],
  [4447, 'GAINE BLANCHE 150CM', 'Électricité', 6, 3.6, 5],
  [512, 'PRISE 2P+T ENCASTRABLE LEGRAND', 'Électricité', 15, 9.5, 3],
  [530, 'LAMPE LED 12W E27', 'Électricité', 20, 12, 3],
  [541, 'CABLE RIGIDE 2,5 mm (m)', 'Électricité', 4, 2.6, 15],
  [560, 'DISJONCTEUR 16A', 'Électricité', 45, 31, 1],
  [869, 'FICHE F PARABOLE STD', 'Électricité', 1, null, 6],
  [707, 'COUDE PARABOLE MAL', 'Électricité', 4, 2.2, 2],
  [808, 'PEIGNE DE CONNEXION CUIVRE', 'Électricité', 20, 13, 1],
  [4433, 'SILICONE TRANSPARENT HOMEY 650', 'Droguerie', 18, 11.5, 2],
  [2792, 'DEBOUCHEUR PM', 'Droguerie', 7, 4.5, 2],
  [2513, 'RAMET BLOC', 'Droguerie', 10, 6.5, 3],
  [2538, 'SCOTCH RUBAN ADHESIF 50X100', 'Droguerie', 18, 11, 2],
  [4434, 'CADENAS 50', 'Droguerie', 12, 7.5, 1],
  [2601, 'COLLE FORTE SADER 30 ML', 'Droguerie', 15, 9.5, 2],
  [2610, 'EAU DE JAVEL 1 L', 'Droguerie', 10, 6.8, 3],
  [2622, 'EPONGE INOX', 'Droguerie', 5, 2.8, 4],
  [2630, 'SAC POUBELLE 50 L (x10)', 'Droguerie', 10, 6, 3],
  [2644, 'CIRE PARQUET 500 ML', 'Droguerie', 25, null, 1],
  [1434, 'COLLE PVC RIGIDE 125 ML SADER', 'Sanitaire', 20, 13, 1],
  [1603, 'RACCORD FEMELLE DN 25 * 3/4 PPR', 'Sanitaire', 20, 12, 2],
  [1416, 'BOUCHON FEMELLE LAITON 3/4', 'Sanitaire', 12, 7.5, 2],
  [1450, 'FLEXIBLE INOX 40 CM', 'Sanitaire', 25, 15, 2],
  [1470, 'ROBINET PUSH LAVABO', 'Sanitaire', 60, 41, 1],
  [1480, 'TEFLON BLANC', 'Sanitaire', 3, 1.5, 4],
  [1490, 'SIPHON LAVABO PVC', 'Sanitaire', 35, 22, 1],
  [3010, 'TOURNEVIS PLAT 6 MM', 'Outillage', 15, 9, 1],
  [3020, 'METRE RUBAN 5 M', 'Outillage', 25, 15, 1],
  [3030, 'FORET BETON 8 MM', 'Outillage', 10, 6, 3],
  [3040, 'CUTTER PRO 18 MM', 'Outillage', 12, 7, 2],
  [3050, 'MARTEAU 500 G', 'Outillage', 45, 30, 1],
  [3060, 'PINCE UNIVERSELLE 180', 'Outillage', 40, 27, 1],
  [3575, 'CHARNIERE 25 mm HYDR', 'Quincaillerie', 9, 5.5, 4],
  [3170, 'TIRETTE MEUBLE CIGARE MM', 'Quincaillerie', 12, 7, 4],
  [2996, 'SUPPORT TV FIX PM 42', 'Quincaillerie', 30, null, 1],
  [3180, 'CHEVILLE 8 MM (x10)', 'Quincaillerie', 5, 2.5, 4],
  [3190, 'VIS 4x40 (x20)', 'Quincaillerie', 5, 2.5, 4],
  [3200, 'SERRURE PORTE BOIS', 'Quincaillerie', 120, 85, 1],
  // Bigger tickets: they bring the average line to ~40 DH, like the real dump (131 297 DH / 3 286 lines).
  [60, 'PEINTURE ACRYLIQUE BLANCHE 15 KG ATLAS', 'Peinture', 380, 290, 1],
  [61, 'VERNIS BOIS 4 L', 'Peinture', 160, 115, 1],
  [575, 'CABLE 2,5 mm ROULEAU 100 M', 'Électricité', 320, 245, 1],
  [580, 'PROJECTEUR LED 50W', 'Électricité', 95, 62, 1],
  [1500, 'MITIGEUR EVIER', 'Sanitaire', 180, 125, 1],
  [1510, "CHASSE D'EAU COMPLETE", 'Sanitaire', 140, 95, 1],
  [3070, 'PERCEUSE A PERCUSSION 750W', 'Outillage', 350, 260, 1],
  [3080, 'COFFRET EMBOUTS 32 PCS', 'Outillage', 70, 45, 1],
  [3210, 'CADENAS LAITON 60 + 3 CLES', 'Quincaillerie', 65, 42, 1],
  [2650, 'COLLE CARRELAGE 25 KG', 'Droguerie', 75, 55, 2],
];
// Lines typed by hand at the till: no product, so no cost (estimated with the default margin).
const TYPED = [
  ['SILICONE TRANSPARENT', 'Droguerie', 20],
  ['COUPE CLE', 'Quincaillerie', 15],
  ['CLE DOUBLE', 'Quincaillerie', 10],
  ['DIVERS', 'Droguerie', 8],
  ['VIS + CHEVILLES', 'Quincaillerie', 6],
];
// Cheap items sell a bit more often. Tuned so 2025-10-20 -> 2026-01-31 gives ~3 300 lines / ~135 000 DH,
// close to the real dump (3 286 lines / 131 297 DH), with a ~31 % gross margin on known-cost lines.
const WEIGHTS = CATALOGUE.map(([, , , price]) => price ** -0.15);
const WEIGHT_TOTAL = WEIGHTS.reduce((a, b) => a + b, 0);

const pickProduct = (random) => {
  let target = random() * WEIGHT_TOTAL;
  for (let i = 0; i < CATALOGUE.length; i += 1) {
    target -= WEIGHTS[i];
    if (target <= 0) return CATALOGUE[i];
  }
  return CATALOGUE.at(-1);
};

const pad2 = (n) => String(n).padStart(2, '0');
const nextDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// Busier weekends, quieter Friday afternoon, a slower Ramadan (2026-02-18 -> 2026-03-19), busy summer painting.
const dayFactor = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const week = [1.15, 1, 1, 1, 1, 0.85, 1.25][weekday];
  const season = { 1: 0.9, 2: 0.9, 6: 1.1, 7: 1.2, 8: 1.15, 12: 0.95 }[m] ?? 1;
  const ramadan = iso >= '2026-02-18' && iso <= '2026-03-19' ? 0.82 : 1;
  // Slow growth: the shop started using the till in Oct 2025.
  const monthsIn = (y - 2025) * 12 + (m - 10);
  return week * season * ramadan * (1 + Math.max(0, monthsIn) * 0.012);
};

/**
 * Sale lines from `from` to `to` (both included), like rows of `bricojamal.sales`.
 * ~93 % have a unit_cost (as after the Chunk 3 backfill); the rest are typed lines or products without a purchase price.
 */
export const generateSales = ({ from = '2025-10-20', to, seed = 2026 } = {}) => {
  const random = createRandom(seed);
  const lines = [];
  let id = 1;
  for (let day = from; day <= to; day = nextDay(day)) {
    const count = Math.max(6, Math.round((24 + random() * 14) * dayFactor(day)));
    let ticket = 0;
    let left = 0;
    let ticketId = '';
    for (let i = 0; i < count; i += 1) {
      if (left === 0) {
        ticket += 1;
        left = 1 + Math.floor(random() * random() * 4);
        ticketId = `TKT-${day.replaceAll('-', '')}-${String(ticket).padStart(3, '0')}`;
      }
      left -= 1;
      const typed = random() < 0.05;
      let line;
      if (typed) {
        const [name, category, price] = TYPED[Math.floor(random() * TYPED.length)];
        line = { product_id: null, productName: name, category, price, cost: null, quantity: 1 };
      } else {
        const [productId, name, category, price, cost, maxQty] = pickProduct(random);
        const quantity = maxQty > 1 && random() < 0.35 ? 1 + Math.floor(random() * maxQty) : 1;
        line = { product_id: productId, productName: name, category, price, cost, quantity };
      }
      lines.push({
        id: id++,
        sale_number: `SALE-${day.replaceAll('-', '')}-${line.product_id ?? 'X'}-${i}`,
        date: day,
        product_id: line.product_id,
        productName: line.productName,
        category: line.category,
        quantity: line.quantity,
        totalPrice: round2(line.price * line.quantity),
        unit_cost: line.cost,
        payment_method: random() < 0.04 ? 'credit' : 'cash',
        notes: `[${ticketId}]`,
      });
    }
  }
  return lines;
};

const unavailable = () => {
  const error = new Error('Sales database unavailable');
  error.code = SALES_UNAVAILABLE;
  error.cause_code = 'MOCK_SALES_DOWN';
  return error;
};

const emptyTotals = () => ({ revenue: 0, known_cogs: 0, unknown_revenue: 0, lines: 0, unknown_lines: 0 });
const addLine = (acc, line) => {
  const known = Number(line.unit_cost) > 0;
  acc.revenue += line.totalPrice;
  acc.lines += 1;
  if (known) acc.known_cogs += line.quantity * line.unit_cost;
  else {
    acc.unknown_revenue += line.totalPrice;
    acc.unknown_lines += 1;
  }
  return acc;
};
const finish = (acc) => ({
  revenue: round2(acc.revenue),
  known_cogs: round2(acc.known_cogs),
  unknown_revenue: round2(acc.unknown_revenue),
  lines: acc.lines,
  unknown_lines: acc.unknown_lines,
});

/**
 * Same interface as createSalesSource() (models/SalesSource.js), over an array of sale lines.
 * `setAvailable(false)` simulates the sales database being down (SALES_UNAVAILABLE errors).
 */
export const createMemorySalesSource = (lines, { available = true, hasUnitCost = true } = {}) => {
  let up = available;
  const checkedAt = new Date().toISOString();
  // Per-day totals, computed once: reports only sum days.
  const days = new Map();
  for (const line of lines) days.set(line.date, addLine(days.get(line.date) ?? emptyTotals(), line));
  const dayKeys = [...days.keys()].sort();
  const guard = () => {
    if (!up) throw unavailable();
  };
  const grouped = (bucketOf, from = null, to = null) => {
    const buckets = new Map();
    for (const key of dayKeys) {
      if (from && (key < from || key >= to)) continue;
      const bucket = bucketOf(key);
      const acc = buckets.get(bucket) ?? emptyTotals();
      const day = days.get(key);
      for (const field of Object.keys(acc)) acc[field] += day[field];
      buckets.set(bucket, acc);
    }
    return [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, acc]) => ({ key, ...finish(acc) }));
  };
  return {
    setAvailable(value) {
      up = Boolean(value);
    },
    async status() {
      if (!up) {
        return { available: false, has_unit_cost: hasUnitCost, checked_at: new Date().toISOString(), last_success_at: null, error_code: 'MOCK_SALES_DOWN' };
      }
      return { available: true, has_unit_cost: hasUnitCost, checked_at: checkedAt, error_code: null };
    },
    async totals(from, to) {
      guard();
      const acc = emptyTotals();
      for (const key of dayKeys) {
        if (key < from || key >= to) continue;
        const day = days.get(key);
        for (const field of Object.keys(acc)) acc[field] += day[field];
      }
      return finish(acc);
    },
    async byMonth(from, to) {
      guard();
      return grouped((key) => key.slice(0, 7), from, to);
    },
    async byDay(from, to) {
      guard();
      return grouped((key) => key, from, to);
    },
    async byYear() {
      guard();
      return grouped((key) => key.slice(0, 4));
    },
    async unknownCostLines(from, to, { limit = 50, offset = 0 } = {}) {
      guard();
      const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
      const safeOffset = Math.max(Math.trunc(Number(offset)) || 0, 0);
      const unknown = lines
        .filter((line) => line.date >= from && line.date < to && !(Number(line.unit_cost) > 0))
        .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
      return {
        total: unknown.length,
        revenue: round2(unknown.reduce((acc, line) => acc + line.totalPrice, 0)),
        limit: safeLimit,
        offset: safeOffset,
        rows: unknown.slice(safeOffset, safeOffset + safeLimit).map((line) => ({
          id: line.id,
          sale_number: line.sale_number,
          ticket: /\[(TKT-[^\]\s]+)\]/.exec(line.notes ?? '')?.[1] ?? null,
          date: line.date,
          product_id: line.product_id,
          product_name: line.productName,
          category: line.category,
          quantity: line.quantity,
          total_price: line.totalPrice,
        })),
      };
    },
  };
};

// ---------- Seed expenses ----------

const at = (month, day) => `${month}-${pad2(Math.min(day, 28))}`;

/**
 * Realistic expenses from `startMonth` to the month of `today` (FINANCE_PLAN.md §5.4, §5.6, §11):
 * rent 5 000 + internet 200 on the 10th, electricity / water paid the next month, transport, meals at the shop,
 * bags, bank fees, home withdrawals, a yearly tax spread over 12 months, and a few bills still to pay
 * (one overdue, one due in 2 days, next month's rent and internet).
 */
export const seedExpenses = async ({ expenses, categories, today, startMonth = '2025-10', seed = 7 }) => {
  const random = createRandom(seed);
  const list = await categories.list({ includeArchived: true });
  const id = (code) => list.find((c) => c.code === code)?.id;
  const between = (min, max) => round2(min + random() * (max - min));
  const currentMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const isPast = (iso) => iso <= today;
  const add = (body) => expenses.create({ status: 'paid', ...body });

  for (const [code, budget] of [
    ['electricity', 600],
    ['transport', 700],
    ['food', 1000],
  ]) {
    if (id(code)) await categories.update(id(code), { monthly_budget: budget });
  }

  for (let month = startMonth; month <= currentMonth; month = addMonths(month, 1)) {
    const m = Number(month.slice(5, 7));
    const next = addMonths(month, 1);
    const isCurrent = month === currentMonth;

    // Fixed bills on the 10th (§5.6). Still pending in the current month before the 10th.
    for (const [code, amount, label, payee] of [
      ['rent', 5000, 'Loyer magasin', 'Propriétaire'],
      ['internet_phone', 200, 'Internet fibre', 'Maroc Telecom'],
    ]) {
      const date = at(month, 10);
      if (isPast(date)) await add({ category_id: id(code), amount, expense_date: date, description: label, payee });
      else await add({ category_id: id(code), amount, expense_date: date, due_date: date, status: 'pending', description: label, payee });
    }

    // Electricity and water: the bill of month M is paid early in M+1 and counts for M (§4 #5).
    const winter = [12, 1, 2].includes(m);
    const elecDate = at(next, 6);
    if (isPast(elecDate)) {
      await add({
        category_id: id('electricity'),
        amount: winter ? between(520, 640) : between(330, 470),
        expense_date: elecDate,
        period_month: month,
        description: 'Facture électricité',
        payee: 'Lydec',
      });
    }
    const waterDate = at(next, 8);
    if (isPast(waterDate) && !(addMonths(currentMonth, -1) === month)) {
      await add({ category_id: id('water'), amount: between(70, 125), expense_date: waterDate, period_month: month, description: 'Facture eau', payee: 'Lydec' });
    }

    // Transport, meals at the shop, bags, bank fees, home.
    const transportDays = [4, 13, 22];
    for (const day of transportDays) {
      const date = at(month, day);
      if (isPast(date)) await add({ category_id: id('transport'), amount: between(140, 240), expense_date: date, description: 'Carburant', payee: 'Afriquia' });
    }
    for (const day of [6, 13, 20, 27]) {
      const date = at(month, day);
      if (isPast(date)) await add({ category_id: id('food'), amount: between(170, 260), expense_date: date, description: 'Repas de la semaine' });
    }
    if (isPast(at(month, 15))) {
      await add({ category_id: id('packaging'), amount: between(110, 180), expense_date: at(month, 15), description: 'Sacs plastique', payee: 'Grossiste Derb Omar' });
    }
    if (isPast(at(month, 28))) {
      await add({ category_id: id('bank_fees'), amount: 25, expense_date: at(month, 28), description: 'Frais de tenue de compte', payee: 'CIH Bank' });
    }
    if (isPast(at(month, 1))) {
      await add({ category_id: id('home'), amount: 2000, expense_date: at(month, 1), description: 'Dépenses maison' });
    }
    if (random() < 0.5 && isPast(at(month, 18))) {
      await add({ category_id: id('home'), amount: between(250, 700), expense_date: at(month, 18), description: 'Courses famille' });
    }

    // Current month: a big delivery (transport spike alert).
    if (isCurrent && todayDay >= 3) {
      await add({
        category_id: id('transport'),
        amount: 680,
        expense_date: at(month, Math.min(todayDay, 3)),
        description: 'Livraison marchandise Casablanca',
        payee: 'Transport Atlas',
      });
    }
  }

  // Yearly costs, spread over 12 months (§4 #6).
  const yearly = [
    ['taxes', 1200, '2026-03-15', '2026-01', 'Taxe professionnelle 2026', 'Commune'],
    ['taxes', 360, '2026-04-20', '2026-01', 'Taxe de services communaux 2026', 'Commune'],
  ];
  for (const [code, amount, date, period, label, payee] of yearly) {
    if (isPast(date)) await add({ category_id: id(code), amount, expense_date: date, period_month: period, spread_months: 12, description: label, payee });
  }
  // One-off expenses.
  const oneOff = [
    ['maintenance', 450, '2026-01-14', 'Réparation rideau métallique', 'Atelier Hassan'],
    ['stock_loss', 180, '2026-02-09', 'Pots de peinture cassés (livraison)', null],
    ['maintenance', 320, '2026-06-03', 'Remplacement néons', null],
    ['other', 150, '2026-09-12', 'Tampon encreur + carnets', 'Librairie Al Amal'],
  ];
  for (const [code, amount, date, label, payee] of oneOff) {
    if (isPast(date)) await add({ category_id: id(code), amount, expense_date: date, description: label, payee });
  }

  // Bills still to pay (overview "À payer" + alerts).
  const plusDays = (n) => {
    const [y, mo, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
  };
  const lastMonth = addMonths(currentMonth, -1);
  await add({
    category_id: id('water'),
    amount: 95,
    expense_date: plusDays(2),
    due_date: plusDays(2),
    period_month: lastMonth,
    status: 'pending',
    description: 'Facture eau',
    payee: 'Lydec',
  });
  await add({
    category_id: id('maintenance'),
    amount: 350,
    expense_date: plusDays(-2),
    due_date: plusDays(-2),
    period_month: currentMonth,
    status: 'pending',
    description: 'Serrurier : serrure arrière',
    payee: 'Atelier Hassan',
  });
  const nextMonth = addMonths(currentMonth, 1);
  for (const [code, amount, label, payee] of [
    ['rent', 5000, 'Loyer magasin', 'Propriétaire'],
    ['internet_phone', 200, 'Internet fibre', 'Maroc Telecom'],
  ]) {
    await add({ category_id: id(code), amount, expense_date: at(nextMonth, 10), due_date: at(nextMonth, 10), status: 'pending', description: label, payee });
  }
};
