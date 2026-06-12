import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = process.env.DATABASE_URL 
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER || 'trace_user',
      password: process.env.DB_PASSWORD || 'trace_password',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'trace_db',
    });

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] executed in ${duration}ms`, { text });
    return res;
  } catch (err) {
    console.error('[DB Query Error]', err);
    throw err;
  }
}

export async function getClient() {
  return await pool.connect();
}

export async function initDb() {
  console.log('Initializing database schema...');
  const initSqlPath = path.join(__dirname, '../../init.sql');
  
  if (!fs.existsSync(initSqlPath)) {
    console.error(`init.sql not found at: ${initSqlPath}`);
    return;
  }

  const sql = fs.readFileSync(initSqlPath, 'utf8');
  
  try {
    // Run the schema setup
    await query(sql);
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
}

export default pool;
