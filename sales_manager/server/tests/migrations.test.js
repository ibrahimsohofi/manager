// Versioned migration runner (ROADMAP_V2.md P-03): SQL splitter, file discovery, plan and apply.
// Run: bun run test   (node --test tests/*.test.js)
// `createTestPool` is a test double of a mysql2 pool used only by these tests (never by the API).
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import {
  applyMigrations,
  checksumOf,
  formatStatus,
  loadMigrations,
  planMigrations,
  splitSqlStatements,
} from '../config/migrations.js';

const silent = { log() {}, warn() {}, error() {} };
const tempDirs = [];

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Writes `files` ({ name: contents }) in a new temp folder (ESM, like server/package.json). */
const makeDir = async (files = {}) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'migrations-test-'));
  tempDirs.push(dir);
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(dir, name), contents);
  }
  return dir;
};

/**
 * Test double: one connection, `schema_migrations` rows kept in memory, inserts kept until commit.
 * @param {{applied?: object[], failOn?: RegExp, lockGranted?: boolean}} [options]
 */
const createTestPool = ({ applied = [], failOn = null, lockGranted = true } = {}) => {
  const state = {
    applied: applied.map((row) => ({ ...row })),
    executed: [],
    params: [],
    connections: 0,
    released: 0,
    locks: 0,
    unlocks: 0,
    commits: 0,
    rollbacks: 0,
    tableCreated: false,
  };
  let buffered = null;
  const connection = {
    async query(sql, params) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT GET_LOCK')) {
        state.locks += 1;
        return [[{ got: lockGranted ? 1 : 0 }]];
      }
      if (text.startsWith('SELECT RELEASE_LOCK')) {
        state.unlocks += 1;
        return [[{ released: 1 }]];
      }
      if (text.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        state.tableCreated = true;
        return [{}];
      }
      if (text.startsWith('SELECT version, name, checksum')) {
        return [state.applied.map((row) => ({ ...row }))];
      }
      if (text.startsWith('INSERT INTO schema_migrations')) {
        const [version, name, checksum, executionMs] = params;
        const row = { version, name, checksum, execution_ms: executionMs, applied_at: new Date(2026, 10, 23, 9, 5) };
        if (buffered) buffered.push(row);
        else state.applied.push(row);
        return [{ affectedRows: 1 }];
      }
      if (failOn?.test(text)) throw new Error(`Table 'nope' doesn't exist`);
      state.executed.push(text);
      state.params.push(params);
      return [[{ ok: 1 }]];
    },
    async beginTransaction() {
      buffered = [];
    },
    async commit() {
      state.commits += 1;
      state.applied.push(...(buffered ?? []));
      buffered = null;
    },
    async rollback() {
      state.rollbacks += 1;
      buffered = null;
    },
    release() {
      state.released += 1;
    },
  };
  return {
    state,
    pool: {
      async getConnection() {
        state.connections += 1;
        return connection;
      },
    },
  };
};

describe('splitSqlStatements', () => {
  test('splits on ; and gives the start line of each statement', () => {
    const sql = 'UPDATE customers SET email = NULL;\n\nCREATE TABLE t (\n  id INT\n);\nALTER TABLE t ADD COLUMN x INT';
    assert.deepEqual(splitSqlStatements(sql), [
      { sql: 'UPDATE customers SET email = NULL', line: 1 },
      { sql: 'CREATE TABLE t (\n  id INT\n)', line: 3 },
      { sql: 'ALTER TABLE t ADD COLUMN x INT', line: 6 },
    ]);
  });

  test('keeps ; inside quotes, backticks, doubled quotes and backslash escapes', () => {
    const sql = [
      "INSERT INTO notes (body) VALUES ('a;b', 'it''s; fine', 'c\\';d');",
      'SELECT "x;y" AS `weird;name`;',
    ].join('\n');
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, 2);
    assert.equal(statements[0].sql, "INSERT INTO notes (body) VALUES ('a;b', 'it''s; fine', 'c\\';d')");
    assert.equal(statements[1].sql, 'SELECT "x;y" AS `weird;name`');
  });

  test('drops -- / # / block comments, keeps executable comments, respects 5--2', () => {
    const sql = [
      '-- header comment; not a statement',
      '# another; comment',
      '/* block; comment */',
      'SELECT 5--2; -- trailing',
      'CREATE TABLE t (id INT) /*!50100 ENGINE=InnoDB */;',
      '/* only a comment */;',
    ].join('\n');
    assert.deepEqual(splitSqlStatements(sql), [
      { sql: 'SELECT 5--2', line: 4 },
      { sql: 'CREATE TABLE t (id INT) /*!50100 ENGINE=InnoDB */', line: 5 },
    ]);
  });

  test('Arabic text and Windows line endings', () => {
    const sql = "INSERT INTO t (name) VALUES ('محمد; الحسني');\r\nSELECT 1;\r\n";
    assert.deepEqual(splitSqlStatements(sql), [
      { sql: "INSERT INTO t (name) VALUES ('محمد; الحسني')", line: 1 },
      { sql: 'SELECT 1', line: 2 },
    ]);
  });

  test('rejects DELIMITER and unclosed quotes / comments', () => {
    assert.throws(() => splitSqlStatements('DELIMITER //\nCREATE TRIGGER x'), /DELIMITER is not supported/);
    assert.throws(() => splitSqlStatements("SELECT 'oops;\nSELECT 2;"), /Unclosed ' quote \(line 1\)/);
    assert.throws(() => splitSqlStatements('SELECT 1;\n/* never closed'), /Unclosed \/\* comment \(line 2\)/);
  });

  test('empty or comment-only input gives no statement', () => {
    assert.deepEqual(splitSqlStatements(''), []);
    assert.deepEqual(splitSqlStatements('-- nothing\n;;\n'), []);
  });
});

