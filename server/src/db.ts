import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type DB = DatabaseSync

export const TABLES = [
  'boards',
  'labels',
  'columns',
  'cards',
  'attachments',
  'items',
  'comments',
] as const
export type Table = (typeof TABLES)[number]
export const isTable = (t: string): t is Table => (TABLES as readonly string[]).includes(t)

/**
 * El servidor no conoce el esquema de las filas: guarda cada una como JSON (con la misma forma
 * que usa el cliente) y solo indexa lo necesario para sincronizar (usuario, tabla, id, updated_at).
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE rows (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, tbl, id)
  ) WITHOUT ROWID;
  CREATE INDEX rows_sync ON rows(user_id, tbl, updated_at);
  `,
  // 2: rol de administrador (puede crear y eliminar usuarios desde la app)
  `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;`,
]

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return db
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * Reloj estrictamente creciente (ms): cada escritura recibe un `updated_at` único, así el cliente
 * puede paginar "desde el cursor" sin perder ni repetir filas, aunque el reloj del sistema retroceda.
 */
export function createClock(db: DB) {
  const max = db.prepare('SELECT MAX(updated_at) AS m FROM rows').get() as { m: string | null }
  let last = max.m ? Date.parse(max.m) : 0
  return () => {
    last = Math.max(Date.now(), last + 1)
    return new Date(last).toISOString()
  }
}
