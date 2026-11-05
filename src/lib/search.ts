import type { Data } from './types'

export type ResultType = 'board' | 'column' | 'card' | 'item' | 'comment'

export interface SearchResult {
  key: string
  type: ResultType
  title: string
  context: string
  boardId: string
  cardId?: string
}

/** Minúsculas y sin acentos: "Presentación" coincide con "presentacion". */
export const normalize = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const snippet = (text: string, q: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = normalize(flat).indexOf(q)
  if (at < 0 || flat.length <= 70) return flat.slice(0, 70)
  const start = Math.max(0, at - 20)
  return (start > 0 ? '…' : '') + flat.slice(start, start + 70)
}

const live = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

export function searchAll(data: Data, query: string, limit = 30): SearchResult[] {
  const q = normalize(query.trim())
  if (!q) return []
  const out: SearchResult[] = []
  const has = (s?: string) => !!s && normalize(s).includes(q)

  const boards = live(data.boards)
  const boardIds = new Set(boards.map((b) => b.id))
  const boardName = new Map(boards.map((b) => [b.id, b.title]))
  const columns = live(data.columns).filter((c) => boardIds.has(c.boardId))
  const colIds = new Set(columns.map((c) => c.id))
  const cards = live(data.cards).filter((c) => colIds.has(c.columnId))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const labelName = new Map(live(data.labels).map((l) => [l.id, l.name]))

  for (const b of boards) {
    if (has(b.title))
      out.push({
        key: `b:${b.id}`,
        type: 'board',
        title: b.title,
        context: 'Tablero',
        boardId: b.id,
      })
  }
  for (const c of columns) {
    if (has(c.title))
      out.push({
        key: `c:${c.id}`,
        type: 'column',
        title: c.title,
        context: `Columna en ${boardName.get(c.boardId)}`,
        boardId: c.boardId,
      })
  }
  for (const c of cards) {
    const where = `Tarjeta en ${boardName.get(c.boardId)}`
    if (has(c.title))
      out.push({
        key: `t:${c.id}`,
        type: 'card',
        title: c.title,
        context: where,
        boardId: c.boardId,
        cardId: c.id,
      })
    else if ((c.labelIds ?? []).some((id) => has(labelName.get(id))))
      out.push({
        key: `t:${c.id}`,
        type: 'card',
        title: c.title,
        context: `${where} · Etiqueta: ${(c.labelIds ?? []).map((id) => labelName.get(id)).filter((n) => has(n))[0]}`,
        boardId: c.boardId,
        cardId: c.id,
      })
    else if (has(c.description))
      out.push({
        key: `t:${c.id}`,
        type: 'card',
        title: c.title,
        context: `${where} · ${snippet(c.description!, q)}`,
        boardId: c.boardId,
        cardId: c.id,
      })
  }
  const seen = new Set(out.filter((r) => r.type === 'card').map((r) => r.cardId))
  for (const i of live(data.items)) {
    const card = cardById.get(i.cardId)
    if (card && has(i.text) && !seen.has(card.id))
      out.push({
        key: `i:${i.id}`,
        type: 'item',
        title: card.title,
        context: `Lista de tareas · ${snippet(i.text, q)}`,
        boardId: card.boardId,
        cardId: card.id,
      })
  }
  for (const m of live(data.comments)) {
    const card = cardById.get(m.cardId)
    if (card && has(m.bodyMd))
      out.push({
        key: `m:${m.id}`,
        type: 'comment',
        title: card.title,
        context: `Comentario · ${snippet(m.bodyMd, q)}`,
        boardId: card.boardId,
        cardId: card.id,
      })
  }
  return out.slice(0, limit)
}
