import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import {
  COOKIE,
  LoginLimiter,
  MIN_PASSWORD,
  SESSION_DAYS,
  createSession,
  createUser,
  dummyHash,
  endOtherSessions,
  endSession,
  cleanAlias,
  findUserByEmail,
  generatePassword,
  hashPassword,
  listUsers,
  normalizeEmail,
  passwordHashOf,
  renewSession,
  sessionUser,
  setAlias,
  setPasswordHash,
  validEmail,
  verifyPassword,
  type User,
} from './auth.ts'
import { createClock, isTable, transaction, type DB } from './db.ts'
import { Hub } from './events.ts'
import { Notifications, detect, type RowChange } from './notifications.ts'

export interface AppOptions {
  db: DB
  dataDir: string
  allowSignup?: boolean
  /** Cookie con atributo Secure (producción, detrás de HTTPS). Desactívalo solo en pruebas por http. */
  cookieSecure?: boolean
  logger?: boolean
}

export interface BuiltApp {
  app: FastifyInstance
  hub: Hub
}

const MAX_BLOB_BYTES = 20 * 1024 * 1024
const MAX_ROW_BYTES = 64 * 1024
const MAX_BATCH = 500
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Tipo real de una imagen por sus primeros bytes (no se confía en el Content-Type del cliente). */
export function sniffImage(b: Buffer): string | null {
  if (b.length < 12) return null
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif'
  if (
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp'
  if (
    b.subarray(4, 8).toString('latin1') === 'ftyp' &&
    /avif|avis/.test(b.subarray(8, 16).toString('latin1'))
  )
    return 'image/avif'
  return null
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

const isStr = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max

export function buildApp(opts: AppOptions): BuiltApp {
  const { db, dataDir } = opts
  const secure = opts.cookieSecure ?? true
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    bodyLimit: 4 * 1024 * 1024,
  })
  const hub = new Hub()
  const notifications = new Notifications(db)
  const nextTs = createClock(db)
  const byEmail = new LoginLimiter(5)
  const byIp = new LoginLimiter(30)

  // JSON tolerante con el cuerpo vacío (p. ej. POST /auth/logout); si viene, debe ser válido.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {})
    try {
      done(null, JSON.parse(body as string))
    } catch {
      done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }), undefined)
    }
  })

  // Imágenes crudas (PUT /api/blobs/:id).
  app.addContentTypeParser(
    /^image\//,
    { parseAs: 'buffer', bodyLimit: MAX_BLOB_BYTES },
    (_req, body, done) => done(null, body),
  )

  const setCookie = (reply: FastifyReply, token: string, maxAge = SESSION_DAYS * 86_400) =>
    reply.header(
      'Set-Cookie',
      `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`,
    )

  const tokenOf = (req: FastifyRequest) => parseCookies(req.headers.cookie)[COOKIE]
  const userOf = (req: FastifyRequest): User | null => sessionUser(db, tokenOf(req))

  /** Rutas autenticadas: devuelve el usuario o responde 401. */
  const requireUser = (req: FastifyRequest, reply: FastifyReply): User | null => {
    const u = userOf(req)
    if (!u) void reply.code(401).send({ error: 'unauthorized' })
    return u
  }

  const sessionIsAdmin = (userId: string) =>
    (
      db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as
        { is_admin: number } | undefined
    )?.is_admin === 1

  /** Rutas de administración: usuario con rol admin, o 401/403. */
  const requireAdmin = (req: FastifyRequest, reply: FastifyReply): User | null => {
    const u = requireUser(req, reply)
    if (!u) return null
    if (!u.isAdmin) {
      void reply.code(403).send({ error: 'forbidden' })
      return null
    }
    return u
  }

  app.addHook('onRequest', async (req, reply) => {
    // CSRF: las peticiones que cambian algo deben venir del mismo origen (el navegador siempre envía Origin).
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
        .split(',')[0]
        .trim()
      let originHost = ''
      try {
        originHost = new URL(String(req.headers.origin ?? '')).host
      } catch {
        /* sin Origin válido */
      }
      if (!originHost || originHost !== host) return reply.code(403).send({ error: 'bad_origin' })
    }
  })

  app.addHook('onSend', async (_req, reply) => {
    if (!reply.hasHeader('cache-control')) reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
  })

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500
    if (status === 500) app.log.error(err)
    void reply
      .code(status)
      .send({ error: status === 413 ? 'too_large' : status === 500 ? 'internal' : 'bad_request' })
  })

  /* ---------- salud ---------- */

  app.get('/api/health', async () => ({ ok: true }))

  /* ---------- autenticación ---------- */

  app.get('/api/auth/config', async () => ({ allowSignup: !!opts.allowSignup }))

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown }
    if (!isStr(body.email, 254) || !isStr(body.password, 1024))
      return reply.code(400).send({ error: 'bad_request' })
    const email = normalizeEmail(body.email)
    if (byEmail.blocked(email) || byIp.blocked(req.ip)) {
      return reply.code(429).header('Retry-After', '900').send({ error: 'too_many_attempts' })
    }
    const user = findUserByEmail(db, email)
    const ok = await verifyPassword(body.password, user ? user.pass_hash : await dummyHash())
    if (!user || !ok) {
      byEmail.fail(email)
      byIp.fail(req.ip)
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    byEmail.reset(email)
    setCookie(reply, createSession(db, user.id))
    return {
      user: { id: user.id, email: user.email, alias: user.alias, isAdmin: sessionIsAdmin(user.id) },
    }
  })

  app.post('/api/auth/signup', async (req, reply) => {
    if (!opts.allowSignup) return reply.code(403).send({ error: 'signup_disabled' })
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown; alias?: unknown }
    if (!isStr(body.email, 254) || !isStr(body.password, 1024))
      return reply.code(400).send({ error: 'bad_request' })
    const email = normalizeEmail(body.email)
    if (!validEmail(email)) return reply.code(400).send({ error: 'invalid_email' })
    const alias = cleanAlias(body.alias)
    if (alias === null) return reply.code(400).send({ error: 'invalid_alias' })
    if (body.password.length < MIN_PASSWORD) return reply.code(400).send({ error: 'weak_password' })
    if (findUserByEmail(db, email)) return reply.code(409).send({ error: 'email_taken' })
    const user = createUser(db, email, await hashPassword(body.password), false, alias)
    setCookie(reply, createSession(db, user.id))
    return reply.code(201).send({ user })
  })

  app.get('/api/auth/me', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const token = tokenOf(req)!
    renewSession(db, token) // sesión deslizante: se renueva mientras uses la app
    setCookie(reply, token)
    return { user }
  })

  app.post('/api/auth/password', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const body = (req.body ?? {}) as { current?: unknown; next?: unknown }
    if (!isStr(body.current, 1024) || !isStr(body.next, 1024)) {
      return reply.code(400).send({ error: 'bad_request' })
    }
    // Mismo límite que el login: nadie puede adivinar la contraseña actual desde una sesión robada.
    const key = `pw:${user.id}`
    if (byEmail.blocked(key)) {
      return reply.code(429).header('Retry-After', '900').send({ error: 'too_many_attempts' })
    }
    if (body.next.length < MIN_PASSWORD) return reply.code(400).send({ error: 'weak_password' })
    if (body.next === body.current) return reply.code(400).send({ error: 'same_password' })

    const stored = passwordHashOf(db, user.id)
    if (!stored || !(await verifyPassword(body.current, stored))) {
      byEmail.fail(key)
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    byEmail.reset(key)
    setPasswordHash(db, user.id, await hashPassword(body.next))
    endOtherSessions(db, user.id, tokenOf(req)!) // las demás sesiones (¿robadas?) dejan de valer
    return reply.code(204).send()
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const token = tokenOf(req)
    if (token) endSession(db, token)
    setCookie(reply, '', 0)
    return reply.code(204).send()
  })

  /* ---------- administración de usuarios (solo admin) ---------- */

  app.get('/api/admin/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    return { users: listUsers(db) }
  })

  app.post('/api/admin/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown; alias?: unknown }
    if (!isStr(body.email, 254)) return reply.code(400).send({ error: 'bad_request' })
    const email = normalizeEmail(body.email)
    if (!validEmail(email)) return reply.code(400).send({ error: 'invalid_email' })
    const alias = cleanAlias(body.alias)
    if (alias === null) return reply.code(400).send({ error: 'invalid_alias' })
    if (body.password !== undefined && body.password !== '') {
      if (!isStr(body.password, 1024)) return reply.code(400).send({ error: 'bad_request' })
      if (body.password.length < MIN_PASSWORD)
        return reply.code(400).send({ error: 'weak_password' })
    }
    if (findUserByEmail(db, email)) return reply.code(409).send({ error: 'email_taken' })
    // Sin contraseña indicada se genera una temporal; solo se muestra en esta respuesta.
    const generated = !body.password
    const password = generated ? generatePassword() : String(body.password)
    const user = createUser(db, email, await hashPassword(password), false, alias)
    return reply.code(201).send({ user, ...(generated ? { password } : {}) })
  })

  app.patch('/api/admin/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    if (!ID_RE.test(id) || !listUsers(db).some((u) => u.id === id))
      return reply.code(404).send({ error: 'not_found' })
    const alias = cleanAlias((req.body as { alias?: unknown } | null)?.alias)
    if (alias === null) return reply.code(400).send({ error: 'invalid_alias' })
    setAlias(db, id, alias)
    return { user: listUsers(db).find((u) => u.id === id) }
  })

  app.post('/api/admin/users/:id/password', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    if (!ID_RE.test(id) || !listUsers(db).some((u) => u.id === id))
      return reply.code(404).send({ error: 'not_found' })
    const password = generatePassword()
    setPasswordHash(db, id, await hashPassword(password))
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id) // cierra sus sesiones abiertas
    return { password }
  })

  app.delete('/api/admin/users/:id', async (req, reply) => {
    const admin = requireAdmin(req, reply)
    if (!admin) return
    const { id } = req.params as { id: string }
    if (!ID_RE.test(id) || !listUsers(db).some((u) => u.id === id))
      return reply.code(404).send({ error: 'not_found' })
    if (id === admin.id) return reply.code(400).send({ error: 'cannot_delete_self' })
    db.prepare('DELETE FROM users WHERE id = ?').run(id) // en cascada: sesiones y filas
    await rm(join(dataDir, 'blobs', id), { recursive: true, force: true })
    return reply.code(204).send()
  })

  /* ---------- sincronización ---------- */

  const selectSince = db.prepare(
    `SELECT r.data, r.user_id FROM rows r
     WHERE r.tbl = ? AND r.updated_at >= ?
       AND (r.user_id = ? OR r.board_id IN (SELECT board_id FROM board_members WHERE user_id = ?))
     ORDER BY r.updated_at, r.id LIMIT ?`,
  )
  const upsert = db.prepare(
    `INSERT INTO rows (user_id, tbl, id, data, updated_at, board_id) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, tbl, id) DO UPDATE SET
       data = excluded.data, updated_at = excluded.updated_at,
       board_id = COALESCE(excluded.board_id, rows.board_id)`,
  )
  const findRow = db.prepare('SELECT user_id, board_id FROM rows WHERE tbl = ? AND id = ?')
  const prevData = db.prepare('SELECT data FROM rows WHERE user_id = ? AND tbl = ? AND id = ?')
  const boardOwner = db.prepare("SELECT user_id FROM rows WHERE tbl = 'boards' AND id = ? LIMIT 1")
  const memberRole = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?')
  const membersOf = db.prepare('SELECT user_id FROM board_members WHERE board_id = ?')

  /** Tablero al que pertenece una fila (los hijos antiguos sin boardId se resuelven por la fila existente). */
  const boardIdOf = (table: string, row: Record<string, unknown>): string | null =>
    table === 'boards'
      ? String(row.id)
      : typeof row.boardId === 'string' && ID_RE.test(row.boardId)
        ? row.boardId
        : null

  /**
   * ¿Puede `userId` escribir esta fila y bajo qué dueño se guarda? Reglas:
   *  · tablero: solo su dueño (o cualquiera si es nuevo: queda a su nombre);
   *  · el resto: el dueño del tablero, o un miembro con rol editor;
   *  · una fila ya existente no puede cambiar de tablero (nadie "roba" filas ajenas por id).
   */
  const writeOwner = (
    userId: string,
    table: string,
    row: Record<string, unknown>,
  ): string | null => {
    const id = String(row.id)
    const boardId = boardIdOf(table, row)
    const existing = findRow.all(table, id) as { user_id: string; board_id: string | null }[]
    const mine = existing.find((e) => e.user_id === userId)

    if (!boardId) return mine || existing.length === 0 ? userId : null // etiquetas/hijos antiguos
    const board = boardOwner.get(boardId) as { user_id: string } | undefined
    let owner = userId
    if (board && board.user_id !== userId) {
      if (table === 'boards') return null
      const m = memberRole.get(boardId, userId) as { role: string } | undefined
      if (!m || m.role !== 'editor') return null
      owner = board.user_id
    }
    const target = existing.find((e) => e.user_id === owner)
    if (target && target.board_id && target.board_id !== boardId) return null
    if (!target && existing.length > 0 && table !== 'boards') return null // id ya usado por otro dueño
    return owner
  }

  const recipients = (ownerId: string, boardId: string | null): string[] => {
    const set = new Set([ownerId])
    if (boardId) for (const m of membersOf.all(boardId) as { user_id: string }[]) set.add(m.user_id)
    return [...set]
  }

  /** Aviso no ligado a una fila (accesos): guarda y empuja en vivo, sin romper la operación si falla. */
  const pushNotification = (
    userId: string,
    n: {
      type: 'access_granted' | 'access_role' | 'access_removed'
      actorId: string
      boardId: string
      excerpt?: string
    },
  ) => {
    try {
      const view = notifications.create({
        userId,
        type: n.type,
        actorId: n.actorId,
        boardId: n.boardId,
        title: notifications.titleOfBoard(n.boardId),
        excerpt: n.excerpt,
      })
      if (view)
        hub.publishNotification(userId, view, notifications.list(userId, { limit: 1 }).unread)
    } catch (e) {
      app.log.error(e)
    }
  }

  /** Crea los avisos que provoca un cambio y los empuja en vivo a los dispositivos del destinatario. */
  const notify = (actorId: string, change: RowChange) => {
    if (!change.boardId) return
    try {
      for (const d of detect(change)) {
        const title = d.cardId
          ? notifications.titleOfCard(d.cardId)
          : notifications.titleOfBoard(change.boardId)
        const view = notifications.create({
          userId: d.userId,
          type: d.type,
          actorId,
          boardId: change.boardId,
          cardId: d.cardId,
          title,
          excerpt: d.excerpt,
        })
        if (view)
          hub.publishNotification(d.userId, view, notifications.list(d.userId, { limit: 1 }).unread)
      }
    } catch (e) {
      app.log.error(e) // un fallo al avisar nunca debe impedir guardar el cambio
    }
  }

  app.get('/api/sync/:table', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { table } = req.params as { table: string }
    if (!isTable(table)) return reply.code(404).send({ error: 'unknown_table' })
    const q = req.query as { since?: string; limit?: string }
    const since = q.since && !Number.isNaN(Date.parse(q.since)) ? q.since : ''
    const limit = Math.min(Math.max(Number(q.limit) || 500, 1), 1000)
    const rows = selectSince.all(table, since, user.id, user.id, limit) as {
      data: string
      user_id: string
    }[]
    return {
      rows: rows.map((r) => {
        const row = JSON.parse(r.data)
        if (table === 'boards') row.ownerId = r.user_id // para distinguir "mis tableros" de los compartidos
        return row
      }),
    }
  })

  app.post('/api/sync/:table', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { table } = req.params as { table: string }
    if (!isTable(table)) return reply.code(404).send({ error: 'unknown_table' })
    const rows = (req.body as { rows?: unknown } | null)?.rows
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) {
      return reply.code(400).send({ error: 'bad_rows' })
    }
    for (const r of rows) {
      if (!r || typeof r !== 'object' || !ID_RE.test(String((r as { id?: unknown }).id))) {
        return reply.code(400).send({ error: 'bad_row' })
      }
      if (JSON.stringify(r).length > MAX_ROW_BYTES)
        return reply.code(413).send({ error: 'too_large' })
    }

    const rejected: string[] = []
    const stored = transaction(db, () => {
      const out: {
        row: Record<string, unknown>
        owner: string
        boardId: string | null
        prev: Record<string, unknown> | null
      }[] = []
      for (const r of rows) {
        const input = { ...(r as Record<string, unknown>) }
        delete input.ownerId // lo pone el servidor al descargar; no se guarda
        const owner = writeOwner(user.id, table, input)
        if (!owner) {
          rejected.push(String(input.id))
          continue
        }
        // El servidor manda el reloj: "último en llegar gana" y el cursor de descarga es fiable.
        const ts = nextTs()
        const row: Record<string, unknown> = { ...input, updatedAt: ts }
        const boardId = boardIdOf(table, row)
        const before = prevData.get(owner, table, String(row.id)) as { data: string } | undefined
        upsert.run(owner, table, String(row.id), JSON.stringify(row), ts, boardId)
        out.push({ row, owner, boardId, prev: before ? JSON.parse(before.data) : null })
      }
      return out
    })

    const clientId = String(req.headers['x-client-id'] ?? '')
    for (const { row, owner, boardId, prev } of stored) {
      const payload = table === 'boards' ? { ...row, ownerId: owner } : row
      const bid =
        boardId ??
        (findRow.get(table, String(row.id)) as { board_id: string | null } | undefined)?.board_id ??
        null
      for (const uid of recipients(owner, bid)) hub.publish(uid, table, payload, clientId)
      notify(user.id, { table, row, prev, boardId: bid })
    }
    return { ok: true, count: stored.length, ...(rejected.length ? { rejected } : {}) }
  })

  /* ---------- tableros compartidos ---------- */

  /** Usuarios registrados (para elegir con quién compartir un tablero). Sin contraseñas ni datos privados. */
  app.get('/api/users/directory', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return {
      users: listUsers(db)
        .filter((u) => u.id !== user.id)
        .map((u) => ({ id: u.id, email: u.email, alias: u.alias }))
        .sort((a, b) => (a.alias || a.email).localeCompare(b.alias || b.email, 'es')),
    }
  })

  /** Tableros que otros comparten conmigo, y los miembros de los míos. */
  app.get('/api/shares', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const shared = (
      db
        .prepare(
          `SELECT m.board_id, m.role, u.email AS owner_email, u.alias AS owner_alias, m.owner_id FROM board_members m
           JOIN users u ON u.id = m.owner_id WHERE m.user_id = ?`,
        )
        .all(user.id) as {
        board_id: string
        role: string
        owner_email: string
        owner_alias: string
        owner_id: string
      }[]
    ).map((m) => ({
      boardId: m.board_id,
      role: m.role,
      ownerId: m.owner_id,
      ownerEmail: m.owner_email,
      ownerAlias: m.owner_alias,
    }))
    const members = (
      db
        .prepare(
          `SELECT m.board_id, m.user_id, m.role, u.email, u.alias FROM board_members m
           JOIN users u ON u.id = m.user_id WHERE m.owner_id = ? ORDER BY m.created_at`,
        )
        .all(user.id) as {
        board_id: string
        user_id: string
        role: string
        email: string
        alias: string
      }[]
    ).map((m) => ({
      boardId: m.board_id,
      userId: m.user_id,
      role: m.role,
      email: m.email,
      alias: m.alias,
    }))
    // Todos los que participan en los tableros que veo (para asignar tarjetas y mostrar la lista de
    // miembros): el dueño y los miembros, también para quien solo es invitado.
    const participants = (
      db
        .prepare(
          `SELECT m.board_id, m.user_id, m.role, u.email, u.alias FROM board_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.board_id IN (
             SELECT board_id FROM board_members WHERE user_id = ?1
             UNION SELECT board_id FROM board_members WHERE owner_id = ?1)
           ORDER BY m.created_at`,
        )
        .all(user.id) as {
        board_id: string
        user_id: string
        role: string
        email: string
        alias: string
      }[]
    ).map((m) => ({
      boardId: m.board_id,
      userId: m.user_id,
      role: m.role,
      email: m.email,
      alias: m.alias,
    }))
    const owners = new Map<
      string,
      { boardId: string; userId: string; role: string; email: string; alias: string }
    >()
    for (const s of shared)
      owners.set(s.boardId, {
        boardId: s.boardId,
        userId: s.ownerId,
        role: 'owner',
        email: s.ownerEmail,
        alias: s.ownerAlias,
      })
    for (const m of members)
      if (!owners.has(m.boardId))
        owners.set(m.boardId, {
          boardId: m.boardId,
          userId: user.id,
          role: 'owner',
          email: user.email,
          alias: user.alias,
        })
    return { shared, members, participants: [...owners.values(), ...participants] }
  })

  /** Pone al día a un usuario recién invitado: sube el `updated_at` de las filas del tablero. */
  const touchBoard = (ownerId: string, boardId: string) =>
    transaction(db, () => {
      const rows = db
        .prepare('SELECT tbl, id, data FROM rows WHERE user_id = ? AND board_id = ?')
        .all(ownerId, boardId) as { tbl: string; id: string; data: string }[]
      const upd = db.prepare(
        'UPDATE rows SET data = ?, updated_at = ? WHERE user_id = ? AND tbl = ? AND id = ?',
      )
      for (const r of rows) {
        const ts = nextTs()
        const data = { ...JSON.parse(r.data), updatedAt: ts }
        upd.run(JSON.stringify(data), ts, ownerId, r.tbl, r.id)
      }
    })

  const ownBoard = (userId: string, boardId: string) =>
    ID_RE.test(boardId) &&
    (boardOwner.get(boardId) as { user_id: string } | undefined)?.user_id === userId

  app.post('/api/boards/:id/members', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { id } = req.params as { id: string }
    if (!ownBoard(user.id, id)) return reply.code(404).send({ error: 'not_found' })
    const body = (req.body ?? {}) as { email?: unknown; role?: unknown }
    if (!isStr(body.email, 254) || (body.role !== 'editor' && body.role !== 'viewer'))
      return reply.code(400).send({ error: 'bad_request' })
    const target = findUserByEmail(db, body.email)
    if (!target) return reply.code(404).send({ error: 'user_not_found' })
    if (target.id === user.id) return reply.code(400).send({ error: 'cannot_share_with_self' })
    const had = memberRole.get(id, target.id)
    db.prepare(
      `INSERT INTO board_members (board_id, owner_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (board_id, user_id) DO UPDATE SET role = excluded.role`,
    ).run(id, user.id, target.id, body.role, new Date().toISOString())
    if (!had) touchBoard(user.id, id)
    hub.publishAccess(target.id)
    const prevRole = (had as { role?: string } | undefined)?.role
    if (!had || prevRole !== body.role)
      pushNotification(target.id, {
        type: had ? 'access_role' : 'access_granted',
        actorId: user.id,
        boardId: id,
        excerpt: body.role === 'editor' ? 'editor' : 'solo lectura',
      })
    return reply.code(had ? 200 : 201).send({
      member: {
        boardId: id,
        userId: target.id,
        email: target.email,
        alias: target.alias,
        role: body.role,
      },
    })
  })

  app.delete('/api/boards/:id/members/:userId', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { id, userId } = req.params as { id: string; userId: string }
    if (!ID_RE.test(id) || !ID_RE.test(userId)) return reply.code(400).send({ error: 'bad_id' })
    const owner = (boardOwner.get(id) as { user_id: string } | undefined)?.user_id
    // El dueño quita a cualquiera; un miembro solo puede salirse él mismo.
    if (!owner || (owner !== user.id && userId !== user.id))
      return reply.code(404).send({ error: 'not_found' })
    const res = db
      .prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?')
      .run(id, userId)
    if (res.changes === 0) return reply.code(404).send({ error: 'not_found' })
    if (userId !== user.id)
      pushNotification(userId, { type: 'access_removed', actorId: user.id, boardId: id })
    hub.publishAccess(userId)
    hub.publishAccess(owner)
    return reply.code(204).send()
  })

  /* ---------- notificaciones ---------- */

  app.get('/api/notifications', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const q = req.query as { unread?: string; limit?: string }
    return notifications.list(user.id, {
      unreadOnly: q.unread === '1',
      limit: Number(q.limit) || 50,
    })
  })

  /** Marca como leídas: `{ all: true }`, `{ ids: [...] }` o `{ cardId }` (al abrir una tarjeta). */
  app.post('/api/notifications/read', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const body = (req.body ?? {}) as { all?: unknown; ids?: unknown; cardId?: unknown }
    if (body.all === true) notifications.markRead(user.id, 'all')
    else if (typeof body.cardId === 'string' && ID_RE.test(body.cardId))
      notifications.markCardRead(user.id, body.cardId)
    else if (
      Array.isArray(body.ids) &&
      body.ids.length <= 200 &&
      body.ids.every((i) => typeof i === 'string' && i.length <= 64)
    )
      notifications.markRead(user.id, body.ids as string[])
    else return reply.code(400).send({ error: 'bad_request' })
    return { unread: notifications.list(user.id, { limit: 1 }).unread }
  })

  notifications.purge()
  const purgeTimer = setInterval(() => notifications.purge(), 6 * 3_600_000)
  purgeTimer.unref()
  app.addHook('onClose', async () => clearInterval(purgeTimer))

  /* ---------- tiempo real (SSE) ---------- */

  app.get('/api/events', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const clientId = String((req.query as { client?: string }).client ?? '').slice(0, 64)
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    })
    res.write('retry: 3000\n\nevent: ready\ndata: {}\n\n')
    const remove = hub.add(user.id, { res, clientId })
    req.raw.on('close', remove)
  })
  const heartbeat = setInterval(() => hub.ping(), 20_000)
  heartbeat.unref()

  /* ---------- archivos de imagen ---------- */

  const blobDir = (userId: string) => join(dataDir, 'blobs', userId)

  app.put('/api/blobs/:id', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { id } = req.params as { id: string }
    if (!ID_RE.test(id)) return reply.code(400).send({ error: 'bad_id' })
    const body = req.body
    if (!Buffer.isBuffer(body)) return reply.code(415).send({ error: 'unsupported_media_type' })
    const mime = sniffImage(body)
    if (!mime) return reply.code(415).send({ error: 'not_an_image' })
    const prev = db.prepare('SELECT user_id FROM blob_owners WHERE id = ?').get(id) as
      { user_id: string } | undefined
    if (prev && prev.user_id !== user.id) return reply.code(403).send({ error: 'forbidden' })
    // Un visor no puede subir imágenes a un tablero compartido, pero sí a los suyos: la fila
    // de la imagen la valida el sync; aquí solo se guarda el archivo bajo quien lo subió.
    db.prepare('INSERT OR IGNORE INTO blob_owners (id, user_id) VALUES (?, ?)').run(id, user.id)

    const dir = blobDir(user.id)
    await mkdir(dir, { recursive: true })
    const tmp = join(dir, `${id}.tmp`)
    await writeFile(tmp, body)
    await rename(tmp, join(dir, id))
    await writeFile(join(dir, `${id}.mime`), mime)
    return reply.code(204).send()
  })

  app.get('/api/blobs/:id', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { id } = req.params as { id: string }
    if (!ID_RE.test(id)) return reply.code(400).send({ error: 'bad_id' })
    // Quién puede verla: quien la subió o cualquiera que vea la fila de la imagen (dueño/miembros).
    const att = db
      .prepare(
        `SELECT r.user_id, r.board_id,
           EXISTS (SELECT 1 FROM board_members m WHERE m.board_id = r.board_id AND m.user_id = ?) AS member
         FROM rows r WHERE r.tbl = 'attachments' AND r.id = ?`,
      )
      .all(user.id, id) as { user_id: string; board_id: string | null; member: number }[]
    const owner = db.prepare('SELECT user_id FROM blob_owners WHERE id = ?').get(id) as
      { user_id: string } | undefined
    const allowed =
      owner?.user_id === user.id || att.some((a) => a.user_id === user.id || a.member === 1)
    if (!allowed) return reply.code(404).send({ error: 'not_found' })
    const dirOwner =
      owner?.user_id ?? att.find((a) => a.user_id === user.id || a.member === 1)!.user_id
    try {
      const [data, mime] = await Promise.all([
        readFile(join(blobDir(dirOwner), id)),
        readFile(join(blobDir(dirOwner), `${id}.mime`), 'utf8'),
      ])
      return reply
        .header('Content-Type', mime)
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        .send(data)
    } catch {
      return reply.code(404).send({ error: 'not_found' })
    }
  })

  app.addHook('onClose', async () => {
    clearInterval(heartbeat)
    hub.closeAll()
  })

  return { app, hub }
}
