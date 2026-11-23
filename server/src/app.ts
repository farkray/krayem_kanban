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
  setGuest,
  setPasswordHash,
  validEmail,
  verifyPassword,
  type User,
} from './auth.ts'
import { createClock, isTable, transaction, type DB } from './db.ts'
import { Hub } from './events.ts'
import { Notifications, detect, type NotificationView, type RowChange } from './notifications.ts'
import { Delivery, cleanPhone, cleanWebhookUrl, validTimezone } from './delivery.ts'
import { buildDigest, dayIn } from './digest.ts'
import { Agents, type Access, type AgentBoard } from './agents.ts'
import { registerAgentApi } from './agentApi.ts'
import { buildN8nWorkflow } from './n8nWorkflow.ts'
import {
  cleanWorkspaceName,
  createWorkspace,
  isMember,
  joinGeneral,
  listAdminWorkspaces,
  setWorkspaceMembers,
  sharesWorkspace,
  workspacesOf,
} from './workspaces.ts'

export interface AppOptions {
  db: DB
  dataDir: string
  allowSignup?: boolean
  /** Cookie con atributo Secure (producción, detrás de HTTPS). Desactívalo solo en pruebas por http. */
  cookieSecure?: boolean
  logger?: boolean
  /** Cliente HTTP para el webhook de avisos (se sustituye en pruebas). */
  fetch?: typeof fetch
}

export interface BuiltApp {
  app: FastifyInstance
  hub: Hub
  delivery: Delivery
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
  const delivery = new Delivery(db, opts.fetch)
  const nextTs = createClock(db)
  const agents = new Agents(db)
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

