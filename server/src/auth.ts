import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import type { DB } from './db.ts'

const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

const scryptAsync = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(pw, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scryptAsync(pw, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Hash de relleno: así un correo inexistente tarda lo mismo que uno existente (no filtra qué cuentas hay).
let dummy: Promise<string> | null = null
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString('hex')))

export const MIN_PASSWORD = 10
export const normalizeEmail = (e: string) => e.trim().toLowerCase()
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/* ---------- sesiones ---------- */

export const SESSION_DAYS = 30
export const COOKIE = 'kanban_session'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)

export interface User {
  id: string
  email: string
  isAdmin: boolean
}

export function createSession(db: DB, userId: string, now = new Date()): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(sha256(token), userId, now.toISOString(), addDays(now, SESSION_DAYS).toISOString())
  return token
}

/** Usuario de una sesión válida, o null. En la BD solo se guarda el hash del token. */
export function sessionUser(db: DB, token: string | undefined, now = new Date()): User | null {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.is_admin, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as
    { id: string; email: string; is_admin: number; expires_at: string } | undefined
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null
  return { id: row.id, email: row.email, isAdmin: row.is_admin === 1 }
}

export function renewSession(db: DB, token: string, now = new Date()) {
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
    addDays(now, SESSION_DAYS).toISOString(),
    sha256(token),
  )
}

export function endSession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

/** Cierra todas las sesiones del usuario salvo la actual (tras cambiar la contraseña). */
export function endOtherSessions(db: DB, userId: string, keepToken: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(
    userId,
    sha256(keepToken),
  )
}

export function setPasswordHash(db: DB, userId: string, passHash: string) {
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(passHash, userId)
}

export function passwordHashOf(db: DB, userId: string): string | undefined {
  const row = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(userId) as
    { pass_hash: string } | undefined
  return row?.pass_hash
}

export function purgeExpiredSessions(db: DB, now = new Date()) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString())
}

export function createUser(db: DB, email: string, passHash: string, isAdmin = false): User {
  const user = { id: randomUUID(), email: normalizeEmail(email), isAdmin }
  db.prepare(
    'INSERT INTO users (id, email, pass_hash, created_at, is_admin) VALUES (?, ?, ?, ?, ?)',
  ).run(user.id, user.email, passHash, new Date().toISOString(), isAdmin ? 1 : 0)
  return user
}

export function setAdmin(db: DB, userId: string, isAdmin: boolean) {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId)
}

export interface UserSummary {
  id: string
  email: string
  createdAt: string
  isAdmin: boolean
  rows: number
}

export function listUsers(db: DB): UserSummary[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.created_at, u.is_admin,
              (SELECT COUNT(*) FROM rows r WHERE r.user_id = u.id) AS n
       FROM users u ORDER BY u.created_at`,
    )
    .all() as { id: string; email: string; created_at: string; is_admin: number; n: number }[]
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.created_at,
    isAdmin: r.is_admin === 1,
    rows: r.n,
  }))
}

export function generatePassword(): string {
  return randomBytes(12).toString('base64url')
}

export function findUserByEmail(db: DB, email: string) {
  return db
    .prepare('SELECT id, email, pass_hash FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as { id: string; email: string; pass_hash: string } | undefined
}

/* ---------- límite de intentos de acceso ---------- */

export class LoginLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()
  private max: number
  private windowMs: number

  constructor(max = 5, windowMs = 15 * 60_000) {
    this.max = max
    this.windowMs = windowMs
  }

  blocked(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key)
    if (!h || h.resetAt <= now) return false
    return h.count >= this.max
  }

  fail(key: string, now = Date.now()) {
    const h = this.hits.get(key)
    if (!h || h.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
    else h.count++
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
    }
  }

  reset(key: string) {
    this.hits.delete(key)
  }
}
