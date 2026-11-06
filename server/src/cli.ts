// Administración de usuarios y copias de seguridad. En el contenedor:
//   docker compose exec api node src/cli.ts create-user ana@correo.com --generate
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  cleanAlias,
  createUser,
  findUserByEmail,
  hashPassword,
  MAX_ALIAS,
  MIN_PASSWORD,
  normalizeEmail,
  validEmail,
} from './auth.ts'
import { openDb } from './db.ts'

const [cmd, ...args] = process.argv.slice(2)
const dataDir = process.env.DATA_DIR ?? './data'
const db = openDb(join(dataDir, 'kanban.db'))

const usage = () => {
  console.error(`Uso:
  create-user <email> [--generate | <contraseña>] [--alias "Nombre"]   Crea un usuario (con --generate muestra una contraseña aleatoria)
  set-password <email> [--generate | <contraseña>]  Cambia la contraseña y cierra sus sesiones
  delete-user <email>                               Elimina el usuario y TODOS sus datos
  set-alias <email> "Nombre Apellido"              Cambia el alias (nombre para mostrar; vacío lo quita)
  set-admin <email> [--remove]                      Da o quita el rol de administrador
  list-users                                        Lista usuarios y cuántas filas tiene cada uno
  backup <carpeta>                                  Copia consistente de la base (VACUUM INTO)`)
  process.exit(2)
}

async function passwordFrom(arg: string | undefined): Promise<{ hash: string; shown?: string }> {
  if (arg === '--generate') {
    const pw = randomBytes(12).toString('base64url')
    return { hash: await hashPassword(pw), shown: pw }
  }
  if (!arg || arg.length < MIN_PASSWORD) {
    console.error(`Indica --generate o una contraseña de al menos ${MIN_PASSWORD} caracteres.`)
    process.exit(2)
  }
  return { hash: await hashPassword(arg) }
}

switch (cmd) {
  case 'create-user': {
    const email = normalizeEmail(args[0] ?? '')
    if (!validEmail(email)) usage()
    if (findUserByEmail(db, email)) {
      console.error('Ya existe ese usuario.')
      process.exit(1)
    }
    const ai = args.indexOf('--alias')
    const alias = ai >= 0 ? cleanAlias(args[ai + 1]) : ''
    if (alias === null) {
      console.error(`El alias admite hasta ${MAX_ALIAS} caracteres.`)
      process.exit(2)
    }
    const { hash, shown } = await passwordFrom(args[1] === '--alias' ? '--generate' : args[1])
    createUser(db, email, hash, false, alias)
    console.log(`Usuario creado: ${email}${alias ? ` (${alias})` : ''}`)
    if (shown) console.log(`Contraseña: ${shown}`)
    break
  }
  case 'set-password': {
    const user = findUserByEmail(db, args[0] ?? '')
    if (!user) {
      console.error('No existe ese usuario.')
      process.exit(1)
    }
    const { hash, shown } = await passwordFrom(args[1])
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, user.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
    console.log(`Contraseña actualizada para ${user.email} (sesiones cerradas).`)
    if (shown) console.log(`Contraseña: ${shown}`)
    break
  }
  case 'delete-user': {
    const user = findUserByEmail(db, args[0] ?? '')
    if (!user) {
      console.error('No existe ese usuario.')
      process.exit(1)
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id) // en cascada: sesiones y filas
    console.log(
      `Eliminado ${user.email}. Sus imágenes siguen en ${join(dataDir, 'blobs', user.id)} (bórralas a mano si quieres).`,
    )
    break
  }
  case 'set-alias': {
    const user = findUserByEmail(db, args[0] ?? '')
    if (!user) {
      console.error('No existe ese usuario.')
      process.exit(1)
    }
    const alias = cleanAlias(args[1] ?? '')
    if (alias === null) {
      console.error(`El alias admite hasta ${MAX_ALIAS} caracteres.`)
      process.exit(2)
    }
    db.prepare('UPDATE users SET alias = ? WHERE id = ?').run(alias, user.id)
    console.log(`${user.email}: alias ${alias ? `“${alias}”` : 'quitado (se muestra el correo)'}.`)
    break
  }
  case 'set-admin': {
    const user = findUserByEmail(db, args[0] ?? '')
    if (!user) {
      console.error('No existe ese usuario.')
      process.exit(1)
    }
    const on = args[1] !== '--remove'
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(on ? 1 : 0, user.id)
    console.log(`${user.email}: ${on ? 'ahora es administrador' : 'ya no es administrador'}.`)
    break
  }
  case 'list-users': {
    const rows = db
      .prepare(
        `SELECT u.email || CASE WHEN u.alias <> '' THEN ' [' || u.alias || ']' ELSE '' END || CASE WHEN u.is_admin = 1 THEN ' (admin)' ELSE '' END AS email, u.created_at, (SELECT COUNT(*) FROM rows r WHERE r.user_id = u.id) AS filas
         FROM users u ORDER BY u.created_at`,
      )
      .all() as { email: string; created_at: string; filas: number }[]
    for (const r of rows) console.log(`${r.email}\t${r.created_at}\t${r.filas} filas`)
    if (rows.length === 0) console.log('(sin usuarios)')
    break
  }
  case 'backup': {
    const dir = args[0]
    if (!dir || !/^[\w./-]+$/.test(dir)) usage()
    const { mkdirSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `kanban-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
    db.exec(`VACUUM INTO '${file}'`)
    console.log(file)
    break
  }
  default:
    usage()
}
db.close()
