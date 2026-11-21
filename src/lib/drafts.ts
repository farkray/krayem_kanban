import { create } from 'zustand'
import { db } from '../db/db'

/**
 * Borradores de texto (actualizaciones, respuestas y ediciones) que aún no se enviaron. Viven en memoria (lectura
 * inmediata) y en la base local del navegador, así que sobreviven a cerrar el diálogo, cambiar de pestaña, recargar o un
 * cierre inesperado. No se sincronizan: son del dispositivo.
 */
const PREFIX = 'draft:'

export const updateDraftKey = (cardId: string) => `${cardId}:update`
export const replyDraftKey = (cardId: string, updateId: string) => `${cardId}:reply:${updateId}`
export const editDraftKey = (cardId: string, commentId: string) => `${cardId}:edit:${commentId}`

interface DraftState {
  items: Record<string, string>
  /** Guarda (o, si está vacío, borra) el borrador. La escritura a disco se agrupa (≈300 ms). */
  set: (key: string, md: string) => void
  clear: (key: string) => void
}

const pending = new Map<string, string | null>()
let timer: ReturnType<typeof setTimeout> | null = null

/** Escribe ya a la base local lo que esté pendiente (al cerrar, enviar o salir de la página). */
export async function flushDrafts(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = null
  const batch = [...pending]
  pending.clear()
  await Promise.all(
    batch.map(([key, value]) =>
      value === null
        ? db.meta.delete(PREFIX + key)
        : db.meta.put({ key: PREFIX + key, value }),
    ),
  ).catch(() => {
    /* sin almacenamiento disponible: el borrador sigue en memoria mientras la página esté abierta */
  })
}

const schedule = (key: string, value: string | null) => {
  pending.set(key, value)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushDrafts(), 300)
}

export const useDrafts = create<DraftState>((set, get) => ({
  items: {},
  set: (key, md) => {
    if (md.trim() === '') return get().clear(key)
    if (get().items[key] === md) return
    set({ items: { ...get().items, [key]: md } })
    schedule(key, md)
  },
  clear: (key) => {
    if (!(key in get().items) && !pending.has(key)) return
    const { [key]: _gone, ...rest } = get().items
    set({ items: rest })
    schedule(key, null)
    void flushDrafts()
  },
}))

/** Carga los borradores guardados (al arrancar la app). */
export async function hydrateDrafts(): Promise<void> {
  const rows = await db.meta.where('key').startsWith(PREFIX).toArray()
  const items: Record<string, string> = {}
  for (const r of rows) if (typeof r.value === 'string') items[r.key.slice(PREFIX.length)] = r.value
  // lo escrito antes de terminar de cargar tiene prioridad
  useDrafts.setState((s) => ({ items: { ...items, ...s.items } }))
}

/** Vacía la memoria (cierre de sesión: la base local ya se borró). */
export function resetDrafts(): void {
  pending.clear()
  if (timer) clearTimeout(timer)
  timer = null
  useDrafts.setState({ items: {} })
}

/** ¿Hay algún borrador (actualización, respuesta o edición) de esta tarjeta? */
export const cardHasDraft = (items: Record<string, string>, cardId: string) =>
  Object.keys(items).some((k) => k.startsWith(`${cardId}:`))

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushDrafts())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushDrafts()
  })
}
