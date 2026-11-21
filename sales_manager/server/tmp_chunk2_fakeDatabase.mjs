// TEMP (Chunk 2 check): same exports as config/database.js, backed by an in-memory statement log.
export const fakeState = {
  statements: [],
  nextId: 1,
  costColumnsMissing: false,
};

export const pool = {
  async execute(sql, params = []) {
    fakeState.statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (fakeState.costColumnsMissing && /INSERT INTO sales/i.test(sql) && /unit_cost/.test(sql)) {
      const error = new Error("Unknown column 'unit_cost' in 'field list'");
      error.code = 'ER_BAD_FIELD_ERROR';
      throw error;
    }
    if (/^\s*INSERT/i.test(sql)) {
      const id = fakeState.nextId++;
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (/^\s*(UPDATE|DELETE)/i.test(sql)) return [{ insertId: 0, affectedRows: 1 }];
    return [[]];
  },
};

const dbHelpers = {
  async get(query, params = []) {
    const [rows] = await pool.execute(query, params);
    return rows[0] || null;
  },
  async all(query, params = []) {
    const [rows] = await pool.execute(query, params);
    return rows;
  },
  async run(query, params = []) {
    const [result] = await pool.execute(query, params);
    return {
      lastID: result.insertId,
      changes: result.affectedRows,
      insertId: result.insertId,
      affectedRows: result.affectedRows,
    };
  },
};

export default dbHelpers;
export const getDatabase = () => dbHelpers;
