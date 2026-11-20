import { useState, type FormEvent } from 'react'
import {
  adminCreateWorkspace,
  adminDeleteWorkspace,
  adminRenameWorkspace,
  adminSetWorkspaceMembers,
  type AdminUser,
  type AdminWorkspace,
} from '../sync/admin'
import panel from './AdminPanel.module.css'
import styles from './AdminWorkspaces.module.css'

const MESSAGES: Record<string, string> = {
  invalid_name: 'El nombre debe tener entre 1 y 60 caracteres.',
  name_taken: 'Ya existe un workspace con ese nombre.',
  workspace_not_empty: 'Tiene tableros: no se puede eliminar.',
  offline: 'No hay conexión con el servidor.',
}
const message = (code: string) => MESSAGES[code] ?? 'No se pudo completar la acción.'

const who = (u: AdminUser) => (u.alias ? `${u.alias} (${u.email})` : u.email)

/** Sección del panel de control: crear workspaces y asignarles usuarios. */
export function AdminWorkspaces({
  users,
  list,
  onReplace,
  onReload,
}: {
  users: AdminUser[]
  list: AdminWorkspace[] | null
  onReplace: (w: AdminWorkspace) => void
  onReload: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = onReload
  const replace = onReplace

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const res = await adminCreateWorkspace(name.trim())
    if (!res.ok) return setError(message(res.error))
    setName('')
    setOpen(res.data.workspace.id)
    void load()
  }

  const rename = async () => {
    if (!editing) return
    setError(null)
    const res = await adminRenameWorkspace(editing.id, editing.value.trim())
    if (!res.ok) return setError(message(res.error))
    setEditing(null)
    replace(res.data.workspace)
  }

  const toggle = async (w: AdminWorkspace, userId: string, on: boolean) => {
    setError(null)
    const next = on ? [...w.members, userId] : w.members.filter((m) => m !== userId)
    const res = await adminSetWorkspaceMembers(w.id, next)
    if (!res.ok) return setError(message(res.error))
    replace(res.data.workspace)
  }

  const remove = async (w: AdminWorkspace) => {
    setError(null)
    const res = await adminDeleteWorkspace(w.id)
    if (!res.ok) return setError(message(res.error))
    void load()
  }

  return (
    <section className={panel.card} aria-labelledby="ws-title">
      <div className={panel.cardHead}>
        <h2 id="ws-title" className={panel.sub}>
          Workspaces
        </h2>
      </div>
      <p className={panel.hint}>
        Quienes comparten un workspace se ven y pueden compartirse tableros. No ven a nadie fuera de
        sus workspaces.
      </p>
      {error && (
        <p className={panel.error} role="alert">
          {error}
        </p>
      )}

      <ul className={styles.list} aria-label="Workspaces">
        {(list ?? []).map((w) => {
          const expanded = open === w.id
          return (
            <li key={w.id} className={styles.item}>
              {editing?.id === w.id ? (
                <form
                  className={styles.row}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void rename()
                  }}
                >
                  <input
                    className={panel.input}
                    value={editing.value}
                    maxLength={60}
                    aria-label="Nombre del workspace"
                    autoFocus
                    onChange={(e) => setEditing({ id: w.id, value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  />
                  <button type="submit" className={panel.primary}>
                    Guardar
                  </button>
                </form>
              ) : (
                <div className={styles.row}>
                  <div className={styles.name}>
                    <strong>{w.name}</strong>
                    <span className={panel.hint}>
                      {w.members.length === 1 ? '1 miembro' : `${w.members.length} miembros`} ·{' '}
                      {w.boards === 1 ? '1 tablero' : `${w.boards} tableros`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={panel.secondary}
                    aria-expanded={expanded}
                    aria-label={`Miembros de ${w.name}`}
                    onClick={() => setOpen(expanded ? null : w.id)}
                  >
                    Miembros
                  </button>
                  <button
                    type="button"
                    className={panel.secondary}
                    aria-label={`Renombrar ${w.name}`}
                    onClick={() => setEditing({ id: w.id, value: w.name })}
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    className={`${panel.secondary} ${styles.danger}`}
                    aria-label={`Eliminar ${w.name}`}
                    disabled={w.boards > 0}
                    title={w.boards > 0 ? 'Tiene tableros: no se puede eliminar' : undefined}
                    onClick={() => void remove(w)}
                  >
                    Eliminar
                  </button>
                </div>
              )}
              {expanded && (
                <fieldset className={styles.members}>
                  <legend className={styles.legend}>Miembros de {w.name}</legend>
                  {users.map((u) => (
                    <label key={u.id} className={styles.member}>
                      <input
                        type="checkbox"
                        checked={w.members.includes(u.id)}
                        onChange={(e) => void toggle(w, u.id, e.target.checked)}
                      />
                      <span>{who(u)}</span>
                    </label>
                  ))}
                  {users.length === 0 && <span className={panel.hint}>No hay usuarios.</span>}
                </fieldset>
              )}
            </li>
          )
        })}
        {list?.length === 0 && <li className={panel.hint}>Aún no hay workspaces.</li>}
      </ul>

      <form className={styles.create} onSubmit={create}>
        <input
          className={panel.input}
          value={name}
          maxLength={60}
          placeholder="Nuevo workspace (ej. Mercabits)"
          aria-label="Nombre del nuevo workspace"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className={panel.primary} disabled={name.trim() === ''}>
          Crear
        </button>
      </form>
    </section>
  )
}
