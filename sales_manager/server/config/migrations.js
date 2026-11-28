// Versioned schema migrations (ROADMAP_V2.md P-03).
//
// Files live in `server/migrations/`, named `NNNN_name.sql` (4-digit version, lowercase name):
//   0001_tickets_and_nulls.sql
//   0002_customer_identity.sql + 0002_customer_identity.js   (optional JS step, runs after the SQL)
// Each version runs once, in ascending order, and is recorded in `schema_migrations`.
//
// Rules (ROADMAP_V2.md §4 #6): never destroy data, back up first, never edit an applied file (add a new
// version instead). No down migrations: the rollback is the backup (R-08). The same files run on MySQL 8
// and MariaDB, so no `ADD COLUMN IF NOT EXISTS` (versions are tracked, a file never runs twice).
//
// SQL files: statements separated by `;`. Quotes, backticks and comments are respected.
// `DELIMITER` (triggers / procedures) is not supported: use a JS step for those.
// JS files: `export async function up({ query, connection, logger })`. `query(sql, params)` returns rows.
//
// Each version runs in one transaction on one connection: data changes (UPDATE / INSERT) are rolled back
// when a later statement fails. MySQL commits DDL (CREATE / ALTER) at once, so keep one concern per version.
// A server-wide lock (GET_LOCK) stops two processes (API start + `db:migrate`) from migrating together.
//
// Kept out of database.js (which connects to MySQL on import) so it can be tested with a test double:
// `pool.getConnection()` -> connection with `query()`, `beginTransaction()`, `commit()`, `rollback()` and
// `release()`, like mysql2/promise.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIGRATIONS_TABLE = 'schema_migrations';
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));
export const MIGRATION_FILE_RE = /^(\d{4})_([a-z0-9][a-z0-9_]*)\.(sql|js)$/;
const LOCK_TIMEOUT_SECONDS = 30;
// Lock names are server-wide in MySQL: the database name keeps two shop databases apart.
const LOCK_NAME_SQL = `CONCAT('${MIGRATIONS_TABLE}:', DATABASE())`;

export const CREATE_MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    version VARCHAR(20) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum CHAR(64) NOT NULL,
    execution_ms INT UNSIGNED NOT NULL DEFAULT 0,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const SELECT_APPLIED_SQL = `SELECT version, name, checksum, execution_ms, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY version`;

const countNewlines = (text) => text.split('\n').length - 1;

/**
 * Splits a SQL file into statements on `;`, outside quotes ('', "", ``) and comments.
 * `-- ` and `#` comments and plain block comments are dropped; MySQL executable comments are kept.
 * @param {string} sql
 * @returns {{sql: string, line: number}[]} statements with the line they start on (1-based)
 */
