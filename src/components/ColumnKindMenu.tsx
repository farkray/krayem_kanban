import { useEffect, useId, useRef, useState } from 'react'
import {
  COLUMN_KINDS,
  COLUMN_KIND_NAMES,
  WIP_LIMITS,
  kindOf,
  type Column,
  type ColumnKind,
} from '../lib/types'
import { TuneIcon } from './Icons'
import styles from './ColumnKindMenu.module.css'

const HELP: Record<ColumnKind, string> = {
  standard: 'Sin límite de tarjetas.',
  next: 'Lo que sigue: máximo 4 tarjetas a la vez.',
  doing: 'En ejecución: máximo 2 tarjetas a la vez.',
}

interface Props {
  column: Column
  onChange: (kind: ColumnKind) => boolean
}

/** Botón de la columna que abre las opciones de tipo (radios): Estándar, Next o Doing. */
export function ColumnKindMenu({ column, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const name = useId()
  const kind = kindOf(column)

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

  return (
    <div ref={wrap} className={styles.wrap}>
      <button
        type="button"
        className={`${styles.btn} ${kind !== 'standard' ? styles.set : ''}`}
        aria-label={`Tipo de columna ${column.title}: ${COLUMN_KIND_NAMES[kind]}`}
        aria-expanded={open}
        aria-haspopup="true"
        title="Tipo de columna"
        onClick={() => setOpen((v) => !v)}
      >
        <TuneIcon width={15} height={15} />
      </button>
      {open && (
        <div className={styles.panel} role="radiogroup" aria-labelledby={`${name}-t`}>
          <span id={`${name}-t`} className={styles.legend}>
            Tipo de columna
          </span>
          {COLUMN_KINDS.map((k) => (
            <label key={k} className={styles.row}>
              <input
                type="radio"
                name={name}
                value={k}
                checked={kind === k}
                onChange={() => {
                  if (onChange(k)) setOpen(false)
                }}
              />
              <span>
                <span className={styles.label}>
                  {COLUMN_KIND_NAMES[k]}
                  {WIP_LIMITS[k] !== null && (
                    <span className={styles.max}> · máx. {WIP_LIMITS[k]}</span>
                  )}
                </span>
                <span className={styles.help}>{HELP[k]}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
