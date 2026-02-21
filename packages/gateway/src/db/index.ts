/**
 * Database connection and initialization
 */

import Database, { type Database as SQLiteDatabase } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize database connection
 */
export function initDatabase(dbPath?: string): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: SQLiteDatabase;
} {
  const databasePath = dbPath || process.env.DATABASE_URL || './.corelink/corelink.db';

  // Ensure directory exists
  const dir = path.dirname(databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create SQLite connection
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL'); // Better concurrency

  // Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

/**
 * Run database migrations
 */
export function runMigrations(db: ReturnType<typeof initDatabase>['db']) {
  const migrationsPath = path.join(__dirname, '../../drizzle');

  if (fs.existsSync(migrationsPath)) {
    migrate(db, { migrationsFolder: migrationsPath });
  }
}

export { schema };
export type Database = ReturnType<typeof initDatabase>['db'];
