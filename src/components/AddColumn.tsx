import { MAX_COLUMNS } from '../lib/types'
import { PlusIcon } from './Icons'
import styles from './AddColumn.module.css'

interface Props {
  count: number
  /** Crea la columna al instante; quien llama abre su nombre para escribirlo. */
  onAdd: () => void
}

/** Va en la cabecera del tablero: así nunca queda cortada al final de las columnas. */
export function AddColumn({ count, onAdd }: Props) {
  const full = count >= MAX_COLUMNS

  return (
    <button
      type="button"
      className={styles.btn}
      disabled={full}
      title={full ? `Un tablero admite como máximo ${MAX_COLUMNS} columnas` : undefined}
      onClick={onAdd}
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
