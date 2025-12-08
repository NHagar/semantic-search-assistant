import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dbDir = dirname(config.DATABASE_PATH);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.DATABASE_PATH);

    // Load sqlite-vec extension
    sqliteVec.load(db);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema(db);

    // Initialize vector table
    initializeVectorTable(db);
  }

  return db;
}

function initializeSchema(database: Database.Database): void {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

function initializeVectorTable(database: Database.Database): void {
  // Check if vector table exists
  const tableExists = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='chunks_vec'
  `).get();

  if (!tableExists) {
    // Create virtual table for vector storage (384 dimensions for bge-small)
    database.exec(`
      CREATE VIRTUAL TABLE chunks_vec USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding float[384]
      )
    `);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Helper for transactions
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const database = getDb();
  return database.transaction(fn)(database);
}
