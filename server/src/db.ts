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
  // 3: tableros compartidos. rows.user_id pasa a ser el DUEÑO del tablero; board_id indexa a qué
  // tablero pertenece cada fila para saber quién puede verla. blob_owners dice quién subió cada imagen.
  `
  ALTER TABLE rows ADD COLUMN board_id TEXT;
  CREATE INDEX rows_board ON rows(board_id);
  UPDATE rows SET board_id = id WHERE tbl = 'boards';
  UPDATE rows SET board_id = json_extract(data, '$.boardId') WHERE tbl IN ('columns', 'cards', 'labels');
  UPDATE rows SET board_id = (
    SELECT json_extract(c.data, '$.boardId') FROM rows c
    WHERE c.user_id = rows.user_id AND c.tbl = 'cards' AND c.id = json_extract(rows.data, '$.cardId')
  ) WHERE tbl IN ('attachments', 'items', 'comments');
  CREATE TABLE board_members (
    board_id TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (board_id, user_id)
  );
  CREATE INDEX members_user ON board_members(user_id);
  CREATE TABLE blob_owners (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );
  `,
  // 4: alias (nombre para mostrar) de cada usuario; vacío = se muestra el correo
  `ALTER TABLE users ADD COLUMN alias TEXT NOT NULL DEFAULT '';`,
  // 5: centro de notificaciones. No son filas de sincronización: se piden aparte (GET /api/notifications).
  // `title` guarda el título de la tarjeta (o del tablero) en el momento del aviso; `count` agrupa avisos
  // repetidos de la misma tarjeta y tipo.
  `
  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    card_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX notifications_user ON notifications(user_id, read_at, created_at);
  CREATE INDEX notifications_card ON notifications(user_id, card_id);
  `,
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
