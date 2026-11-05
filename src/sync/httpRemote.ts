import type { Attachment, TableKey } from '../lib/types'
import type { Remote } from './engine'

/** La sesión ya no es válida (cookie vencida o cerrada en otro lado). */
export class AuthError extends Error {}

/**
 * Cliente de la API propia (mismo origen, cookie de sesión HttpOnly).
 * `onUnauthorized` se llama ante un 401 para que la app pida iniciar sesión de nuevo.
 */
export function createHttpRemote(
  apiUrl: string,
  clientId: string,
  onUnauthorized: () => void,
): Remote {
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${apiUrl}${path}`, { credentials: 'same-origin', ...init })
    if (res.status === 401) {
      onUnauthorized()
      throw new AuthError('Sesión vencida')
    }
    if (!res.ok) throw new Error(`Error ${res.status} del servidor`)
    return res
  }

  return {
    async fetchSince(table, cursor, limit) {
      const q = new URLSearchParams({ limit: String(limit) })
      if (cursor) q.set('since', cursor)
      const res = await request(`/sync/${table}?${q}`)
      return ((await res.json()) as { rows: never[] }).rows
    },

    async upsert(table, rows) {
      await request(`/sync/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId },
        body: JSON.stringify({ rows }),
      })
    },

    async uploadBlob(att: Attachment, blob: Blob) {
      await request(`/blobs/${encodeURIComponent(att.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || att.mime },
        body: blob,
      })
    },

    async downloadBlob(att: Attachment) {
      const res = await request(`/blobs/${encodeURIComponent(att.id)}`)
      return res.blob()
    },

    subscribe(onRow, onReconnect) {
      // EventSource reconecta solo; cada (re)conexión dispara una descarga para ponerse al día.
      const es = new EventSource(`${apiUrl}/events?client=${encodeURIComponent(clientId)}`)
      es.addEventListener('ready', () => onReconnect())
      es.addEventListener('row', (e) => {
        const { table, row } = JSON.parse((e as MessageEvent<string>).data) as {
          table: TableKey
          row: never
        }
        onRow(table, row)
      })
      return () => es.close()
    },
  }
}
