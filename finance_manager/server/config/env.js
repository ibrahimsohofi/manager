// Configuration of the finance API (FINANCE_PLAN.md §1, §1.1). The only file that reads process.env.
// config() loads finance_manager/server/.env once (shell variables win over the file), checks every
// value and returns a frozen object. checkConfig(env) / buildConfig(env) do the same from a plain
// object: no file, no process.env, so they are unit-testable.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = path.join(SERVER_DIR, '.env');
export const ENV_EXAMPLE_FILE = path.join(SERVER_DIR, '.env.example');

export const DEFAULTS = Object.freeze({
  PORT: 3002,
  // Loopback only: the finance frontend reaches the API through the Vite /api proxy on the same machine,
  // so the money data is not exposed on the shop network. Set HOST=0.0.0.0 to reach it from other devices.
  HOST: '127.0.0.1',
  DB_HOST: 'localhost',
  DB_PORT: 3306,
  DB_USER: 'root',
  DB_NAME: 'finance_manager',
  SALES_DB_NAME: 'bricojamal',
  PRODUCTS_API_URL: 'http://localhost:5000',
  SALES_APP_URL: 'http://localhost:5174',
  CORS_ORIGINS: 'http://localhost:5175,http://127.0.0.1:5175',
  SESSION_IDLE_MINUTES: 15,
});

// The catalogue database: finance tables must never be created there either.
const CATALOGUE_DB_NAME = 'products_manager';
const DB_NAME_RE = /^[A-Za-z0-9_]{1,64}$/;
// Ports of the other apps (README "Ports"). Not an error: only a likely copy / paste mistake.
const OTHER_APP_PORTS = new Map([
  [5000, 'products_manager API'],
  [3001, 'sales_manager API'],
  [5173, 'products_manager frontend'],
  [5174, 'sales_manager frontend'],
  [5175, 'finance_manager frontend'],
]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class ConfigError extends Error {
  constructor(problems, warnings = []) {
    super(`Invalid finance_manager configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
    this.warnings = warnings;
  }
}

const trimmed = (value) => (value === undefined || value === null ? '' : String(value).trim());
const sameHost = (a, b) => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || (LOOPBACK_HOSTS.has(left) && LOOPBACK_HOSTS.has(right));
};

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

/**
 * Reads and checks every setting. Never throws.
 * @returns {{config: object, problems: string[], warnings: string[]}}
 */
export const checkConfig = (env = {}) => {
  const problems = [];
  const warnings = [];
  const get = (key) => trimmed(env[key]);
  // Passwords are kept as typed (no trim). dotenv already trims unquoted values.
  const secret = (key) => (env[key] === undefined || env[key] === null ? '' : String(env[key]));

  const int = (key, fallback, min, max) => {
    const raw = get(key);
    if (raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${key} must be a whole number from ${min} to ${max} (got "${raw}")`);
      return fallback;
    }
    return n;
  };

  const dbName = (key, fallback) => {
    const name = get(key) || fallback;
    if (!DB_NAME_RE.test(name)) {
      problems.push(`${key} may only contain letters, digits and _ (got "${name}")`);
      return fallback;
    }
    return name;
  };

  const httpUrl = (key, fallback) => {
    const raw = get(key) || fallback;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      return raw.replace(/\/+$/, '');
    } catch {
      problems.push(`${key} must be an http(s) URL (got "${raw}")`);
      return fallback;
    }
  };

  // ---------- Server ----------
  const nodeEnv = get('NODE_ENV') || 'development';
  const server = {
    port: int('PORT', DEFAULTS.PORT, 1, 65535),
    host: get('HOST') || DEFAULTS.HOST,
    nodeEnv,
    isProduction: nodeEnv === 'production',
  };
  if (OTHER_APP_PORTS.has(server.port)) {
    warnings.push(`PORT ${server.port} is the ${OTHER_APP_PORTS.get(server.port)} port. The finance API uses 3002.`);
  }

  // ---------- Finance database (read / write, decision 27) ----------
  const financeDb = {
    host: get('DB_HOST') || DEFAULTS.DB_HOST,
    port: int('DB_PORT', DEFAULTS.DB_PORT, 1, 65535),
    user: get('DB_USER') || DEFAULTS.DB_USER,
    password: secret('DB_PASSWORD'),
    database: dbName('DB_NAME', DEFAULTS.DB_NAME),
  };

  // ---------- Sales database (read only, §1.1) ----------
  // SALES_DB_* fall back to DB_*. The password goes with the user: SALES_DB_PASSWORD is only read
  // when SALES_DB_USER is set, so the root password is never paired with another user by mistake.
  const ownSalesUser = get('SALES_DB_USER') !== '';
  const salesDb = {
    host: get('SALES_DB_HOST') || financeDb.host,
    port: get('SALES_DB_PORT') === '' ? financeDb.port : int('SALES_DB_PORT', financeDb.port, 1, 65535),
    user: ownSalesUser ? get('SALES_DB_USER') : financeDb.user,
    password: ownSalesUser ? secret('SALES_DB_PASSWORD') : financeDb.password,
    database: dbName('SALES_DB_NAME', DEFAULTS.SALES_DB_NAME),
    ownUser: ownSalesUser,
  };
  if (!ownSalesUser && secret('SALES_DB_PASSWORD') !== '') {
    warnings.push('SALES_DB_PASSWORD is ignored because SALES_DB_USER is empty (the DB_* login is used).');
  }

  // The finance tables must never be created in another app's database.
  const sameServer = sameHost(financeDb.host, salesDb.host) && financeDb.port === salesDb.port;
  if (sameServer && financeDb.database.toLowerCase() === salesDb.database.toLowerCase()) {
    problems.push(
      `DB_NAME and SALES_DB_NAME are both "${financeDb.database}" on the same server. ` +
        'DB_NAME is the finance database (default finance_manager), never the sales database.'
    );
  }
  if (financeDb.database.toLowerCase() === CATALOGUE_DB_NAME) {
    problems.push(`DB_NAME "${financeDb.database}" is the catalogue database. Use finance_manager.`);
  }

  if (server.isProduction) {
    if (!ownSalesUser) {
      warnings.push(
        'SALES_DB_USER is empty: the sales are read with the finance login. In production, use a MySQL user ' +
          `with GRANT SELECT ON ${salesDb.database}.* only (FINANCE_PLAN.md §1.1).`
      );
    }
    if (financeDb.user === 'root') {
      warnings.push(`DB_USER is root. In production, use a user limited to ${financeDb.database}.*.`);
    }
  }

  // ---------- Other apps ----------
  const productsApiUrl = httpUrl('PRODUCTS_API_URL', DEFAULTS.PRODUCTS_API_URL);
  const salesAppUrl = httpUrl('SALES_APP_URL', DEFAULTS.SALES_APP_URL);

  // ---------- Security ----------
  const corsOrigins = [];
  for (const raw of (get('CORS_ORIGINS') || DEFAULTS.CORS_ORIGINS).split(',')) {
    const origin = raw.trim();
    if (!origin) continue;
    if (origin === '*') {
      problems.push('CORS_ORIGINS cannot be "*": list the allowed origins (the finance data stays private).');
      continue;
    }
    try {
      const url = new URL(origin);
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== origin.replace(/\/$/, '')) {
        throw new Error('not an origin');
      }
      if (!corsOrigins.includes(url.origin)) corsOrigins.push(url.origin);
    } catch {
      problems.push(`CORS_ORIGINS: "${origin}" is not an origin like http://localhost:5175`);
    }
  }

  const session = {
    idleMinutes: int('SESSION_IDLE_MINUTES', DEFAULTS.SESSION_IDLE_MINUTES, 1, 1440),
  };

  return {
    config: { server, financeDb, salesDb, productsApiUrl, salesAppUrl, corsOrigins, session, warnings },
    problems,
    warnings,
  };
};

