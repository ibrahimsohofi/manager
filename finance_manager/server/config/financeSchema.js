// finance_manager database schema (FINANCE_PLAN.md §5.1, §5.4, §5.5; Chunk 1b).
// Moved from sales_manager/server/config/financeSchema.js: the expense tables live in their own
// `finance_manager` database (decision 27). The sale cost columns stay in sales_manager (saleCostSchema.js).
// `pool` only needs `execute(sql, params) -> [rows]`, like mysql2/promise, so it can be tested with a fake pool.
// Every step is idempotent and runs on each API start. A failing step is logged, never thrown.
const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

// §5.4. `is_personal` = withdrawal (home), not a business expense. `is_fixed` feeds the break-even point.
// Food is a business expense (meals at the shop, §4 #19). Icons are lucide names, colours are hex.
// Colours = SOHOFI BRICO brand palette (navy #07294D, orange #F76B03 + tints), same set as src/lib/categoryIcons.js.
export const FINANCE_SEED_CATEGORIES = [
  { code: 'rent', name_fr: 'Loyer', name_ar: 'الكراء', icon: 'store', color: '#07294d', is_fixed: true },
  { code: 'electricity', name_fr: 'Électricité', name_ar: 'الكهرباء', icon: 'zap', color: '#f76b03' },
  { code: 'water', name_fr: 'Eau', name_ar: 'الماء', icon: 'droplets', color: '#2e77b8' },
  { code: 'internet_phone', name_fr: 'Internet & téléphone', name_ar: 'الإنترنت والهاتف', icon: 'wifi', color: '#1f4e79', is_fixed: true },
  { code: 'salaries', name_fr: 'Salaires / aide', name_ar: 'الأجور', icon: 'users', color: '#0f766e', is_fixed: true },
  { code: 'cnss', name_fr: 'CNSS', name_ar: 'الضمان الاجتماعي', icon: 'shield-check', color: '#4aa3a2', is_fixed: true },
  { code: 'taxes', name_fr: 'Impôts & taxes', name_ar: 'الضرائب والرسوم', icon: 'landmark', color: '#b42318', is_fixed: true },
  { code: 'transport', name_fr: 'Transport & carburant', name_ar: 'النقل والبنزين', icon: 'truck', color: '#c2410c' },
  { code: 'packaging', name_fr: 'Sacs & emballages', name_ar: 'الأكياس والتغليف', icon: 'package', color: '#f2b544' },
  { code: 'maintenance', name_fr: 'Entretien & réparations', name_ar: 'الصيانة والإصلاح', icon: 'wrench', color: '#64748b' },
  { code: 'bank_fees', name_fr: 'Frais bancaires', name_ar: 'مصاريف البنك', icon: 'credit-card', color: '#334155' },
  { code: 'stock_loss', name_fr: 'Pertes & casse', name_ar: 'الخسائر والكسر', icon: 'package-x', color: '#9f1239' },
  { code: 'food', name_fr: 'Repas au magasin', name_ar: 'الأكل في المحل', icon: 'utensils', color: '#ff9f43' },
  { code: 'home', name_fr: 'Maison & famille', name_ar: 'المنزل والعائلة', icon: 'house', color: '#5b8db8', is_personal: true },
  { code: 'other', name_fr: 'Divers', name_ar: 'متفرقات', icon: 'ellipsis', color: '#94a3b8' },
];

// The first theme used an earthy palette. Categories still carrying one of those colours (seeded or picked
// from the old swatches) are moved to their brand equivalent on start. Old and new sets do not overlap,
// so the step is idempotent and never touches a colour chosen from the current palette.
export const LEGACY_CATEGORY_COLORS = {
  '#b45309': '#07294d',
  '#ca8a04': '#f76b03',
  '#0891b2': '#2e77b8',
  '#0d9488': '#1f4e79',
  '#16a34a': '#0f766e',
  '#65a30d': '#4aa3a2',
  '#dc2626': '#b42318',
  '#ea580c': '#c2410c',
  '#a16207': '#f2b544',
  '#57534e': '#64748b',
  '#475569': '#334155',
  '#be123c': '#9f1239',
  '#f97316': '#ff9f43',
  '#db2777': '#5b8db8',
  '#78716c': '#94a3b8',
  '#14532d': '#3d5a80',
};

