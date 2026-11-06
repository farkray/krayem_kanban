import { join } from 'node:path'
import { buildApp } from './app.ts'
import {
  createUser,
  findUserByEmail,
  hashPassword,
  MIN_PASSWORD,
  normalizeEmail,
  purgeExpiredSessions,
  setAdmin,
  validEmail,
} from './auth.ts'
import { openDb } from './db.ts'

const env = process.env
const dataDir = env.DATA_DIR ?? './data'
const port = Number(env.PORT ?? 3000)
const flag = (v: string | undefined, def: boolean) =>
  v === undefined ? def : v === 'true' || v === '1'

const db = openDb(join(dataDir, 'kanban.db'))
purgeExpiredSessions(db)

// Primer arranque: crea el usuario inicial desde variables de entorno (después ya no hacen falta).
const adminEmail = env.ADMIN_EMAIL ? normalizeEmail(env.ADMIN_EMAIL) : ''
if (adminEmail && env.ADMIN_PASSWORD && !findUserByEmail(db, adminEmail)) {
  if (!validEmail(adminEmail) || env.ADMIN_PASSWORD.length < MIN_PASSWORD) {
    console.error(`ADMIN_EMAIL inválido o ADMIN_PASSWORD con menos de ${MIN_PASSWORD} caracteres.`)
    process.exit(1)
  }
  createUser(db, adminEmail, await hashPassword(env.ADMIN_PASSWORD), true)
  console.log(`Usuario creado: ${adminEmail}`)
}

// ADMIN_EMAIL siempre tiene el rol de administrador (también si la cuenta ya existía).
const existingAdmin = adminEmail ? findUserByEmail(db, adminEmail) : undefined
if (existingAdmin) setAdmin(db, existingAdmin.id, true)

const { app } = buildApp({
  db,
  dataDir,
  allowSignup: flag(env.ALLOW_SIGNUP, false),
  cookieSecure: flag(env.COOKIE_SECURE, true),
  logger: true,
})

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    void app.close().then(() => {
      db.close()
      process.exit(0)
    })
  })
}

await app.listen({ port, host: '0.0.0.0' })
