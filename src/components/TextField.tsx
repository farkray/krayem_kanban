import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import styles from './TextField.module.css'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'children'> {
  /** Etiqueta del campo: descansa dentro y sube al enfocar o al tener contenido (Material 2, campo relleno). */
  label: string
  /** Texto de apoyo bajo el campo (o el error, si lo hay). */
  helper?: ReactNode
  error?: boolean
  className?: string
}

/**
 * Campo de texto relleno al estilo Material Design 2: etiqueta flotante, fondo suave, línea inferior que se vuelve de color
 * al enfocar. La etiqueta envuelve al campo, así que es su nombre accesible (igual que un `<label>` normal).
 */
export function TextField({ label, helper, error = false, className = '', placeholder, ...input }: Props) {
  const helpId = useId()
  return (
    <div className={`${styles.root} ${className}`}>
      <label className={styles.field} data-invalid={error || undefined}>
        <input
          {...input}
          className={styles.input}
          // " " mantiene :placeholder-shown para saber si está vacío; el texto de ayuda real solo se ve al enfocar
          placeholder={placeholder ?? ' '}
          aria-invalid={error || undefined}
          aria-describedby={helper ? helpId : input['aria-describedby']}
        />
        <span className={styles.label}>{label}</span>
        <span className={styles.line} aria-hidden="true" />
      </label>
      {helper && (
        <p id={helpId} className={error ? `${styles.helper} ${styles.helperError}` : styles.helper}>
          {helper}
        </p>
      )}
    </div>
  )
}
