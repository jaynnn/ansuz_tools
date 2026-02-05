import sqlite3 from 'sqlite3';
import path from 'path';
import { logInfo, logError, logWarn } from './logger';

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

// Migration function to check and update table schema
const migrateStockPredictionsTable = async () => {
  try {
    // Check if the table exists
    const tableInfo: any = await dbGet(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stock_predictions'"
    );

    if (!tableInfo) {
      // Table doesn't exist, no migration needed
      return;
    }

    // Get current table schema
    const columns: any[] = await dbAll("PRAGMA table_info(stock_predictions)");
    const columnNames = columns.map((col: any) => col.name);

    // Check if prediction_date column exists
    const hasPredictionDate = columnNames.includes('prediction_date');
    const hasPredictionDateCamelCase = columnNames.includes('predictionDate');

    if (hasPredictionDate) {
      // Table already has the correct schema
      logInfo('stock_predictions_migration_skip', { reason: 'schema_up_to_date' });
      return;
    }

    if (hasPredictionDateCamelCase) {
      // Need to rename column from predictionDate to prediction_date
      logInfo('stock_predictions_migration_start', { reason: 'rename_predictionDate_column' });
      
      // SQLite doesn't support renaming columns directly in older versions
      // We need to recreate the table with the correct schema
      await dbRun('BEGIN TRANSACTION');
      
      try {
        // Create a new table with the correct schema
        await dbRun(`
          CREATE TABLE stock_predictions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            stock_info TEXT NOT NULL,
            prediction_date TEXT,
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

        // Copy data from old table to new table, renaming the column
        await dbRun(`
          INSERT INTO stock_predictions_new 
            (id, user_id, stock_info, prediction_date, predicted_change, predicted_percent, 
             actual_change, actual_percent, is_complete, created_at, updated_at)
          SELECT 
            id, user_id, stock_info, predictionDate, predicted_change, predicted_percent,
            actual_change, actual_percent, is_complete, created_at, updated_at
          FROM stock_predictions
        `);

        // Drop old table
        await dbRun('DROP TABLE stock_predictions');

        // Rename new table to original name
        await dbRun('ALTER TABLE stock_predictions_new RENAME TO stock_predictions');

        await dbRun('COMMIT');
        logInfo('stock_predictions_migration_success', { reason: 'renamed_predictionDate_column' });
      } catch (error) {
        await dbRun('ROLLBACK');
        throw error;
      }
    } else if (!hasPredictionDate) {
      // Column doesn't exist at all, need to add it
      logInfo('stock_predictions_migration_start', { reason: 'add_prediction_date_column' });
      
      try {
        await dbRun('ALTER TABLE stock_predictions ADD COLUMN prediction_date TEXT');
        logInfo('stock_predictions_migration_success', { reason: 'added_prediction_date_column' });
      } catch (error) {
        // If column already exists or other error, log and continue
        logWarn('stock_predictions_migration_warning', { 
          reason: 'failed_to_add_column',
          error: (error as Error).message 
        });
      }
    }
  } catch (error) {
    logError('stock_predictions_migration_error', error as Error);
    throw error;
  }
};

export const initDatabase = async () => {
  try {
    logInfo('database_init_start', { dbPath });
    
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
        prediction_date TEXT,
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

    // Run migrations to update existing tables if needed
    await migrateStockPredictionsTable();

    console.log('Database initialized successfully');
    logInfo('database_init_success', { dbPath });
  } catch (error) {
    console.error('Error initializing database:', error);
    logError('database_init_error', error as Error, { dbPath });
    throw error;
  }
};

export { db };
