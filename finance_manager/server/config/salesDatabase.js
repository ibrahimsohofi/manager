// Read-only access to the sales database `bricojamal` (FINANCE_PLAN.md §1.1, decision 28).
// Every connection runs SET SESSION TRANSACTION READ ONLY, so a bug can never write to the sales.
// In production, also use a MySQL user with `GRANT SELECT ON bricojamal.*` only.
// Takes the checked config from env.js (`cfg.salesDb`, SALES_DB_* falling back to DB_*).
import mysql from 'mysql2/promise';

const CONNECT_TIMEOUT_MS = 3000;

/**
 * @param {{host: string, port: number, user: string, password: string, database: string}} dbConfig
 * @returns {{getPool: () => import('mysql2/promise').Pool, close: () => Promise<void>}}
 */
export const createSalesDatabase = (dbConfig, { logger = console } = {}) => {
  const { host, port, user, password, database } = dbConfig;
  let pool = null;

  /** The read-only pool. Created on first use; it only connects when a query runs. */
  const getPool = () => {
    if (pool) return pool;
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      charset: 'utf8mb4',
      dateStrings: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
    // Raw (callback) connection: commands run in order, so this is done before the first query.
    pool.on('connection', (connection) => {
      connection.query('SET SESSION TRANSACTION READ ONLY', (error) => {
        if (error) logger.error('❌ Could not make the sales connection read-only:', error.message);
      });
    });
    return pool;
  };

  const close = async () => {
    const current = pool;
    pool = null;
    if (current) await current.end().catch(() => {});
  };

  return { getPool, close };
};