describe('loadMigrations', () => {
  test('a missing folder means no migrations', async () => {
    const result = await loadMigrations(path.join(tmpdir(), 'does-not-exist-migrations-test'));
    assert.deepEqual(result, { migrations: [], ignored: [], errors: [] });
  });

  test('orders by version, pairs .sql + .js, ignores badly named files', async () => {
    const dir = await makeDir({
      '0002_customer_identity.sql': 'ALTER TABLE customers ADD COLUMN search_name VARCHAR(255) NULL;',
      '0002_customer_identity.js': 'export async function up() {}',
      '0001_tickets_and_nulls.sql': 'UPDATE customers SET email = NULL;\nSELECT 1;',
      '001_too_short.sql': 'SELECT 1;',
      '0003_Upper.sql': 'SELECT 1;',
      'README.md': 'not a migration',
    });
    const { migrations, ignored, errors } = await loadMigrations(dir);
    assert.deepEqual(errors, []);
    assert.deepEqual(ignored, ['0003_Upper.sql', '001_too_short.sql']);
    assert.deepEqual(
      migrations.map((m) => [m.id, m.statements.length, Boolean(m.sqlFile), Boolean(m.jsFile)]),
      [
        ['0001_tickets_and_nulls', 2, true, false],
        ['0002_customer_identity', 1, true, true],
      ]
    );
    assert.match(migrations[0].checksum, /^[0-9a-f]{64}$/);
  });

  test('reports a version used twice, bad SQL and an empty file', async () => {
    const dir = await makeDir({
      '0001_first.sql': 'SELECT 1;',
      '0001_second.sql': 'SELECT 2;',
      '0002_broken.sql': "SELECT 'never closed;",
      '0003_empty.sql': '-- nothing here\n',
    });
    const { migrations, errors } = await loadMigrations(dir);
    assert.deepEqual(migrations.map((m) => m.id), ['0001_first']);
    assert.equal(errors.length, 3);
    assert.match(errors[0], /Version 0001 is used twice: 0001_first and 0001_second/);
    assert.match(errors[1], /0002_broken\.sql: Unclosed ' quote/);
    assert.match(errors[2], /0003_empty\.sql has no SQL statement/);
  });

  test('checksum ignores line endings', () => {
    assert.equal(checksumOf('SELECT 1;\r\nSELECT 2;\r\n'), checksumOf('SELECT 1;\nSELECT 2;\n'));
    assert.notEqual(checksumOf('SELECT 1;'), checksumOf('SELECT 2;'));
  });
});

describe('planMigrations', () => {
  const files = [
    { version: '0001', name: 'a', id: '0001_a', checksum: 'c1' },
    { version: '0002', name: 'b', id: '0002_b', checksum: 'c2' },
    { version: '0004', name: 'd', id: '0004_d', checksum: 'c4' },
  ];

  test('applied / changed / missing / pending (out of order)', () => {
    const plan = planMigrations(files, [
      { version: '0001', name: 'a', checksum: 'c1', applied_at: '2026-11-20 10:00:00' },
      { version: '0003', name: 'c', checksum: 'c3' },
      { version: '0004', name: 'd', checksum: 'edited' },
    ]);
    assert.deepEqual(
      plan.entries.map((e) => [e.id, e.status, e.outOfOrder ?? null]),
      [
        ['0001_a', 'applied', null],
        ['0002_b', 'pending', true],
        ['0003_c', 'missing', null],
        ['0004_d', 'changed', null],
      ]
    );
    assert.deepEqual(plan.pending.map((m) => m.id), ['0002_b']);
    assert.deepEqual(plan.counts, { applied: 1, changed: 1, missing: 1, pending: 1 });
  });

  test('fresh database: everything pending, in order', () => {
    const plan = planMigrations(files, []);
    assert.deepEqual(plan.pending.map((m) => m.id), ['0001_a', '0002_b', '0004_d']);
    assert.ok(plan.entries.every((e) => e.status === 'pending' && e.outOfOrder === false));
  });
});

describe('applyMigrations', () => {
  test('applies pending versions in order, records them, then has nothing left to do', async () => {
    const dir = await makeDir({
      '0001_tickets_and_nulls.sql': "UPDATE customers SET email = NULL WHERE email = '';\nCREATE TABLE sale_tickets (id INT);",
      '0002_ticket_column.sql': 'ALTER TABLE sales ADD COLUMN ticket_id INT NULL;',
    });
    const { pool, state } = createTestPool();

    const first = await applyMigrations(pool, { dir, logger: silent });
    assert.equal(first.failed, null);
    assert.deepEqual(first.applied, ['0001_tickets_and_nulls', '0002_ticket_column']);
    assert.deepEqual(first.pending, []);
    assert.ok(state.tableCreated);
    assert.deepEqual(state.executed, [
      "UPDATE customers SET email = NULL WHERE email = ''",
      'CREATE TABLE sale_tickets (id INT)',
      'ALTER TABLE sales ADD COLUMN ticket_id INT NULL',
    ]);
    assert.ok(state.params.every((params) => params === undefined), 'statements run without placeholders');
    assert.deepEqual(state.applied.map((row) => row.version), ['0001', '0002']);
    assert.equal(state.commits, 2);
    assert.equal(state.unlocks, 1);
    assert.equal(state.released, 1);

    const second = await applyMigrations(pool, { dir, logger: silent });
    assert.deepEqual(second.applied, []);
    assert.equal(state.executed.length, 3, 'nothing runs twice');
    assert.deepEqual(second.plan.counts, { applied: 2, changed: 0, missing: 0, pending: 0 });
  });

  test('a failing statement stops the run: version not recorded, later ones stay pending', async () => {
    const dir = await makeDir({
      '0001_ok.sql': 'CREATE TABLE a (id INT);',
      '0002_bad.sql': 'UPDATE customers SET code = NULL;\n\nALTER TABLE nope ADD COLUMN x INT;',
      '0003_later.sql': 'CREATE TABLE c (id INT);',
    });
    const { pool, state } = createTestPool({ failOn: /ALTER TABLE nope/ });
    const report = await applyMigrations(pool, { dir, logger: silent });

    assert.deepEqual(report.applied, ['0001_ok']);
    assert.deepEqual(report.pending, ['0002_bad', '0003_later']);
    assert.equal(report.failed.step, '0002_bad');
    assert.equal(report.failed.statementIndex, 2);
    assert.equal(report.failed.statementLine, 3);
    assert.match(report.failed.message, /statement 2\/2 \(line 3\): Table 'nope' doesn't exist/);
    assert.deepEqual(state.applied.map((row) => row.version), ['0001']);
    assert.equal(state.rollbacks, 1);
    assert.ok(!state.executed.includes('CREATE TABLE c (id INT)'));
    assert.equal(state.unlocks, 1, 'lock released after a failure');
    assert.equal(state.released, 1);
  });

  test('apply: false only lists the pending versions', async () => {
    const dir = await makeDir({ '0001_a.sql': 'CREATE TABLE a (id INT);' });
    const { pool, state } = createTestPool();
    const report = await applyMigrations(pool, { dir, logger: silent, apply: false });
    assert.deepEqual(report.pending, ['0001_a']);
    assert.deepEqual(report.applied, []);
    assert.deepEqual(state.executed, []);
    assert.equal(state.applied.length, 0);
  });

  test('lock held by another process: nothing runs', async () => {
    const dir = await makeDir({ '0001_a.sql': 'CREATE TABLE a (id INT);' });
    const { pool, state } = createTestPool({ lockGranted: false });
    const report = await applyMigrations(pool, { dir, logger: silent, lockTimeoutSeconds: 1 });
    assert.equal(report.failed.step, 'lock');
    assert.equal(state.tableCreated, false);
    assert.deepEqual(state.executed, []);
    assert.equal(state.unlocks, 0);
    assert.equal(state.released, 1);
  });

  test('broken files: the database is not touched', async () => {
    const dir = await makeDir({ '0001_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 2;' });
    const { pool, state } = createTestPool();
    const report = await applyMigrations(pool, { dir, logger: silent });
    assert.equal(report.failed.step, 'load');
    assert.equal(state.connections, 0);
  });

  test('JS step runs after the SQL, in the same transaction, with query()', async () => {
    const dir = await makeDir({
      '0001_identity.sql': 'ALTER TABLE customers ADD COLUMN search_name VARCHAR(255) NULL;',
      '0001_identity.js': [
        'export async function up({ query }) {',
        "  const rows = await query('SELECT id, name FROM customers WHERE search_name IS NULL');",
        "  await query('UPDATE customers SET search_name = ? WHERE id = ?', ['ok', rows.length]);",
        '}',
      ].join('\n'),
    });
    const { pool, state } = createTestPool();
    const report = await applyMigrations(pool, { dir, logger: silent });
    assert.equal(report.failed, null);
    assert.deepEqual(state.executed, [
      'ALTER TABLE customers ADD COLUMN search_name VARCHAR(255) NULL',
      'SELECT id, name FROM customers WHERE search_name IS NULL',
      'UPDATE customers SET search_name = ? WHERE id = ?',
    ]);
    assert.deepEqual(state.params.at(-1), ['ok', 1]);
    assert.deepEqual(state.applied.map((row) => row.name), ['identity']);
  });

  test('JS step without up(): fails before anything runs', async () => {
    const dir = await makeDir({ '0001_nothing.js': 'export const x = 1;' });
    const { pool, state } = createTestPool();
    const report = await applyMigrations(pool, { dir, logger: silent });
    assert.equal(report.failed.step, '0001_nothing');
    assert.match(report.failed.message, /must export an async up\(\) function/);
    assert.equal(state.applied.length, 0);
  });

  test('a file edited after it was applied is not run again (warning only)', async () => {
    const dir = await makeDir({ '0001_a.sql': 'CREATE TABLE a (id INT, extra INT);' });
    const { pool, state } = createTestPool({
      applied: [{ version: '0001', name: 'a', checksum: checksumOf('CREATE TABLE a (id INT);'), execution_ms: 3 }],
    });
    const report = await applyMigrations(pool, { dir, logger: silent });
    assert.equal(report.failed, null);
    assert.deepEqual(report.applied, []);
    assert.deepEqual(state.executed, []);
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /0001_a was edited after it was applied/);
  });

  test('no migration files yet: only the tracking table is created', async () => {
    const dir = await makeDir();
    const { pool, state } = createTestPool();
    const report = await applyMigrations(pool, { dir, logger: silent });
    assert.equal(report.failed, null);
    assert.ok(state.tableCreated);
    assert.deepEqual(report.plan.entries, []);
  });
});

describe('formatStatus', () => {
  test('lists every version with a summary and the backup hint', () => {
    const plan = planMigrations(
      [
        { version: '0001', name: 'tickets_and_nulls', id: '0001_tickets_and_nulls', checksum: 'c1' },
        { version: '0002', name: 'customer_identity', id: '0002_customer_identity', checksum: 'c2' },
      ],
      [{ version: '0001', name: 'tickets_and_nulls', checksum: 'c1', applied_at: new Date(2026, 10, 23, 9, 5) }]
    );
    const lines = formatStatus(plan, { target: 'bricojamal@localhost:3306' });
    assert.equal(lines[0], 'Schema migrations - bricojamal@localhost:3306');
    assert.equal(lines[1], '  0001  tickets_and_nulls  applied   2026-11-23 09:05');
    assert.equal(lines[2], '  0002  customer_identity  pending');
    assert.ok(lines.includes('1 applied, 1 pending'));
    assert.equal(lines.at(-1), 'Back up the database, then run: bun run db:migrate');
  });

  test('empty folder and no tracking table', () => {
    const lines = formatStatus(planMigrations([], []), { tableExists: false });
    assert.ok(lines.includes('No schema_migrations table yet: nothing has been applied.'));
    assert.ok(lines.includes('No migration files in server/migrations yet.'));
    assert.ok(lines.includes('0 applied, 0 pending'));
  });
});
