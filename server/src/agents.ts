import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DB } from './db.ts'

/**
 * Conexiones de agentes externos (Hermes, Claude…) por API con token. El administrador las crea y elige a qué tableros llega
 * cada una y con qué nivel. El token se muestra una sola vez: aquí solo se guarda su huella.
 */
export type Access = 'read' | 'write'

export interface AgentBoard {
  boardId: string
  access: Access
}

export interface AgentView {
  id: string
  name: string
  description: string
  tokenPrefix: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  canNotify: boolean
  canContacts: boolean
  boards: AgentBoard[]
}

export const TOKEN_PREFIX = 'kbn_'
export const MAX_NAME = 60
export const MAX_DESCRIPTION = 300

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Token nuevo: `kbn_` + 256 bits aleatorios en base64url. */
export const newToken = () => TOKEN_PREFIX + randomBytes(32).toString('base64url')

interface Raw {
  id: string
  name: string
  description: string
  token_prefix: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  can_notify: number
  can_contacts: number
}

export class Agents {
  private db: DB
  /** Ventanas deslizantes en memoria para limitar el uso (se reinician con el servidor). */
  private hits = new Map<string, number[]>()

  constructor(db: DB) {
    this.db = db
  }

  private view(r: Raw): AgentView {
    const boards = this.db
      .prepare('SELECT board_id, access FROM agent_boards WHERE agent_id = ? ORDER BY board_id')
      .all(r.id) as { board_id: string; access: Access }[]
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      tokenPrefix: r.token_prefix,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      lastUsedAt: r.last_used_at,
      canNotify: r.can_notify === 1,
      canContacts: r.can_contacts === 1,
      boards: boards.map((b) => ({ boardId: b.board_id, access: b.access })),
    }
  }

  list(): AgentView[] {
    return (
      this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as unknown as Raw[]
    ).map((r) => this.view(r))
  }

  get(id: string): AgentView | null {
    const r = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as unknown as
      | Raw
      | undefined
    return r ? this.view(r) : null
  }

  create(input: {
    name: string
    description: string
    createdBy: string
    expiresAt: string | null
    canNotify: boolean
    canContacts: boolean
    boards: AgentBoard[]
  }): { agent: AgentView; token: string } {
    const id = randomUUID()
    const token = newToken()
    this.db
      .prepare(
        `INSERT INTO agents (id, name, description, token_hash, token_prefix, created_by, created_at, expires_at, can_notify, can_contacts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description,
        sha256(token),
        token.slice(0, 12),
        input.createdBy,
        new Date().toISOString(),
        input.expiresAt,
        input.canNotify ? 1 : 0,
        input.canContacts ? 1 : 0,
      )
    this.setBoards(id, input.boards)
    return { agent: this.get(id) as AgentView, token }
  }

  update(
    id: string,
    patch: {
      name?: string
      description?: string
      expiresAt?: string | null
      canNotify?: boolean
      canContacts?: boolean
      boards?: AgentBoard[]
    },
  ): AgentView | null {
    if (!this.get(id)) return null
    const set = (col: string, v: string | number | null) =>
      this.db.prepare(`UPDATE agents SET ${col} = ? WHERE id = ?`).run(v, id)
    if (patch.name !== undefined) set('name', patch.name)
    if (patch.description !== undefined) set('description', patch.description)
    if (patch.expiresAt !== undefined) set('expires_at', patch.expiresAt)
    if (patch.canNotify !== undefined) set('can_notify', patch.canNotify ? 1 : 0)
    if (patch.canContacts !== undefined) set('can_contacts', patch.canContacts ? 1 : 0)
    if (patch.boards) this.setBoards(id, patch.boards)
    return this.get(id)
  }

  setBoards(id: string, boards: AgentBoard[]) {
    this.db.prepare('DELETE FROM agent_boards WHERE agent_id = ?').run(id)
    const ins = this.db.prepare(
      'INSERT OR REPLACE INTO agent_boards (agent_id, board_id, access) VALUES (?, ?, ?)',
    )
    for (const b of boards) ins.run(id, b.boardId, b.access)
  }

  /** Token nuevo: el anterior deja de servir al instante. Se devuelve una sola vez. */
  rotate(id: string): string | null {
    if (!this.get(id)) return null
    const token = newToken()
    this.db
      .prepare('UPDATE agents SET token_hash = ?, token_prefix = ?, revoked_at = NULL WHERE id = ?')
      .run(sha256(token), token.slice(0, 12), id)
    return token
  }

  revoke(id: string): boolean {
    return (
      Number(
        this.db
          .prepare('UPDATE agents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
          .run(new Date().toISOString(), id).changes,
      ) > 0
    )
  }

  remove(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes) > 0
  }

  /** Conexión a la que pertenece un token válido (no revocado ni caducado), o null. */
  authenticate(token: string, now = new Date()): AgentView | null {
    if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null
    const hash = sha256(token)
    const r = this.db.prepare('SELECT * FROM agents WHERE token_hash = ?').get(hash) as unknown as
      | (Raw & { token_hash: string })
      | undefined
    // comparación a tiempo constante de la huella (la búsqueda por índice ya la filtra; esto evita atajos por prefijo)
    if (!r || !timingSafeEqual(Buffer.from(r.token_hash), Buffer.from(hash))) return null
    if (r.revoked_at) return null
    if (r.expires_at && Date.parse(r.expires_at) <= now.getTime()) return null
    return this.view(r)
  }

  touch(id: string, now = new Date()) {
    this.db.prepare('UPDATE agents SET last_used_at = ? WHERE id = ?').run(now.toISOString(), id)
  }

  /** Cuenta un golpe en una ventana deslizante; false si ya superó el máximo. */
  allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (list.length >= max) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    return true
  }

  log(agentId: string, method: string, path: string, status: number, boardId: string | null) {
    this.db
      .prepare(
        'INSERT INTO agent_log (agent_id, at, method, path, status, board_id) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(agentId, new Date().toISOString(), method, path.slice(0, 200), status, boardId)
  }

  activity(id: string, limit = 100) {
    return (
      this.db
        .prepare(
          'SELECT at, method, path, status, board_id FROM agent_log WHERE agent_id = ? ORDER BY id DESC LIMIT ?',
        )
        .all(id, Math.min(Math.max(limit, 1), 500)) as {
        at: string
        method: string
        path: string
        status: number
        board_id: string | null
      }[]
    ).map((r) => ({ at: r.at, method: r.method, path: r.path, status: r.status, boardId: r.board_id }))
  }

  /** Borra el registro antiguo (se conservan 90 días). */
  purge(now = new Date()) {
    const limit = new Date(now.getTime() - 90 * 86_400_000).toISOString()
    this.db.prepare('DELETE FROM agent_log WHERE at < ?').run(limit)
  }
}

/* ---------- clave de orden (misma regla que `fractional-indexing`, sin la librería) ---------- */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Clave que ordena justo después de `last` (o la primera si no hay). Compatible con las del cliente. */
export function keyAfter(last: string | null): string {
  if (!last) return 'a0'
  const head = last[0]
  if (head < 'a' || head > 'y') return `${last}V` // formato inesperado: añadir cola sigue ordenando después
  const len = head.charCodeAt(0) - 'a'.charCodeAt(0) + 2
  const digits = last.slice(1, len).split('')
  let i = digits.length - 1
  while (i >= 0) {
    const d = DIGITS.indexOf(digits[i])
    if (d < DIGITS.length - 1) {
      digits[i] = DIGITS[d + 1]
      return head + digits.join('')
    }
    digits[i] = DIGITS[0]
    i--
  }
  // desbordamiento: sube la cabecera y alarga la parte entera
  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1)
  return nextHead + DIGITS[0].repeat(len)
}
