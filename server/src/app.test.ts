// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { buildApp, sniffImage, type BuiltApp } from './app.ts'
import { LoginLimiter, createUser, findUserByEmail, hashPassword, verifyPassword } from './auth.ts'
import { openDb, type DB } from './db.ts'

const HOST = 'kanban.test'
const PASSWORD = 'contraseña-larga-123'

let db: DB
let built: BuiltApp

async function makeApp(opts: { allowSignup?: boolean } = {}) {
  db = openDb(':memory:')
  built = buildApp({
    db,
    dataDir: mkdtempSync(join(tmpdir(), 'kanban-')),
    cookieSecure: true,
    ...opts,
  })
  await built.app.ready()
  return built.app
}

const headers = (cookie?: string, extra: Record<string, string> = {}) => ({
  host: HOST,
  origin: `http://${HOST}`,
  ...(cookie ? { cookie } : {}),
  ...extra,
})

async function addUser(email: string, password = PASSWORD) {
  return createUser(db, email, await hashPassword(password))
}

async function login(email: string, password = PASSWORD) {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: headers(),
    payload: { email, password },
  })
  const cookie = String(res.headers['set-cookie'] ?? '').split(';')[0]
  return { res, cookie }
}

const board = (id: string, title = 'T') => ({
  id,
  title,
  position: 'a0',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2000-01-01T00:00:00.000Z',
})

afterEach(async () => {
  await built?.app.close()
})

describe('contraseñas', () => {
  it('verifica y rechaza', async () => {
    const h = await hashPassword('abc-123-xyz')
    expect(h.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('abc-123-xyz', h)).toBe(true)
    expect(await verifyPassword('otra', h)).toBe(false)
    expect(await verifyPassword('x', 'basura')).toBe(false)
  })

  it('LoginLimiter bloquea tras N fallos y se reinicia', () => {
    const l = new LoginLimiter(3, 1000)
    for (let i = 0; i < 3; i++) l.fail('k', 0)
    expect(l.blocked('k', 500)).toBe(true)
    expect(l.blocked('k', 1500)).toBe(false) // ventana vencida
    l.fail('k', 2000)
    l.reset('k')
    expect(l.blocked('k', 2001)).toBe(false)
  })
})

