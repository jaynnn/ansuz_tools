import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || './database.sqlite';
const db = new sqlite3.Database(dbPath);

// Promisified database methods with proper typing
export const dbRun = (sql: string, params: any[] = []): Promise<sqlite3.RunResult> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

export const dbGet = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const dbTransaction = async <T>(callback: () => Promise<T>): Promise<T> => {
  await dbRun('BEGIN TRANSACTION');
  try {
    const result = await callback();
    await dbRun('COMMIT');
    return result;
  } catch (error) {
    await dbRun('ROLLBACK');
    throw error;
  }
};

export const initDatabase = async () => {
  try {
    // Create users table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tools table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        tags TEXT,
        url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create stock_predictions table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS stock_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        stock_info TEXT NOT NULL,
        predicted_change TEXT NOT NULL,
        predicted_percent REAL NOT NULL DEFAULT 0,
        actual_change TEXT NOT NULL,
        actual_percent REAL NOT NULL DEFAULT 0,
        is_complete INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export { db };
