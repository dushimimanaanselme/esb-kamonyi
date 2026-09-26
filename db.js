const mysql = require('mysql2/promise');

let pool = null;
async function getPool() {
  if (pool) return pool;
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'esb_kamonyi',
      waitForConnections: true,
      connectionLimit: 10
    });
    await pool.query('SELECT 1');
    console.log('MySQL connected');
  } catch (e) {
    console.log('MySQL unavailable, using in-memory store. ' + e.message);
    pool = null;
  }
  return pool;
}
module.exports = { getPool };
