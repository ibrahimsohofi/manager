import mysql from 'mysql2/promise';
import fs from 'node:fs';
const c = await mysql.createConnection({ socketPath: '/tmp/mdb/run/mysqld.sock', user: 'root', multipleStatements: true });
await c.query("ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD(''); FLUSH PRIVILEGES;");
await c.query('DROP DATABASE IF EXISTS bricojamal; CREATE DATABASE bricojamal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE bricojamal;');
await c.query(fs.readFileSync('/home/project/manager/databases/bricojamal.sql', 'utf8'));
const [t] = await c.query('SHOW TABLES');
console.log('tables:', t.map(r => Object.values(r)[0]).join(', '));
for (const tbl of ['customers', 'sales']) { const [[r]] = await c.query(`SELECT COUNT(*) n FROM ${tbl}`); console.log(tbl, r.n); }
const [s] = await c.query('SELECT id, name, code, phone FROM customers LIMIT 5'); console.table(s);
await c.end();