  const isGuest = (userId: string) =>
    (
      db.prepare('SELECT is_guest FROM users WHERE id = ?').get(userId) as
        { is_guest: number } | undefined
    )?.is_guest === 1

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
    // La API de agentes usa un token Bearer (no una cookie): no hay credencial "ambiente" que proteger.
    if (req.url.startsWith('/api/agent/v1/')) return
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
      user: {
        id: user.id,
        email: user.email,
        alias: user.alias,
        isAdmin: sessionIsAdmin(user.id),
        isGuest: isGuest(user.id),
      },
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
    joinGeneral(db, user.id) // quien se registra solo entra al workspace General
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
    const body = (req.body ?? {}) as {
      email?: unknown
      password?: unknown
      alias?: unknown
      guest?: unknown
      workspaceIds?: unknown
    }
    const wsIds = body.workspaceIds ?? []
    if (!Array.isArray(wsIds) || !wsIds.every((w) => validId(w) && workspaceExists.get(w)))
      return reply.code(400).send({ error: 'unknown_workspace' })
    if (!isStr(body.email, 254)) return reply.code(400).send({ error: 'bad_request' })
    if (body.guest !== undefined && typeof body.guest !== 'boolean')
      return reply.code(400).send({ error: 'bad_request' })
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
    const user = createUser(
      db,
      email,
      await hashPassword(password),
      false,
      alias,
      body.guest === true,
    )
    for (const w of wsIds)
      db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id) VALUES (?, ?)').run(
        w,
        user.id,
      )
    return reply.code(201).send({ user, ...(generated ? { password } : {}) })
  })

  app.patch('/api/admin/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    if (!ID_RE.test(id) || !listUsers(db).some((u) => u.id === id))
      return reply.code(404).send({ error: 'not_found' })
    const body = (req.body ?? {}) as { alias?: unknown; guest?: unknown }
    if (body.alias !== undefined) {
      const alias = cleanAlias(body.alias)
      if (alias === null) return reply.code(400).send({ error: 'invalid_alias' })
      setAlias(db, id, alias)
    }
    if (body.guest !== undefined) {
      if (typeof body.guest !== 'boolean') return reply.code(400).send({ error: 'bad_request' })
      const target = listUsers(db).find((u) => u.id === id)
      // Un administrador no puede ser invitado (primero se le quita el rol de administrador)
      if (body.guest && target?.isAdmin)
        return reply.code(400).send({ error: 'admin_cannot_be_guest' })
      setGuest(db, id, body.guest)
    }
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

  /* ---------- workspaces (solo admin) ---------- */

  const workspaceId = (req: FastifyRequest) => (req.params as { id: string }).id
  const knownWorkspace = (id: string) => ID_RE.test(id) && !!workspaceExists.get(id)

  app.get('/api/admin/workspaces', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    return { workspaces: listAdminWorkspaces(db) }
  })

  app.post('/api/admin/workspaces', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const name = cleanWorkspaceName((req.body as { name?: unknown } | null)?.name)
    if (!name) return reply.code(400).send({ error: 'invalid_name' })
    const w = createWorkspace(db, name)
    if (!w) return reply.code(409).send({ error: 'name_taken' })
    return reply.code(201).send({ workspace: listAdminWorkspaces(db).find((x) => x.id === w.id) })
  })

  app.patch('/api/admin/workspaces/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = workspaceId(req)
    if (!knownWorkspace(id)) return reply.code(404).send({ error: 'not_found' })
    const name = cleanWorkspaceName((req.body as { name?: unknown } | null)?.name)
    if (!name) return reply.code(400).send({ error: 'invalid_name' })
    try {
      db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
    } catch {
      return reply.code(409).send({ error: 'name_taken' })
    }
    for (const m of listAdminWorkspaces(db).find((w) => w.id === id)?.members ?? [])
      hub.publishAccess(m)
    return { workspace: listAdminWorkspaces(db).find((w) => w.id === id) }
  })

  app.put('/api/admin/workspaces/:id/members', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = workspaceId(req)
    if (!knownWorkspace(id)) return reply.code(404).send({ error: 'not_found' })
    const ids = (req.body as { userIds?: unknown } | null)?.userIds
    if (!Array.isArray(ids) || ids.length > 5000 || !ids.every(validId))
      return reply.code(400).send({ error: 'bad_request' })
    const known = new Set(listUsers(db).map((u) => u.id))
    if (!ids.every((u) => known.has(u))) return reply.code(400).send({ error: 'unknown_user' })
    const affected = transaction(db, () => setWorkspaceMembers(db, id, [...new Set(ids)]))
    for (const u of affected) hub.publishAccess(u)
    return { workspace: listAdminWorkspaces(db).find((w) => w.id === id) }
  })

  app.delete('/api/admin/workspaces/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = workspaceId(req)
    const w = ID_RE.test(id) ? listAdminWorkspaces(db).find((x) => x.id === id) : undefined
    if (!w) return reply.code(404).send({ error: 'not_found' })
    if (w.boards > 0) return reply.code(409).send({ error: 'workspace_not_empty' })
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
    for (const m of w.members) hub.publishAccess(m)
    return reply.code(204).send()
  })

  /* ---------- conexiones de agentes (solo admin) ---------- */

  const boardInfo = (id: string) => {
    const r = db
      .prepare("SELECT user_id, data FROM rows WHERE tbl = 'boards' AND id = ? LIMIT 1")
      .get(id) as { user_id: string; data: string } | undefined
    if (!r) return null
    const d = JSON.parse(r.data) as { title?: string; deletedAt?: string; parentId?: string; workspaceId?: string }
    if (d.deletedAt || d.parentId) return null
    const owner = db.prepare('SELECT email, alias FROM users WHERE id = ?').get(r.user_id) as
      | { email: string; alias: string }
      | undefined
    const ws = d.workspaceId
      ? (db.prepare('SELECT name FROM workspaces WHERE id = ?').get(d.workspaceId) as { name: string } | undefined)
      : undefined
    return {
      id,
      title: String(d.title ?? ''),
      ownerEmail: owner?.email ?? '',
      ownerName: owner ? owner.alias || owner.email : '',
      workspace: ws?.name ?? '',
    }
  }

  const agentView = (a: ReturnType<Agents['get']>) =>
    a && {
      ...a,
      boards: a.boards.map((g) => ({
        ...g,
        title: boardInfo(g.boardId)?.title ?? '(tablero no disponible)',
        ownerName: boardInfo(g.boardId)?.ownerName ?? '',
        available: !!boardInfo(g.boardId),
      })),
    }

  /** Valida y limpia los campos de una conexión; devuelve el error o los datos. */
  const cleanAgent = (body: Record<string, unknown>, partial: boolean) => {
    const out: {
      name?: string
      description?: string
      expiresAt?: string | null
      canNotify?: boolean
      canContacts?: boolean
      boards?: AgentBoard[]
    } = {}
    if (!partial || body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : ''
      if (!name || name.length > 60) return { error: 'invalid_name' as const }
      out.name = name
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || body.description.length > 300)
        return { error: 'invalid_description' as const }
      out.description = body.description.trim()
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null || body.expiresAt === '') out.expiresAt = null
      else if (typeof body.expiresAt === 'string' && !Number.isNaN(Date.parse(body.expiresAt)))
        out.expiresAt = new Date(body.expiresAt).toISOString()
      else return { error: 'invalid_expires' as const }
    }
    for (const k of ['canNotify', 'canContacts'] as const) {
      if (body[k] === undefined) continue
      if (typeof body[k] !== 'boolean') return { error: 'bad_request' as const }
      out[k] = body[k]
    }
    if (body.boards !== undefined) {
      if (!Array.isArray(body.boards) || body.boards.length > 200) return { error: 'bad_request' as const }
      const boards: AgentBoard[] = []
      for (const b of body.boards as { boardId?: unknown; access?: unknown }[]) {
        const access = b?.access
        if (!validId(b?.boardId) || (access !== 'read' && access !== 'write') || !boardInfo(b.boardId))
          return { error: 'invalid_board' as const }
        if (!boards.some((x) => x.boardId === b.boardId))
          boards.push({ boardId: b.boardId, access: access as Access })
      }
      out.boards = boards
    }
    return { data: out }
  }

  app.get('/api/admin/boards', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const ids = db.prepare("SELECT id FROM rows WHERE tbl = 'boards'").all() as { id: string }[]
    return {
      boards: ids
        .flatMap((r) => boardInfo(r.id) ?? [])
        .sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'es') || a.title.localeCompare(b.title, 'es')),
    }
  })

  app.get('/api/admin/agents', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    return { agents: agents.list().map((a) => agentView(a)) }
  })

  app.post('/api/admin/agents', async (req, reply) => {
    const admin = requireAdmin(req, reply)
    if (!admin) return
    const c = cleanAgent((req.body ?? {}) as Record<string, unknown>, false)
    if ('error' in c) return reply.code(400).send({ error: c.error })
    const { agent, token } = agents.create({
      name: c.data.name as string,
      description: c.data.description ?? '',
      createdBy: admin.id,
      expiresAt: c.data.expiresAt ?? null,
      canNotify: c.data.canNotify ?? false,
      canContacts: c.data.canContacts ?? false,
      boards: c.data.boards ?? [],
    })
    return reply.code(201).send({ agent: agentView(agent), token })
  })

  app.patch('/api/admin/agents/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    const c = cleanAgent((req.body ?? {}) as Record<string, unknown>, true)
    if ('error' in c) return reply.code(400).send({ error: c.error })
    const a = validId(id) ? agents.update(id, c.data) : null
    if (!a) return reply.code(404).send({ error: 'not_found' })
    return { agent: agentView(a) }
  })

  app.post('/api/admin/agents/:id/rotate', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    const token = validId(id) ? agents.rotate(id) : null
    if (!token) return reply.code(404).send({ error: 'not_found' })
    return { agent: agentView(agents.get(id)), token }
  })

  app.post('/api/admin/agents/:id/revoke', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    if (!validId(id) || !agents.get(id)) return reply.code(404).send({ error: 'not_found' })
    agents.revoke(id)
    return { agent: agentView(agents.get(id)) }
  })

  app.delete('/api/admin/agents/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    if (!validId(id) || !agents.remove(id)) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })

  app.get('/api/admin/agents/:id/log', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    if (!validId(id) || !agents.get(id)) return reply.code(404).send({ error: 'not_found' })
    return { log: agents.activity(id, Number((req.query as { limit?: string }).limit) || 100) }
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

  const workspaceExists = db.prepare('SELECT 1 FROM workspaces WHERE id = ?')
  const boardRow = db.prepare("SELECT data FROM rows WHERE tbl = 'boards' AND id = ? LIMIT 1")
  const validId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)

  /** Tablero padre de un subtablero (los subtableros comparten miembros y permisos con su padre). */
  const parentOf = (boardId: string): string | null => {
    const r = boardRow.get(boardId) as { data: string } | undefined
    if (!r) return null
    try {
      const p = (JSON.parse(r.data) as { parentId?: unknown }).parentId
      return validId(p) ? p : null
    } catch {
      return null
    }
  }

  /**
   * Tablero al que pertenece una fila para permisos y envío: el de arriba si es un subtablero
   * (o algo suyo, como una subetiqueta). Los hijos antiguos sin boardId se resuelven por la fila existente.
   */
  const boardIdOf = (table: string, row: Record<string, unknown>): string | null =>
    table === 'boards'
      ? validId(row.parentId)
        ? row.parentId
        : String(row.id)
      : validId(row.boardId)
        ? (parentOf(row.boardId) ?? row.boardId)
        : null

  /**
   * ¿Puede `userId` escribir esta fila y bajo qué dueño se guarda? Reglas:
   *  · tablero: solo su dueño (o cualquiera si es nuevo: queda a su nombre);
   *  · el resto: el dueño del tablero, o un miembro con rol editor;
   *  · una fila ya existente solo cambia de tablero dentro del mismo dueño (nadie "roba" filas ajenas por id).
   */
  const writeOwner = (
    userId: string,
    table: string,
    row: Record<string, unknown>,
  ): string | null => {
    const id = String(row.id)
    // Un "me gusta" solo lo escribe su dueño (nadie da "me gusta" en nombre de otra persona).
    if (table === 'likes' && row.userId !== userId) return null
    const boardId = boardIdOf(table, row)
    // Un invitado no crea tableros: solo escribe en tableros que ya existen (y a los que ya pertenece)
    if (isGuest(userId) && (!boardId || !boardOwner.get(boardId))) return null
    // Un subtablero cuelga de un tablero de primer nivel (un solo nivel de profundidad).
    if (table === 'boards' && boardId !== id && parentOf(boardId as string)) return null
    // Un tablero solo se crea (o se mueve) en un workspace del que su autor es miembro.
    if (table === 'boards' && row.workspaceId !== undefined) {
      if (!validId(row.workspaceId)) return null
      const stored = (boardRow.get(id) as { data: string } | undefined)?.data
      let storedWs: unknown
      try {
        storedWs = stored ? (JSON.parse(stored) as { workspaceId?: unknown }).workspaceId : undefined
      } catch {
        storedWs = undefined
      }
      if (
        storedWs !== row.workspaceId &&
        !isMember(db, row.workspaceId, userId) &&
        !(sessionIsAdmin(userId) && workspaceExists.get(row.workspaceId))
      )
        return null
    }
    const existing = findRow.all(table, id) as { user_id: string; board_id: string | null }[]
    const mine = existing.find((e) => e.user_id === userId)

    if (!boardId) return mine || existing.length === 0 ? userId : null // etiquetas/hijos antiguos
    const board = boardOwner.get(boardId) as { user_id: string } | undefined
    let owner = userId
    if (board && board.user_id !== userId) {
      if (table === 'boards') return null
      const m = memberRole.get(boardId, userId) as { role: string } | undefined
      // Editar exige ser editor; el "me gusta" lo puede dar también quien solo lee el tablero.
      if (!m || (m.role !== 'editor' && !(table === 'likes' && m.role === 'viewer'))) return null
      owner = board.user_id
    }
    const target = existing.find((e) => e.user_id === owner)
    if (target && target.board_id && target.board_id !== boardId) {
      // Solo se permite pasar una fila a otro tablero del MISMO dueño, y si puedo editar el de origen.
      if (table === 'boards') return null
      const old = boardOwner.get(target.board_id) as { user_id: string } | undefined
      if (!old || old.user_id !== owner) return null
      if (old.user_id !== userId) {
        const m = memberRole.get(target.board_id, userId) as { role: string } | undefined
        if (m?.role !== 'editor') return null
      }
    }
    if (!target && existing.length > 0 && table !== 'boards') return null // id ya usado por otro dueño
    return owner
  }

  const recipients = (ownerId: string, boardId: string | null): string[] => {
    const set = new Set([ownerId])
    if (boardId) for (const m of membersOf.all(boardId) as { user_id: string }[]) set.add(m.user_id)
    return [...set]
  }

  /** Entrega un aviso nuevo: en vivo a sus dispositivos y, si procede, a la cola del webhook. */
  const emit = (userId: string, view: NotificationView) => {
    hub.publishNotification(userId, view, notifications.list(userId, { limit: 1 }).unread)
    delivery.enqueue(view, userId, notifications.titleOfBoard(view.boardId))
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
      if (view) emit(userId, view)
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
        if (view) emit(d.userId, view)
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
        .filter((u) => u.id !== user.id && (user.isAdmin || sharesWorkspace(db, user.id, u.id)))
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
    return {
      shared,
      members,
      participants: [...owners.values(), ...participants],
      workspaces: workspacesOf(db, user.id, user.isAdmin),
    }
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
    !parentOf(boardId) && // un subtablero no se comparte aparte: usa los miembros de su padre
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
    // Solo se comparte con quien está en el workspace del tablero (si no, es como si no existiera).
    const bw = (() => {
      try {
        const d = (boardRow.get(id) as { data: string } | undefined)?.data
        const w = d ? (JSON.parse(d) as { workspaceId?: unknown }).workspaceId : undefined
        return validId(w) ? w : null
      } catch {
        return null
      }
    })()
    if (bw ? !isMember(db, bw, target.id) : !sharesWorkspace(db, user.id, target.id))
      return reply.code(404).send({ error: 'user_not_found' })
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

  /** Miembros de un tablero que no pertenecen al workspace `to` (perderían el acceso al mover el tablero ahí). */
  const outsiders = (boardId: string, to: string) =>
    (
      db
        .prepare(
          `SELECT m.user_id AS id, u.email, u.alias FROM board_members m JOIN users u ON u.id = m.user_id
           WHERE m.board_id = ? AND m.user_id NOT IN (SELECT user_id FROM workspace_members WHERE workspace_id = ?)`,
        )
        .all(boardId, to) as { id: string; email: string; alias: string }[]
    ).map((u) => ({ userId: u.id, email: u.email, alias: u.alias }))

  /** El dueño (o un admin que sea el dueño) puede mover su tablero a un workspace del que es miembro. */
  const movableBoard = (req: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(req, reply)
    if (!user) return null
    const { id } = req.params as { id: string }
    if (!ownBoard(user.id, id)) {
      void reply.code(404).send({ error: 'not_found' })
      return null
    }
    return { user, id }
  }

  app.get('/api/boards/:id/workspace-impact', async (req, reply) => {
    const ctx = movableBoard(req, reply)
    if (!ctx) return
    const to = (req.query as { to?: unknown }).to
    if (!validId(to) || !workspaceExists.get(to)) return reply.code(400).send({ error: 'bad_request' })
    return { removed: outsiders(ctx.id, to) }
  })

  app.put('/api/boards/:id/workspace', async (req, reply) => {
    const ctx = movableBoard(req, reply)
    if (!ctx) return
    const { user, id } = ctx
    const to = (req.body as { workspaceId?: unknown } | null)?.workspaceId
    if (!validId(to) || !workspaceExists.get(to)) return reply.code(400).send({ error: 'bad_request' })
    if (!isMember(db, to, user.id) && !user.isAdmin) return reply.code(403).send({ error: 'forbidden' })
    const stored = boardRow.get(id) as { data: string } | undefined
    if (!stored) return reply.code(404).send({ error: 'not_found' })
    const removed = outsiders(id, to)
    const ts = nextTs()
    const row = { ...JSON.parse(stored.data), workspaceId: to, updatedAt: ts } as Record<string, unknown>
    transaction(db, () => {
      upsert.run(user.id, 'boards', id, JSON.stringify(row), ts, id)
      for (const r of removed)
        db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(id, r.userId)
    })
    const clientId = String(req.headers['x-client-id'] ?? '')
    for (const uid of recipients(user.id, id)) hub.publish(uid, 'boards', { ...row, ownerId: user.id }, clientId)
    for (const r of removed) {
      pushNotification(r.userId, { type: 'access_removed', actorId: user.id, boardId: id })
      hub.publishAccess(r.userId)
    }
    hub.publishAccess(user.id)
    return { workspaceId: to, removed }
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

  /* ---------- entrega fuera de la app (webhook → n8n) ---------- */

  const publicOrigin = (raw: unknown): string | null => {
    if (raw === '' || raw === undefined) return ''
    const u = cleanWebhookUrl(raw)
    return u ? new URL(u).origin : null
  }

  const adminView = () => ({ ...delivery.settings(), stats: delivery.stats() })

  app.get('/api/admin/notifications', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    return adminView()
  })

  /** Guarda la URL del webhook, si está activo, la dirección pública y la zona horaria. */
  app.put('/api/admin/notifications', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const b = (req.body ?? {}) as {
      enabled?: unknown
      url?: unknown
      publicUrl?: unknown
      timezone?: unknown
    }
    const patch: Parameters<Delivery['save']>[0] = {}
    if (b.url !== undefined) {
      if (b.url === '') patch.url = ''
      else {
        const url = cleanWebhookUrl(b.url)
        if (!url) return reply.code(400).send({ error: 'invalid_url' })
        patch.url = url
      }
    }
    if (b.publicUrl !== undefined) {
      const origin = publicOrigin(b.publicUrl)
      if (origin === null) return reply.code(400).send({ error: 'invalid_public_url' })
      patch.publicUrl = origin
    }
    if (b.timezone !== undefined) {
      if (typeof b.timezone !== 'string' || !validTimezone(b.timezone))
        return reply.code(400).send({ error: 'invalid_timezone' })
      patch.timezone = b.timezone
    }
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') return reply.code(400).send({ error: 'bad_request' })
      const url = patch.url ?? delivery.settings().url
      if (b.enabled && !url) return reply.code(400).send({ error: 'url_required' })
      if (b.enabled && !delivery.settings().hasSecret) delivery.rotateSecret()
      patch.enabled = b.enabled
    }
    delivery.save(patch)
    return adminView()
  })

  /** Genera un secreto nuevo (invalida el anterior). Se muestra una sola vez. */
  app.post('/api/admin/notifications/secret', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    return { secret: delivery.rotateSecret(), ...adminView() }
  })

  /** Envía un aviso de prueba al propio admin, con los dos canales, y dice cómo fue. */
  app.post('/api/admin/notifications/test', async (req, reply) => {
    const admin = requireAdmin(req, reply)
    if (!admin) return
    const now = new Date().toISOString()
    const payload = delivery.buildPayload(
      {
        id: 'prueba',
        type: 'test',
        boardId: '',
        cardId: null,
        title: '',
        excerpt: '',
        count: 1,
        actorName: 'El kanban',
        createdAt: now,
      },
      admin.id,
      'test',
      ['email', 'whatsapp'],
    )
    if (!payload) return reply.code(404).send({ error: 'not_found' })
    // Un envío por canal, como los avisos reales; se detiene en el primer fallo.
    for (const channel of payload.channels) {
      const error = await delivery.post({ ...payload, channels: [channel] })
      if (error) return reply.code(502).send({ error: 'webhook_failed', detail: error })
    }
    return { ok: true }
  })

  app.post('/api/admin/notifications/retry', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    delivery.retryFailed()
    void delivery.flush()
    return adminView()
  })

  /** Descarga el flujo de n8n (JSON importable), sin secretos. */
  app.get('/api/admin/notifications/workflow', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    // Sin dirección pública guardada se usa la de esta misma petición (la que ve el admin).
    const kanbanUrl = delivery.settings().publicUrl || `${req.protocol}://${req.hostname}`
    const flow = buildN8nWorkflow({ kanbanUrl })
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="kanban-avisos-n8n.json"')
      .send(JSON.stringify(flow, null, 2))
  })

  /** ¿Se pueden elegir canales? (solo si el admin activó la entrega) */
  app.get('/api/notifications/channels', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return { available: delivery.settings().enabled, ...delivery.channelsOf(user.id) }
  })

  app.put('/api/me/notifications', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const b = (req.body ?? {}) as Record<string, unknown>
    const phone = cleanPhone(b.phone)
    if (phone === null) return reply.code(400).send({ error: 'invalid_phone' })
    for (const k of ['email', 'whatsapp', 'digest'])
      if (typeof b[k] !== 'boolean') return reply.code(400).send({ error: 'bad_request' })
    if (b.whatsapp === true && phone === '')
      return reply.code(400).send({ error: 'phone_required' })
    delivery.setChannels(user.id, {
      phone,
      email: b.email as boolean,
      whatsapp: b.whatsapp as boolean,
      digest: b.digest as boolean,
    })
    return { available: delivery.settings().enabled, ...delivery.channelsOf(user.id) }
  })

  /** Resumen "Hoy" de todas las personas que lo pidieron; lo consulta n8n cada mañana (Bearer). */
  app.get('/api/integrations/digest', async (req, reply) => {
    const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1] ?? ''
    if (!delivery.settings().enabled || !delivery.checkSecret(token))
      return reply.code(401).send({ error: 'unauthorized' })
    return buildDigest(db, delivery)
  })

  registerAgentApi(app, {
    db,
    agents,
    hub,
    notifications,
    nextTs,
    today: () => dayIn(delivery.settings().timezone, new Date()),
  })

  notifications.purge()
  delivery.purge()
  agents.purge()
  delivery.start()
  const purgeTimer = setInterval(() => {
    notifications.purge()
    delivery.purge()
    agents.purge()
  }, 6 * 3_600_000)
  purgeTimer.unref()
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer)
    delivery.stop()
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

  return { app, hub, delivery }
}
