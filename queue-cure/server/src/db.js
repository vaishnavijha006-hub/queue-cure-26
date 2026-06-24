// src/db.js
// Uses Node's built-in SQLite (node:sqlite) — no native compilation needed.
// Requires Node.js v22.5+ (you're on v24, so this works perfectly).

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || './data/queue.db';
const resolvedPath = path.resolve(__dirname, '..', DB_PATH);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const raw = new DatabaseSync(resolvedPath);

// Thin wrapper so the rest of the app can keep using the better-sqlite3-style
// API (prepare().run/get/all, db.transaction(fn)) without any other file changing.
function wrapStmt(stmt) {
  return {
    run: (...args) => {
      const info = stmt.run(...args);
      return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    },
    get: (...args) => stmt.get(...args),
    all: (...args) => stmt.all(...args),
  };
}

const db = {
  exec: (sql) => raw.exec(sql),
  pragma: () => {}, // no-op, node:sqlite doesn't need this
  prepare: (sql) => wrapStmt(raw.prepare(sql)),
  transaction: (fn) => {
    return (...args) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    };
  },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS clinic_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    avg_consult_minutes REAL NOT NULL DEFAULT 8,
    now_serving_token_id INTEGER,
    last_called_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_number INTEGER NOT NULL,
    patient_name TEXT NOT NULL,
    phone TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    called_at TEXT,
    consult_started_at TEXT,
    done_at TEXT,
    queue_date TEXT NOT NULL DEFAULT (date('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
  CREATE INDEX IF NOT EXISTS idx_tokens_date ON tokens(queue_date);
`);

const stateRow = db.prepare('SELECT * FROM clinic_state WHERE id = 1').get();
if (!stateRow) {
  const defaultAvg = Number(process.env.DEFAULT_AVG_CONSULT_MINUTES) || 8;
  db.prepare(
    'INSERT INTO clinic_state (id, avg_consult_minutes, now_serving_token_id, last_called_at) VALUES (1, ?, NULL, NULL)'
  ).run(defaultAvg);
}

module.exports = db;