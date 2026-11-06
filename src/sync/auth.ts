import { create } from 'zustand'
import { getConfig, isConfigured } from '../lib/config'

export type AuthStatus = 'disabled' | 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: AuthStatus
  userId: string | null
  email: string | null
  /** Nombre para mostrar (alias); vacío = se usa el correo. */
  alias: string
  /** Puede administrar usuarios (el servidor lo vuelve a comprobar en cada petición). */
  isAdmin: boolean
}

/** `disabled` = sin servidor configurado (modo solo local, sin cuenta). */
export const useAuth = create<AuthState>(() => ({
  status: isConfigured() ? 'loading' : 'disabled',
  userId: null,
  email: null,
  alias: '',
  isAdmin: false,
}))

export interface ApiUser {
  id: string
  email: string
  alias?: string
  isAdmin?: boolean
}

export type AuthResult = { ok: true; user: ApiUser } | { ok: false; error: string }

const api = (path: string) => `${getConfig().API_URL}${path}`

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(api(path), {
    method: 'POST',
    credentials: 'same-origin',
    // Sin cuerpo no se declara JSON (el servidor rechazaría un JSON vacío).
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function credentials(
  path: string,
  email: string,
  password: string,
  alias?: string,
): Promise<AuthResult> {
  try {
    const res = await post(path, { email, password, ...(alias ? { alias } : {}) })
    const data = (await res.json().catch(() => ({}))) as { user?: ApiUser; error?: string }
    if (res.ok && data.user) return { ok: true, user: data.user }
    return { ok: false, error: data.error ?? 'error' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export const apiLogin = (email: string, password: string) =>
  credentials('/auth/login', email, password)
export const apiSignup = (email: string, password: string, alias?: string) =>
  credentials('/auth/signup', email, password, alias)

/** Cambia la contraseña. Devuelve el código de error del servidor, `offline`, o null si salió bien. */
export async function apiChangePassword(current: string, next: string): Promise<string | null> {
  try {
    const res = await post('/auth/password', { current, next })
    if (res.ok) return null
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'error'
  } catch {
    return 'offline'
  }
}

/** Cierra la sesión en el servidor. `false` si no se pudo (sin red): la cookie sigue viva. */
export async function apiLogout(): Promise<boolean> {
  try {
    const res = await post('/auth/logout')
    return res.ok || res.status === 401
  } catch {
    return false
  }
}

export type MeResult = { kind: 'user'; user: ApiUser } | { kind: 'anonymous' } | { kind: 'offline' }

/** ¿Hay sesión válida? `offline` = no se pudo preguntar (se puede seguir con la identidad guardada). */
export async function apiMe(): Promise<MeResult> {
  try {
    const res = await fetch(api('/auth/me'), { credentials: 'same-origin' })
    if (res.status === 401) return { kind: 'anonymous' }
    if (!res.ok) return { kind: 'offline' }
    return { kind: 'user', user: ((await res.json()) as { user: ApiUser }).user }
  } catch {
    return { kind: 'offline' }
  }
}

export async function apiAuthConfig(): Promise<{ allowSignup: boolean }> {
  try {
    const res = await fetch(api('/auth/config'))
    return res.ok ? ((await res.json()) as { allowSignup: boolean }) : { allowSignup: false }
  } catch {
    return { allowSignup: false }
  }
}