export const splitSqlStatements = (sql) => {
  const text = String(sql ?? '').replace(/\r\n?/g, '\n');
  const statements = [];
  let current = '';
  let startLine = 1;
  let line = 1;
  let i = 0;

  const append = (chunk) => {
    if (current.trim() === '' && chunk.trim() !== '') startLine = line;
    current += chunk;
  };
  const push = () => {
    const statement = current.trim();
    current = '';
    if (!statement) return;
    if (/^DELIMITER\b/i.test(statement)) {
      throw new Error(`DELIMITER is not supported (line ${startLine}): put triggers / procedures in a .js step`);
    }
    statements.push({ sql: statement, line: startLine });
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // `-- ` (MySQL needs a space or control character after the dashes) and `#` comments
    if ((ch === '-' && next === '-' && (i + 2 >= text.length || /\s/.test(text[i + 2]))) || ch === '#') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end; // the newline itself is handled below
      continue;
    }

    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) throw new Error(`Unclosed /* comment (line ${line})`);
      const chunk = text.slice(i, end + 2);
      // `/*! ... */` is executed by MySQL / MariaDB: keep it. A plain comment becomes a space.
      append(text[i + 2] === '!' ? chunk : ' ');
      line += countNewlines(chunk);
      i = end + 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\' && ch !== '`') {
          j += 2;
          continue;
        }
        if (text[j] === ch) {
          if (text[j + 1] === ch) {
            j += 2; // doubled quote = escaped quote
            continue;
          }
          break;
        }
        j += 1;
      }
      if (j >= text.length) throw new Error(`Unclosed ${ch} quote (line ${line})`);
      const chunk = text.slice(i, j + 1);
      append(chunk);
      line += countNewlines(chunk);
      i = j + 1;
      continue;
    }

    if (ch === ';') {
      push();
      i += 1;
      continue;
    }

    append(ch);
    if (ch === '\n') line += 1;
    i += 1;
  }
  push();
  return statements;
};

/** SHA-256 of the file contents, line endings normalized (a Windows checkout gives the same checksum). */
export const checksumOf = (...parts) => {
  const hash = createHash('sha256');
  parts.forEach((part, index) => {
    if (index > 0) hash.update('\n--\n');
    hash.update(String(part).replace(/\r\n?/g, '\n'));
  });
  return hash.digest('hex');
};

/**
 * Reads the migration folder. A missing folder means "no migrations yet".
 * @returns {Promise<{migrations: object[], ignored: string[], errors: string[]}>}
 *   `errors` (duplicate version, bad SQL...) mean nothing may run until the files are fixed.
 */
export const loadMigrations = async (dir = DEFAULT_MIGRATIONS_DIR) => {
  let files;
  try {
    files = await readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return { migrations: [], ignored: [], errors: [] };
    throw error;
  }

  const byVersion = new Map();
  const ignored = [];
  const errors = [];
  for (const file of [...files].sort()) {
    if (file.startsWith('.')) continue;
    const match = MIGRATION_FILE_RE.exec(file);
    if (!match) {
      if (/\.(sql|js)$/i.test(file)) ignored.push(file);
      continue;
    }
    const [, version, name, ext] = match;
    const entry = byVersion.get(version) ?? { version, name, sqlFile: null, jsFile: null };
    if (entry.name !== name) {
      errors.push(`Version ${version} is used twice: ${version}_${entry.name} and ${version}_${name}`);
      continue;
    }
    entry[ext === 'sql' ? 'sqlFile' : 'jsFile'] = path.join(dir, file);
    byVersion.set(version, entry);
  }

  const migrations = [];
  const ordered = [...byVersion.values()].sort((a, b) => a.version.localeCompare(b.version));
  for (const entry of ordered) {
    const id = `${entry.version}_${entry.name}`;
    const sqlText = entry.sqlFile ? await readFile(entry.sqlFile, 'utf8') : null;
    const jsText = entry.jsFile ? await readFile(entry.jsFile, 'utf8') : null;
    let statements = [];
    if (sqlText !== null) {
      try {
        statements = splitSqlStatements(sqlText);
      } catch (error) {
        errors.push(`${id}.sql: ${error.message}`);
        continue;
      }
      if (statements.length === 0 && jsText === null) {
        errors.push(`${id}.sql has no SQL statement`);
        continue;
      }
    }
    migrations.push({
      version: entry.version,
      name: entry.name,
      id,
      sqlFile: entry.sqlFile,
      jsFile: entry.jsFile,
      statements,
      checksum: checksumOf(...[sqlText, jsText].filter((part) => part !== null)),
    });
  }
  return { migrations, ignored, errors };
};

/**
 * Compares the files with the `schema_migrations` rows.
 * Status per version: `applied`, `changed` (applied, file edited since), `missing` (applied, file gone)
 * or `pending` (`outOfOrder` when an older version than the last applied one shows up).
 */
export const planMigrations = (migrations, appliedRows = []) => {
  const applied = new Map(appliedRows.map((row) => [String(row.version), row]));
  const lastApplied = [...applied.keys()].sort().at(-1) ?? '';
  const entries = [];
  const pending = [];

  for (const migration of migrations) {
    const row = applied.get(migration.version);
    if (!row) {
      pending.push(migration);
      entries.push({
        version: migration.version,
        name: migration.name,
        id: migration.id,
        status: 'pending',
        outOfOrder: migration.version < lastApplied,
      });
      continue;
    }
    entries.push({
      version: migration.version,
      name: migration.name,
      id: migration.id,
      status: row.checksum === migration.checksum ? 'applied' : 'changed',
      appliedAt: row.applied_at ?? null,
      executionMs: Number(row.execution_ms) || 0,
    });
    applied.delete(migration.version);
  }
  for (const row of applied.values()) {
    const version = String(row.version);
    entries.push({
      version,
      name: row.name,
      id: `${version}_${row.name}`,
      status: 'missing',
      appliedAt: row.applied_at ?? null,
    });
  }
  entries.sort((a, b) => a.version.localeCompare(b.version));

  const counts = { applied: 0, changed: 0, missing: 0, pending: 0 };
  for (const entry of entries) counts[entry.status] += 1;
  return { entries, pending, counts };
};

const pad2 = (value) => String(value).padStart(2, '0');
const formatDate = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  return String(value).slice(0, 16);
};

/** Lines printed by `bun run db:status`. */
export const formatStatus = (plan, { target = '', ignored = [], errors = [], tableExists = true } = {}) => {
  const lines = [`Schema migrations${target ? ` - ${target}` : ''}`];
  if (!tableExists) lines.push(`No ${MIGRATIONS_TABLE} table yet: nothing has been applied.`);
  if (plan.entries.length === 0) lines.push('No migration files in server/migrations yet.');

  const width = Math.max(4, ...plan.entries.map((entry) => entry.name.length));
  for (const entry of plan.entries) {
    const head = `  ${entry.version}  ${entry.name.padEnd(width)}  `;
    if (entry.status === 'pending') {
      lines.push(`${head}pending${entry.outOfOrder ? '   (older than the last applied version)' : ''}`);
      continue;
    }
    const note = { applied: '', changed: '   ! file edited after it was applied', missing: '   ! file missing' }[
      entry.status
    ];
    lines.push(`${head}applied   ${formatDate(entry.appliedAt)}${note}`);
  }

  const { counts } = plan;
  const summary = [`${counts.applied + counts.changed + counts.missing} applied`, `${counts.pending} pending`];
  if (counts.changed) summary.push(`${counts.changed} edited after applying`);
  if (counts.missing) summary.push(`${counts.missing} with a missing file`);
  lines.push('', summary.join(', '));

  for (const file of ignored) {
    lines.push(`! ${file} ignored: name migration files NNNN_name.sql or NNNN_name.js (4 digits, lowercase)`);
  }
  for (const error of errors) lines.push(`x ${error}`);
  if (counts.pending > 0) lines.push('Back up the database, then run: bun run db:migrate');
  return lines;
};

const loadUpFunction = async (file) => {
  const mod = await import(pathToFileURL(file).href);
  const up = mod.up ?? mod.default?.up ?? (typeof mod.default === 'function' ? mod.default : null);
  if (typeof up !== 'function') throw new Error(`${path.basename(file)} must export an async up() function`);
  return up;
};

/** Runs one version (SQL statements, then the JS step) and records it, in one transaction. */
const runMigration = async (connection, migration, logger) => {
  const started = Date.now();
  const up = migration.jsFile ? await loadUpFunction(migration.jsFile) : null;
  await connection.beginTransaction();
  try {
    const total = migration.statements.length;
    for (const [index, statement] of migration.statements.entries()) {
      try {
        // No params: a `?` inside a migration is never treated as a placeholder.
        await connection.query(statement.sql);
      } catch (error) {
        const failure = new Error(`statement ${index + 1}/${total} (line ${statement.line}): ${error.message}`);
        failure.statementIndex = index + 1;
        failure.statementLine = statement.line;
        failure.cause = error;
        throw failure;
      }
    }
    if (up) {
      const query = async (sql, params) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      };
      try {
        await up({ query, connection, logger });
      } catch (error) {
        const failure = new Error(`JS step: ${error.message}`);
        failure.cause = error;
        throw failure;
      }
    }
    const executionMs = Date.now() - started;
    await connection.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum, execution_ms) VALUES (?, ?, ?, ?)`,
      [migration.version, migration.name, migration.checksum, executionMs]
    );
    await connection.commit();
    return executionMs;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Applies the pending migrations in order. Logs, never throws.
 * @param {{getConnection: () => Promise<object>}} pool mysql2/promise pool
 * @param {{dir?: string, logger?: Console, apply?: boolean, lockTimeoutSeconds?: number}} [options]
 *   `apply: false` only reads the plan (pending versions are listed, nothing runs).
 * @returns {Promise<{applied: string[], pending: string[], plan: object|null, warnings: string[],
 *   failed: {step: string, message: string, statementIndex?: number, statementLine?: number}|null}>}
 *   `failed` is set when nothing more could run: bad files, lock busy, database error or a failed version
 *   (that version and the later ones are not recorded and stay pending).
 */
