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

async function makeApp(opts: { allowSignup?: boolean; fetch?: typeof fetch } = {}) {
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

  it('los invitados también ven quién participa (dueño y demás miembros)', async () => {
    const { c } = await setup()
    await push(c.owner, 'boards', [board('b1')])
    await share(c.owner, 'b1', 'ana@correo.com', 'editor')
    await share(c.owner, 'b1', 'beto@correo.com', 'viewer')
    const get = async (cookie: string) =>
      (
        await built.app.inject({ method: 'GET', url: '/api/shares', headers: headers(cookie) })
      ).json()
    for (const cookie of [c.ana, c.owner]) {
      const { participants } = await get(cookie)
      expect(
        participants.map((p: { email: string; role: string }) => `${p.email}:${p.role}`).sort(),
      ).toEqual(['ana@correo.com:editor', 'beto@correo.com:viewer', 'dueno@correo.com:owner'])
    }
    // quien no participa no ve nada
    await addUser('ceci@correo.com')
    const ceci = (await login('ceci@correo.com')).cookie
    expect((await get(ceci)).participants).toEqual([])
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

describe('alias de usuarios y directorio', () => {
  const asAdmin = async () => {
    await makeApp()
    createUser(db, 'admin@correo.com', await hashPassword(PASSWORD), true)
    return (await login('admin@correo.com')).cookie
  }
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, payload?: object) =>
    built.app.inject({ method, url, headers: headers(cookie), payload })

  it('el admin crea usuarios con alias (limpio de espacios) y se ve en /me y en la lista', async () => {
    const cookie = await asAdmin()
    const res = await call('POST', '/api/admin/users', cookie, {
      email: 'jorge@mercabits.com',
      alias: '  Jorge   Menéndez ',
      password: 'una-contraseña-larga',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().user.alias).toBe('Jorge Menéndez')
    const jorge = await login('jorge@mercabits.com', 'una-contraseña-larga')
    expect(jorge.res.json().user.alias).toBe('Jorge Menéndez')
    const me = await call('GET', '/api/auth/me', jorge.cookie)
    expect(me.json().user.alias).toBe('Jorge Menéndez')
    const list = (await call('GET', '/api/admin/users', cookie)).json().users as {
      email: string
      alias: string
    }[]
    expect(list.find((u) => u.email === 'jorge@mercabits.com')?.alias).toBe('Jorge Menéndez')
  })

  it('alias demasiado largo se rechaza; sin alias queda vacío', async () => {
    const cookie = await asAdmin()
    const bad = await call('POST', '/api/admin/users', cookie, {
      email: 'a@b.co',
      alias: 'x'.repeat(61),
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error).toBe('invalid_alias')
    const ok = await call('POST', '/api/admin/users', cookie, { email: 'c@d.co' })
    expect(ok.json().user.alias).toBe('')
  })

  it('el admin cambia o quita el alias; un usuario normal no puede', async () => {
    const cookie = await asAdmin()
    const ana = await addUser('ana@correo.com')
    const set = await call('PATCH', `/api/admin/users/${ana.id}`, cookie, { alias: 'Ana López' })
    expect(set.json().user.alias).toBe('Ana López')
    const clear = await call('PATCH', `/api/admin/users/${ana.id}`, cookie, { alias: '' })
    expect(clear.json().user.alias).toBe('')
    expect((await call('PATCH', '/api/admin/users/nope', cookie, { alias: 'x' })).statusCode).toBe(
      404,
    )
    const normal = (await login('ana@correo.com')).cookie
    expect(
      (await call('PATCH', `/api/admin/users/${ana.id}`, normal, { alias: 'Yo' })).statusCode,
    ).toBe(403)
  })

  it('el registro abierto también guarda el alias', async () => {
    await makeApp({ allowSignup: true })
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: headers(),
      payload: { email: 'nuevo@correo.com', password: PASSWORD, alias: 'Nuevo Usuario' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().user.alias).toBe('Nuevo Usuario')
  })

  it('directorio: usuarios registrados (sin uno mismo ni datos privados), solo con sesión', async () => {
    const cookie = await asAdmin()
    await call('POST', '/api/admin/users', cookie, {
      email: 'jorge@mercabits.com',
      alias: 'Jorge Menéndez',
    })
    await addUser('ana@correo.com')
    expect((await call('GET', '/api/users/directory', '')).statusCode).toBe(401)
    const ana = (await login('ana@correo.com')).cookie
    const dir = (await call('GET', '/api/users/directory', ana)).json().users as {
      email: string
      alias: string
    }[]
    expect(dir.map((u) => u.email)).toEqual(['admin@correo.com', 'jorge@mercabits.com'])
    expect(dir[1].alias).toBe('Jorge Menéndez')
    expect(JSON.stringify(dir)).not.toMatch(/pass|hash|admin":/)
  })

  it('los participantes de un tablero llevan alias', async () => {
    const cookie = await asAdmin()
    await call('POST', '/api/admin/users', cookie, {
      email: 'jorge@mercabits.com',
      alias: 'Jorge Menéndez',
    })
    await call('POST', '/api/sync/boards', cookie, { rows: [board('b1')] })
    const share = await call('POST', '/api/boards/b1/members', cookie, {
      email: 'jorge@mercabits.com',
      role: 'editor',
    })
    expect(share.json().member.alias).toBe('Jorge Menéndez')
    const { participants, members } = (await call('GET', '/api/shares', cookie)).json()
    expect(members[0].alias).toBe('Jorge Menéndez')
    expect(participants.map((p: { alias: string }) => p.alias)).toContain('Jorge Menéndez')
  })
})

describe('centro de notificaciones', () => {
  async function setup() {
    await makeApp()
    const owner = await addUser('dueno@correo.com')
    const ana = await addUser('ana@correo.com')
    const beto = await addUser('beto@correo.com')
    const c = {
      owner: (await login('dueno@correo.com')).cookie,
      ana: (await login('ana@correo.com')).cookie,
      beto: (await login('beto@correo.com')).cookie,
    }
    return { c, owner, ana, beto }
  }

  const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
    built.app.inject({ method, url, headers: headers(cookie), payload })
  const push = (cookie: string, table: string, rows: object[]) =>
    call('POST', `/api/sync/${table}`, cookie, { rows })
  const share = (cookie: string, boardId: string, email: string, role = 'editor') =>
    call('POST', `/api/boards/${boardId}/members`, cookie, { email, role })
  const inbox = async (cookie: string, query = '') =>
    (await call('GET', `/api/notifications${query}`, cookie)).json() as {
      notifications: {
        id: string
        type: string
        cardId: string | null
        title: string
        excerpt: string
        count: number
        actorName: string
        readAt: string | null
      }[]
      unread: number
    }
  const card = (id: string, extra: object = {}) => ({
    id,
    boardId: 'b1',
    columnId: 'c1',
    title: 'Banner importador',
    position: 'a0',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    ...extra,
  })
  const comment = (id: string, bodyMd: string, cardId = 'k1') => ({
    id,
    boardId: 'b1',
    cardId,
    bodyMd,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  })
  const mention = (name: string, id: string) => `[@${name}](mention:${id})`

  async function sharedBoard() {
    const s = await setup()
    await push(s.c.owner, 'boards', [board('b1', 'Trabajo')])
    await push(s.c.owner, 'cards', [card('k1')])
    await share(s.c.owner, 'b1', 'ana@correo.com', 'editor')
    db.exec('DELETE FROM notifications') // el aviso de acceso no es lo que se prueba aquí
    return s
  }

  it('requiere sesión', async () => {
    await makeApp()
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: headers(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('una mención en una actualización avisa a la persona mencionada', async () => {
    const { c, ana } = await sharedBoard()
    await push(c.owner, 'comments', [
      comment('m1', `${mention('Ana', ana.id)} revisa el **banner** antes del viernes`),
    ])
    const { notifications, unread } = await inbox(c.ana)
    expect(unread).toBe(1)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      type: 'mention',
      cardId: 'k1',
      title: 'Banner importador',
      excerpt: '@Ana revisa el banner antes del viernes',
      actorName: 'dueno@correo.com',
      readAt: null,
    })
  })

  it('una mención en una tarea de la lista también avisa', async () => {
    const { c, ana } = await sharedBoard()
    await push(c.owner, 'items', [
      {
        id: 'i1',
        boardId: 'b1',
        cardId: 'k1',
        text: `Mandar recibo a ${mention('Ana', ana.id)}`,
        done: false,
        position: 'a0',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
    ])
    expect((await inbox(c.ana)).notifications[0].type).toBe('mention')
  })

  it('nadie se avisa a sí mismo', async () => {
    const { c, owner } = await sharedBoard()
    await push(c.owner, 'comments', [comment('m1', `nota para ${mention('yo', owner.id)}`)])
    expect((await inbox(c.owner)).notifications).toEqual([])
  })

  it('editar sin añadir menciones no vuelve a avisar, y una mención nueva sí', async () => {
    const { c, ana, beto } = await sharedBoard()
    await share(c.owner, 'b1', 'beto@correo.com', 'viewer')
    await call('POST', '/api/notifications/read', c.beto, { all: true }) // aviso de acceso
    const first = `hola ${mention('Ana', ana.id)}`
    await push(c.owner, 'comments', [comment('m1', first)])
    await call('POST', '/api/notifications/read', c.ana, { all: true })
    await push(c.owner, 'comments', [comment('m1', `${first}, gracias`)]) // misma mención
    expect((await inbox(c.ana)).unread).toBe(0)
    await push(c.owner, 'comments', [comment('m1', `${first} y ${mention('Beto', beto.id)}`)])
    expect((await inbox(c.beto)).unread).toBe(1)
    expect((await inbox(c.ana)).unread).toBe(0)
  })

  it('no avisa a quien no tiene acceso al tablero', async () => {
    const { c, beto } = await sharedBoard() // beto no es miembro
    await push(c.owner, 'comments', [comment('m1', `psst ${mention('Beto', beto.id)}`)])
    expect((await inbox(c.beto)).notifications).toEqual([])
  })

  it('asignar una tarjeta avisa al nuevo asignado, no al autor ni al repetir', async () => {
    const { c, ana } = await sharedBoard()
    await push(c.owner, 'cards', [card('k1', { assigneeId: ana.id })])
    let box = await inbox(c.ana)
    expect(box.notifications[0]).toMatchObject({ type: 'assignment', cardId: 'k1' })
    await call('POST', '/api/notifications/read', c.ana, { all: true })
    await push(c.owner, 'cards', [card('k1', { assigneeId: ana.id, title: 'Otro título' })])
    box = await inbox(c.ana)
    expect(box.unread).toBe(0)
    // Ana se asigna sola: no se avisa a sí misma
    await push(c.ana, 'cards', [card('k2', { assigneeId: ana.id })])
    expect((await inbox(c.ana)).unread).toBe(0)
  })

  it('funde avisos repetidos de la misma tarjeta y tipo', async () => {
    const { c, ana } = await sharedBoard()
    for (const [i, id] of ['m1', 'm2', 'm3'].entries())
      await push(c.owner, 'comments', [comment(id, `${i} ${mention('Ana', ana.id)}`)])
    const { notifications, unread } = await inbox(c.ana)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].count).toBe(3)
    expect(unread).toBe(1)
  })

  it('accesos: alta, cambio de permiso y baja avisan a la persona afectada', async () => {
    const { c, ana } = await setup()
    await push(c.owner, 'boards', [board('b1', 'Trabajo')])
    await share(c.owner, 'b1', 'ana@correo.com', 'viewer')
    await share(c.owner, 'b1', 'ana@correo.com', 'viewer') // igual: no avisa
    await share(c.owner, 'b1', 'ana@correo.com', 'editor')
    await built.app.inject({
      method: 'DELETE',
      url: `/api/boards/b1/members/${ana.id}`,
      headers: headers(c.owner),
    })
    const types = (await inbox(c.ana)).notifications.map((n) => n.type).sort()
    expect(types).toEqual(['access_granted', 'access_removed', 'access_role'])
    expect((await inbox(c.ana)).notifications.every((n) => n.title === 'Trabajo')).toBe(true)
    // salirse uno mismo no genera aviso para sí
    await share(c.owner, 'b1', 'ana@correo.com', 'viewer')
    await call('POST', '/api/notifications/read', c.ana, { all: true })
    await built.app.inject({
      method: 'DELETE',
      url: `/api/boards/b1/members/${ana.id}`,
      headers: headers(c.ana),
    })
    expect((await inbox(c.ana)).unread).toBe(0)
  })

  it('marca leídas por id, por tarjeta y todas; cada quien solo las suyas', async () => {
    const { c, ana } = await sharedBoard()
    await push(c.owner, 'cards', [card('k1', { assigneeId: ana.id })])
    await push(c.owner, 'comments', [comment('m1', mention('Ana', ana.id))])
    const box = await inbox(c.ana)
    expect(box.unread).toBe(2)
    // otra persona no puede leer las de Ana
    expect(
      (
        await call('POST', '/api/notifications/read', c.owner, { ids: [box.notifications[0].id] })
      ).json().unread,
    ).toBe(0)
    expect((await inbox(c.ana)).unread).toBe(2)
    const byId = await call('POST', '/api/notifications/read', c.ana, {
      ids: [box.notifications[0].id],
    })
    expect(byId.json().unread).toBe(1)
    const byCard = await call('POST', '/api/notifications/read', c.ana, { cardId: 'k1' })
    expect(byCard.json().unread).toBe(0)
    expect((await inbox(c.ana, '?unread=1')).notifications).toEqual([])
    expect((await inbox(c.ana)).notifications).toHaveLength(2) // siguen en el historial
    expect((await call('POST', '/api/notifications/read', c.ana, { nada: 1 })).statusCode).toBe(400)
  })

  it('las notificaciones de otra persona no se ven', async () => {
    const { c, ana } = await sharedBoard()
    await push(c.owner, 'comments', [comment('m1', mention('Ana', ana.id))])
    expect((await inbox(c.owner)).notifications).toEqual([])
  })

  it('borra las de más de 90 días', async () => {
    const { c, ana } = await sharedBoard()
    await push(c.owner, 'comments', [comment('m1', mention('Ana', ana.id))])
    db.prepare('UPDATE notifications SET created_at = ?').run('2020-01-01T00:00:00.000Z')
    const { Notifications } = await import('./notifications.ts')
    expect(new Notifications(db).purge()).toBe(1)
    expect((await inbox(c.ana)).notifications).toEqual([])
  })

  it('un fallo al avisar no impide guardar el cambio', async () => {
    const { c, ana } = await sharedBoard()
    db.exec('DROP TABLE notifications')
    const res = await push(c.owner, 'comments', [comment('m1', mention('Ana', ana.id))])
    expect(res.statusCode).toBe(200)
    expect(res.json().count).toBe(1)
  })
})

describe('notificaciones: texto', () => {
  it('extrae menciones y deja un extracto legible', async () => {
    const { mentionedIds, excerptOf } = await import('./notifications.ts')
    const text = 'Hola [@Ana Pérez](mention:u1), mira ![img](x.webp) [esto](http://a.b) **ya**'
    expect([...mentionedIds(text)]).toEqual(['u1'])
    expect(excerptOf(text)).toBe('Hola @Ana Pérez, mira esto ya')
    expect(excerptOf('x'.repeat(300)).length).toBe(140)
    expect(mentionedIds(undefined).size).toBe(0)
  })
})

describe('aspecto del tablero', () => {
  it('el color y el icono viajan con el tablero y los ve quien lo comparte; un editor no los cambia', async () => {
    await makeApp()
    await addUser('dueno@correo.com')
    await addUser('ana@correo.com')
    const owner = (await login('dueno@correo.com')).cookie
    const ana = (await login('ana@correo.com')).cookie
    const post = (cookie: string, rows: object[]) =>
      built.app.inject({
        method: 'POST',
        url: '/api/sync/boards',
        headers: headers(cookie),
        payload: { rows },
      })
    await post(owner, [{ ...board('b1', 'Trabajo'), color: 'morado', icon: 'cohete' }])
    await built.app.inject({
      method: 'POST',
      url: '/api/boards/b1/members',
      headers: headers(owner),
      payload: { email: 'ana@correo.com', role: 'editor' },
    })
    const mine = (
      await built.app.inject({ method: 'GET', url: '/api/sync/boards', headers: headers(ana) })
    ).json().rows
    expect(mine[0]).toMatchObject({ id: 'b1', color: 'morado', icon: 'cohete' })
    // el editor no puede reescribir el tablero (ni su aspecto)
    const res = await post(ana, [{ ...board('b1', 'Trabajo'), color: 'rojo', icon: 'casa' }])
    expect(res.json().rejected).toEqual(['b1'])
  })
})

describe('entrega de avisos (webhook hacia n8n)', () => {
  const HOOK = 'https://n8n.test/webhook/kanban-avisos'
  type Call = { url: string; headers: Record<string, string>; body: Record<string, any> }
  let calls: Call[]
  let reply: () => Response | Promise<Response>

  async function setup() {
    calls = []
    reply = () => new Response('{"ok":true}', { status: 200 })
    await makeApp({
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          headers: init.headers as Record<string, string>,
          body: JSON.parse(String(init.body)),
        })
        return reply()
      }) as unknown as typeof fetch,
    })
    const admin = createUser(db, 'admin@correo.com', await hashPassword(PASSWORD), true, 'Admin')
    const ana = await addUser('ana@correo.com')
    const c = {
      admin: (await login('admin@correo.com')).cookie,
      ana: (await login('ana@correo.com')).cookie,
    }
    return { c, admin, ana }
  }

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, cookie?: string, payload?: object) =>
    built.app.inject({ method, url, headers: headers(cookie), payload })
  const enable = async (cookie: string) =>
    (
      await call('PUT', '/api/admin/notifications', cookie, {
        url: HOOK,
        enabled: true,
        publicUrl: 'https://kanban.test/algo/mas',
      })
    ).json()
  const prefs = (cookie: string, p: object) =>
    call('PUT', '/api/me/notifications', cookie, {
      phone: '',
      email: false,
      whatsapp: false,
      digest: false,
      ...p,
    })
  const card = (id: string, extra: object = {}) => ({
    id,
    boardId: 'b1',
    columnId: 'c1',
    title: 'Banner importador',
    position: 'a0',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    ...extra,
  })
  const comment = (id: string, bodyMd: string) => ({
    id,
    boardId: 'b1',
    cardId: 'k1',
    bodyMd,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  })
  const push = (cookie: string, table: string, rows: object[]) =>
    call('POST', `/api/sync/${table}`, cookie, { rows })

  /** Tablero compartido con Ana; deja la bandeja y la cola vacías. */
  async function shared() {
    const s = await setup()
    await enable(s.c.admin)
    await push(s.c.admin, 'boards', [board('b1', 'Trabajo')])
    await push(s.c.admin, 'cards', [card('k1')])
    await call('POST', '/api/boards/b1/members', s.c.admin, {
      email: 'ana@correo.com',
      role: 'editor',
    })
    db.exec('DELETE FROM notifications; DELETE FROM outbox')
    return s
  }
  const outbox = () => db.prepare('SELECT * FROM outbox ORDER BY created_at').all() as any[]

  it('solo el admin ve y cambia la configuración, y valida la URL', async () => {
    const { c } = await setup()
    expect((await call('GET', '/api/admin/notifications', c.ana)).statusCode).toBe(403)
    expect((await call('PUT', '/api/admin/notifications', c.ana, { url: HOOK })).statusCode).toBe(
      403,
    )
    for (const bad of ['no es url', 'ftp://n8n.test/x', 'https://u:p@n8n.test/x'])
      expect(
        (await call('PUT', '/api/admin/notifications', c.admin, { url: bad })).statusCode,
      ).toBe(400)
    expect(
      (await call('PUT', '/api/admin/notifications', c.admin, { enabled: true })).json().error,
    ).toBe('url_required')
    expect(
      (await call('PUT', '/api/admin/notifications', c.admin, { timezone: 'Marte/Olimpo' }))
        .statusCode,
    ).toBe(400)
  })

  it('al activar se crea un secreto; nunca vuelve a mostrarse salvo al regenerarlo', async () => {
    const { c } = await setup()
    const saved = await enable(c.admin)
    expect(saved).toMatchObject({ enabled: true, url: HOOK, hasSecret: true })
    expect(saved.publicUrl).toBe('https://kanban.test') // solo el origen, sin ruta
    expect(JSON.stringify(saved)).not.toMatch(/secret"\s*:\s*"/)
    const first = (await call('GET', '/api/admin/notifications', c.admin)).json()
    expect(first.secret).toBeUndefined()
    const rotated = (await call('POST', '/api/admin/notifications/secret', c.admin)).json()
    expect(rotated.secret).toHaveLength(43)
    expect(built.delivery.checkSecret(rotated.secret)).toBe(true)
    expect(built.delivery.checkSecret('otro')).toBe(false)
  })

  it('cada persona elige sus canales; WhatsApp exige un teléfono válido', async () => {
    const { c } = await setup()
    expect((await call('GET', '/api/notifications/channels', c.ana)).json().available).toBe(false)
    await enable(c.admin)
    expect((await prefs(c.ana, { whatsapp: true })).json().error).toBe('phone_required')
    for (const bad of ['123', 'abc', '5512345678'])
      expect((await prefs(c.ana, { phone: bad })).json().error).toBe('invalid_phone')
    const ok = await prefs(c.ana, { phone: '+52 55 1234 5678', email: true, whatsapp: true })
    expect(ok.json()).toMatchObject({
      available: true,
      phone: '+525512345678',
      email: true,
      whatsapp: true,
    })
    expect((await prefs(c.ana, { email: 'sí' })).statusCode).toBe(400)
    expect((await call('PUT', '/api/me/notifications', undefined, {})).statusCode).toBe(401)
  })

  it('una mención se envía al webhook con firma de token, canales, enlace y teléfono', async () => {
    const { c, ana } = await shared()
    await prefs(c.ana, { phone: '+525512345678', email: true, whatsapp: true })
    await push(c.admin, 'comments', [
      comment('m1', `[@Ana](mention:${ana.id}) revisa el **banner**`),
    ])
    expect(outbox()).toHaveLength(2) // un envío por canal: si uno falla, el reintento no repite el otro
    expect(await built.delivery.flush()).toBe(2)
    expect(calls.map((c) => c.body.channels)).toEqual([['email'], ['whatsapp']])
    const { url, headers: h, body } = calls[0]
    expect(url).toBe(HOOK)
    const secret = (
      db.prepare("SELECT value FROM settings WHERE key = 'webhook_secret'").get() as {
        value: string
      }
    ).value
    expect(h.Authorization).toBe(`Bearer ${secret}`)
    expect(body).toMatchObject({
      event: 'notification',
      type: 'mention',
      channels: ['email'],
      recipient: { name: 'ana@correo.com', email: 'ana@correo.com', phone: '+525512345678' },
      actor: 'Admin',
      board: { id: 'b1', title: 'Trabajo' },
      card: { id: 'k1', title: 'Banner importador' },
      excerpt: 'revisa el banner'.replace(/^/, '@Ana '),
      url: 'https://kanban.test/b/b1',
    })
    expect(outbox().map((r) => r.status)).toEqual(['sent', 'sent'])
    expect(await built.delivery.flush()).toBe(0) // ya enviado: no se repite
  })

  it('no encola si está apagado, si la persona no eligió canales o si el aviso se fundió', async () => {
    const { c, ana } = await shared()
    // sin canales elegidos
    await push(c.admin, 'comments', [comment('m1', `[@Ana](mention:${ana.id}) uno`)])
    expect(outbox()).toHaveLength(0)
    // con canal: el primero se encola; los siguientes (fundidos) no
    await prefs(c.ana, { email: true })
    await call('POST', '/api/notifications/read', c.ana, { all: true }) // el aviso anterior ya está leído
    await push(c.admin, 'comments', [comment('m2', `[@Ana](mention:${ana.id}) dos`)])
    await push(c.admin, 'comments', [comment('m3', `[@Ana](mention:${ana.id}) tres`)])
    expect(outbox()).toHaveLength(1)
    // apagado
    await call('PUT', '/api/admin/notifications', c.admin, { enabled: false })
    db.exec('DELETE FROM outbox; DELETE FROM notifications')
    await push(c.admin, 'cards', [card('k2', { assigneeId: ana.id })])
    expect(outbox()).toHaveLength(0)
    expect(await built.delivery.flush()).toBe(0)
  })

  it('reintenta con espera creciente y al agotarse queda como fallido; el admin puede reintentarlo', async () => {
    const { c, ana } = await shared()
    await prefs(c.ana, { email: true })
    reply = () => new Response('boom', { status: 500 })
    await push(c.admin, 'comments', [comment('m1', `[@Ana](mention:${ana.id}) hola`)])
    await built.delivery.flush()
    let row = outbox()[0]
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error: 'El webhook respondió 500.',
    })
    expect(Date.parse(row.next_attempt_at)).toBeGreaterThan(Date.now() + 30_000)
    expect(await built.delivery.flush()).toBe(0) // aún no toca
    for (let i = 0; i < 5; i++) {
      db.prepare('UPDATE outbox SET next_attempt_at = ?').run(new Date(0).toISOString())
      await built.delivery.flush()
    }
    row = outbox()[0]
    expect(row).toMatchObject({ status: 'failed', attempts: 6 })
    expect((await call('GET', '/api/admin/notifications', c.admin)).json().stats).toMatchObject({
      pending: 0,
      failed: 1,
    })
    reply = () => new Response('{}', { status: 200 })
    await call('POST', '/api/admin/notifications/retry', c.admin)
    await built.delivery.flush()
    expect(outbox()[0].status).toBe('sent')
  })

  it('una caída de red también se reintenta y no rompe el guardado del cambio', async () => {
    const { c, ana } = await shared()
    await prefs(c.ana, { email: true })
    reply = () => Promise.reject(new TypeError('fetch failed'))
    const res = await push(c.admin, 'comments', [comment('m1', `[@Ana](mention:${ana.id}) hola`)])
    expect(res.statusCode).toBe(200)
    await built.delivery.flush()
    expect(outbox()[0]).toMatchObject({ status: 'pending', attempts: 1 })
    expect(outbox()[0].last_error).toContain('No se pudo conectar')
  })

  it('el envío de prueba usa ambos canales y informa si el webhook falla', async () => {
    const { c } = await setup()
    await enable(c.admin)
    expect((await call('POST', '/api/admin/notifications/test', c.admin)).json()).toEqual({
      ok: true,
    })
    expect(calls.map((c) => [c.body.event, c.body.channels])).toEqual([
      ['test', ['email']],
      ['test', ['whatsapp']],
    ])
    reply = () => new Response('no', { status: 404 })
    const bad = await call('POST', '/api/admin/notifications/test', c.admin)
    expect(bad.statusCode).toBe(502)
    expect(bad.json().detail).toBe('El webhook respondió 404.')
    expect((await call('POST', '/api/admin/notifications/test', c.ana)).statusCode).toBe(403)
  })

  it('el flujo de n8n se descarga como JSON importable, sin secretos', async () => {
    const { c } = await setup()
    await enable(c.admin)
    const secret = (await call('POST', '/api/admin/notifications/secret', c.admin)).json().secret
    expect((await call('GET', '/api/admin/notifications/workflow', c.ana)).statusCode).toBe(403)
    const res = await call('GET', '/api/admin/notifications/workflow', c.admin)
    expect(res.headers['content-disposition']).toContain('kanban-avisos-n8n.json')
    expect(res.body).not.toContain(secret)
    const flow = JSON.parse(res.body)
    const names = flow.nodes.map((n: { name: string }) => n.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Aviso del kanban',
        'Preparar aviso',
        'Correo no activo',
        'WhatsApp no activo',
        'Cada mañana',
        'Pedir resumen',
        'Enviar correo',
        'Enviar WhatsApp',
        '¿Por correo?',
        '¿Por WhatsApp?',
      ]),
    )
    // toda conexión apunta a un nodo que existe
    for (const [from, out] of Object.entries<any>(flow.connections)) {
      expect(names).toContain(from)
      for (const branch of out.main) for (const l of branch) expect(names).toContain(l.node)
    }
    expect(new Set(names).size).toBe(names.length)
    const digest = flow.nodes.find((n: { name: string }) => n.name === 'Pedir resumen')
    expect(digest.parameters.url).toBe('https://kanban.test/api/integrations/digest')
    expect(flow.active).toBe(false)
    // responde al terminar de enviar (no antes): si falla un envío, el kanban reintenta
    const hook = flow.nodes.find((n: { name: string }) => n.name === 'Aviso del kanban')
    expect(hook.parameters.responseMode).toBe('lastNode')
    expect(names).not.toContain('Responder 200')
    // las dos salidas de cada filtro (true y false) llevan a un nodo
    for (const f of ['¿Por correo?', '¿Por WhatsApp?'])
      expect(flow.connections[f].main).toHaveLength(2)
  })

  describe('resumen diario', () => {
    const ymd = (offset: number) => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() + offset)
      return d.toISOString().slice(0, 10)
    }
    async function withCards() {
      const s = await shared()
      await call('PUT', '/api/admin/notifications', s.c.admin, { timezone: 'UTC' })
      await prefs(s.c.admin, { email: true, digest: true })
      await prefs(s.c.ana, { email: true, digest: false })
      await push(s.c.admin, 'columns', [
        {
          id: 'c1',
          boardId: 'b1',
          title: 'Por hacer',
          position: 'a0',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2000-01-01T00:00:00.000Z',
        },
        {
          id: 'cd',
          boardId: 'b1',
          title: 'Listo',
          position: 'a1',
          kind: 'done',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2000-01-01T00:00:00.000Z',
        },
      ])
      await push(s.c.admin, 'cards', [
        card('vieja', { title: 'Vieja', endDate: ymd(-3) }),
        card('hoy', { title: 'Hoy', endDate: ymd(0) }),
        card('manana', { title: 'Mañana', endDate: ymd(1) }),
        card('lejos', { title: 'Lejos', endDate: ymd(9) }),
        card('hecha', { title: 'Hecha', columnId: 'cd', endDate: ymd(-3) }),
        card('de-ana', { title: 'De Ana', endDate: ymd(0), assigneeId: s.ana.id }),
      ])
      const secret = (await call('POST', '/api/admin/notifications/secret', s.c.admin)).json()
        .secret
      return { ...s, secret }
    }
    const digest = (token?: string) =>
      built.app.inject({
        method: 'GET',
        url: '/api/integrations/digest',
        headers: { host: HOST, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      })

    it('exige el token del webhook', async () => {
      const { secret } = await withCards()
      expect((await digest()).statusCode).toBe(401)
      expect((await digest('incorrecto')).statusCode).toBe(401)
      expect((await digest(secret)).statusCode).toBe(200)
      await built.app.inject({
        method: 'PUT',
        url: '/api/admin/notifications',
        headers: headers((await login('admin@correo.com')).cookie),
        payload: { enabled: false },
      })
      expect((await digest(secret)).statusCode).toBe(401) // apagado
    })

    it('trae solo a quien lo pidió, con sus tarjetas vencidas, de hoy y de mañana, y el texto listo', async () => {
      const { secret } = await withCards()
      const body = (await digest(secret)).json()
      expect(body.date).toBe(ymd(0))
      expect(body.users).toHaveLength(1) // Ana no lo pidió
      const u = body.users[0]
      expect(u.recipient.email).toBe('admin@correo.com')
      expect(u.channels).toEqual(['email'])
      expect(u.overdue.map((i: { title: string }) => i.title)).toEqual(['Vieja'])
      // "De Ana" está asignada a otra persona; "Hecha" está en una columna Done; "Lejos" no urge
      expect(u.today.map((i: { title: string }) => i.title)).toEqual(['Hoy'])
      expect(u.tomorrow.map((i: { title: string }) => i.title)).toEqual(['Mañana'])
      expect(u.subject).toBe('Hoy: 3 tarjetas con fecha')
      expect(u.text).toContain('Vencidas (1)')
      expect(u.text).toContain('• Vieja — Trabajo')
      expect(u.text).not.toContain('Lejos')
    })

    it('respeta la zona horaria para decir cuál es "hoy"', async () => {
      const { c, secret } = await withCards()
      await call('PUT', '/api/admin/notifications', c.admin, { timezone: 'Pacific/Kiritimati' }) // UTC+14
      const body = (await digest(secret)).json()
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(
        new Date(),
      )
      expect(body.date).toBe(d)
    })
  })
})

