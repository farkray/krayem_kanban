import { useEffect, useRef, useState } from 'react'
import { useLabels } from '../store/hooks'
import { useStore } from '../store/store'
import { FilterIcon } from './Icons'
import { LabelChip } from './LabelChip'
import styles from './FilterMenu.module.css'

/** Botón "Filtros": filtra las tarjetas del tablero por etiqueta (cualquiera de las marcadas). */
export function FilterMenu({ boardId }: { boardId: string | null }) {
  const labels = useLabels(boardId)
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
  const active = filter.length
  const toggle = (id: string) =>
    setFilter(filter.includes(id) ? filter.filter((f) => f !== id) : [...filter, id])

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
        <div className={styles.panel} role="group" aria-label="Filtrar por etiqueta">
          <h2 className={styles.title}>Filtrar por etiqueta</h2>
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
            <button type="button" className={styles.clear} onClick={() => setFilter([])}>
              Limpiar filtro
            </button>
          )}
        </div>
      )}
    </div>
  )
}
