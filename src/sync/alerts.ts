import { getConfig } from '../lib/config'

/** Cómo quiere recibir avisos fuera de la app una persona. */
export interface AlertPrefs {
  /** El admin activó la entrega; si no, no hay nada que elegir. */
  available: boolean
  phone: string
  email: boolean
  whatsapp: boolean
  digest: boolean
}

export type AlertResult<T> = { ok: true; data: T } | { ok: false; error: string }

const api = (path: string) => `${getConfig().API_URL}${path}`

export async function getAlertPrefs(): Promise<AlertResult<AlertPrefs>> {
  try {
    const res = await fetch(api('/notifications/channels'), { credentials: 'same-origin' })
    const data = (await res.json().catch(() => ({}))) as AlertPrefs & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'error' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export async function saveAlertPrefs(
  prefs: Omit<AlertPrefs, 'available'>,
): Promise<AlertResult<AlertPrefs>> {
  try {
    const res = await fetch(api('/me/notifications'), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    const data = (await res.json().catch(() => ({}))) as AlertPrefs & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'error' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}
