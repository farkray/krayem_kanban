import { TextField } from './TextField'
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
  adminListWorkspaces,
  adminResetPassword,
  adminSetAlias,
  adminSetGuest,
  adminSetPhone,
  type AdminUser,
  type AdminWorkspace,
} from '../sync/admin'
import { AdminAgents } from './AdminAgents'
import { AdminNotifications } from './AdminNotifications'
import { AdminWorkspaces } from './AdminWorkspaces'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { MoreIcon } from './Icons'
import { Select } from './Select'
import styles from './AdminPanel.module.css'

const MIN = 10

const ROLE_OPTIONS = [
  { value: 'user', label: 'Usuario' },
  { value: 'guest', label: 'Invitado' },
]

type Tab = 'users' | 'workspaces' | 'agents' | 'alerts'
const TABS: { id: Tab; label: string }[] = [
  { id: 'users', label: 'Usuarios' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'agents', label: 'Conexiones' },
  { id: 'alerts', label: 'Avisos' },
]
const TAB_KEY = 'kanban-admin-tab'
const savedTab = (): Tab => {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.id === v) ? (v as Tab) : 'users'
  } catch {
    return 'users'
  }
}

const MESSAGES: Record<string, string> = {
  invalid_email: 'Ese correo no es válido.',
  invalid_alias: 'El alias admite hasta 60 caracteres.',
  invalid_phone: 'El WhatsApp debe ir con código de país, por ejemplo +52 55 1234 5678.',
  email_taken: 'Ya existe un usuario con ese correo.',
  weak_password: `La contraseña debe tener al menos ${MIN} caracteres (o déjala vacía para generar una).`,
  cannot_delete_self: 'No puedes eliminar tu propia cuenta.',
  admin_cannot_be_guest: 'Un administrador no puede ser invitado.',
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
  const [guest, setGuest] = useState(false)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [editingPhone, setEditingPhone] = useState<{ id: string; value: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Shown | null>(null)
  const [toDelete, setToDelete] = useState<AdminUser | null>(null)
  const [copied, setCopied] = useState(false)
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[] | null>(null)
  const [newWs, setNewWs] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>(savedTab)
  const [creating, setCreating] = useState(false)

  const pickTab = (t: Tab) => {
    setTab(t)
    try {
      sessionStorage.setItem(TAB_KEY, t)
    } catch {
      /* sin almacenamiento: la pestaña solo dura esta visita */
    }
  }
  // Flechas, Inicio y Fin cambian de pestaña (patrón de pestañas WAI-ARIA)
  const onTabKey = (e: React.KeyboardEvent, id: Tab) => {
    const i = TABS.findIndex((t) => t.id === id)
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + TABS.length) % TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    pickTab(TABS[next].id)
    document.getElementById(`tab-${TABS[next].id}`)?.focus()
  }
  const workspacesOf = (userId: string) =>
    (workspaces ?? [])
      .filter((w) => w.members.includes(userId))
      .map((w) => w.name)
      .join(', ')

  const loadWorkspaces = useCallback(async () => {
    const res = await adminListWorkspaces()
    if (res.ok) setWorkspaces(res.data?.workspaces ?? [])
  }, [])

  const load = useCallback(async () => {
    const res = await adminListUsers()
    if (res.ok) setUsers(res.data.users)
    else setError(message(res.error))
  }, [])

  useEffect(() => {
    if (isAdmin) {
      void load()
      void loadWorkspaces()
    }
  }, [isAdmin, load, loadWorkspaces])

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
      guest,
      newWs,
    )
    setBusy(false)
    if (!res.ok) return setError(message(res.error))
    setShown({ email: res.data.user.email, password: res.data.password ?? password })
    setCopied(false)
    setEmail('')
    setPassword('')
    setAlias('')
    setGuest(false)
    setNewWs([])
    setCreating(false)
    void load()
    void loadWorkspaces()
  }

  const changeRole = async (u: AdminUser, makeGuest: boolean) => {
    setError(null)
    const res = await adminSetGuest(u.id, makeGuest)
    if (!res.ok) return setError(message(res.error))
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

  const savePhone = async () => {
    if (!editingPhone) return
    setError(null)
    const res = await adminSetPhone(editingPhone.id, editingPhone.value.trim())
    if (!res.ok) return setError(message(res.error))
    setEditingPhone(null)
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

  const waCount = {
    ok: users?.filter((u) => u.whatsapp?.status === 'ok').length ?? 0,
    missing: users?.filter((u) => u.whatsapp?.status === 'missing').length ?? 0,
    invalid: users?.filter((u) => u.whatsapp?.status === 'invalid').length ?? 0,
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
          {users && (
            <span>
              {' · '}WhatsApp: {waCount.ok} listos
              {waCount.missing > 0 && `, ${waCount.missing} sin número`}
              {waCount.invalid > 0 && `, ${waCount.invalid} con formato inválido`}
            </span>
          )}
        </p>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}{' '}
          {users === null && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setError(null)
                void load()
              }}
            >
              Reintentar
            </button>
          )}
        </p>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => pickTab(t.id)}
            onKeyDown={(e) => onTabKey(e, t.id)}
          >
            {t.label}
            {t.id === 'users' && users && <span className={styles.count}>{users.length}</span>}
            {t.id === 'workspaces' && workspaces && (
              <span className={styles.count}>{workspaces.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div role="tabpanel" id="panel-users" aria-labelledby="tab-users" className={styles.panel}>
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


          {creating && (
        <section id="new-user" className={styles.card} aria-labelledby="new-title">
          <div className={styles.cardHead}>
            <h2 id="new-title" className={styles.sub}>
              Nuevo usuario
            </h2>
          </div>
          <form onSubmit={create}>
            <TextField
              className={styles.field}
              label="Correo"
              type="email"
              value={email}
              required
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              className={styles.field}
              label="Alias (opcional)"
              type="text"
              value={alias}
              maxLength={60}
              autoComplete="off"
              placeholder="Ej. Jorge Menéndez"
              onChange={(e) => setAlias(e.target.value)}
            />
            <TextField
              className={styles.field}
              label="Contraseña (opcional)"
              type="text"
              value={password}
              autoComplete="off"
              placeholder="Vacía = se genera una temporal"
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className={styles.label}>
              <Select
                label="Rol"
                value={guest ? 'guest' : 'user'}
                options={ROLE_OPTIONS}
                onChange={(v) => setGuest(v === 'guest')}
              />
              <span className={styles.hint}>
                {guest
                  ? 'El invitado no crea tableros: solo participa en los que le compartan.'
                  : 'El usuario puede crear sus propios tableros y compartirlos.'}
              </span>
            </div>
            {workspaces && workspaces.length > 0 && (
              <fieldset className={styles.wsPick}>
                <legend className={styles.wsLegend}>Workspaces</legend>
                {workspaces.map((w) => (
                  <label key={w.id} className={styles.wsOption}>
                    <input
                      type="checkbox"
                      checked={newWs.includes(w.id)}
                      onChange={(e) =>
                        setNewWs((cur) =>
                          e.target.checked ? [...cur, w.id] : cur.filter((x) => x !== w.id),
                        )
                      }
                    />
                    {w.name}
                  </label>
                ))}
                <span className={styles.hint}>
                  Sin workspace, la persona no ve a nadie ni puede crear tableros.
                </span>
              </fieldset>
            )}
            <button
              type="submit"
              className={styles.primaryWide}
              disabled={busy || email.trim() === ''}
            >
              Crear usuario
            </button>
          </form>
        </section>
          )}

        <section className={styles.card} aria-labelledby="users-title">
          <div className={styles.cardHead}>
            <h2 id="users-title" className={styles.sub}>
              Usuarios
            </h2>
            <div className={styles.tools}>
              <input
                type="search"
                className={styles.search}
                value={query}
                placeholder="Buscar usuario"
                aria-label="Buscar usuario"
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className={styles.primary}
                aria-expanded={creating}
                aria-controls="new-user"
                onClick={() => setCreating((v) => !v)}
              >
                Nuevo usuario
              </button>
            </div>
          </div>

          <table className={styles.table} aria-label="Usuarios">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col">Workspaces</th>
                <th scope="col">WhatsApp</th>
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
                      <Select
                        variant="pill"
                        className={styles.roleSelect}
                        label={`Rol de ${u.email}`}
                        value={u.isGuest ? 'guest' : 'user'}
                        options={ROLE_OPTIONS}
                        onChange={(v) => void changeRole(u, v === 'guest')}
                      />
                    )}
                  </td>
                  <td className={styles.meta}>{workspacesOf(u.id) || '—'}</td>
                  <td className={styles.waCell}>
                    {editingPhone?.id === u.id ? (
                      <form
                        className={styles.aliasForm}
                        onSubmit={(e) => {
                          e.preventDefault()
                          void savePhone()
                        }}
                      >
                        <input
                          className={styles.input}
                          type="tel"
                          value={editingPhone.value}
                          autoFocus
                          aria-label={`WhatsApp de ${u.email}`}
                          placeholder="+52 55 1234 5678"
                          onChange={(e) => setEditingPhone({ id: u.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingPhone(null)
                          }}
                        />
                        <button type="submit" className={styles.primary}>
                          Guardar
                        </button>
                        <button type="button" className={styles.secondary} onClick={() => setEditingPhone(null)}>
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <div className={styles.wa}>
                        <span
                          className={
                            u.whatsapp?.status === 'ok' ? styles.waOk : u.whatsapp?.status === 'invalid' ? styles.waBad : styles.waMissing
                          }
                        >
                          {u.whatsapp?.status === 'ok'
                            ? u.whatsapp.e164
                            : u.whatsapp?.status === 'invalid'
                              ? `Formato inválido: ${u.phone}`
                              : 'Falta'}
                        </span>
                        {u.whatsapp?.status === 'ok' && (
                          <span className={styles.meta}>{u.whatsapp.optIn ? 'avisos activados' : 'avisos desactivados'}</span>
                        )}
                        <button
                          type="button"
                          className={styles.waEdit}
                          aria-label={`Editar WhatsApp de ${u.email}`}
                          onClick={() => setEditingPhone({ id: u.id, value: u.phone })}
                        >
                          {u.whatsapp?.status === 'ok' ? 'Editar' : 'Agregar'}
                        </button>
                      </div>
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

        </div>
      )}

      {tab === 'workspaces' && (
        <div
          role="tabpanel"
          id="panel-workspaces"
          aria-labelledby="tab-workspaces"
          className={styles.panel}
        >
          <AdminWorkspaces
            users={users ?? []}
            list={workspaces}
            onReplace={(w) =>
              setWorkspaces((cur) => cur?.map((x) => (x.id === w.id ? w : x)) ?? cur)
            }
            onReload={() => void loadWorkspaces()}
          />
        </div>
      )}

      {tab === 'agents' && (
        <div role="tabpanel" id="panel-agents" aria-labelledby="tab-agents" className={styles.panel}>
          <AdminAgents />
        </div>
      )}

      {tab === 'alerts' && (
        <div role="tabpanel" id="panel-alerts" aria-labelledby="tab-alerts" className={styles.panel}>
          <AdminNotifications />
        </div>
      )}

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
