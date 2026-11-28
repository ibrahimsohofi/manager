// MySQL settings of the sales API (`bricojamal`), from the environment / `.env` in the current folder.
// Shared by config/database.js (connects on import) and `bun run db:status` (read only, no side effect).
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bricojamal',
  multipleStatements: true,
  charset: 'utf8mb4'
};
