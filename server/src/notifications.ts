import { randomUUID } from 'node:crypto'
import type { StatementSync } from 'node:sqlite'
import type { DB } from './db.ts'

export type NotificationType =
  'mention' | 'assignment' | 'access_granted' | 'access_role' | 'access_removed'

export interface NotificationInput {
  userId: string
  type: NotificationType
  actorId: string
  boardId: string
  cardId?: string
  title: string
  excerpt?: string
}

export interface NotificationView {
  id: string
  type: NotificationType
  boardId: string
  cardId: string | null
  title: string
  excerpt: string
  count: number
  actorId: string
  actorName: string
  createdAt: string
  readAt: string | null
}

/** Avisos repetidos del mismo tipo y tarjeta se funden si llegan dentro de esta ventana. */
export const COALESCE_MS = 5 * 60_000
/** Las notificaciones más antiguas se borran. */
export const RETENTION_DAYS = 90

const TOKEN = /\[@([^\]]+)\]\(mention:([A-Za-z0-9_-]+)\)/g

/** Ids de las personas mencionadas en un texto guardado (`[@Nombre](mention:<id>)`). */
export const mentionedIds = (text: unknown): Set<string> =>
  new Set(typeof text === 'string' ? [...text.matchAll(TOKEN)].map((m) => m[2]) : [])

