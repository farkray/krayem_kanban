import type { Label } from '../lib/types'
import styles from './LabelChip.module.css'

interface Props {
  label: Label
  /** Si se pasa, el chip muestra una × para quitarlo (p. ej. en el detalle de la tarjeta). */
  onRemove?: () => void
}

/** Etiqueta: punto del color + nombre. El nombre siempre está escrito: el color no es la única señal. */
export function LabelChip({ label, onRemove }: Props) {
  return (
    <span className={styles.chip} data-color={label.color}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.name}>{label.name}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Quitar etiqueta ${label.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  )
}
