// Cost of each sale line, database part (FINANCE_PLAN.md §5.2, Chunk 1b).
// Split from the old `financeSchema.js`: the expense tables now live in the `finance_manager` database
// (decision 27). `bricojamal` only keeps the sale cost columns, which finance_manager reads (§1.1).
// Kept out of database.js (which connects to MySQL on import) so it can be tested with a fake pool:
// `pool` only needs `execute(sql, params) -> [rows]`, like mysql2/promise.
// Every step is idempotent and runs on each API start. A failing step is logged, never thrown.

// Appended at the end of `sales` (no AFTER): cheapest ALTER on MySQL 8 and MariaDB.
export const SALES_COST_COLUMNS = [
  { name: 'unit_cost', definition: 'DECIMAL(10,2) NULL' },
  { name: 'cost_source', definition: "ENUM('sale', 'backfill') NULL" },
];

const SALES_DATE_INDEX = 'idx_sales_date';

const columnExists = async (pool, table, column) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.n) > 0;
};

// Any index whose first column is `date` already serves the date-range reports, whatever its name.
// The name is checked too, so CREATE INDEX never fails with a duplicate key name.
const salesDateIndexExists = async (pool) => {
  const [rows] = await pool.execute(
    `SELECT INDEX_NAME AS index_name, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS seq
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales'`
  );
  return rows.some(
    (row) => row.index_name === SALES_DATE_INDEX || (Number(row.seq) === 1 && row.column_name === 'date')
  );
};

/**
 * Adds `sales.unit_cost` / `cost_source` and the `sales (date)` index. Safe to run on every start.
 * @returns {Promise<{columnsAdded: string[], indexAdded: boolean, errors: {step: string, message: string}[]}>}
 */
export const ensureSaleCostColumns = async (pool, { logger = console } = {}) => {
  const report = { columnsAdded: [], indexAdded: false, errors: [] };
  const fail = (step, error) => {
    report.errors.push({ step, message: error.message });
    logger.error(`❌ Sale cost setup failed (${step}):`, error.message);
  };

  // 1. Cost of each sale line (filled at checkout from Chunk 2, by the backfill script from Chunk 3)
  for (const column of SALES_COST_COLUMNS) {
    try {
      if (await columnExists(pool, 'sales', column.name)) continue;
      await pool.execute(`ALTER TABLE \`sales\` ADD COLUMN \`${column.name}\` ${column.definition}`);
      report.columnsAdded.push(column.name);
      logger.log(`✅ sales.${column.name} column added`);
    } catch (error) {
      fail(`sales.${column.name}`, error);
    }
  }

  // 2. Monthly / yearly finance reports filter sales by date
  try {
    if (!(await salesDateIndexExists(pool))) {
      await pool.execute(`CREATE INDEX ${SALES_DATE_INDEX} ON \`sales\` (\`date\`)`);
      report.indexAdded = true;
      logger.log(`✅ ${SALES_DATE_INDEX} index added`);
    }
  } catch (error) {
    fail(SALES_DATE_INDEX, error);
  }

  if (report.errors.length === 0) {
    logger.log('✅ Sale cost columns created/verified');
  }
  return report;
};
