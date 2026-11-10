import type { DB } from './db.ts'
import type { Delivery } from './delivery.ts'

export interface DigestItem {
  cardId: string
  boardId: string
  boardTitle: string
  title: string
  date: string
}

export interface DigestUser {
  recipient: { id: string; name: string; email: string; phone: string }
  channels: string[]
  overdue: DigestItem[]
  today: DigestItem[]
  tomorrow: DigestItem[]
  starting: DigestItem[]
  /** Mensaje listo para enviar. */
  subject: string
  text: string
}

/** "YYYY-MM-DD" de un instante en una zona horaria. */
export function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

export const addDay = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const short = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '')

interface RawRow {
  tbl: string
  user_id: string
  data: string
}

/**
 * Resumen "Hoy" de cada persona que lo pidió: sus tarjetas vencidas, que vencen hoy o mañana y que
 * empiezan hoy. Mismas reglas que el panel de la app: mías = asignadas a mí, o sin asignar en un
 * tablero propio; sin las de columnas Done ni las borradas.
 */
export function buildDigest(
  db: DB,
  delivery: Delivery,
  now = new Date(),
): { date: string; users: DigestUser[] } {
  const settings = delivery.settings()
  const today = dayIn(settings.timezone, now)
  const tomorrow = addDay(today, 1)

  const people = db.prepare('SELECT id FROM users WHERE notify_digest = 1').all() as {
    id: string
  }[]

  const rowsFor = db.prepare(
    `SELECT r.tbl, r.user_id, r.data FROM rows r
     WHERE r.tbl IN ('boards', 'columns', 'cards')
       AND (r.user_id = ?1 OR r.board_id IN (SELECT board_id FROM board_members WHERE user_id = ?1))`,
  )

  const users: DigestUser[] = []
  for (const { id } of people) {
    const prefs = delivery.channelsOf(id)
    const recipient = delivery.recipient(id)
    if (!prefs || !recipient) continue
    const channels = delivery.activeChannels(prefs)
    if (channels.length === 0) continue

    const boards = new Map<string, { title: string; owner: string }>()
    const columns = new Map<string, { done: boolean }>()
    const cards: Record<string, unknown>[] = []
    for (const r of rowsFor.all(id) as unknown as RawRow[]) {
      const d = JSON.parse(r.data) as Record<string, unknown>
      if (d.deletedAt) continue
      if (r.tbl === 'boards')
        boards.set(String(d.id), { title: String(d.title ?? ''), owner: r.user_id })
      else if (r.tbl === 'columns') columns.set(String(d.id), { done: d.kind === 'done' })
      else cards.push(d)
    }

    const groups = { overdue: [], today: [], tomorrow: [], starting: [] } as Record<
      'overdue' | 'today' | 'tomorrow' | 'starting',
      DigestItem[]
    >
    for (const c of cards) {
      const board = boards.get(String(c.boardId))
      const col = columns.get(String(c.columnId))
      if (!board || !col || col.done) continue
      const assignee = typeof c.assigneeId === 'string' ? c.assigneeId : ''
      if (assignee ? assignee !== id : board.owner !== id) continue
      const end = typeof c.endDate === 'string' ? c.endDate : ''
      const start = typeof c.startDate === 'string' ? c.startDate : ''
      let group: keyof typeof groups | null = null
      let date = end
      if (end) {
        if (end < today) group = 'overdue'
        else if (end === today) group = 'today'
        else if (end === tomorrow) group = 'tomorrow'
      }
      if (!group && start === today) {
        group = 'starting'
        date = start
      }
      if (group)
        groups[group].push({
          cardId: String(c.id),
          boardId: String(c.boardId),
          boardTitle: board.title,
          title: String(c.title ?? ''),
          date,
        })
    }
    for (const g of Object.values(groups))
      g.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'es'))
    const total =
      groups.overdue.length + groups.today.length + groups.tomorrow.length + groups.starting.length
    if (total === 0) continue

    const section = (label: string, items: DigestItem[]) =>
      items.length === 0
        ? ''
        : `${label} (${items.length})\n${items
            .map((i) => `• ${i.title} — ${i.boardTitle}${i.date ? ` · ${short(i.date)}` : ''}`)
            .join('\n')}\n\n`
    const link = delivery.boardUrl(null)
    const text =
      `Buenos días, ${recipient.name}. Esto requiere tu atención hoy:\n\n` +
      section('Vencidas', groups.overdue) +
      section('Vencen hoy', groups.today) +
      section('Vencen mañana', groups.tomorrow) +
      section('Empiezan hoy', groups.starting) +
      (link ? link : '')
    users.push({
      recipient,
      channels,
      ...groups,
      subject: `Hoy: ${total} ${total === 1 ? 'tarjeta' : 'tarjetas'} con fecha`,
      text: text.trim(),
    })
  }
  return { date: today, users }
}
