import { useState } from 'react'
import { LIMITS, MAX_COLUMNS } from '../lib/types'
import { PlusIcon } from './Icons'
import { InlineInput } from './InlineInput'
import styles from './AddColumn.module.css'

interface Props {
  count: number
  onAdd: (title: string) => void
}

/** Va en la cabecera del tablero: así nunca queda cortada al final de las columnas. */
export function AddColumn({ count, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const full = count >= MAX_COLUMNS

  if (open && !full) {
    return (
      <div className={styles.form}>
        <InlineInput
          label="Nombre de la columna"
          placeholder="Nombre de la columna"
          maxLength={LIMITS.column}
          onSubmit={(t) => {
            onAdd(t)
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      className={styles.btn}
      disabled={full}
      title={full ? `Un tablero admite como máximo ${MAX_COLUMNS} columnas` : undefined}
      onClick={() => setOpen(true)}
    >
      <PlusIcon width={16} height={16} />
      <span>Agregar columna</span>
      <span className={styles.count} aria-hidden="true">
        {count}/{MAX_COLUMNS}
      </span>
      <span className={styles.sr}>
        {count} de {MAX_COLUMNS} columnas
      </span>
    </button>
  )
}