/** Texto corto y legible: las menciones quedan como "@Nombre" y se quita el formato Markdown. */
export function excerptOf(text: unknown, max = 140): string {
  if (typeof text !== 'string') return ''
  const plain = text
    .replace(TOKEN, '@$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain
}

export interface RowChange {
  table: string
  row: Record<string, unknown>
  prev: Record<string, unknown> | null
  boardId: string | null
}

export interface Detected {
  userId: string
  type: NotificationType
  cardId?: string
  excerpt?: string
}

/** Compara una fila guardada con su versión anterior y dice a quién hay que avisar (sin filtrar). */
export function detect({ table, row, prev }: RowChange): Detected[] {
  const out: Detected[] = []
  if (table === 'comments' || table === 'items') {
    const field = table === 'comments' ? 'bodyMd' : 'text'
    const before = mentionedIds(prev?.[field])
    const cardId = typeof row.cardId === 'string' ? row.cardId : undefined
    if (!cardId) return out
    for (const id of mentionedIds(row[field])) {
      if (!before.has(id))
        out.push({ userId: id, type: 'mention', cardId, excerpt: excerptOf(row[field]) })
    }
  }
  if (table === 'cards') {
    const now = typeof row.assigneeId === 'string' ? row.assigneeId : ''
    const was = typeof prev?.assigneeId === 'string' ? prev.assigneeId : ''
    if (now && now !== was) out.push({ userId: now, type: 'assignment', cardId: String(row.id) })
  }
  return out
}

export class Notifications {
  private db: DB
  private insert: StatementSync
  private findRecent: StatementSync
  private bump: StatementSync
  private recipientHasAccess: StatementSync
  private cardTitle: StatementSync
  private boardTitle: StatementSync

  constructor(db: DB) {
    this.db = db
    this.insert = db.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, board_id, card_id, title, excerpt, count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    this.findRecent = db.prepare(
      `SELECT id, count FROM notifications
       WHERE user_id = ? AND type = ? AND board_id = ? AND COALESCE(card_id, '') = ?
         AND read_at IS NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1`,
    )
    this.bump = db.prepare(
      'UPDATE notifications SET count = count + 1, excerpt = ?, title = ?, actor_id = ?, created_at = ? WHERE id = ?',
    )
    this.recipientHasAccess = db.prepare(
      `SELECT 1 FROM rows WHERE tbl = 'boards' AND id = ?1 AND user_id = ?2
       UNION SELECT 1 FROM board_members WHERE board_id = ?1 AND user_id = ?2 LIMIT 1`,
    )
    this.cardTitle = db.prepare("SELECT data FROM rows WHERE tbl = 'cards' AND id = ? LIMIT 1")
    this.boardTitle = db.prepare("SELECT data FROM rows WHERE tbl = 'boards' AND id = ? LIMIT 1")
  }

  titleOfCard(cardId: string): string {
    const r = this.cardTitle.get(cardId) as { data: string } | undefined
    return r ? String(JSON.parse(r.data).title ?? '') : ''
  }

  titleOfBoard(boardId: string): string {
    const r = this.boardTitle.get(boardId) as { data: string } | undefined
    return r ? String(JSON.parse(r.data).title ?? '') : ''
  }

  /**
   * Guarda un aviso y devuelve su vista (o null si no procede: el autor no se avisa a sí mismo y
   * solo se avisa a quien tiene acceso al tablero, salvo cuando se le acaba de quitar).
   */
  create(n: NotificationInput, now = new Date()): NotificationView | null {
    if (n.userId === n.actorId) return null
    if (n.type !== 'access_removed' && !this.recipientHasAccess.get(n.boardId, n.userId))
      return null
    const user = this.db.prepare('SELECT 1 FROM users WHERE id = ?').get(n.userId)
    if (!user) return null

    const createdAt = now.toISOString()
    const since = new Date(now.getTime() - COALESCE_MS).toISOString()
    const recent = this.findRecent.get(n.userId, n.type, n.boardId, n.cardId ?? '', since) as
      { id: string; count: number } | undefined
    let id: string
    if (recent) {
      id = recent.id
      this.bump.run(n.excerpt ?? '', n.title, n.actorId, createdAt, id)
    } else {
      id = randomUUID()
      this.insert.run(
        id,
        n.userId,
        n.type,
        n.actorId,
        n.boardId,
        n.cardId ?? null,
        n.title,
        n.excerpt ?? '',
        createdAt,
      )
    }
    return this.get(n.userId, id)
  }

  get(userId: string, id: string): NotificationView | null {
    return this.list(userId, { id }).notifications[0] ?? null
  }

  list(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; id?: string } = {},
  ): { notifications: NotificationView[]; unread: number } {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
    const rows = this.db
      .prepare(
        `SELECT n.id, n.type, n.board_id, n.card_id, n.title, n.excerpt, n.count, n.actor_id,
                n.created_at, n.read_at, u.email AS actor_email, u.alias AS actor_alias
         FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.user_id = ?1
           AND (?2 = 0 OR n.read_at IS NULL)
           AND (?3 = '' OR n.id = ?3)
         ORDER BY n.created_at DESC LIMIT ?4`,
      )
      .all(userId, opts.unreadOnly ? 1 : 0, opts.id ?? '', limit) as {
      id: string
      type: NotificationType
      board_id: string
      card_id: string | null
      title: string
      excerpt: string
      count: number
      actor_id: string
      created_at: string
      read_at: string | null
      actor_email: string | null
      actor_alias: string | null
    }[]
    const unread = (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .get(userId) as { n: number }
    ).n
    return {
      unread,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        boardId: r.board_id,
        cardId: r.card_id,
        title: r.title,
        excerpt: r.excerpt,
        count: r.count,
        actorId: r.actor_id,
        actorName: r.actor_alias || r.actor_email || '',
        createdAt: r.created_at,
        readAt: r.read_at,
      })),
    }
  }

  markRead(userId: string, ids: string[] | 'all', now = new Date()): number {
    const at = now.toISOString()
    if (ids === 'all') {
      return Number(
        this.db
          .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
          .run(at, userId).changes,
      )
    }
    const upd = this.db.prepare(
      'UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL',
    )
    let n = 0
    for (const id of ids) n += Number(upd.run(at, userId, id).changes)
    return n
  }

  /** Lee las de una tarjeta (al abrirla): la marca "Te mencionan" y la campana quedan sincronizadas. */
  markCardRead(userId: string, cardId: string, now = new Date()): number {
    return Number(
      this.db
        .prepare(
          'UPDATE notifications SET read_at = ? WHERE user_id = ? AND card_id = ? AND read_at IS NULL',
        )
        .run(now.toISOString(), userId, cardId).changes,
    )
  }

  purge(now = new Date()): number {
    const limit = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString()
    return Number(
      this.db.prepare('DELETE FROM notifications WHERE created_at < ?').run(limit).changes,
    )
  }
}