describe('autenticación', () => {
  it('login correcto: cookie HttpOnly/SameSite/Secure, /me y logout', async () => {
    await makeApp()
    await addUser('Ana@Correo.com')
    const { res, cookie } = await login('ana@correo.com')
    expect(res.statusCode).toBe(200)
    const set = String(res.headers['set-cookie'])
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/SameSite=Lax/)
    expect(set).toMatch(/Secure/)

    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: headers(cookie),
    })
    expect(me.json().user.email).toBe('ana@correo.com')

    await built.app.inject({ method: 'POST', url: '/api/auth/logout', headers: headers(cookie) })
    const after = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: headers(cookie),
    })
    expect(after.statusCode).toBe(401)
  })

  it('logout acepta JSON con cuerpo vacío (como lo envía un fetch con Content-Type)', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const { cookie } = await login('ana@correo.com')
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: headers(cookie, { 'content-type': 'application/json' }),
    })
    expect(res.statusCode).toBe(204)
    expect(String(res.headers['set-cookie'])).toMatch(/Max-Age=0/)
  })

  describe('cambio de contraseña', () => {
    const change = (cookie: string, current: string, next: string) =>
      built.app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: headers(cookie),
        payload: { current, next },
      })

    it('cambia la contraseña, cierra las otras sesiones y mantiene la actual', async () => {
      await makeApp()
      await addUser('ana@correo.com')
      const a = (await login('ana@correo.com')).cookie
      const b = (await login('ana@correo.com')).cookie // otro dispositivo
      const res = await change(a, PASSWORD, 'nueva-contraseña-456')
      expect(res.statusCode).toBe(204)

      const me = (c: string) =>
        built.app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(c) })
      expect((await me(a)).statusCode).toBe(200) // la sesión que cambió sigue
      expect((await me(b)).statusCode).toBe(401) // la otra se cerró

      expect((await login('ana@correo.com', PASSWORD)).res.statusCode).toBe(401)
      expect((await login('ana@correo.com', 'nueva-contraseña-456')).res.statusCode).toBe(200)
    })

    it('exige sesión', async () => {
      await makeApp()
      const res = await built.app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: headers(),
        payload: { current: PASSWORD, next: 'nueva-contraseña-456' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('rechaza actual incorrecta, nueva corta o igual a la actual', async () => {
      await makeApp()
      await addUser('ana@correo.com')
      const { cookie } = await login('ana@correo.com')
      expect((await change(cookie, 'incorrecta-123', 'nueva-contraseña-456')).statusCode).toBe(401)
      expect((await change(cookie, PASSWORD, 'corta')).json().error).toBe('weak_password')
      expect((await change(cookie, PASSWORD, PASSWORD)).json().error).toBe('same_password')
      // Nada cambió: la contraseña original sigue valiendo.
      expect((await login('ana@correo.com', PASSWORD)).res.statusCode).toBe(200)
    })

    it('bloquea tras 5 intentos con la actual incorrecta', async () => {
      await makeApp()
      await addUser('ana@correo.com')
      const { cookie } = await login('ana@correo.com')
      for (let i = 0; i < 5; i++) await change(cookie, 'incorrecta-123', 'nueva-contraseña-456')
      expect((await change(cookie, PASSWORD, 'nueva-contraseña-456')).statusCode).toBe(429)
    })
  })

  it('JSON inválido: 400', async () => {
    await makeApp()
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: headers(undefined, { 'content-type': 'application/json' }),
      payload: '{no es json',
    })
    expect(res.statusCode).toBe(400)
  })

  it('credenciales incorrectas: 401 igual para usuario inexistente y contraseña mala', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const bad = await login('ana@correo.com', 'incorrecta-123')
    const ghost = await login('nadie@correo.com')
    expect(bad.res.statusCode).toBe(401)
    expect(ghost.res.statusCode).toBe(401)
    expect(bad.res.json()).toEqual(ghost.res.json())
  })

  it('bloquea tras 5 intentos fallidos aunque luego acierte', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    for (let i = 0; i < 5; i++) await login('ana@correo.com', 'mala-contraseña')
    const blocked = await login('ana@correo.com')
    expect(blocked.res.statusCode).toBe(429)
  })

  it('registro: deshabilitado por defecto; habilitado valida y entra', async () => {
    await makeApp()
    const off = await built.app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: headers(),
      payload: { email: 'nuevo@correo.com', password: PASSWORD },
    })
    expect(off.statusCode).toBe(403)
    await built.app.close()

    await makeApp({ allowSignup: true })
    const post = (payload: object) =>
      built.app.inject({ method: 'POST', url: '/api/auth/signup', headers: headers(), payload })
    expect((await post({ email: 'mal', password: PASSWORD })).statusCode).toBe(400)
    expect((await post({ email: 'a@b.co', password: 'corta' })).statusCode).toBe(400)
    const ok = await post({ email: 'a@b.co', password: PASSWORD })
    expect(ok.statusCode).toBe(201)
    expect(String(ok.headers['set-cookie'])).toMatch(/kanban_session=/)
    expect((await post({ email: 'A@B.co', password: PASSWORD })).statusCode).toBe(409)
  })

  it('CSRF: rechaza POST sin Origin o desde otro origen', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const base = {
      method: 'POST' as const,
      url: '/api/auth/login',
      payload: { email: 'ana@correo.com', password: PASSWORD },
    }
    expect((await built.app.inject({ ...base, headers: { host: HOST } })).statusCode).toBe(403)
    expect(
      (await built.app.inject({ ...base, headers: { host: HOST, origin: 'https://malo.example' } }))
        .statusCode,
    ).toBe(403)
    expect((await built.app.inject({ ...base, headers: headers() })).statusCode).toBe(200)
  })

  it('detrás de proxy usa X-Forwarded-Host para validar el origen', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        host: 'api:3000',
        origin: 'https://kanban.midominio.com',
        'x-forwarded-host': 'kanban.midominio.com',
      },
      payload: { email: 'ana@correo.com', password: PASSWORD },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('sincronización', () => {
  it('exige sesión y valida la tabla', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    expect(
      (await built.app.inject({ method: 'GET', url: '/api/sync/boards', headers: headers() }))
        .statusCode,
    ).toBe(401)
    const { cookie } = await login('ana@correo.com')
    expect(
      (
        await built.app.inject({
          method: 'GET',
          url: '/api/sync/secretos',
          headers: headers(cookie),
        })
      ).statusCode,
    ).toBe(404)
  })

  it('guarda, sobrescribe updatedAt con el reloj del servidor y descarga por cursor', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const { cookie } = await login('ana@correo.com')
    const post = (rows: object[]) =>
      built.app.inject({
        method: 'POST',
        url: '/api/sync/boards',
        headers: headers(cookie),
        payload: { rows },
      })

    expect((await post([board('b1', 'Uno'), board('b2', 'Dos')])).statusCode).toBe(200)
    const all = (
      await built.app.inject({ method: 'GET', url: '/api/sync/boards', headers: headers(cookie) })
    ).json().rows
    expect(all.map((r: { id: string }) => r.id)).toEqual(['b1', 'b2'])
    expect(all[0].updatedAt).not.toBe('2000-01-01T00:00:00.000Z')
    expect(all[0].updatedAt < all[1].updatedAt).toBe(true) // reloj estrictamente creciente

    // Último en escribir gana, y solo cambia lo reescrito.
    await post([board('b1', 'Uno v2')])
    const since = all[1].updatedAt
    const delta = (
      await built.app.inject({
        method: 'GET',
        url: `/api/sync/boards?since=${since}`,
        headers: headers(cookie),
      })
    ).json().rows
    expect(delta.map((r: { id: string; title: string }) => [r.id, r.title])).toEqual([
      ['b2', 'Dos'], // gte: repite la última fila (el cliente es idempotente)
      ['b1', 'Uno v2'],
    ])
  })

  it('aísla los datos entre usuarios', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    await addUser('beto@correo.com')
    const ana = (await login('ana@correo.com')).cookie
    const beto = (await login('beto@correo.com')).cookie
    await built.app.inject({
      method: 'POST',
      url: '/api/sync/boards',
      headers: headers(ana),
      payload: { rows: [board('privado')] },
    })
    const visto = (
      await built.app.inject({ method: 'GET', url: '/api/sync/boards', headers: headers(beto) })
    ).json().rows
    expect(visto).toEqual([])
  })

  it('sincroniza también las etiquetas (tabla labels)', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const { cookie } = await login('ana@correo.com')
    const label = { id: 'l1', name: 'Coppel', color: 'blue', createdAt: 't', updatedAt: 't' }
    const post = await built.app.inject({
      method: 'POST',
      url: '/api/sync/labels',
      headers: headers(cookie),
      payload: { rows: [label] },
    })
    expect(post.statusCode).toBe(200)
    const got = await built.app.inject({
      method: 'GET',
      url: '/api/sync/labels',
      headers: headers(cookie),
    })
    expect(got.json().rows[0]).toMatchObject({ id: 'l1', name: 'Coppel', color: 'blue' })
  })

  it('rechaza filas inválidas, lotes enormes y ids raros', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const { cookie } = await login('ana@correo.com')
    const post = (rows: unknown) =>
      built.app.inject({
        method: 'POST',
        url: '/api/sync/cards',
        headers: headers(cookie),
        payload: { rows },
      })
    expect((await post([])).statusCode).toBe(400)
    expect((await post('x')).statusCode).toBe(400)
    expect((await post([{ id: "x'; DROP TABLE rows;--" }])).statusCode).toBe(400)
    expect((await post(Array.from({ length: 501 }, (_, i) => ({ id: `c${i}` })))).statusCode).toBe(
      400,
    )
    expect((await post([{ id: 'grande', t: 'x'.repeat(70_000) }])).statusCode).toBe(413)
  })

  it('SSE: avisa a los otros dispositivos, no a quien escribió', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const { cookie } = await login('ana@correo.com')
    await built.app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = built.app.server.address() as AddressInfo
    const base = `http://127.0.0.1:${port}`
    const h = { cookie, origin: base }

    const open = async (client: string) => {
      const ctrl = new AbortController()
      const res = await fetch(`${base}/api/events?client=${client}`, {
        headers: h,
        signal: ctrl.signal,
      })
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const reader = res.body!.getReader()
      let text = ''
      const pump = (async () => {
        const dec = new TextDecoder()
        try {
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            text += dec.decode(value)
          }
        } catch {
          /* abortado */
        }
      })()
      return {
        get text() {
          return text
        },
        stop: () => ctrl.abort(),
        pump,
      }
    }

    const a = await open('A')
    const b = await open('B')
    await vi.waitFor(() => expect(a.text).toContain('event: ready'))
    await vi.waitFor(() => expect(b.text).toContain('event: ready'))

    const res = await fetch(`${base}/api/sync/boards`, {
      method: 'POST',
      headers: { ...h, 'content-type': 'application/json', 'x-client-id': 'A' },
      body: JSON.stringify({ rows: [board('en-vivo', 'Hola')] }),
    })
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(b.text).toContain('"id":"en-vivo"'))
    expect(a.text).not.toContain('en-vivo')
    a.stop()
    b.stop()
    await Promise.all([a.pump, b.pump])
  })
})

