import { useEffect, useRef, useState } from 'react'
import { displayName } from '../lib/people'
import { useParticipants } from '../sync/access'
import { useAuth } from '../sync/auth'
import { Avatar } from './Avatar'
import styles from './MembersButton.module.css'

const ROLE_LABEL = { owner: 'Dueño', editor: 'Editor', viewer: 'Solo lectura' } as const
const MAX_SHOWN = 4

/** Pila de avatares del tablero; al pulsarla se abre la lista con nombre y permiso de cada persona. */
export function MembersButton({
  boardId,
  onManage,
}: {
  boardId: string
  /** Solo el dueño: abre el diálogo para invitar o quitar gente. */
  onManage?: () => void
}) {
  const people = useParticipants(boardId)
  const me = useAuth((s) => s.userId)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
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

  if (people.length < 2) return null // privado: no hay a quién listar
  const extra = people.length - MAX_SHOWN

  return (
    <div ref={wrap} className={styles.wrap}>
      <button
        type="button"
        className={styles.stack}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Miembros del tablero: ${people.length} personas`}
        onClick={() => setOpen((v) => !v)}
      >
        {people.slice(0, MAX_SHOWN).map((p) => (
          <Avatar key={p.userId} email={p.email} alias={p.alias} decorative />
        ))}
        {extra > 0 && <span className={styles.more}>+{extra}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="group" aria-label="Miembros del tablero">
          <h2 className={styles.title}>Miembros · {people.length}</h2>
          <ul className={styles.list}>
            {people.map((p) => (
              <li key={p.userId} className={styles.row}>
                <Avatar email={p.email} alias={p.alias} decorative />
                <span className={styles.who}>
                  <span className={styles.email}>
                    {displayName(p)}
                    {p.userId === me && <span className={styles.me}> (tú)</span>}
                  </span>
                  <span className={styles.role}>
                    {p.alias ? `${p.email} · ` : ''}
                    {ROLE_LABEL[p.role]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {onManage && (
            <button
              type="button"
              className={styles.manage}
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              Administrar acceso
            </button>
          )}
        </div>
      )}
    </div>
  )
}
