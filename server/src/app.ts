import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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
  findUserByEmail,
  hashPassword,
  normalizeEmail,
  passwordHashOf,
  renewSession,
  sessionUser,
  setPasswordHash,
  validEmail,
  verifyPassword,
  type User,
} from './auth.ts'
import { createClock, isTable, transaction, type DB } from './db.ts'
import { Hub } from './events.ts'

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
    return { user: { id: user.id, email: user.email } }
  })

  app.post('/api/auth/signup', async (req, reply) => {
    if (!opts.allowSignup) return reply.code(403).send({ error: 'signup_disabled' })
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown }
    if (!isStr(body.email, 254) || !isStr(body.password, 1024))
      return reply.code(400).send({ error: 'bad_request' })
    const email = normalizeEmail(body.email)
    if (!validEmail(email)) return reply.code(400).send({ error: 'invalid_email' })
    if (body.password.length < MIN_PASSWORD) return reply.code(400).send({ error: 'weak_password' })
    if (findUserByEmail(db, email)) return reply.code(409).send({ error: 'email_taken' })
    const user = createUser(db, email, await hashPassword(body.password))
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

  /* ---------- sincronización ---------- */

  const selectSince = db.prepare(
    `SELECT data FROM rows WHERE user_id = ? AND tbl = ? AND updated_at >= ?
     ORDER BY updated_at, id LIMIT ?`,
  )
  const upsert = db.prepare(
    `INSERT INTO rows (user_id, tbl, id, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )

  app.get('/api/sync/:table', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const { table } = req.params as { table: string }
    if (!isTable(table)) return reply.code(404).send({ error: 'unknown_table' })
    const q = req.query as { since?: string; limit?: string }
    const since = q.since && !Number.isNaN(Date.parse(q.since)) ? q.since : ''
    const limit = Math.min(Math.max(Number(q.limit) || 500, 1), 1000)
    const rows = selectSince.all(user.id, table, since, limit) as { data: string }[]
    return { rows: rows.map((r) => JSON.parse(r.data)) }
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

    const stored = transaction(db, () =>
      rows.map((r) => {
        // El servidor manda el reloj: "último en llegar gana" y el cursor de descarga es fiable.
        const ts = nextTs()
        const row: Record<string, unknown> = { ...(r as Record<string, unknown>), updatedAt: ts }
        upsert.run(user.id, table, String(row.id), JSON.stringify(row), ts)
        return row
      }),
    )

    const clientId = String(req.headers['x-client-id'] ?? '')
    for (const row of stored) hub.publish(user.id, table, row, clientId)
    return { ok: true, count: stored.length }
  })

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
    try {
      const [data, mime] = await Promise.all([
        readFile(join(blobDir(user.id), id)),
        readFile(join(blobDir(user.id), `${id}.mime`), 'utf8'),
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
