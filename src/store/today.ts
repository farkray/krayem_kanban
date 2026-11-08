import { useEffect, useMemo, useState } from 'react'
import { toISODate } from '../lib/format'
import { todaySummary, type TodayItem } from '../lib/today'
import { useAuth } from '../sync/auth'
import { useStore } from './store'

/** Fecha de hoy (YYYY-MM-DD) que se actualiza sola al pasar la medianoche. */
export function useTodayKey(): string {
  const [key, setKey] = useState(() => toISODate(new Date()))
  useEffect(() => {
    const id = setInterval(() => setKey(toISODate(new Date())), 60_000)
    return () => clearInterval(id)
  }, [])
  return key
}

/** Tarjetas mías que vencen, están vencidas o empiezan hoy (calculado en el dispositivo). */
export function useTodaySummary(): { items: TodayItem[]; day: string } {
  const day = useTodayKey()
  const boards = useStore((s) => s.boards)
  const columns = useStore((s) => s.columns)
  const cards = useStore((s) => s.cards)
  const me = useAuth((s) => s.userId)
  const items = useMemo(
    () => todaySummary({ boards, columns, cards }, me ?? '', new Date()),
    // `day` fuerza el recálculo al cambiar de día aunque no cambien los datos
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boards, columns, cards, me, day],
  )
  return { items, day }
}

const SEEN_KEY = 'kanban_today_seen'

/** ¿Ya se abrió el panel hoy? Sirve para que el resumen solo sume al contador una vez al día. */
export function wasSeen(day: string, me: string | null): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === `${me ?? ''}:${day}`
  } catch {
    return false
  }
}

export function markSeen(day: string, me: string | null) {
  try {
    localStorage.setItem(SEEN_KEY, `${me ?? ''}:${day}`)
  } catch {
    /* almacenamiento no disponible */
  }
}
