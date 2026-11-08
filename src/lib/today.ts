import { toISODate } from './format'
import { kindOf, type Board, type Card, type Column } from './types'

export type TodayGroup = 'overdue' | 'today' | 'tomorrow' | 'starting'

export interface TodayItem {
  cardId: string
  boardId: string
  title: string
  group: TodayGroup
  /** Fecha que explica por qué está aquí (final, o inicio si empieza hoy). */
  date: string
}

export const TODAY_GROUPS: { id: TodayGroup; label: string }[] = [
  { id: 'overdue', label: 'Vencidas' },
  { id: 'today', label: 'Vencen hoy' },
  { id: 'tomorrow', label: 'Vencen mañana' },
  { id: 'starting', label: 'Empiezan hoy' },
]

const ORDER: Record<TodayGroup, number> = { overdue: 0, today: 1, tomorrow: 2, starting: 3 }

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Resumen "Hoy": tarjetas mías con fechas que requieren atención. Se calcula en el dispositivo con
 * lo que ya está descargado, así funciona sin conexión.
 *
 * "Mías" = asignadas a mí, o sin asignar en un tablero propio. Quedan fuera las tarjetas en una
 * columna Done, las borradas y las de tableros o columnas borrados.
 */
export function todaySummary(
  data: { boards: Board[]; columns: Column[]; cards: Card[] },
  me: string | null,
  now: Date = new Date(),
): TodayItem[] {
  if (!me) return []
  const today = toISODate(now)
  const tomorrow = toISODate(addDays(now, 1))
  const boards = new Map(data.boards.filter((b) => !b.deletedAt).map((b) => [b.id, b]))
  const columns = new Map(data.columns.filter((c) => !c.deletedAt).map((c) => [c.id, c]))

  const out: TodayItem[] = []
  for (const card of data.cards) {
    if (card.deletedAt) continue
    const board = boards.get(card.boardId)
    const column = columns.get(card.columnId)
    if (!board || !column || kindOf(column) === 'done') continue
    const mine = card.assigneeId ? card.assigneeId === me : !board.ownerId || board.ownerId === me
    if (!mine) continue

    let group: TodayGroup | null = null
    let date = card.endDate ?? ''
    if (card.endDate) {
      if (card.endDate < today) group = 'overdue'
      else if (card.endDate === today) group = 'today'
      else if (card.endDate === tomorrow) group = 'tomorrow'
    }
    if (!group && card.startDate === today) {
      group = 'starting'
      date = card.startDate
    }
    if (group) out.push({ cardId: card.id, boardId: card.boardId, title: card.title, group, date })
  }
  return out.sort(
    (a, b) =>
      ORDER[a.group] - ORDER[b.group] ||
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title, 'es'),
  )
}
