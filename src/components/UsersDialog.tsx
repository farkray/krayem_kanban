import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminSetAlias,
  adminResetPassword,
  type AdminUser,
} from '../sync/admin'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import styles from './UsersDialog.module.css'

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

export function UsersDialog({ me, onClose }: { me: string | null; onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    void load()
  }, [load])

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
    setShown({
      email: res.data.user.email,
      password: res.data.password ?? password,
    })
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

  return (
    <Modal label="Usuarios" onClose={onClose} size="lg">
      <h2 className={styles.title}>Usuarios</h2>

      {shown && (
        <div className={styles.secret} role="status">
          <p>
            Contraseña temporal de <strong>{shown.email}</strong>. Cópiala ahora: no se vuelve a
            mostrar.
          </p>
          <div className={styles.secretRow}>
            <code className={styles.code}>{shown.password}</code>
            <button type="button" className={styles.secondary} onClick={copy}>
              {copied ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <ul className={styles.list} aria-label="Usuarios">
        {(users ?? []).map((u) => (
          <li key={u.id} className={styles.row}>
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
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setEditing(null)
                    }
                  }}
                />
                <button type="submit" className={styles.primary}>
                  Guardar
                </button>
                <button type="button" className={styles.secondary} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <div className={styles.who}>
                  <span className={styles.email}>{u.alias || u.email}</span>
                  <span className={styles.meta}>
                    {u.alias ? `${u.email} · ` : ''}
                    {u.isAdmin ? 'Administrador · ' : ''}
                    {u.rows} registros
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.secondary}
                  aria-label={`Editar alias de ${u.email}`}
                  onClick={() => setEditing({ id: u.id, value: u.alias })}
                >
                  {u.alias ? 'Editar alias' : 'Poner alias'}
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.secondary}
              aria-label={`Restablecer contraseña de ${u.email}`}
              onClick={() => reset(u)}
            >
              Restablecer contraseña
            </button>
            {u.email !== me && (
              <button
                type="button"
                className={styles.danger}
                aria-label={`Eliminar a ${u.email}`}
                onClick={() => setToDelete(u)}
              >
                Eliminar
              </button>
            )}
          </li>
        ))}
        {users === null && !error && <li className={styles.meta}>Cargando…</li>}
      </ul>

      <form className={styles.form} onSubmit={create}>
        <h3 className={styles.sub}>Nuevo usuario</h3>
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
            placeholder="Nombre para mostrar, p. ej. Jorge Menéndez"
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
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cerrar
          </button>
          <button type="submit" className={styles.primary} disabled={busy || email.trim() === ''}>
            Crear usuario
          </button>
        </div>
      </form>

      {toDelete && (
        <ConfirmDialog
          title={`Eliminar a ${toDelete.email}`}
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
    </Modal>
  )
}
