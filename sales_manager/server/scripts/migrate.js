// Versioned schema migrations from the command line (ROADMAP_V2.md P-03). Run from sales_manager/server:
//   bun run db:status    read only: applied / pending versions (creates nothing, changes nothing)
//   bun run db:migrate   same start-up schema setup as the API, then applies the pending versions
// Back up first:  mysqldump -u root -p bricojamal > bricojamal_backup.sql
// Exit code 1 when MySQL can't be reached or a migration fails.
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/dbConfig.js';
import { applyMigrations, formatStatus, loadMigrations, MIGRATIONS_TABLE, planMigrations } from '../config/migrations.js';

const target = `${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`;

// mysql2 can throw an error with an empty message (ECONNREFUSED on `localhost`)
const describeError = (error) =>
  error.message ||
  error.errors?.map((inner) => inner.message).find(Boolean) ||
  (error.code === 'ECONNREFUSED' ? 'nothing is listening: MySQL is not running or not reachable' : 'connection failed');

const status = async () => {
  const { migrations, ignored, errors } = await loadMigrations();
  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      charset: dbConfig.charset,
      connectTimeout: 5000,
    });
  } catch (error) {
    if (error.code === 'ER_BAD_DB_ERROR') {
      // Database not created yet: everything is pending
      const plan = planMigrations(migrations, []);
      console.log(`Database ${dbConfig.database} does not exist yet (it is created when the API starts).`);
      console.log(formatStatus(plan, { target, ignored, errors, tableExists: false }).join('\n'));
      return errors.length > 0 ? 1 : 0;
    }
    throw error;
  }
  try {
    const [tables] = await connection.query(
      'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [MIGRATIONS_TABLE]
    );
    const tableExists = Number(tables[0]?.n) > 0;
    const [rows] = tableExists
      ? await connection.query(`SELECT version, name, checksum, execution_ms, applied_at FROM ${MIGRATIONS_TABLE}`)
      : [[]];
    const plan = planMigrations(migrations, rows);
    console.log(formatStatus(plan, { target, ignored, errors, tableExists }).join('\n'));
    return errors.length > 0 ? 1 : 0;
  } finally {
    await connection.end();
  }
};

const migrate = async () => {
  // database.js connects on import and runs the whole start-up schema setup (tables, legacy steps), then
  // the versioned migrations. This command always applies them, even with DB_AUTO_MIGRATE=false in .env
  // (dotenv never overrides a variable that is already set).
  process.env.DB_AUTO_MIGRATE = 'true';
  // Namespace import: `db.pool` is a live binding (null until database.js has connected), so it is read
  // after `databaseReady`, never destructured up front.
  const db = await import('../config/database.js');
  const { migrations: report } = await db.databaseReady;
  try {
    if (report.failed) {
      console.error(`\nMigration stopped (${report.failed.step}): ${report.failed.message}`);
      return 1;
    }
    console.log(
      report.applied.length > 0
        ? `\nDone: ${report.applied.length} migration(s) applied on ${target}.`
        : `\nNothing to apply: ${target} is up to date.`
    );
    return 0;
  } finally {
    await db.pool?.end();
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/migrate.js [--status]');
    return 0;
  }
  if (args.includes('--status')) return status();
  // Same check as the API, before database.js connects (it calls process.exit on a fatal error)
  const { errors } = await loadMigrations();
  if (errors.length > 0) {
    console.error(`Fix the migration files first:\n${errors.map((error) => `  x ${error}`).join('\n')}`);
    return 1;
  }
  return migrate();
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`❌ ${error.code ? `${error.code}: ` : ''}${describeError(error)} (${target})`);
    console.error('💡 Check that MySQL is running and the DB_* settings in .env');
    process.exit(1);
  });
