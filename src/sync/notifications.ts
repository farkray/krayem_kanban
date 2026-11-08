import { create } from 'zustand'
import { getConfig } from '../lib/config'

export type NotificationType =
  'mention' | 'assignment' | 'access_granted' | 'access_role' | 'access_removed'

/** Un aviso del centro de notificaciones (lo genera el servidor). */
export interface AppNotification {
  id: string
  type: NotificationType
  boardId: string
  cardId: string | null
  /** Título de la tarjeta (o del tablero en los avisos de acceso) cuando ocurrió. */
  title: string
  excerpt: string
  /** Cuántos avisos iguales se fundieron en este. */
  count: number
  actorName: string
  createdAt: string
  readAt: string | null
}

interface NotificationsState {
  items: AppNotification[]
  unread: number
  loaded: boolean
}

export const useNotifications = create<NotificationsState>(() => ({
  items: [],
  unread: 0,
  loaded: false,
}))

const MAX_ITEMS = 100
const api = (path: string) => `${getConfig().API_URL}${path}`

export function resetNotifications() {
  useNotifications.setState({ items: [], unread: 0, loaded: false })
}

/** Descarga la bandeja. Sin red se queda con lo último que se supo. */
export async function refreshNotifications(): Promise<void> {
  try {
    const res = await fetch(api('/notifications?limit=50'), { credentials: 'same-origin' })
    if (!res.ok) return
    const data = (await res.json()) as { notifications: AppNotification[]; unread: number }
    useNotifications.setState({ items: data.notifications, unread: data.unread, loaded: true })
  } catch {
    /* sin conexión */
  }
}

/** Llega un aviso nuevo (o uno fundido con otro anterior) por el canal en vivo. */
export function receiveNotification(n: AppNotification, unread: number) {
  useNotifications.setState((s) => ({
    items: [n, ...s.items.filter((i) => i.id !== n.id)].slice(0, MAX_ITEMS),
    unread,
  }))
}

async function postRead(body: object) {
  try {
    const res = await fetch(api('/notifications/read'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const { unread } = (await res.json()) as { unread: number }
      useNotifications.setState({ unread })
    }
  } catch {
    /* sin conexión: el servidor se pondrá al día en la próxima descarga */
  }
}

const stamp = () => new Date().toISOString()

/** Marca como leídas las indicadas (al instante en pantalla; el servidor lo confirma). */
export function markRead(ids: string[]) {
  if (ids.length === 0) return
  const set = new Set(ids)
  useNotifications.setState((s) => {
    const items = s.items.map((i) => (set.has(i.id) && !i.readAt ? { ...i, readAt: stamp() } : i))
    const changed = items.filter((i, k) => i.readAt !== s.items[k].readAt).length
    return { items, unread: Math.max(0, s.unread - changed) }
  })
  void postRead({ ids })
}

export function markAllRead() {
  useNotifications.setState((s) => ({
    items: s.items.map((i) => (i.readAt ? i : { ...i, readAt: stamp() })),
    unread: 0,
  }))
  void postRead({ all: true })
}

/** Al abrir una tarjeta se leen sus avisos: la campana y la marca "Te mencionan" quedan al día. */
export function markCardRead(cardId: string) {
  const pending = useNotifications.getState().items.some((i) => i.cardId === cardId && !i.readAt)
  if (!pending) return
  useNotifications.setState((s) => {
    const items = s.items.map((i) =>
      i.cardId === cardId && !i.readAt ? { ...i, readAt: stamp() } : i,
    )
    const changed = items.filter((i, k) => i.readAt !== s.items[k].readAt).length
    return { items, unread: Math.max(0, s.unread - changed) }
  })
  void postRead({ cardId })
}