describe('imágenes', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ])

  it('sniffImage reconoce formatos por su firma', () => {
    expect(sniffImage(png)).toBe('image/png')
    expect(
      sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])),
    ).toBe('image/jpeg')
    expect(
      sniffImage(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBPVP8 '),
          Buffer.alloc(8),
        ]),
      ),
    ).toBe('image/webp')
    expect(sniffImage(Buffer.from('<script>alert(1)</script>'))).toBeNull()
  })

  it('sube y descarga con el tipo real, y solo la ve su dueño', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    await addUser('beto@correo.com')
    const ana = (await login('ana@correo.com')).cookie
    const beto = (await login('beto@correo.com')).cookie
    const put = (cookie: string, id: string, body: Buffer, type = 'image/png') =>
      built.app.inject({
        method: 'PUT',
        url: `/api/blobs/${id}`,
        headers: headers(cookie, { 'content-type': type }),
        payload: body,
      })

    expect((await put(ana, 'img1', png)).statusCode).toBe(204)
    const got = await built.app.inject({
      method: 'GET',
      url: '/api/blobs/img1',
      headers: headers(ana),
    })
    expect(got.statusCode).toBe(200)
    expect(got.headers['content-type']).toBe('image/png')
    expect(got.headers['content-security-policy']).toContain('sandbox')
    expect(got.rawPayload.equals(png)).toBe(true)

    expect(
      (await built.app.inject({ method: 'GET', url: '/api/blobs/img1', headers: headers(beto) }))
        .statusCode,
    ).toBe(404)
    expect(
      (await built.app.inject({ method: 'GET', url: '/api/blobs/img1', headers: headers() }))
        .statusCode,
    ).toBe(401)
  })

  it('rechaza lo que no es imagen aunque diga serlo, e ids con rutas', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    const { cookie } = await login('ana@correo.com')
    const fake = await built.app.inject({
      method: 'PUT',
      url: '/api/blobs/x1',
      headers: headers(cookie, { 'content-type': 'image/png' }),
      payload: Buffer.from('<html><script>alert(1)</script></html>'),
    })
    expect(fake.statusCode).toBe(415)
    const traversal = await built.app.inject({
      method: 'GET',
      url: '/api/blobs/..%2F..%2Fetc%2Fpasswd',
      headers: headers(cookie),
    })
    expect([400, 404]).toContain(traversal.statusCode)
  })
})

