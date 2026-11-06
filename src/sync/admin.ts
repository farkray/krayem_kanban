import { getConfig } from '../lib/config'

export interface AdminUser {
  id: string
  email: string
  createdAt: string
  isAdmin: boolean
  rows: number
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string }

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
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'error' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export const adminListUsers = () => call<{ users: AdminUser[] }>('GET', '/users')

/** Sin `password` el servidor genera una temporal y la devuelve (solo esta vez). */
export const adminCreateUser = (email: string, password?: string) =>
  call<{ user: AdminUser; password?: string }>('POST', '/users', { email, password })

export const adminResetPassword = (id: string) =>
  call<{ password: string }>('POST', `/users/${encodeURIComponent(id)}/password`)

export const adminDeleteUser = (id: string) =>
  call<void>('DELETE', `/users/${encodeURIComponent(id)}`)
