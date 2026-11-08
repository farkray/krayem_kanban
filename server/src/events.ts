import type { ServerResponse } from 'node:http'

interface Sub {
  res: ServerResponse
  clientId: string
}

/** Difunde cambios (SSE) a los demás dispositivos/pestañas del mismo usuario. */
export class Hub {
  private subs = new Map<string, Set<Sub>>()

  add(userId: string, sub: Sub): () => void {
    let set = this.subs.get(userId)
    if (!set) this.subs.set(userId, (set = new Set()))
    const mine = set
    mine.add(sub)
    return () => {
      mine.delete(sub)
      if (mine.size === 0) this.subs.delete(userId)
    }
  }

  publish(userId: string, table: string, row: unknown, exceptClientId?: string) {
    const payload = `event: row\ndata: ${JSON.stringify({ table, row })}\n\n`
    for (const sub of this.subs.get(userId) ?? []) {
      if (sub.clientId !== exceptClientId) sub.res.write(payload)
    }
  }

  /** Aviso de que cambió quién ve qué (alta/baja de miembros): el cliente refresca y descarga. */
  publishAccess(userId: string) {
    for (const sub of this.subs.get(userId) ?? []) sub.res.write('event: access\ndata: {}\n\n')
  }

  /** Una notificación nueva (o actualizada) para este usuario, en todos sus dispositivos. */
  publishNotification(userId: string, notification: unknown, unread: number) {
    const payload = `event: notification\ndata: ${JSON.stringify({ notification, unread })}\n\n`
    for (const sub of this.subs.get(userId) ?? []) sub.res.write(payload)
  }

  ping() {
    for (const set of this.subs.values()) for (const s of set) s.res.write(': ping\n\n')
  }

  closeAll() {
    for (const set of this.subs.values()) for (const s of set) s.res.end()
    this.subs.clear()
  }
}
