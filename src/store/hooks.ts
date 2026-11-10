import { useMemo } from 'react'
import { byPosition } from '../lib/position'
import { displayName } from '../lib/people'
import type { Comment } from '../lib/types'
import { useAccess } from '../sync/access'
import { useAuth } from '../sync/auth'
import { useStore } from './store'

type Live = { deletedAt?: string }
const live = <T extends Live>(rows: T[]) => rows.filter((r) => !r.deletedAt)

/** Mis tableros (en el orden que elegí) y después los que otras personas comparten conmigo. */
export function useBoards() {
  const boards = useStore((s) => s.boards)
  const me = useAuth((s) => s.userId)
  return useMemo(() => {
    const foreign = (b: { ownerId?: string }) => !!b.ownerId && !!me && b.ownerId !== me
    return live(boards).sort(
      (a, b) => Number(foreign(a)) - Number(foreign(b)) || byPosition(a, b),
    )
  }, [boards, me])
}

export function useColumns(boardId: string | null) {
  const columns = useStore((s) => s.columns)
  return useMemo(
    () =>
      live(columns)
        .filter((c) => c.boardId === boardId)
        .sort(byPosition),
    [columns, boardId],
  )
}

/** Tarjetas vivas del tablero, ordenadas por posición. */
export function useBoardCards(boardId: string | null) {
  const cards = useStore((s) => s.cards)
  return useMemo(
    () =>
      live(cards)
        .filter((c) => c.boardId === boardId)
        .sort(byPosition),
    [cards, boardId],
  )
}

export function useItems(cardId: string) {
  const items = useStore((s) => s.items)
  return useMemo(
    () =>
      live(items)
        .filter((i) => i.cardId === cardId)
        .sort(byPosition),
    [items, cardId],
  )
}

export function useComments(cardId: string) {
  const comments = useStore((s) => s.comments)
  return useMemo(
    () =>
      live(comments)
        .filter((c) => c.cardId === cardId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [comments, cardId],
  )
}

/** Una actualización con sus respuestas (las más viejas primero). */
export interface UpdateThread {
  update: Comment
  replies: Comment[]
}

/** Actualizaciones de una tarjeta, las más nuevas primero, cada una con sus respuestas. */
export function useUpdateThreads(cardId: string): UpdateThread[] {
  const comments = useComments(cardId)
  return useMemo(() => {
    const replies = new Map<string, Comment[]>()
    for (const c of comments)
      if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c])
    return comments
      .filter((c) => !c.parentId)
      .map((update) => ({ update, replies: replies.get(update.id) ?? [] }))
      .reverse()
  }, [comments])
}

export interface LikeInfo {
  count: number
  mine: boolean
  /** Quienes dieron "me gusta" (ids de usuario). */
  by: string[]
}

/** "Me gusta" por actualización: cuántos y si yo di uno. Dos dispositivos de la misma persona cuentan una vez. */
export function useLikes(cardId: string): Map<string, LikeInfo> {
  const likes = useStore((s) => s.likes)
  const me = useAuth((s) => s.userId) ?? 'local'
  return useMemo(() => {
    const by = new Map<string, Set<string>>()
    for (const l of live(likes))
      if (l.cardId === cardId) by.set(l.commentId, (by.get(l.commentId) ?? new Set()).add(l.userId))
    return new Map(
      [...by].map(([id, users]) => [
        id,
        { count: users.size, mine: users.has(me), by: [...users] },
      ]),
    )
  }, [likes, cardId, me])
}

/** Conteos por tarjeta para chips (checklist y comentarios). */
export function useCardStats() {
  const items = useStore((s) => s.items)
  const comments = useStore((s) => s.comments)
  const me = useAuth((s) => s.userId)
  return useMemo(() => {
    const stats = new Map<
      string,
      { done: number; total: number; comments: number; mentioned: boolean }
    >()
    const get = (id: string) => {
      let s = stats.get(id)
      if (!s) stats.set(id, (s = { done: 0, total: 0, comments: 0, mentioned: false }))
      return s
    }
    for (const i of live(items)) {
      const s = get(i.cardId)
      s.total++
      if (i.done) s.done++
      if (me && i.text.includes(`(mention:${me})`)) s.mentioned = true
    }
    for (const c of live(comments)) {
      const s = get(c.cardId)
      s.comments++
      if (me && c.bodyMd.includes(`(mention:${me})`)) s.mentioned = true
    }
    return stats
  }, [items, comments, me])
}

export interface BoardSummary {
  id: string
  title: string
  color?: string
  icon?: string
  columnCount: number
  cardCount: number
  /** Tablero que otra persona comparte conmigo (rol y dueño). */
  sharedBy?: { name: string; role: 'editor' | 'viewer' }
  /** Mi tablero, compartido con otras personas. */
  memberCount: number
}

export function useBoardSummaries(): BoardSummary[] {
  const boards = useBoards()
  const columns = useStore((s) => s.columns)
  const cards = useStore((s) => s.cards)
  const shared = useAccess((s) => s.shared)
  const members = useAccess((s) => s.members)
  const me = useAuth((s) => s.userId)
  return useMemo(() => {
    const colCount = new Map<string, number>()
    for (const c of live(columns)) colCount.set(c.boardId, (colCount.get(c.boardId) ?? 0) + 1)
    const cardCount = new Map<string, number>()
    for (const c of live(cards)) cardCount.set(c.boardId, (cardCount.get(c.boardId) ?? 0) + 1)
    return boards.map((b) => {
      const foreign = !!b.ownerId && !!me && b.ownerId !== me
      const s = shared.find((x) => x.boardId === b.id)
      return {
        id: b.id,
        title: b.title,
        color: b.color,
        icon: b.icon,
        columnCount: colCount.get(b.id) ?? 0,
        cardCount: cardCount.get(b.id) ?? 0,
        sharedBy: foreign
          ? {
              name: s ? displayName({ email: s.ownerEmail, alias: s.ownerAlias }) : '',
              role: s?.role ?? 'viewer',
            }
          : undefined,
        memberCount: foreign ? 0 : members.filter((m) => m.boardId === b.id).length,
      }
    })
  }, [boards, columns, cards, shared, members, me])
}

export function useAttachments(cardId: string) {
  const attachments = useStore((s) => s.attachments)
  return useMemo(
    () =>
      live(attachments)
        .filter((a) => a.cardId === cardId && !a.inline)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [attachments, cardId],
  )
}

/** Adjuntos vivos por id (para resolver portadas sin recorrer la lista por tarjeta). */
export function useAttachmentIndex() {
  const attachments = useStore((s) => s.attachments)
  return useMemo(() => new Map(live(attachments).map((a) => [a.id, a])), [attachments])
}

/** Etiquetas vivas de un tablero, por nombre. */
export function useLabels(boardId: string | null | undefined) {
  const labels = useStore((s) => s.labels)
  return useMemo(
    () =>
      live(labels)
        .filter((l) => l.boardId === boardId)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    [labels, boardId],
  )
}

/** Etiquetas vivas por id (para pintar las de cada tarjeta). */
export function useLabelIndex() {
  const labels = useStore((s) => s.labels)
  return useMemo(() => new Map(live(labels).map((l) => [l.id, l])), [labels])
}
