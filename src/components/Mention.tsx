import { createContext, useContext } from 'react'
import { splitMentions, type MentionPerson } from '../lib/mentions'
import styles from './Mention.module.css'

interface Ctx {
  people: MentionPerson[]
  /** Mi id de usuario: mis menciones se resaltan. */
  me: string | null
}

export const MentionContext = createContext<Ctx>({ people: [], me: null })

/** Chip de una persona mencionada: usa su nombre actual y resalta si eres tú. */
export function MentionChip({ id, label }: { id: string; label: string }) {
  const { people, me } = useContext(MentionContext)
  const name = people.find((p) => p.userId === id)?.name ?? label
  const mine = id === me
  return (
    <span
      className={`${styles.chip} ${mine ? styles.mine : ''}`}
      title={mine ? 'Te mencionan' : name}
    >
      @{name}
    </span>
  )
}

/** Texto plano con menciones (p. ej. un ítem de la lista de tareas) dibujado con chips. */
export function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((p, i) =>
        p.type === 'text' ? (
          <span key={i}>{p.text}</span>
        ) : (
          <MentionChip key={i} id={p.id} label={p.label} />
        ),
      )}
    </>
  )
}
