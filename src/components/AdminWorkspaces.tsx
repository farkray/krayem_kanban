import { useMemo, useState, type FormEvent } from 'react'
import {
  adminCreateWorkspace,
  adminDeleteWorkspace,
  adminRenameWorkspace,
  adminSetWorkspaceMembers,
  type AdminUser,
  type AdminWorkspace,
} from '../sync/admin'
import { Avatar } from './Avatar'
import panel from './AdminPanel.module.css'
import styles from './AdminWorkspaces.module.css'

const MESSAGES: Record<string, string> = {
  invalid_name: 'El nombre debe tener entre 1 y 60 caracteres.',
  name_taken: 'Ya existe un workspace con ese nombre.',
  workspace_not_empty: 'Tiene tableros: no se puede eliminar.',
  offline: 'No hay conexión con el servidor.',
}
const message = (code: string) => MESSAGES[code] ?? 'No se pudo completar la acción.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

interface Props {
  users: AdminUser[]
  list: AdminWorkspace[] | null
  onReplace: (w: AdminWorkspace) => void
  onReload: () => void
}

/** Pestaña Workspaces: lista a la izquierda, detalle (nombre y miembros) a la derecha. */
export function AdminWorkspaces({ users, list, onReplace, onReload }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const current = list?.find((w) => w.id === selected) ?? list?.[0] ?? null

  const people = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(
      (u) => !q || u.email.toLowerCase().includes(q) || u.alias.toLowerCase().includes(q),
    )
  }, [users, query])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const res = await adminCreateWorkspace(name.trim())
    if (!res.ok) return setError(message(res.error))
    setName('')
    setSelected(res.data.workspace.id)
    onReload()
  }

  const rename = async (w: AdminWorkspace, value: string) => {
    setError(null)
    const res = await adminRenameWorkspace(w.id, value.trim())
    if (!res.ok) return setError(message(res.error))
    setRenaming(null)
    onReplace(res.data.workspace)
  }

  const toggle = async (w: AdminWorkspace, userId: string, on: boolean) => {
    setError(null)
    const next = on ? [...w.members, userId] : w.members.filter((m) => m !== userId)
    const res = await adminSetWorkspaceMembers(w.id, next)
    if (!res.ok) return setError(message(res.error))
    onReplace(res.data.workspace)
  }

  const remove = async (w: AdminWorkspace) => {
    setError(null)
    const res = await adminDeleteWorkspace(w.id)
    if (!res.ok) return setError(message(res.error))
    setSelected(null)
    onReload()
  }

  return (
    <div>
      <p className={styles.intro}>
        Quienes comparten un workspace se ven y pueden compartirse tableros. No ven a nadie fuera de
        sus workspaces.
      </p>
      {error && (
        <p className={panel.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.layout}>
        <section className={panel.card} aria-labelledby="ws-list-title">
          <h2 id="ws-list-title" className={`${panel.sub} ${styles.listTitle}`}>
            Workspaces
          </h2>
          <ul className={styles.list} aria-label="Workspaces">
            {(list ?? []).map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={styles.pick}
                  aria-current={current?.id === w.id ? 'true' : undefined}
                  onClick={() => {
                    setSelected(w.id)
                    setRenaming(null)
                  }}
                >
                  <span className={styles.pickName}>{w.name}</span>
                  <span className={styles.pickMeta}>
                    {plural(w.members.length, 'miembro', 'miembros')} ·{' '}
                    {plural(w.boards, 'tablero', 'tableros')}
                  </span>
                </button>
              </li>
            ))}
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

        {current ? (
          <section
            className={panel.card}
            aria-label={`Detalle de ${current.name}`}
            key={current.id}
          >
            <div className={styles.detailHead}>
              {renaming === current.id ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void rename(current, new FormData(e.currentTarget).get('n') as string)
                  }}
                >
                  <input
                    name="n"
                    className={panel.input}
                    defaultValue={current.name}
                    maxLength={60}
                    aria-label="Nombre del workspace"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                  />
                  <button type="submit" className={panel.primary}>
                    Guardar
                  </button>
                  <button type="button" className={panel.secondary} onClick={() => setRenaming(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <h2 className={panel.sub}>{current.name}</h2>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={panel.secondary}
                      aria-label={`Renombrar ${current.name}`}
                      onClick={() => setRenaming(current.id)}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      className={`${panel.secondary} ${styles.danger}`}
                      aria-label={`Eliminar ${current.name}`}
                      disabled={current.boards > 0}
                      onClick={() => void remove(current)}
                    >
                      Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
            <p className={panel.hint}>
              {current.boards > 0
                ? `Tiene ${plural(current.boards, 'tablero', 'tableros')}, así que no se puede eliminar.`
                : 'Sin tableros: se puede eliminar.'}
            </p>

            <div className={styles.membersHead}>
              <h3 className={styles.membersTitle}>Miembros</h3>
              <span className={styles.membersCount} aria-live="polite">
                {current.members.length} de {plural(users.length, 'usuario', 'usuarios')}
              </span>
              <input
                type="search"
                className={panel.search}
                value={query}
                placeholder="Buscar persona"
                aria-label="Buscar persona"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <fieldset className={styles.members}>
              <legend className={panel.sr}>Miembros de {current.name}</legend>
              {people.map((u) => (
                <label key={u.id} className={styles.member}>
                  <input
                    type="checkbox"
                    checked={current.members.includes(u.id)}
                    onChange={(e) => void toggle(current, u.id, e.target.checked)}
                  />
                  <Avatar email={u.email} alias={u.alias} decorative />
                  <span className={styles.memberText}>
                    <span>{u.alias || u.email}</span>
                    {u.alias && <span className={styles.memberMeta}>{u.email}</span>}
                  </span>
                </label>
              ))}
              {people.length === 0 && <span className={panel.hint}>Nadie coincide.</span>}
            </fieldset>
            <p className={panel.hint}>
              Quitar a alguien le retira el acceso a los tableros compartidos de este workspace.
            </p>
          </section>
        ) : (
          list && (
            <section className={panel.card}>
              <p className={panel.hint}>Crea el primer workspace para empezar a agrupar personas.</p>
            </section>
          )
        )}
      </div>
    </div>
  )
}