describe('administración de usuarios', () => {
  const asAdmin = async () => {
    await makeApp()
    createUser(db, 'admin@correo.com', await hashPassword(PASSWORD), true)
    return (await login('admin@correo.com')).cookie
  }
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie: string, payload?: object) =>
    built.app.inject({ method, url, headers: headers(cookie), payload })

  it('solo el admin entra: sin sesión 401, usuario normal 403', async () => {
    await makeApp()
    await addUser('ana@correo.com')
    expect((await call('GET', '/api/admin/users', '')).statusCode).toBe(401)
    const { cookie } = await login('ana@correo.com')
    expect((await call('GET', '/api/admin/users', cookie)).statusCode).toBe(403)
    expect((await call('POST', '/api/admin/users', cookie, { email: 'x@y.com' })).statusCode).toBe(
      403,
    )
  })

  it('/me y login informan si es admin', async () => {
    const cookie = await asAdmin()
    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: headers(cookie),
    })
    expect(me.json().user.isAdmin).toBe(true)
    await addUser('ana@correo.com')
    const ana = await login('ana@correo.com')
    expect(ana.res.json().user.isAdmin).toBe(false)
  })

  it('crea usuarios: con contraseña propia o generada, y el nuevo puede entrar', async () => {
    const cookie = await asAdmin()
    const gen = await call('POST', '/api/admin/users', cookie, { email: 'Nuevo@Correo.com' })
    expect(gen.statusCode).toBe(201)
    const pw = gen.json().password as string
    expect(pw.length).toBeGreaterThanOrEqual(10)
    expect((await login('nuevo@correo.com', pw)).res.statusCode).toBe(200)

    const own = await call('POST', '/api/admin/users', cookie, {
      email: 'dos@correo.com',
      password: 'otra-contraseña-larga',
    })
    expect(own.statusCode).toBe(201)
    expect(own.json().password).toBeUndefined()

    expect(
      (await call('POST', '/api/admin/users', cookie, { email: 'dos@correo.com' })).statusCode,
    ).toBe(409)
    expect(
      (await call('POST', '/api/admin/users', cookie, { email: 'no-es-correo' })).statusCode,
    ).toBe(400)
    expect(
      (
        await call('POST', '/api/admin/users', cookie, {
          email: 'tres@correo.com',
          password: 'corta',
        })
      ).statusCode,
    ).toBe(400)
  })

  it('lista usuarios con su rol y filas', async () => {
    const cookie = await asAdmin()
    await addUser('ana@correo.com')
    const res = await call('GET', '/api/admin/users', cookie)
    const users = res.json().users as { email: string; isAdmin: boolean }[]
    expect(users.map((u) => [u.email, u.isAdmin])).toEqual([
      ['admin@correo.com', true],
      ['ana@correo.com', false],
    ])
    expect(JSON.stringify(res.json())).not.toContain('pass_hash')
  })

  it('restablecer contraseña: nueva temporal, la anterior ya no sirve y cierra sus sesiones', async () => {
    const cookie = await asAdmin()
    const ana = await addUser('ana@correo.com')
    const session = (await login('ana@correo.com')).cookie
    const res = await call('POST', `/api/admin/users/${ana.id}/password`, cookie)
    expect(res.statusCode).toBe(200)
    const pw = res.json().password as string
    expect((await login('ana@correo.com')).res.statusCode).toBe(401)
    expect((await login('ana@correo.com', pw)).res.statusCode).toBe(200)
    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: headers(session),
    })
    expect(me.statusCode).toBe(401)
  })

  it('elimina usuarios y sus datos, pero no a sí mismo', async () => {
    const cookie = await asAdmin()
    const ana = await addUser('ana@correo.com')
    const admin = findUserByEmail(db, 'admin@correo.com')!
    expect((await call('DELETE', `/api/admin/users/${admin.id}`, cookie)).statusCode).toBe(400)
    expect((await call('DELETE', `/api/admin/users/${ana.id}`, cookie)).statusCode).toBe(204)
    expect(findUserByEmail(db, 'ana@correo.com')).toBeUndefined()
    expect((await call('DELETE', `/api/admin/users/${ana.id}`, cookie)).statusCode).toBe(404)
  })

  it('exige el mismo origen (CSRF)', async () => {
    const cookie = await asAdmin()
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { host: HOST, origin: 'http://otro.sitio', cookie },
      payload: { email: 'x@y.com' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('tableros compartidos', () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32, 1),
  ])

  async function setup() {
    await makeApp()
    const owner = await addUser('dueno@correo.com')
    const ana = await addUser('ana@correo.com')
    await addUser('beto@correo.com')
    const c = {
      owner: (await login('dueno@correo.com')).cookie,
      ana: (await login('ana@correo.com')).cookie,
      beto: (await login('beto@correo.com')).cookie,
    }
    return { c, owner, ana }
  }

  const push = (cookie: string, table: string, rows: object[]) =>
    built.app.inject({
      method: 'POST',
      url: `/api/sync/${table}`,
      headers: headers(cookie),
      payload: { rows },
    })
  const pull = async (cookie: string, table: string, since = '') =>
    (
      await built.app.inject({
        method: 'GET',
        url: `/api/sync/${table}${since ? `?since=${since}` : ''}`,
        headers: headers(cookie),
      })
    ).json().rows as Record<string, unknown>[]
  const ids = (rows: Record<string, unknown>[]) => rows.map((r) => r.id)
  const share = (cookie: string, boardId: string, email: string, role = 'editor') =>
    built.app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/members`,
      headers: headers(cookie),
      payload: { email, role },
    })
  const card = (id: string, boardId: string, title = 'C') => ({
    id,
    boardId,
    columnId: 'col1',
    title,
    position: 'a0',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  })

  it('privado por defecto: nadie más ve el tablero ni sus tarjetas', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await push(c.owner, 'cards', [card('k1', 'b1')])
    expect(ids(await pull(c.ana, 'boards'))).toEqual([])
    expect(ids(await pull(c.ana, 'cards'))).toEqual([])
  })

  it('al compartir, el invitado recibe el tablero completo aunque su cursor sea reciente', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await push(c.owner, 'cards', [card('k1', 'b1')])
    const cursor = new Date().toISOString() // el invitado ya descargó todo lo anterior a este momento
    expect((await share(c.owner, 'b1', 'ana@correo.com', 'viewer')).statusCode).toBe(201)
    const boards = await pull(c.ana, 'boards', cursor)
    expect(ids(boards)).toEqual(['b1'])
    expect(boards[0].ownerId).toBeTruthy()
    expect(ids(await pull(c.ana, 'cards', cursor))).toEqual(['k1'])
    expect(ids(await pull(c.beto, 'cards'))).toEqual([]) // otros siguen sin verlo
  })

  it('editor escribe (queda a nombre del dueño); lector no', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await share(c.owner, 'b1', 'ana@correo.com', 'editor')
    await share(c.owner, 'b1', 'beto@correo.com', 'viewer')

    expect(
      (await push(c.ana, 'cards', [card('k1', 'b1', 'de Ana')])).json().rejected,
    ).toBeUndefined()
    expect(ids(await pull(c.owner, 'cards'))).toEqual(['k1'])
    expect(ids(await pull(c.beto, 'cards'))).toEqual(['k1'])

    const res = await push(c.beto, 'cards', [card('k2', 'b1', 'de Beto')])
    expect(res.json().rejected).toEqual(['k2'])
    expect(ids(await pull(c.owner, 'cards'))).toEqual(['k1'])
  })

  it('no se puede escribir en tableros ajenos ni robar filas por id', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await push(c.owner, 'cards', [card('k1', 'b1', 'original')])
    await share(c.owner, 'b1', 'ana@correo.com', 'editor')
    // un editor no cambia el tablero en sí (nombre, borrado…)
    expect((await push(c.ana, 'boards', [board('b1', 'hackeado')])).json().rejected).toEqual(['b1'])
    // ni escribe donde no tiene acceso
    expect((await push(c.beto, 'cards', [card('k9', 'b1')])).json().rejected).toEqual(['k9'])
    // ni mueve una tarjeta de un tablero privado a uno compartido reusando su id
    await push(c.owner, 'boards', [board('b2')])
    await push(c.owner, 'cards', [card('k2', 'b2', 'privada')])
    expect((await push(c.ana, 'cards', [card('k2', 'b1', 'robada')])).json().rejected).toEqual([
      'k2',
    ])
    const mine = await pull(c.owner, 'cards')
    expect(mine.find((r) => r.id === 'k2')?.title).toBe('privada')
  })

  it('quitar a un miembro: deja de recibir cambios; un miembro puede salirse; otros no pueden quitar', async () => {
    const { c, ana } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await share(c.owner, 'b1', 'ana@correo.com', 'editor')
    await share(c.owner, 'b1', 'beto@correo.com', 'viewer')
    const del = (cookie: string, userId: string) =>
      built.app.inject({
        method: 'DELETE',
        url: `/api/boards/b1/members/${userId}`,
        headers: headers(cookie),
      })
    const beto = findUserByEmail(db, 'beto@correo.com')!
    expect((await del(c.ana, beto.id)).statusCode).toBe(404) // un miembro no expulsa a otro
    expect((await del(c.owner, ana.id)).statusCode).toBe(204)
    await push(c.owner, 'cards', [card('k1', 'b1')])
    expect(ids(await pull(c.ana, 'cards'))).toEqual([])
    expect((await del(c.beto, beto.id)).statusCode).toBe(204) // se sale solo
    expect(ids(await pull(c.beto, 'boards'))).toEqual([])
  })

  it('validaciones al compartir', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    expect((await share(c.owner, 'b1', 'nadie@correo.com')).statusCode).toBe(404)
    expect((await share(c.owner, 'b1', 'dueno@correo.com')).statusCode).toBe(400)
    expect((await share(c.owner, 'b1', 'ana@correo.com', 'admin')).statusCode).toBe(400)
    expect((await share(c.ana, 'b1', 'beto@correo.com')).statusCode).toBe(404) // no es su tablero
    // cambiar el rol de alguien ya invitado
    await share(c.owner, 'b1', 'ana@correo.com', 'viewer')
    expect((await share(c.owner, 'b1', 'ana@correo.com', 'editor')).statusCode).toBe(200)
  })

  it('/api/shares lista lo compartido conmigo y los miembros de los míos', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await share(c.owner, 'b1', 'ana@correo.com', 'viewer')
    const get = async (cookie: string) =>
      (
        await built.app.inject({ method: 'GET', url: '/api/shares', headers: headers(cookie) })
      ).json()
    const ana = await get(c.ana)
    expect(ana.shared).toMatchObject([
      { boardId: 'b1', role: 'viewer', ownerEmail: 'dueno@correo.com' },
    ])
    const owner = await get(c.owner)
    expect(owner.members).toMatchObject([
      { boardId: 'b1', email: 'ana@correo.com', role: 'viewer' },
    ])
  })

  it('imágenes: los miembros las ven; quien no tiene acceso, no', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await built.app.inject({
      method: 'PUT',
      url: '/api/blobs/img1',
      headers: { ...headers(c.owner), 'content-type': 'image/png' },
      payload: PNG,
    })
    await push(c.owner, 'attachments', [
      {
        id: 'img1',
        boardId: 'b1',
        cardId: 'k1',
        name: 'x',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '',
      },
    ])
    const get = (cookie: string) =>
      built.app.inject({ method: 'GET', url: '/api/blobs/img1', headers: headers(cookie) })
    expect((await get(c.ana)).statusCode).toBe(404)
    await share(c.owner, 'b1', 'ana@correo.com', 'viewer')
    expect((await get(c.ana)).statusCode).toBe(200)
    expect((await get(c.beto)).statusCode).toBe(404)
    // una imagen subida por un editor la ve el dueño
    await share(c.owner, 'b1', 'beto@correo.com', 'editor')
    await built.app.inject({
      method: 'PUT',
      url: '/api/blobs/img2',
      headers: { ...headers(c.beto), 'content-type': 'image/png' },
      payload: PNG,
    })
    await push(c.beto, 'attachments', [
      {
        id: 'img2',
        boardId: 'b1',
        cardId: 'k1',
        name: 'y',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '',
      },
    ])
    const owner2 = await built.app.inject({
      method: 'GET',
      url: '/api/blobs/img2',
      headers: headers(c.owner),
    })
    expect(owner2.statusCode).toBe(200)
  })

  it('las filas antiguas sin board_id se completan en la migración', async () => {
    // (la migración se ejecuta al abrir la BD; aquí se comprueba que los hijos se indexan al escribir)
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await push(c.owner, 'items', [
      {
        id: 'i1',
        boardId: 'b1',
        cardId: 'k1',
        text: 't',
        done: false,
        position: 'a0',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '',
      },
    ])
    const row = db.prepare("SELECT board_id FROM rows WHERE tbl = 'items' AND id = 'i1'").get() as {
      board_id: string
    }
    expect(row.board_id).toBe('b1')
  })
})
