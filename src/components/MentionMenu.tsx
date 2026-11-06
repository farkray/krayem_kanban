import type { CSSProperties } from 'react'
import type { MentionPerson } from '../lib/mentions'
import styles from './MentionMenu.module.css'

/** Lista de personas que aparece al escribir "@" (la maneja quien la usa: input o editor). */
export function MentionMenu({
  id,
  options,
  active,
  onPick,
  style,
}: {
  id: string
  options: MentionPerson[]
  active: number
  onPick: (p: MentionPerson) => void
  style?: CSSProperties
}) {
  return (
    <ul id={id} className={styles.menu} style={style} role="listbox" aria-label="Mencionar a">
      {options.map((p, i) => (
        <li
          key={p.userId}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === active}
          className={i === active ? styles.on : styles.item}
          // mousedown (no click): así el campo no pierde el foco antes de elegir
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(p)
          }}
        >
          <span className={styles.at} aria-hidden="true">
            @
          </span>
          {p.name}
        </li>
      ))}
    </ul>
  )
}
