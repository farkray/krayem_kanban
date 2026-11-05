/** "0 tarjetas", "1 tarjeta", "2 tarjetas". */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "Creada hoy", "Creada ayer", "Creada hace 3 días", "Creada hace 2 semanas"... */
export function createdLabel(iso: string, now: Date = new Date()): string {
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS))
  if (days === 0) return 'Creada hoy'
  if (days === 1) return 'Creada ayer'
  if (days < 7) return `Creada hace ${days} días`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return `Creada hace ${w} ${w === 1 ? 'semana' : 'semanas'}`
  }
  if (days < 365) {
    const m = Math.floor(days / 30)
    return `Creada hace ${m} ${m === 1 ? 'mes' : 'meses'}`
  }
  const y = Math.floor(days / 365)
  return `Creada hace ${y} ${y === 1 ? 'año' : 'años'}`
}

/* ---------- fechas de tarjeta (YYYY-MM-DD) ---------- */

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "3 nov" */
export function formatShortDate(iso: string): string {
  return parseISODate(iso)
    .toLocaleDateString('es', { day: 'numeric', month: 'short' })
    .replace('.', '')
}

/** "3 nov → 10 nov", "Inicio 3 nov", "Vence 10 nov" o null. */
export function dateRangeLabel(start?: string, end?: string): string | null {
  if (start && end) return `${formatShortDate(start)} → ${formatShortDate(end)}`
  if (start) return `Inicio ${formatShortDate(start)}`
  if (end) return `Vence ${formatShortDate(end)}`
  return null
}

export type DueState = 'overdue' | 'soon' | null

/** "vencida" si el final ya pasó; "pronto" si faltan ≤ 2 días. Una tarjeta terminada no vence. */
export function dueState(
  end: string | undefined,
  finished: boolean,
  now: Date = new Date(),
): DueState {
  if (!end || finished) return null
  const diff = Math.round((parseISODate(end).getTime() - startOfDay(now)) / DAY_MS)
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'soon'
  return null
}

/** "hace un momento", "hace 5 min", "hace 2 h", "ayer", "3 nov". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return formatShortDate(toISODate(new Date(iso)))
}
