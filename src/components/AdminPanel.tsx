import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminResetPassword,
  adminSetAlias,
  type AdminUser,
} from '../sync/admin'
import { AdminNotifications } from './AdminNotifications'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { MoreIcon } from './Icons'
import styles from './AdminPanel.module.css'

const MIN = 10

const MESSAGES: Record<string, string> = {
  invalid_email: 'Ese correo no es válido.',
  invalid_alias: 'El alias admite hasta 60 caracteres.',
  email_taken: 'Ya existe un usuario con ese correo.',
  weak_password: `La contraseña debe tener al menos ${MIN} caracteres (o déjala vacía para generar una).`,
  cannot_delete_self: 'No puedes eliminar tu propia cuenta.',
  forbidden: 'Tu cuenta no tiene permiso de administrador.',
  offline: 'No hay conexión con el servidor.',
}
const message = (code: string) => MESSAGES[code] ?? 'No se pudo completar la acción.'

/** Contraseña temporal recién creada o restablecida: se muestra una sola vez. */
interface Shown {
  email: string
  password: string
}

/** Menú "⋯" de una fila: acciones secundarias (restablecer contraseña, eliminar). */
function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={wrap} className={styles.menuWrap}>
      <button
        ref={trigger}
        type="button"
        className={styles.iconBtn}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon width={18} height={18} />
      </button>
      {open && (
        // Un clic en una opción cierra el menú
        <div className={styles.menu} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

interface Props {
  /** Correo de la cuenta en uso (no se puede eliminar a sí misma). */
  me: string | null
  isAdmin: boolean
  /** Vuelve a la pantalla de tableros. */
  onBack: () => void
}

/** Panel de control del administrador: gestión de cuentas en su propia pantalla. */
export function AdminPanel({ me, isAdmin, onBack }: Props) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [alias, setAlias] = useState('')
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Shown | null>(null)
  const [toDelete, setToDelete] = useState<AdminUser | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await adminListUsers()
    if (res.ok) setUsers(res.data.users)
    else setError(message(res.error))
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (users ?? []).filter(
      (u) => !q || u.email.toLowerCase().includes(q) || u.alias.toLowerCase().includes(q),
    )
  }, [users, query])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await adminCreateUser(
      email.trim(),
      password || undefined,
      alias.trim() || undefined,
    )
    setBusy(false)
    if (!res.ok) return setError(message(res.error))
    setShown({ email: res.data.user.email, password: res.data.password ?? password })
    setCopied(false)
    setEmail('')
    setPassword('')
    setAlias('')
    void load()
  }

  const saveAlias = async () => {
    if (!editing) return
    setError(null)
    const res = await adminSetAlias(editing.id, editing.value.trim())
    if (!res.ok) return setError(message(res.error))
    setEditing(null)
    void load()
  }

  const reset = async (u: AdminUser) => {
    setError(null)
    const res = await adminResetPassword(u.id)
    if (!res.ok) return setError(message(res.error))
    setShown({ email: u.email, password: res.data.password })
    setCopied(false)
  }

  const remove = async () => {
    if (!toDelete) return
    const res = await adminDeleteUser(toDelete.id)
    setToDelete(null)
    if (!res.ok) return setError(message(res.error))
    void load()
  }

  const copy = async () => {
    if (!shown) return
    try {
      await navigator.clipboard.writeText(shown.password)
      setCopied(true)
    } catch {
      /* sin permiso del portapapeles: se puede seleccionar y copiar a mano */
    }
  }

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      <span aria-hidden="true">←</span> Volver a los tableros
    </button>
  )

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        {back}
        <h1 className={styles.title}>Panel de control</h1>
        <p className={styles.denied} role="alert">
          Tu cuenta no tiene permiso de administrador.
        </p>
      </div>
    )
  }

  const total = users?.length ?? 0
  const admins = users?.filter((u) => u.isAdmin).length ?? 0

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        {back}
        <h1 className={styles.title}>Panel de control</h1>
        <p className={styles.lead}>
          {users
            ? `${total === 1 ? '1 usuario' : `${total} usuarios`} · ${admins === 1 ? '1 administrador' : `${admins} administradores`}`
            : 'Cargando…'}
        </p>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="users-title">
          <div className={styles.cardHead}>
            <h2 id="users-title" className={styles.sub}>
              Usuarios
            </h2>
            <input
              type="search"
              className={styles.search}
              value={query}
              placeholder="Buscar usuario"
              aria-label="Buscar usuario"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <table className={styles.table} aria-label="Usuarios">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col">
                  <span className={styles.sr}>Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id}>
                  <td className={styles.userCell}>
                    {editing?.id === u.id ? (
                      <form
                        className={styles.aliasForm}
                        onSubmit={(e) => {
                          e.preventDefault()
                          void saveAlias()
                        }}
                      >
                        <input
                          className={styles.input}
                          value={editing.value}
                          maxLength={60}
                          autoFocus
                          aria-label={`Alias de ${u.email}`}
                          placeholder="Nombre para mostrar"
                          onChange={(e) => setEditing({ id: u.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditing(null)
                          }}
                        />
                        <button type="submit" className={styles.primary}>
                          Guardar
                        </button>
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => setEditing(null)}
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <div className={styles.who}>
                        <Avatar email={u.email} alias={u.alias} decorative />
                        <span className={styles.names}>
                          <span className={styles.email}>{u.alias || u.email}</span>
                          {u.alias && <span className={styles.meta}>{u.email}</span>}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    {u.isAdmin ? (
                      <span className={styles.badge}>Administrador</span>
                    ) : (
                      <span className={styles.plain}>Usuario</span>
                    )}
                  </td>
                  <td className={styles.actions}>
                    {editing?.id !== u.id && (
                      <div className={styles.actionsRow}>
                        <button
                          type="button"
                          className={styles.secondary}
                          aria-label={`Editar alias de ${u.email}`}
                          onClick={() => setEditing({ id: u.id, value: u.alias })}
                        >
                          {u.alias ? 'Editar alias' : 'Poner alias'}
                        </button>
                        <RowMenu label={`Más acciones de ${u.email}`}>
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.menuItem}
                            aria-label={`Restablecer contraseña de ${u.email}`}
                            onClick={() => reset(u)}
                          >
                            Restablecer contraseña
                          </button>
                          {u.email !== me && (
                            <button
                              type="button"
                              role="menuitem"
                              className={`${styles.menuItem} ${styles.menuDanger}`}
                              aria-label={`Eliminar a ${u.email}`}
                              onClick={() => setToDelete(u)}
                            >
                              Eliminar usuario
                            </button>
                          )}
                        </RowMenu>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users === null && !error && <p className={styles.meta}>Cargando…</p>}
          {users && visible.length === 0 && (
            <p className={styles.meta}>Ningún usuario coincide con la búsqueda.</p>
          )}
        </section>

        <div className={styles.side}>
          {shown && (
            <section className={styles.secret} role="status" aria-label="Contraseña temporal">
              <h2 className={styles.secretTitle}>Contraseña temporal</h2>
              <p>
                De <strong>{shown.email}</strong>. Cópiala ahora: no se vuelve a mostrar.
              </p>
              <div className={styles.secretRow}>
                <code className={styles.code}>{shown.password}</code>
                <button type="button" className={styles.secondary} onClick={copy}>
                  {copied ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            </section>
          )}

          <AdminNotifications />

          <section className={styles.card} aria-labelledby="new-title">
            <div className={styles.cardHead}>
              <h2 id="new-title" className={styles.sub}>
                Nuevo usuario
              </h2>
            </div>
            <form onSubmit={create}>
              <label className={styles.label}>
                Correo
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  required
                  autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Alias (opcional)
                <input
                  type="text"
                  className={styles.input}
                  value={alias}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="Ej. Jorge Menéndez"
                  onChange={(e) => setAlias(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Contraseña (opcional)
                <input
                  type="text"
                  className={styles.input}
                  value={password}
                  autoComplete="off"
                  placeholder="Vacía = se genera una temporal"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className={styles.primaryWide}
                disabled={busy || email.trim() === ''}
              >
                Crear usuario
              </button>
            </form>
          </section>
        </div>
      </div>

      {toDelete && (
        <ConfirmDialog
          title={`Eliminar a ${toDelete.alias || toDelete.email}`}
          confirmLabel="Eliminar usuario"
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
        >
          <p>
            Se borran su cuenta y <strong>todos sus datos</strong> ({toDelete.rows} registros e
            imágenes). No se puede deshacer.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
