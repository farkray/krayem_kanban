import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { keyAfter, type AgentView, type Agents } from './agents.ts'
import type { DB } from './db.ts'
import type { Hub } from './events.ts'
import type { Notifications } from './notifications.ts'
import { openApiSpec } from './agentOpenApi.ts'
import { whatsappOf } from './phone.ts'

/** API para agentes externos (Hermes, Claude…): `Authorization: Bearer kbn_…`. Solo ve y toca los tableros autorizados. */
export interface AgentCtx {
  db: DB
  agents: Agents
  hub: Hub
  notifications: Notifications
  nextTs: () => string
  /** Hoy ("YYYY-MM-DD") en la zona horaria configurada. */
  today: () => string
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_CARD_TITLE = 200
const MAX_TEXT = 10_000
const WIP: Record<string, number | null> = { standard: null, next: 4, doing: 2, done: null }
const REQ_PER_MIN = 120
const NOTIFY_PER_HOUR = 30
const NOTIFY_PER_PERSON_HOUR = 5

type Row = Record<string, unknown>
interface Stored {
  tbl: string
  id: string
  user_id: string
  data: string
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const validId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
const validDate = (v: unknown): v is string =>
  typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v))
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function registerAgentApi(app: FastifyInstance, ctx: AgentCtx) {
  const { db, agents, hub, notifications } = ctx
  const attached = new WeakMap<FastifyRequest, { agent: AgentView; boardId: string | null }>()

  const rowsOfBoard = db.prepare('SELECT tbl, id, user_id, data FROM rows WHERE board_id = ?')
  const boardRow = db.prepare("SELECT user_id, data FROM rows WHERE tbl = 'boards' AND id = ? LIMIT 1")
  const cardRow = db.prepare("SELECT user_id, board_id, data FROM rows WHERE tbl = 'cards' AND id = ? LIMIT 1")
  const upsert = db.prepare(
    `INSERT INTO rows (user_id, tbl, id, data, updated_at, board_id) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
       board_id = COALESCE(excluded.board_id, rows.board_id)`,
  )
  const members = db.prepare('SELECT user_id FROM board_members WHERE board_id = ?')
  const userRow = db.prepare('SELECT id, email, alias, phone, notify_whatsapp FROM users WHERE id = ?')
  const userByEmail = db.prepare('SELECT id, email, alias FROM users WHERE email = ?')

  interface UserContact {
    email: string
    alias: string
    phone: string
    notify_whatsapp: number
  }
  /**
   * Datos de contacto de una persona (solo si la conexión tiene el permiso): correo, teléfono en formato internacional y el
   * estado de su WhatsApp (formato correcto o no, y si aceptó recibir avisos por ese canal).
   */
  const contactOf = (u: UserContact | undefined, agent: AgentView) => {
    if (!agent.canContacts || !u) return {}
    const wa = whatsappOf(u.phone, u.notify_whatsapp === 1)
    return { email: u.email, phone: wa.e164, whatsapp: wa }
  }

  /* ---------- lectura de un tablero ---------- */

  interface BoardData {
    id: string
    ownerId: string
    board: Row
    columns: Row[]
    cards: Row[]
    labels: Row[]
    comments: Row[]
    items: Row[]
  }

  /** Tablero autorizado a esta conexión (y vigente), con sus filas. null si no existe, está borrado o no es suyo. */
  const loadBoard = (agent: AgentView, boardId: string): BoardData | null => {
    if (!agent.boards.some((b) => b.boardId === boardId)) return null
    const br = boardRow.get(boardId) as { user_id: string; data: string } | undefined
    if (!br) return null
    const board = JSON.parse(br.data) as Row
    if (board.deletedAt || board.parentId) return null
    const out: BoardData = {
      id: boardId,
      ownerId: br.user_id,
      board,
      columns: [],
      cards: [],
      labels: [],
      comments: [],
      items: [],
    }
    for (const r of rowsOfBoard.all(boardId) as unknown as Stored[]) {
      const d = JSON.parse(r.data) as Row
      if (d.deletedAt) continue
      if (r.tbl === 'columns') out.columns.push(d)
      else if (r.tbl === 'cards') out.cards.push(d)
      else if (r.tbl === 'labels') out.labels.push(d)
      else if (r.tbl === 'comments') out.comments.push(d)
      else if (r.tbl === 'items') out.items.push(d)
    }
    const byPos = (a: Row, b: Row) => (str(a.position) < str(b.position) ? -1 : 1)
    out.columns.sort(byPos)
    out.cards.sort(byPos)
    return out
  }

  const canWrite = (agent: AgentView, boardId: string) =>
    agent.boards.some((b) => b.boardId === boardId && b.access === 'write')

  const personName = (id: string) => {
    const u = userRow.get(id) as { email: string; alias: string } | undefined
    return u ? u.alias || u.email : ''
  }

  const participants = (b: BoardData, agent: AgentView) => {
    const ids = new Set<string>([b.ownerId])
    for (const m of members.all(b.id) as { user_id: string }[]) ids.add(m.user_id)
    return [...ids].flatMap((id) => {
      const u = userRow.get(id) as unknown as (UserContact & { id: string }) | undefined
      if (!u) return []
      return [
        {
          id: u.id,
          name: u.alias || u.email,
          ...contactOf(u, agent),
          role: id === b.ownerId ? 'owner' : 'member',
        },
      ]
    })
  }

  const cardView = (c: Row, b: BoardData, agent: AgentView) => {
    const col = b.columns.find((x) => x.id === c.columnId)
    const assignee = str(c.assigneeId)
    const items = b.items.filter((i) => i.cardId === c.id)
    const labelNames = ((c.labelIds as string[] | undefined) ?? []).flatMap((id) => {
      const l = b.labels.find((x) => x.id === id)
      return l ? [{ id, name: str(l.name) }] : []
    })
    const u = assignee ? (userRow.get(assignee) as unknown as UserContact | undefined) : undefined
    return {
      id: str(c.id),
      boardId: b.id,
      boardTitle: str(b.board.title),
      columnId: str(c.columnId),
      column: str(col?.title),
      columnKind: str(col?.kind) || 'standard',
      title: str(c.title),
      description: str(c.description),
      startDate: str(c.startDate) || null,
      endDate: str(c.endDate) || null,
      assignee: assignee
        ? {
            id: assignee,
            name: u ? u.alias || u.email : '',
            ...contactOf(u, agent),
          }
        : null,
      labels: labelNames,
      checklist: { done: items.filter((i) => i.done).length, total: items.length },
      comments: b.comments.filter((m) => m.cardId === c.id && !m.parentId).length,
    }
  }

  const authorOf = (c: Row, viewer?: AgentView) => {
    const a = str(c.authorId)
    if (a.startsWith('agent:')) {
      const ag = agents.get(a.slice(6))
      return { id: a, name: ag ? `${ag.name} (agente)` : 'Agente', agent: true }
    }
    const u = a && viewer ? (userRow.get(a) as unknown as UserContact | undefined) : undefined
    return { id: a, name: a ? personName(a) : '', agent: false, ...(viewer ? contactOf(u, viewer) : {}) }
  }

  /* ---------- autenticación, límites y registro ---------- */

  app.register(
    async (api) => {
      api.addHook('onRequest', async (req, reply) => {
        const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1] ?? ''
        if (req.url.startsWith('/api/agent/v1/openapi.json')) return // contrato público (no contiene datos)
        const agent = agents.authenticate(token)
        if (!agent) return reply.code(401).send({ error: 'unauthorized' })
        if (!agents.allow(`req:${agent.id}`, REQ_PER_MIN, 60_000))
          return reply.code(429).header('Retry-After', '30').send({ error: 'rate_limited' })
        agents.touch(agent.id)
        attached.set(req, { agent, boardId: null })
      })
      api.addHook('onResponse', async (req, reply) => {
        const a = attached.get(req)
        if (a) agents.log(a.agent.id, req.method, req.url.split('?')[0], reply.statusCode, a.boardId)
      })

      const me = (req: FastifyRequest) => attached.get(req) as { agent: AgentView; boardId: string | null }
      const board = (req: FastifyRequest, reply: FastifyReply, boardId: unknown): BoardData | null => {
        const ctxReq = me(req)
        if (!validId(boardId)) {
          void reply.code(400).send({ error: 'bad_request' })
          return null
        }
        ctxReq.boardId = boardId
        const b = loadBoard(ctxReq.agent, boardId)
        if (!b) {
          void reply.code(404).send({ error: 'not_found' }) // no se distingue "no existe" de "no autorizado"
          return null
        }
        return b
      }
      const writable = (req: FastifyRequest, reply: FastifyReply, b: BoardData) => {
        if (canWrite(me(req).agent, b.id)) return true
        void reply.code(403).send({ error: 'read_only', detail: 'La conexión solo puede leer este tablero.' })
        return false
      }
      const publish = (b: BoardData, tbl: string, row: Row) => {
        const ids = new Set<string>([b.ownerId])
        for (const m of members.all(b.id) as { user_id: string }[]) ids.add(m.user_id)
        for (const uid of ids) hub.publish(uid, tbl, row)
      }
      const store = (b: BoardData, tbl: string, row: Row): Row => {
        const ts = ctx.nextTs()
        const out: Row = { ...row, updatedAt: ts }
        upsert.run(b.ownerId, tbl, String(out.id), JSON.stringify(out), ts, b.id)
        publish(b, tbl, out)
        return out
      }

      /* ---------- lectura ---------- */

      api.get('/openapi.json', async () => openApiSpec())

      api.get('/me', async (req) => {
        const { agent } = me(req)
        const boards = agent.boards.flatMap((g) => {
          const b = loadBoard(agent, g.boardId)
          return b ? [{ id: b.id, title: str(b.board.title), access: g.access }] : []
        })
        return {
          agent: {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            expiresAt: agent.expiresAt,
            canNotify: agent.canNotify,
            canContacts: agent.canContacts,
          },
          boards,
          today: ctx.today(),
        }
      })

      api.get('/boards', async (req) => {
        const { agent } = me(req)
        const out = agent.boards.flatMap((g) => {
          const b = loadBoard(agent, g.boardId)
          return b
            ? [
                {
                  id: b.id,
                  title: str(b.board.title),
                  access: g.access,
                  columns: b.columns.length,
                  cards: b.cards.length,
                },
              ]
            : []
        })
        return { boards: out }
      })

      api.get('/boards/:id', async (req, reply) => {
        const b = board(req, reply, (req.params as { id: string }).id)
        if (!b) return
        const { agent } = me(req)
        return {
          id: b.id,
          title: str(b.board.title),
          access: canWrite(agent, b.id) ? 'write' : 'read',
          columns: b.columns.map((c) => {
            const kind = str(c.kind) || 'standard'
            return {
              id: str(c.id),
              title: str(c.title),
              kind,
              limit: WIP[kind] ?? null,
              cards: b.cards.filter((x) => x.columnId === c.id).length,
            }
          }),
          labels: b.labels.map((l) => ({ id: str(l.id), name: str(l.name) })),
          people: participants(b, agent),
          cards: b.cards.map((c) => cardView(c, b, agent)),
        }
      })

      api.get('/people', async (req, reply) => {
        const q = req.query as { board?: string }
        const b = board(req, reply, q.board)
        if (!b) return
        return { people: participants(b, me(req).agent) }
      })

      api.get('/cards/:id', async (req, reply) => {
        const { id } = req.params as { id: string }
        if (!validId(id)) return reply.code(400).send({ error: 'bad_request' })
        const r = cardRow.get(id) as { board_id: string | null; data: string } | undefined
        const b = r?.board_id ? board(req, reply, r.board_id) : null
        if (!b) return reply.code(404).send({ error: 'not_found' })
        const c = b.cards.find((x) => x.id === id)
        if (!c) return reply.code(404).send({ error: 'not_found' })
        const own = b.comments
          .filter((m) => m.cardId === id)
          .sort((a, z) => (str(a.createdAt) < str(z.createdAt) ? -1 : 1))
        return {
          ...cardView(c, b, me(req).agent),
          checklist: {
            items: b.items
              .filter((i) => i.cardId === id)
              .sort((a, z) => (str(a.position) < str(z.position) ? -1 : 1))
              .map((i) => ({ text: str(i.text), done: !!i.done })),
          },
          updates: own.map((m) => ({
            id: str(m.id),
            parentId: str(m.parentId) || null,
            author: authorOf(m, me(req).agent),
            body: str(m.bodyMd),
            createdAt: str(m.createdAt),
            editedAt: str(m.editedAt) || null,
          })),
        }
      })

      api.get('/tasks', async (req, reply) => {
        const q = req.query as {
          board?: string
          assignee?: string
          due?: string
          pending?: string
        }
        const { agent } = me(req)
        const today = ctx.today()
        const week = addDays(today, 7)
        const only = q.board ? board(req, reply, q.board) : null
        if (q.board && !only) return
        const all = only ? [only] : agent.boards.flatMap((g) => loadBoard(agent, g.boardId) ?? [])
        const pendingOnly = q.pending !== '0'
        const tasks = []
        for (const b of all) {
          for (const c of b.cards) {
            const col = b.columns.find((x) => x.id === c.columnId)
            if (pendingOnly && col?.kind === 'done') continue
            const v = cardView(c, b, agent)
            if (q.assignee === 'none' ? v.assignee : q.assignee && v.assignee?.id !== q.assignee) continue
            const end = v.endDate
            if (q.due === 'overdue' && !(end && end < today)) continue
            if (q.due === 'today' && end !== today) continue
            if (q.due === 'week' && !(end && end >= today && end <= week)) continue
            if (q.due === 'none' && end) continue
            tasks.push({ ...v, overdue: !!end && end < today && col?.kind !== 'done' })
          }
        }
        tasks.sort(
          (a, z) => (a.endDate ?? '9999').localeCompare(z.endDate ?? '9999') || a.title.localeCompare(z.title, 'es'),
        )
        return { today, count: tasks.length, tasks: tasks.slice(0, 500) }
      })

      /**
       * Recordatorios listos para enviar: las tareas pendientes agrupadas por persona, con su contacto (correo, teléfono y estado
       * de WhatsApp si la conexión tiene el permiso) y un texto sugerido. `due`: overdue (por defecto: vencidas y de hoy) | today | week.
       */
      api.get('/reminders', async (req, reply) => {
        const q = req.query as { board?: string; due?: string }
        const { agent } = me(req)
        const only = q.board ? board(req, reply, q.board) : null
        if (q.board && !only) return
        const all = only ? [only] : agent.boards.flatMap((g) => loadBoard(agent, g.boardId) ?? [])
        const today = ctx.today()
        const limit = q.due === 'week' ? addDays(today, 7) : q.due === 'today' ? today : today
        const slim = (t: ReturnType<typeof cardView>) => ({
          cardId: t.id,
          title: t.title,
          boardId: t.boardId,
          board: t.boardTitle,
          column: t.column,
          endDate: t.endDate,
          overdue: !!t.endDate && t.endDate < today,
          daysLate: t.endDate && t.endDate < today ? Math.round((Date.parse(today) - Date.parse(t.endDate)) / 86_400_000) : 0,
        })
        const byPerson = new Map<string, { assignee: NonNullable<ReturnType<typeof cardView>['assignee']>; tasks: ReturnType<typeof slim>[] }>()
        const unassigned: ReturnType<typeof slim>[] = []
        for (const b of all) {
          for (const c of b.cards) {
            const col = b.columns.find((x) => x.id === c.columnId)
            if (col?.kind === 'done') continue
            const v = cardView(c, b, agent)
            if (!v.endDate) continue
            if (q.due === 'today' ? v.endDate !== today : v.endDate > limit) continue
            if (!v.assignee) {
              unassigned.push(slim(v))
              continue
            }
            const g = byPerson.get(v.assignee.id) ?? { assignee: v.assignee, tasks: [] }
            g.tasks.push(slim(v))
            byPerson.set(v.assignee.id, g)
          }
        }
        const people = [...byPerson.values()].map(({ assignee, tasks }) => {
          tasks.sort((a, z) => (a.endDate ?? '').localeCompare(z.endDate ?? ''))
          const late = tasks.filter((t) => t.overdue)
          const line = (t: (typeof tasks)[number]) =>
            `• ${t.title} (${t.board})${t.overdue ? ` — vencida hace ${t.daysLate} ${t.daysLate === 1 ? 'día' : 'días'}` : t.endDate === today ? ' — vence hoy' : ` — vence el ${t.endDate}`}`
          const first = assignee.name.split(' ')[0]
          return {
            person: assignee,
            overdue: late.length,
            tasks,
            suggestedText: `Hola ${first}, tienes ${tasks.length} ${tasks.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}:\n${tasks.map(line).join('\n')}`,
          }
        })
        people.sort((a, z) => z.overdue - a.overdue || a.person.name.localeCompare(z.person.name, 'es'))
        return { today, people, unassigned }
      })

      api.get('/search', async (req, reply) => {
        const q = req.query as { q?: string; board?: string }
        const needle = (q.q ?? '').trim().toLowerCase()
        if (needle.length < 2) return reply.code(400).send({ error: 'bad_request', detail: 'q: mínimo 2 caracteres' })
        const { agent } = me(req)
        const only = q.board ? board(req, reply, q.board) : null
        if (q.board && !only) return
        const all = only ? [only] : agent.boards.flatMap((g) => loadBoard(agent, g.boardId) ?? [])
        const hits: { type: string; boardId: string; boardTitle: string; cardId: string; cardTitle: string; snippet: string }[] = []
        const snip = (t: string) => {
          const i = t.toLowerCase().indexOf(needle)
          return t.slice(Math.max(0, i - 40), i + 100).replace(/\s+/g, ' ')
        }
        for (const b of all) {
          const title = (c: Row) => str(c.title)
          for (const c of b.cards) {
            const base = { boardId: b.id, boardTitle: str(b.board.title), cardId: str(c.id), cardTitle: title(c) }
            if (title(c).toLowerCase().includes(needle)) hits.push({ type: 'card', ...base, snippet: title(c) })
            else if (str(c.description).toLowerCase().includes(needle))
              hits.push({ type: 'description', ...base, snippet: snip(str(c.description)) })
          }
          for (const m of b.comments) {
            const c = b.cards.find((x) => x.id === m.cardId)
            if (c && str(m.bodyMd).toLowerCase().includes(needle))
              hits.push({
                type: 'update',
                boardId: b.id,
                boardTitle: str(b.board.title),
                cardId: str(c.id),
                cardTitle: title(c),
                snippet: snip(str(m.bodyMd)),
              })
          }
          for (const i of b.items) {
            const c = b.cards.find((x) => x.id === i.cardId)
            if (c && str(i.text).toLowerCase().includes(needle))
              hits.push({
                type: 'task',
                boardId: b.id,
                boardTitle: str(b.board.title),
                cardId: str(c.id),
                cardTitle: title(c),
                snippet: str(i.text),
              })
          }
        }
        return { count: hits.length, results: hits.slice(0, 40) }
      })

      /* ---------- escritura (solo tableros con nivel "write") ---------- */

      /** Valida los campos comunes de una tarjeta; devuelve el error o la parte ya limpia. */
      const cleanFields = (
        b: BoardData,
        body: Row,
      ): { error: string } | { fields: Row; unset: string[] } => {
        const fields: Row = {}
        const unset: string[] = []
        if (body.title !== undefined) {
          const t = str(body.title).replace(/\s+/g, ' ').trim()
          if (!t || t.length > MAX_CARD_TITLE) return { error: 'invalid_title' }
          fields.title = t
        }
        if (body.description !== undefined) {
          if (typeof body.description !== 'string' || body.description.length > MAX_TEXT)
            return { error: 'invalid_description' }
          fields.description = body.description
        }
        for (const k of ['startDate', 'endDate'] as const) {
          if (body[k] === undefined) continue
          if (body[k] === null || body[k] === '') unset.push(k)
          else if (validDate(body[k])) fields[k] = body[k]
          else return { error: `invalid_${k}` }
        }
        if (body.assigneeId !== undefined) {
          if (body.assigneeId === null || body.assigneeId === '') unset.push('assigneeId')
          else {
            const ok = participants(b, { canContacts: false } as AgentView).some((p) => p.id === body.assigneeId)
            if (!ok) return { error: 'assignee_not_in_board' }
            fields.assigneeId = body.assigneeId
          }
        }
        if (body.labelIds !== undefined) {
          const ids = body.labelIds
          if (!Array.isArray(ids) || ids.length > 8 || !ids.every((i) => b.labels.some((l) => l.id === i)))
            return { error: 'invalid_labels' }
          fields.labelIds = ids
        }
        return { fields, unset }
      }

      /** Quita campos y comprueba que la fecha final no sea anterior a la inicial. */
      const finalize = (row: Row, unset: string[]): string | null => {
        for (const k of unset) delete row[k]
        const s = str(row.startDate)
        const e = str(row.endDate)
        return s && e && e < s ? 'end_before_start' : null
      }

      /** Respeta el límite de tarjetas del tipo de columna (Next 4, Doing 2). */
      const fits = (b: BoardData, columnId: string, ignoreCardId?: string) => {
        const col = b.columns.find((c) => c.id === columnId)
        if (!col) return 'column_not_found'
        const limit = WIP[str(col.kind) || 'standard']
        if (limit === null) return null
        const n = b.cards.filter((c) => c.columnId === columnId && c.id !== ignoreCardId).length
        return n >= limit ? 'column_full' : null
      }

      const endPosition = (b: BoardData, columnId: string, ignoreCardId?: string) => {
        const last = b.cards
          .filter((c) => c.columnId === columnId && c.id !== ignoreCardId)
          .map((c) => str(c.position))
          .sort()
          .pop()
        return keyAfter(last ?? null)
      }

      api.post('/cards', async (req, reply) => {
        const body = (req.body ?? {}) as Row
        const b = board(req, reply, body.boardId)
        if (!b || !writable(req, reply, b)) return
        if (!validId(body.columnId)) return reply.code(400).send({ error: 'bad_request', detail: 'columnId' })
        if (body.title === undefined) return reply.code(400).send({ error: 'invalid_title' })
        const f = cleanFields(b, body)
        if ('error' in f) return reply.code(400).send({ error: f.error })
        const full = fits(b, body.columnId)
        if (full) return reply.code(full === 'column_full' ? 409 : 404).send({ error: full })
        const ts = ctx.nextTs()
        const row: Row = {
          id: randomUUID(),
          boardId: b.id,
          columnId: body.columnId,
          title: '',
          position: endPosition(b, body.columnId),
          createdAt: ts,
          updatedAt: ts,
          ...f.fields,
        }
        const err = finalize(row, f.unset)
        if (err) return reply.code(400).send({ error: err })
        const saved = store(b, 'cards', row)
        b.cards.push(saved)
        return reply.code(201).send({ card: cardView(saved, b, me(req).agent) })
      })

      api.patch('/cards/:id', async (req, reply) => {
        const { id } = req.params as { id: string }
        if (!validId(id)) return reply.code(400).send({ error: 'bad_request' })
        const r = cardRow.get(id) as { board_id: string | null } | undefined
        const b = r?.board_id ? board(req, reply, r.board_id) : null
        if (!b) return reply.code(404).send({ error: 'not_found' })
        if (!writable(req, reply, b)) return
        const card = b.cards.find((c) => c.id === id)
        if (!card) return reply.code(404).send({ error: 'not_found' })
        const body = (req.body ?? {}) as Row
        const f = cleanFields(b, body)
        if ('error' in f) return reply.code(400).send({ error: f.error })
        const next: Row = { ...card, ...f.fields }
        if (body.columnId !== undefined && body.columnId !== card.columnId) {
          if (!validId(body.columnId)) return reply.code(400).send({ error: 'bad_request', detail: 'columnId' })
          const full = fits(b, body.columnId, id)
          if (full) return reply.code(full === 'column_full' ? 409 : 404).send({ error: full })
          next.columnId = body.columnId
          next.position = endPosition(b, body.columnId, id)
        }
        const err = finalize(next, f.unset)
        if (err) return reply.code(400).send({ error: err })
        const saved = store(b, 'cards', next)
        return { card: cardView(saved, b, me(req).agent) }
      })

      api.post('/cards/:id/comments', async (req, reply) => {
        const { id } = req.params as { id: string }
        if (!validId(id)) return reply.code(400).send({ error: 'bad_request' })
        const r = cardRow.get(id) as { board_id: string | null } | undefined
        const b = r?.board_id ? board(req, reply, r.board_id) : null
        if (!b) return reply.code(404).send({ error: 'not_found' })
        if (!writable(req, reply, b)) return
        if (!b.cards.some((c) => c.id === id)) return reply.code(404).send({ error: 'not_found' })
        const body = (req.body ?? {}) as Row
        const text = str(body.body).trim()
        if (!text || text.length > MAX_TEXT) return reply.code(400).send({ error: 'invalid_body' })
        let parentId: string | undefined
        if (body.parentId !== undefined) {
          const p = b.comments.find((m) => m.id === body.parentId && m.cardId === id && !m.parentId)
          if (!p) return reply.code(404).send({ error: 'parent_not_found' })
          parentId = str(p.id)
        }
        const ts = ctx.nextTs()
        const saved = store(b, 'comments', {
          id: randomUUID(),
          cardId: id,
          boardId: b.id,
          bodyMd: text,
          authorId: `agent:${me(req).agent.id}`,
          agentName: me(req).agent.name,
          createdAt: ts,
          updatedAt: ts,
          ...(parentId ? { parentId } : {}),
        })
        return reply.code(201).send({ update: { id: str(saved.id), author: authorOf(saved), body: text } })
      })

      /* ---------- avisos dentro de la app ---------- */

      api.post('/notify', async (req, reply) => {
        const { agent } = me(req)
        if (!agent.canNotify) return reply.code(403).send({ error: 'not_allowed', detail: 'La conexión no puede avisar.' })
        const body = (req.body ?? {}) as Row
        const b = board(req, reply, body.boardId)
        if (!b) return
        const message = str(body.message).replace(/\s+/g, ' ').trim()
        if (!message || message.length > 300) return reply.code(400).send({ error: 'invalid_message' })
        const target =
          typeof body.userId === 'string'
            ? (userRow.get(body.userId) as { id: string } | undefined)
            : typeof body.email === 'string'
              ? (userByEmail.get(body.email.trim().toLowerCase()) as { id: string } | undefined)
              : undefined
        // solo a personas que participan en el tablero (si no, es como si no existiera)
        if (!target || !participants(b, agent).some((p) => p.id === target.id))
          return reply.code(404).send({ error: 'recipient_not_in_board' })
        let cardId: string | undefined
        if (body.cardId !== undefined) {
          if (!b.cards.some((c) => c.id === body.cardId)) return reply.code(404).send({ error: 'card_not_found' })
          cardId = String(body.cardId)
        }
        if (!agents.allow(`notify:${agent.id}`, NOTIFY_PER_HOUR, 3_600_000))
          return reply.code(429).send({ error: 'rate_limited', detail: 'Máximo de avisos por hora alcanzado.' })
        if (!agents.allow(`notify:${agent.id}:${target.id}`, NOTIFY_PER_PERSON_HOUR, 3_600_000))
          return reply.code(429).send({ error: 'rate_limited', detail: 'Demasiados avisos a esta persona en una hora.' })
        const view = notifications.create({
          userId: target.id,
          type: 'agent',
          actorId: `agent:${agent.id}`,
          boardId: b.id,
          cardId,
          title: cardId ? notifications.titleOfCard(cardId) : str(b.board.title),
          excerpt: message,
        })
        if (!view) return reply.code(404).send({ error: 'recipient_not_in_board' })
        // solo aviso dentro de la app: no entra a la cola de correo/WhatsApp (de eso se encarga el agente)
        hub.publishNotification(target.id, view, notifications.list(target.id, { limit: 1 }).unread)
        return reply.code(201).send({ ok: true })
      })
    },
    { prefix: '/api/agent/v1' },
  )
}
