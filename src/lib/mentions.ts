import { displayName } from './people'

/**
 * Menciones (@persona). En el texto guardado una mención es un enlace Markdown normal:
 *   [@Jorge Menéndez](mention:<id de usuario>)
 * así se ve bien en cualquier lector de Markdown y sigue al usuario aunque cambie de alias.
 * Mientras se escribe se muestra como "@Jorge Menéndez" (texto plano); al guardar se codifica.
 */
export interface MentionPerson {
  userId: string
  name: string
}

export const MENTION_SCHEME = 'mention:'

const TOKEN = /\[@([^\]]+)\]\(mention:([A-Za-z0-9_-]+)\)/g

export const peopleOf = (
  list: { userId: string; email: string; alias?: string }[],
): MentionPerson[] => list.map((p) => ({ userId: p.userId, name: displayName(p) }))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "@Nombre" escrito a mano o elegido en el menú → enlace de mención. Primero los nombres más largos. */
export function encodeMentions(text: string, people: MentionPerson[]): string {
  let out = text
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length)
  for (const p of sorted) {
    const re = new RegExp(`(^|[^\\w@\\[])@${escapeRe(p.name)}(?![\\p{L}\\p{N}_])`, 'gu')
    out = out.replace(re, (_m, lead: string) => `${lead}[@${p.name}](mention:${p.userId})`)
  }
  return out
}

/** Enlaces de mención → "@Nombre actual" (para editar). */
export function decodeMentions(text: string, people: MentionPerson[]): string {
  const byId = new Map(people.map((p) => [p.userId, p.name]))
  return text.replace(TOKEN, (_m, label: string, id: string) => `@${byId.get(id) ?? label}`)
}

/** Ids de las personas mencionadas en un texto guardado. */
export function mentionedIds(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[2])
}

export type Part = { type: 'text'; text: string } | { type: 'mention'; id: string; label: string }

/** Parte un texto guardado en trozos de texto y menciones (para dibujar chips). */
export function splitMentions(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
    parts.push({ type: 'mention', id: m[2], label: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}

/** Si el cursor está justo después de "@algo", devuelve lo escrito y dónde empieza la "@". */
export function mentionQuery(before: string): { query: string; start: number } | null {
  const m = /(^|[\s(])@([^\s@]{0,30})$/u.exec(before)
  if (!m) return null
  return { query: m[2], start: before.length - m[2].length - 1 }
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Personas cuyo nombre contiene lo escrito (sin acentos ni mayúsculas); máx. 6. */
export function filterPeople(people: MentionPerson[], query: string): MentionPerson[] {
  const q = fold(query)
  return people.filter((p) => !q || fold(p.name).includes(q)).slice(0, 6)
}