describe('entrega: utilidades', () => {
  it('limpia teléfonos y URLs', async () => {
    const { cleanPhone, cleanWebhookUrl } = await import('./delivery.ts')
    expect(cleanPhone('+52 (55) 1234-5678')).toBe('+525512345678')
    expect(cleanPhone('')).toBe('')
    expect(cleanPhone(undefined)).toBe('')
    expect(cleanPhone('5512345678')).toBeNull()
    expect(cleanPhone(5512345678)).toBeNull()
    expect(cleanWebhookUrl(' https://n8n.test/webhook/x ')).toBe('https://n8n.test/webhook/x')
    expect(cleanWebhookUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('"me gusta" y respuestas', () => {
  it('quien solo lee puede dar "me gusta" (a su nombre); nadie lo da por otra persona ni escribe', async () => {
    await makeApp()
    const owner = await addUser('dueno@correo.com')
    const ana = await addUser('ana@correo.com')
    const cOwner = (await login('dueno@correo.com')).cookie
    const cAna = (await login('ana@correo.com')).cookie
    const post = (cookie: string, table: string, rows: object[]) =>
      built.app.inject({
        method: 'POST',
        url: `/api/sync/${table}`,
        headers: headers(cookie),
        payload: { rows },
      })
    const get = async (cookie: string, table: string) =>
      (
        await built.app.inject({
          method: 'GET',
          url: `/api/sync/${table}`,
          headers: headers(cookie),
        })
      ).json().rows as { id: string; userId?: string }[]
    const t = '2026-11-01T00:00:00.000Z'
    await post(cOwner, 'boards', [{ ...board('b1', 'Trabajo') }])
    await post(cOwner, 'comments', [
      {
        id: 'm1',
        boardId: 'b1',
        cardId: 'k1',
        bodyMd: 'Hola',
        authorId: owner.id,
        createdAt: t,
        updatedAt: t,
      },
    ])
    await built.app.inject({
      method: 'POST',
      url: '/api/boards/b1/members',
      headers: headers(cOwner),
      payload: { email: 'ana@correo.com', role: 'viewer' },
    })
    const like = (id: string, userId: string) => ({
      id,
      boardId: 'b1',
      cardId: 'k1',
      commentId: 'm1',
      userId,
      createdAt: t,
      updatedAt: t,
    })
    // el lector da "me gusta"
    expect((await post(cAna, 'likes', [like('l1', ana.id)])).json().rejected).toBeUndefined()
    expect((await get(cOwner, 'likes')).map((l) => l.userId)).toEqual([ana.id])
    // pero no lo da por otra persona…
    expect((await post(cAna, 'likes', [like('l2', owner.id)])).json().rejected).toEqual(['l2'])
    // …ni escribe una respuesta
    const reply = {
      id: 'r1',
      boardId: 'b1',
      cardId: 'k1',
      parentId: 'm1',
      bodyMd: 'x',
      createdAt: t,
      updatedAt: t,
    }
    expect((await post(cAna, 'comments', [reply])).json().rejected).toEqual(['r1'])
    // quien no tiene acceso al tablero tampoco
    await addUser('beto@correo.com')
    const cBeto = (await login('beto@correo.com')).cookie
    expect(
      (await post(cBeto, 'likes', [like('l3', findUserByEmail(db, 'beto@correo.com')!.id)])).json()
        .rejected,
    ).toEqual(['l3'])
    // quitar el "me gusta" (borrado lógico) lo hace la misma persona
    expect(
      (await post(cAna, 'likes', [{ ...like('l1', ana.id), deletedAt: t }])).json().rejected,
    ).toBeUndefined()
    expect((await get(cOwner, 'likes'))[0]).toMatchObject({ deletedAt: t })
  })
})