// §5.1 + §5.5. No foreign keys between these tables (a category in use is archived, never deleted;
// allocations are rewritten by the expense model).
export const FINANCE_TABLES = [
  {
    name: 'expense_categories',
    sql: `
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(40) NULL,
        name_fr VARCHAR(100) NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        icon VARCHAR(40) NULL,
        color VARCHAR(20) NULL,
        is_personal TINYINT(1) NOT NULL DEFAULT 0,
        is_fixed TINYINT(1) NOT NULL DEFAULT 0,
        monthly_budget DECIMAL(12,2) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_expense_categories_code (code)
      ) ${TABLE_OPTIONS}
    `,
  },
  {
    name: 'expenses',
    sql: `
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        expense_date DATE NOT NULL,
        period_month CHAR(7) NOT NULL,
        spread_months TINYINT NOT NULL DEFAULT 1,
        \`status\` ENUM('paid', 'pending') NOT NULL DEFAULT 'paid',
        due_date DATE NULL,
        paid_from ENUM('till', 'bank', 'pocket') NOT NULL DEFAULT 'till',
        payee VARCHAR(150) NULL,
        reference VARCHAR(100) NULL,
        description VARCHAR(255) NULL,
        notes TEXT NULL,
        attachment_url VARCHAR(500) NULL,
        recurring_id INT NULL,
        deleted_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_expenses_period (period_month),
        INDEX idx_expenses_date (expense_date),
        INDEX idx_expenses_category (category_id),
        INDEX idx_expenses_status (\`status\`),
        INDEX idx_expenses_recurring (recurring_id)
      ) ${TABLE_OPTIONS}
    `,
  },
  {
    // One row per month an expense counts in (1 row, or N when spread). Monthly reports = simple SUM.
    name: 'expense_allocations',
    sql: `
      CREATE TABLE IF NOT EXISTS expense_allocations (
        expense_id INT NOT NULL,
        period_month CHAR(7) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        PRIMARY KEY (expense_id, period_month),
        INDEX idx_expense_alloc_period (period_month)
      ) ${TABLE_OPTIONS}
    `,
  },
  {
    name: 'recurring_expenses',
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        label VARCHAR(150) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        amount_is_estimate TINYINT(1) NOT NULL DEFAULT 0,
        frequency ENUM('monthly', 'quarterly', 'yearly') NOT NULL DEFAULT 'monthly',
        day_of_month TINYINT NOT NULL DEFAULT 1,
        start_month CHAR(7) NOT NULL,
        end_month CHAR(7) NULL,
        payee VARCHAR(150) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        last_generated_month CHAR(7) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ${TABLE_OPTIONS}
    `,
  },
  {
    name: 'cash_closings',
    sql: `
      CREATE TABLE IF NOT EXISTS cash_closings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        closing_date DATE NOT NULL,
        opening_float DECIMAL(12,2) NOT NULL DEFAULT 0,
        cash_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
        cash_payments_received DECIMAL(12,2) NOT NULL DEFAULT 0,
        till_expenses DECIMAL(12,2) NOT NULL DEFAULT 0,
        cash_removed DECIMAL(12,2) NOT NULL DEFAULT 0,
        expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
        counted_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
        difference DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cash_closings_date (closing_date)
      ) ${TABLE_OPTIONS}
    `,
  },
  {
    // §5.5. Same shape as the bricojamal one: PIN hash, default margin...
    name: 'app_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        name VARCHAR(80) PRIMARY KEY,
        value TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ${TABLE_OPTIONS}
    `,
  },
];

// Seeds only an empty table (first start). INSERT IGNORE + the unique `code` keep two API
// processes starting at the same time from inserting the categories twice.
const seedCategories = async (pool) => {
  const [rows] = await pool.execute('SELECT COUNT(*) AS n FROM expense_categories');
  if (Number(rows[0]?.n) > 0) return 0;

  const placeholders = FINANCE_SEED_CATEGORIES.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = FINANCE_SEED_CATEGORIES.flatMap((category, index) => [
    category.code,
    category.name_fr,
    category.name_ar,
    category.icon,
    category.color,
    category.is_personal ? 1 : 0,
    category.is_fixed ? 1 : 0,
    index + 1,
  ]);
  const [result] = await pool.execute(
    `INSERT IGNORE INTO expense_categories
       (code, name_fr, name_ar, icon, color, is_personal, is_fixed, sort_order)
     VALUES ${placeholders}`,
    params
  );
  return Number(result?.affectedRows) || 0;
};

// Old earthy colour -> brand colour, in one UPDATE. Case-insensitive on the stored hex.
const rebrandCategoryColors = async (pool) => {
  const entries = Object.entries(LEGACY_CATEGORY_COLORS);
  const cases = entries.map(() => 'WHEN ? THEN ?').join(' ');
  const [result] = await pool.execute(
    `UPDATE expense_categories
        SET color = CASE LOWER(color) ${cases} ELSE color END
      WHERE LOWER(color) IN (${entries.map(() => '?').join(', ')})`,
    [...entries.flat(), ...entries.map(([legacy]) => legacy)]
  );
  return Number(result?.affectedRows) || 0;
};

/**
 * Creates the finance tables, seeds the expense categories and moves legacy colours to the brand palette.
 * Safe to run on every start.
 * @returns {Promise<{tables: string[], categoriesSeeded: number, categoriesRecolored: number, errors: {step: string, message: string}[]}>}
 */
export const ensureFinanceTables = async (pool, { logger = console } = {}) => {
  const report = { tables: [], categoriesSeeded: 0, categoriesRecolored: 0, errors: [] };
  const fail = (step, error) => {
    report.errors.push({ step, message: error.message });
    logger.error(`❌ Finance setup failed (${step}):`, error.message);
  };

  // 1. Tables
  for (const table of FINANCE_TABLES) {
    try {
      await pool.execute(table.sql);
      report.tables.push(table.name);
    } catch (error) {
      fail(`table ${table.name}`, error);
    }
  }

  // 2. Category seed (only when the table is empty). Skipped if expense_categories could not be created.
  if (report.tables.includes('expense_categories')) {
    try {
      report.categoriesSeeded = await seedCategories(pool);
      if (report.categoriesSeeded > 0) {
        logger.log(`✅ ${report.categoriesSeeded} expense categories seeded`);
      }
    } catch (error) {
      fail('category seed', error);
    }
    // 3. Brand colours for categories created with the first (earthy) palette.
    try {
      report.categoriesRecolored = await rebrandCategoryColors(pool);
      if (report.categoriesRecolored > 0) {
        logger.log(`🎨 ${report.categoriesRecolored} expense categories moved to the brand colours`);
      }
    } catch (error) {
      fail('category colours', error);
    }
  }

  if (report.errors.length === 0) {
    logger.log('✅ Finance tables created/verified');
  }
  return report;
};
