import { displayName } from '../lib/people'
import type { LabelColor } from '../lib/types'
import styles from './Avatar.module.css'

const COLORS: LabelColor[] = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'gray']

/** Iniciales: de un alias ("Jorge Menéndez" → "JM") o, si es un correo, de su parte local ("ana.perez@x.com" → "AP"). */
export function initialsOf(name: string): string {
  const base = name.includes('@') ? name.split('@')[0] : name
  const parts = base.split(/[._\-+\s]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 1)
  return letters.toUpperCase()
}

/** El mismo correo siempre da el mismo color (hash simple). */
export function colorOf(email: string): LabelColor {
  let h = 0
  for (const ch of email.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

interface Props {
  email: string
  /** Alias de la persona: si existe, de él salen las iniciales y el nombre accesible. */
  alias?: string
  size?: 'sm' | 'md'
  /** Texto accesible; por defecto el correo. Con `decorative` queda oculto para lectores de pantalla. */
  label?: string
  decorative?: boolean
}

/** Círculo con iniciales sobre un color suave (misma paleta AA que las etiquetas). */
export function Avatar({ email, alias, size = 'md', label, decorative }: Props) {
  const c = colorOf(email) // el color depende del correo: no cambia si se edita el alias
  const name = displayName({ email, alias })
  return (
    <span
      className={`${styles.avatar} ${size === 'sm' ? styles.sm : ''}`}
      style={{ background: `var(--label-${c}-soft)`, color: `var(--label-${c}-text)` }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label ?? name })}
      title={decorative ? undefined : (label ?? name)}
    >
      {initialsOf(name)}
    </span>
  )
}
