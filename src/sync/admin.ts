import { getConfig } from '../lib/config'

export interface AdminUser {
  id: string
  email: string
  alias: string
  createdAt: string
  isAdmin: boolean
  rows: number
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string; detail?: string }

const url = (path: string) => `${getConfig().API_URL}/admin${path}`

async function call<T>(method: string, path: string, body?: unknown): Promise<AdminResult<T>> {
  try {
    const res = await fetch(url(path), {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 204) return { ok: true, data: undefined as T }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string }
    return res.ok
      ? { ok: true, data }
      : { ok: false, error: data.error ?? 'error', detail: data.detail }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export const adminListUsers = () => call<{ users: AdminUser[] }>('GET', '/users')

/** Sin `password` el servidor genera una temporal y la devuelve (solo esta vez). */
export const adminCreateUser = (email: string, password?: string, alias?: string) =>
  call<{ user: AdminUser; password?: string }>('POST', '/users', { email, password, alias })

export const adminSetAlias = (id: string, alias: string) =>
  call<{ user: AdminUser }>('PATCH', `/users/${encodeURIComponent(id)}`, { alias })

export const adminResetPassword = (id: string) =>
  call<{ password: string }>('POST', `/users/${encodeURIComponent(id)}/password`)

export const adminDeleteUser = (id: string) =>
  call<void>('DELETE', `/users/${encodeURIComponent(id)}`)

/* ---------- avisos fuera de la app (webhook → n8n) ---------- */

export interface DeliveryAdmin {
  enabled: boolean
  url: string
  hasSecret: boolean
  publicUrl: string
  timezone: string
  stats: { pending: number; sent: number; failed: number; lastError: string }
}

export const adminGetDelivery = () => call<DeliveryAdmin>('GET', '/notifications')

export const adminSaveDelivery = (patch: {
  enabled?: boolean
  url?: string
  publicUrl?: string
  timezone?: string
}) => call<DeliveryAdmin>('PUT', '/notifications', patch)

/** Genera un secreto nuevo (el anterior deja de servir); se devuelve una sola vez. */
export const adminNewSecret = () =>
  call<DeliveryAdmin & { secret: string }>('POST', '/notifications/secret')

export const adminTestDelivery = () => call<{ ok: true }>('POST', '/notifications/test')

export const adminRetryDelivery = () => call<DeliveryAdmin>('POST', '/notifications/retry')

/** Dirección del flujo de n8n para descargar (JSON, sin secretos). */
export const deliveryWorkflowUrl = () => url('/notifications/workflow')