export const applyMigrations = async (pool, options = {}) => {
  const {
    dir = DEFAULT_MIGRATIONS_DIR,
    logger = console,
    apply = true,
    lockTimeoutSeconds = LOCK_TIMEOUT_SECONDS,
  } = options;
  const report = { applied: [], pending: [], plan: null, warnings: [], failed: null };
  const warn = (message) => {
    report.warnings.push(message);
    logger.warn(`⚠️ ${message}`);
  };

  let loaded;
  try {
    loaded = await loadMigrations(dir);
  } catch (error) {
    report.failed = { step: 'load', message: error.message };
    logger.error('❌ Migration files could not be read:', error.message);
    return report;
  }
  for (const file of loaded.ignored) {
    warn(`${file} ignored: name migration files NNNN_name.sql or NNNN_name.js (4 digits, lowercase)`);
  }
  if (loaded.errors.length > 0) {
    report.failed = { step: 'load', message: loaded.errors.join('; ') };
    logger.error(`❌ No migration was run, fix the migration files first: ${report.failed.message}`);
    return report;
  }

  let connection = null;
  let locked = false;
  try {
    connection = await pool.getConnection();
    const [lockRows] = await connection.query(`SELECT GET_LOCK(${LOCK_NAME_SQL}, ?) AS got`, [lockTimeoutSeconds]);
    if (Number(lockRows[0]?.got) !== 1) {
      report.failed = {
        step: 'lock',
        message: `another process has been migrating this database for more than ${lockTimeoutSeconds}s`,
      };
      logger.error(`❌ Migrations skipped: ${report.failed.message}. Restart once it has finished.`);
      return report;
    }
    locked = true;

    await connection.query(CREATE_MIGRATIONS_TABLE_SQL);
    const [rows] = await connection.query(SELECT_APPLIED_SQL);
    const plan = planMigrations(loaded.migrations, rows);
    report.plan = plan;
    report.pending = plan.pending.map((migration) => migration.id);

    for (const entry of plan.entries) {
      if (entry.status === 'changed') {
        warn(`Migration ${entry.id} was edited after it was applied. It is not run again: put new changes in a new version.`);
      } else if (entry.status === 'missing') {
        warn(`Migration ${entry.id} is recorded as applied but its file is missing from server/migrations.`);
      } else if (entry.status === 'pending' && entry.outOfOrder) {
        warn(`Migration ${entry.id} is older than the last applied version. It runs now.`);
      }
    }
    if (!apply || plan.pending.length === 0) return report;

    logger.log(`🔄 Applying ${plan.pending.length} migration(s): ${report.pending.join(', ')}`);
    for (const migration of plan.pending) {
      try {
        const executionMs = await runMigration(connection, migration, logger);
        report.applied.push(migration.id);
        logger.log(`✅ Migration ${migration.id} applied (${executionMs} ms)`);
      } catch (error) {
        report.failed = {
          step: migration.id,
          message: error.message,
          ...(error.statementIndex ? { statementIndex: error.statementIndex, statementLine: error.statementLine } : {}),
        };
        logger.error(`❌ Migration ${migration.id} failed: ${error.message}`);
        logger.error(
          '   It was not recorded and the later migrations were not run. MySQL commits CREATE / ALTER at once, ' +
            'so earlier statements of this file may already be applied: check them (or restore the backup), ' +
            'fix the file, then run `bun run db:migrate`.'
        );
        break;
      }
    }
    report.pending = report.pending.filter((id) => !report.applied.includes(id));
    return report;
  } catch (error) {
    report.failed = { step: 'database', message: error.message };
    logger.error('❌ Migration runner failed:', error.message);
    return report;
  } finally {
    if (connection) {
      if (locked) await connection.query(`SELECT RELEASE_LOCK(${LOCK_NAME_SQL}) AS released`).catch(() => {});
      connection.release();
    }
  }
};
