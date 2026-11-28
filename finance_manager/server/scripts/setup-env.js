#!/usr/bin/env node
// Creates finance_manager/server/.env from .env.example (never overwrites, unless --force), then prints the
// resulting configuration with masked passwords. `--check` also tries both database logins.
//   bun run setup-env            create .env if missing + summary
//   bun run setup-env --check    + connection test (finance DB read / write, sales DB read only)
//   bun run setup-env --force    replace an existing .env with the example (asks nothing: use with care)
import { copyFileSync, existsSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { ConfigError, ENV_EXAMPLE_FILE, ENV_FILE, config, configSummary } from '../config/env.js';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const check = args.has('--check');

if (!existsSync(ENV_EXAMPLE_FILE)) {
  console.error(`❌ Missing ${ENV_EXAMPLE_FILE}`);
  process.exit(1);
}

if (!existsSync(ENV_FILE) || force) {
  copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
  console.log(`✅ ${force ? 'Replaced' : 'Created'} ${ENV_FILE} from .env.example`);
} else {
  console.log(`ℹ️  ${ENV_FILE} already exists (kept as is, use --force to replace it)`);
}

let cfg;
try {
  cfg = config();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    for (const warning of error.warnings) console.warn(`⚠️  ${warning}`);
    process.exit(1);
  }
  throw error;
}

console.log('\nfinance_manager configuration');
for (const line of configSummary(cfg)) console.log(`  ${line}`);
for (const warning of cfg.warnings) console.warn(`⚠️  ${warning}`);

const tryLogin = async (label, { host, port, user, password, database }, withDatabase) => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 4000,
      ...(withDatabase ? { database } : {}),
    });
    await connection.query('SELECT 1');
    console.log(`✅ ${label}: login OK`);
    return true;
  } catch (error) {
    console.error(`❌ ${label}: ${error.code || ''} ${error.message}`);
    return false;
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
};

if (check) {
  console.log('');
  // The finance database may not exist yet (the API creates it), so only the server login is tested.
  const financeOk = await tryLogin('Finance DB server', cfg.financeDb, false);
  const salesOk = await tryLogin(`Sales DB ${cfg.salesDb.database}`, cfg.salesDb, true);
  process.exit(financeOk && salesOk ? 0 : 1);
}