/** Like checkConfig, but throws a ConfigError listing every problem. Returns a frozen object. */
export const buildConfig = (env = {}) => {
  const { config: built, problems, warnings } = checkConfig(env);
  if (problems.length > 0) throw new ConfigError(problems, warnings);
  return deepFreeze(built);
};

let cached = null;

/**
 * The configuration of this process, read once. Loads server/.env when it exists (never overrides
 * a variable already set in the shell). Throws a ConfigError on invalid values.
 */
export const config = () => {
  if (cached) return cached;
  const found = existsSync(ENV_FILE);
  if (found) dotenv.config({ path: ENV_FILE, quiet: true });
  cached = deepFreeze({ ...buildConfig(process.env), envFile: { path: ENV_FILE, found } });
  return cached;
};

/** Tests only: the next config() call reads process.env again. */
export const resetConfig = () => {
  cached = null;
};

const mask = (password) => (password ? '•'.repeat(8) : '(empty)');
const dbLabel = ({ user, password, host, port, database }) =>
  `${user}:${mask(password)}@${host}:${port}/${database}`;

/** Human-readable lines for logs and setup-env. Passwords are masked. */
export const configSummary = (cfg) => [
  `API         http://${cfg.server.host}:${cfg.server.port} (${cfg.server.nodeEnv})`,
  `Finance DB  ${dbLabel(cfg.financeDb)}  read / write`,
  `Sales DB    ${dbLabel(cfg.salesDb)}  read only${cfg.salesDb.ownUser ? '' : ' (DB_* login)'}`,
  `Products    ${cfg.productsApiUrl}`,
  `Sales app   ${cfg.salesAppUrl}`,
  `CORS        ${cfg.corsOrigins.join(', ') || '(none)'}`,
  `PIN lock    after ${cfg.session.idleMinutes} min without activity`,
];
