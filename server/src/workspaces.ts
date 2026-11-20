import { randomUUID } from 'node:crypto'
import type { DB } from './db.ts'

export interface WorkspaceView {
  id: string
  name: string
}

export interface AdminWorkspace extends WorkspaceView {
  createdAt: string
  members: string[] // ids de usuario
  boards: number
}

export const MAX_WORKSPACE_NAME = 60

export function cleanWorkspaceName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length > 0 && t.length <= MAX_WORKSPACE_NAME ? t : null
}

/** Workspaces de una persona (el administrador ve todos). */
export function workspacesOf(db: DB, userId: string, isAdmin: boolean): WorkspaceView[] {
  const sql = isAdmin
    ? 'SELECT id, name FROM workspaces ORDER BY name COLLATE NOCASE'
    : `SELECT w.id, w.name FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
       ORDER BY w.name COLLATE NOCASE`
  return (isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(userId)) as unknown as WorkspaceView[]
}

export const isMember = (db: DB, workspaceId: string, userId: string) =>
  !!db
    .prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId)

/** ¿Comparten al menos un workspace? */
export const sharesWorkspace = (db: DB, a: string, b: string) =>
  !!db
    .prepare(
      `SELECT 1 FROM workspace_members x JOIN workspace_members y ON y.workspace_id = x.workspace_id
       WHERE x.user_id = ? AND y.user_id = ? LIMIT 1`,
    )
    .get(a, b)

export function listAdminWorkspaces(db: DB): AdminWorkspace[] {
  const ws = db
    .prepare('SELECT id, name, created_at FROM workspaces ORDER BY name COLLATE NOCASE')
    .all() as { id: string; name: string; created_at: string }[]
  const members = db.prepare('SELECT workspace_id, user_id FROM workspace_members').all() as {
    workspace_id: string
    user_id: string
  }[]
  const boards = db
    .prepare(
      `SELECT json_extract(data, '$.workspaceId') AS w, COUNT(*) AS n FROM rows
       WHERE tbl = 'boards' AND json_extract(data, '$.parentId') IS NULL GROUP BY w`,
    )
    .all() as { w: string | null; n: number }[]
  return ws.map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.created_at,
    members: members.filter((m) => m.workspace_id === w.id).map((m) => m.user_id),
    boards: boards.find((b) => b.w === w.id)?.n ?? 0,
  }))
}

export function createWorkspace(db: DB, name: string): WorkspaceView | null {
  const id = randomUUID().replace(/-/g, '').slice(0, 16)
  try {
    db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').run(
      id,
      name,
      new Date().toISOString(),
    )
  } catch {
    return null // nombre repetido
  }
  return { id, name }
}

/**
 * Reemplaza los miembros de un workspace. A quien sale se le retiran los accesos a tableros de ese
 * workspace (como miembro y los que él había compartido ahí). Devuelve los usuarios afectados.
 */
export function setWorkspaceMembers(db: DB, workspaceId: string, userIds: string[]): string[] {
  const current = (
    db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').all(workspaceId) as {
      user_id: string
    }[]
  ).map((r) => r.user_id)
  const next = new Set(userIds)
  const removed = current.filter((u) => !next.has(u))
  const added = userIds.filter((u) => !current.includes(u))
  const affected = new Set<string>([...removed, ...added])
  for (const u of added)
    db.prepare('INSERT INTO workspace_members (workspace_id, user_id) VALUES (?, ?)').run(
      workspaceId,
      u,
    )
  for (const u of removed) {
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(
      workspaceId,
      u,
    )
    const gone = db
      .prepare(
        `SELECT m.user_id, m.owner_id FROM board_members m
         WHERE (m.user_id = ?1 OR m.owner_id = ?1) AND m.board_id IN (
           SELECT id FROM rows WHERE tbl = 'boards' AND json_extract(data, '$.workspaceId') = ?2)`,
      )
      .all(u, workspaceId) as { user_id: string; owner_id: string }[]
    for (const g of gone) {
      affected.add(g.user_id)
      affected.add(g.owner_id)
    }
    db.prepare(
      `DELETE FROM board_members WHERE (user_id = ?1 OR owner_id = ?1) AND board_id IN (
         SELECT id FROM rows WHERE tbl = 'boards' AND json_extract(data, '$.workspaceId') = ?2)`,
    ).run(u, workspaceId)
  }
  return [...affected]
}

/** Mete a una persona en el workspace "General" (lo crea si no existe): altas por registro y primer admin. */
export function joinGeneral(db: DB, userId: string): void {
  let w = db.prepare("SELECT id FROM workspaces WHERE name = 'General'").get() as
    | { id: string }
    | undefined
  if (!w) {
    const created = createWorkspace(db, 'General')
    if (!created) return
    w = { id: created.id }
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id) VALUES (?, ?)').run(
    w.id,
    userId,
  )
}
