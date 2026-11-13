import { useEffect, useRef, useState } from 'react'
import { useLabels } from '../store/hooks'
import { useStore } from '../store/store'
import { useParticipants } from '../sync/access'
import { useAuth } from '../sync/auth'
import { displayName } from '../lib/people'
import { ASSIGNEE_NONE } from '../lib/types'
import { Avatar } from './Avatar'
import { FilterIcon } from './Icons'
import { LabelChip } from './LabelChip'
import styles from './FilterMenu.module.css'

/** Botón "Filtros": filtra las tarjetas del tablero por etiqueta (cualquiera de las marcadas). */
export function FilterMenu({ boardId }: { boardId: string | null }) {
  // En un subtablero: las etiquetas del principal y las propias; las personas son las del principal.
  const parentId = useStore((s) => s.boards.find((b) => b.id === boardId)?.parentId)
  const own = useLabels(boardId)
  const labels = own // en un subtablero, solo sus subetiquetas
  const people = useParticipants(parentId ?? boardId)
  const me = useAuth((s) => s.userId)
  const assignees = useStore((s) => s.assigneeFilter)
  const setAssignees = useStore((s) => s.setAssigneeFilter)
  const filter = useStore((s) => s.labelFilter)
  const setFilter = useStore((s) => s.setLabelFilter)
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

  if (!boardId) return null // el filtro es por etiquetas de un tablero
  const active = filter.length + assignees.length
  const toggle = (id: string) =>
    setFilter(filter.includes(id) ? filter.filter((f) => f !== id) : [...filter, id])
  const toggleAssignee = (id: string) =>
    setAssignees(assignees.includes(id) ? assignees.filter((f) => f !== id) : [...assignees, id])
  // Yo primero: "mis tarjetas" es el filtro que más se usa.
  const ordered = [...people].sort((a, b) => Number(b.userId === me) - Number(a.userId === me))

  return (
    <div ref={wrap} className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        aria-label={
          active ? `Filtros, ${active} ${active === 1 ? 'activo' : 'activos'}` : 'Filtros'
        }
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <FilterIcon />
        {active > 0 && <span className={styles.badge}>{active}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="group" aria-label="Filtros">
          {people.length > 1 && (
            <>
              <h2 className={styles.title}>Asignado a</h2>
              <ul className={styles.list} aria-label="Filtrar por persona">
                {ordered.map((p) => (
                  <li key={p.userId}>
                    <label className={styles.row}>
                      <input
                        type="checkbox"
                        checked={assignees.includes(p.userId)}
                        onChange={() => toggleAssignee(p.userId)}
                        aria-label={`Mostrar solo lo asignado a ${p.userId === me ? 'mí' : displayName(p)}`}
                      />
                      <Avatar email={p.email} alias={p.alias} size="sm" decorative />
                      <span>{p.userId === me ? 'Yo' : displayName(p)}</span>
                    </label>
                  </li>
                ))}
                <li>
                  <label className={styles.row}>
                    <input
                      type="checkbox"
                      checked={assignees.includes(ASSIGNEE_NONE)}
                      onChange={() => toggleAssignee(ASSIGNEE_NONE)}
                      aria-label="Mostrar solo lo no asignado"
                    />
                    <span>Sin asignar</span>
                  </label>
                </li>
              </ul>
            </>
          )}
          <h2 className={styles.title}>Etiquetas</h2>
          {labels.length === 0 ? (
            <p className={styles.empty}>
              Aún no tienes etiquetas. Créalas desde el detalle de una tarjeta.
            </p>
          ) : (
            <ul className={styles.list}>
              {labels.map((l) => (
                <li key={l.id}>
                  <label className={styles.row}>
                    <input
                      type="checkbox"
                      checked={filter.includes(l.id)}
                      onChange={() => toggle(l.id)}
                      aria-label={`Mostrar solo ${l.name}`}
                    />
                    <LabelChip label={l} />
                  </label>
                </li>
              ))}
            </ul>
          )}
          {active > 0 && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setFilter([])
                setAssignees([])
              }}
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}
    </div>
  )
}
