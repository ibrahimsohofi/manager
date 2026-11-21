// Own database of the finance app (FINANCE_PLAN.md §1, decision 27): expenses, categories, settings.
// Created on first use if missing, like `bricojamal`. The pool is opened lazily: if MySQL is down when the
// API starts, the API still listens and the next request tries again.
// Takes the checked config from env.js (`cfg.financeDb`): this file never reads process.env.
import mysql from 'mysql2/promise';
import { httpError } from '../utils/finance.js';
import { ensureFinanceTables } from './financeSchema.js';

const NAME_RE = /^[A-Za-z0-9_]+$/;
const CONNECT_TIMEOUT_MS = 5000;

/**
 * @param {{host: string, port: number, user: string, password: string, database: string}} dbConfig
 * @returns {{getPool: () => Promise<import('mysql2/promise').Pool>, init: () => Promise<boolean>,
 *   ping: () => Promise<boolean>, close: () => Promise<void>}}
 */
export const createFinanceDatabase = (dbConfig, { logger = console } = {}) => {
  const { database, host, port, user, password } = dbConfig;
  if (!NAME_RE.test(database)) throw new Error(`Invalid finance database name "${database}"`);
  const server = { host, port, user, password, connectTimeout: CONNECT_TIMEOUT_MS };

  let pool = null;
  let opening = null;

  const open = async () => {
    const admin = await mysql.createConnection(server);
    try {
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await admin.end();
    }

    const created = mysql.createPool({
      ...server,
      database,
      charset: 'utf8mb4',
      // DATE columns stay 'YYYY-MM-DD' strings: no timezone shift on expense dates.
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    const report = await ensureFinanceTables(created, { logger });
    if (!report.tables.includes('expenses')) {
      await created.end().catch(() => {});
      throw new Error(report.errors.map((e) => `${e.step}: ${e.message}`).join('; ') || 'schema setup failed');
    }
    logger.log(`✅ Finance database ready: ${database}@${host}:${port}`);
    return created;
  };

  /** The finance pool. Throws a 503 error (code FINANCE_DB_UNAVAILABLE) when MySQL can't be reached. */
  const getPool = async () => {
    if (pool) return pool;
    if (!opening) {
      opening = open()
        .then((created) => {
          pool = created;
          return created;
        })
        .finally(() => {
          opening = null;
        });
    }
    try {
      return await opening;
    } catch (error) {
      logger.error('❌ Finance database unavailable:', error.message);
      throw httpError(503, 'Finance database unavailable', 'FINANCE_DB_UNAVAILABLE');
    }
  };

  /** Called once on start. Never throws: the API listens even when MySQL is down. */
  const init = async () => {
    try {
      await getPool();
      return true;
    } catch {
      logger.error('💡 Check MySQL and the DB_* settings in finance_manager/server/.env');
      return false;
    }
  };

  const ping = async () => {
    try {
      const ready = await getPool();
      await ready.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  };

  const close = async () => {
    const current = pool;
    pool = null;
    if (current) await current.end().catch(() => {});
  };

  return { getPool, init, ping, close };
};

/** Runs `work(connection)` in a transaction on the given pool. Rolls back and rethrows on error. */
export const withTransaction = async (pool, work) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};
