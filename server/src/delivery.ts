import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { StatementSync } from 'node:sqlite'
import type { DB } from './db.ts'

/** Espera antes de cada reintento (el primero es el envío inicial). */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1
export const SEND_TIMEOUT_MS = 8_000
const KEEP_SENT_DAYS = 14

export type Channel = 'email' | 'whatsapp'

export interface DeliverySettings {
  enabled: boolean
  url: string
  /** Hay un secreto guardado (nunca se devuelve su valor, salvo al crearlo). */
  hasSecret: boolean
  /** Dirección pública del kanban, para los enlaces de los avisos. */
  publicUrl: string
  /** Zona horaria para "hoy" en el resumen diario. */
  timezone: string
}

export interface UserChannels {
  phone: string
  email: boolean
  whatsapp: boolean
  digest: boolean
}

/** Teléfono internacional: +, código de país y número (8 a 15 dígitos en total). Vacío = sin teléfono. */
export const cleanPhone = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') return null
  const t = raw.replace(/[\s().-]/g, '')
  if (t === '') return ''
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null
}

export const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** URL http(s) válida y sin credenciales incrustadas; si no, null. */
export function cleanWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (t.length === 0 || t.length > 500) return null
  try {
    const u = new URL(t)
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

export interface DeliveryPayload {
  event: 'notification' | 'test'
  version: 1
  id: string
  type: string
  recipient: { id: string; name: string; email: string; phone: string }
  channels: Channel[]
  actor: string
  board: { id: string; title: string } | null
  card: { id: string; title: string } | null
  excerpt: string
  count: number
  url: string
  createdAt: string
}

type Fetch = typeof fetch

/** Lo que hace falta de un aviso para enviarlo (también sirve para la prueba del admin). */
export interface Alert {
  id: string
  type: string
  boardId: string
  cardId: string | null
  title: string
  excerpt: string
  count: number
  actorName: string
  createdAt: string
}

export class Delivery {
  private db: DB
  private fetchImpl: Fetch
  private getSetting: StatementSync
  private putSetting: StatementSync
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(db: DB, fetchImpl: Fetch = fetch) {
    this.db = db
    this.fetchImpl = fetchImpl
    this.getSetting = db.prepare('SELECT value FROM settings WHERE key = ?')
    this.putSetting = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    )
  }

  private read(key: string, fallback = ''): string {
    return (this.getSetting.get(key) as { value: string } | undefined)?.value ?? fallback
  }

  settings(): DeliverySettings {
    return {
      enabled: this.read('webhook_enabled') === '1' && !!this.read('webhook_url'),
      url: this.read('webhook_url'),
      hasSecret: !!this.read('webhook_secret'),
      publicUrl: this.read('public_url'),
      timezone: this.read('timezone', 'America/Mexico_City'),
    }
  }

  save(patch: { enabled?: boolean; url?: string; publicUrl?: string; timezone?: string }) {
    if (patch.url !== undefined) this.putSetting.run('webhook_url', patch.url)
    if (patch.enabled !== undefined)
      this.putSetting.run('webhook_enabled', patch.enabled ? '1' : '0')
    if (patch.publicUrl !== undefined) this.putSetting.run('public_url', patch.publicUrl)
    if (patch.timezone !== undefined) this.putSetting.run('timezone', patch.timezone)
  }

  /** Genera un secreto nuevo y lo guarda; solo se devuelve aquí, una vez. */
  rotateSecret(): string {
    const secret = randomBytes(32).toString('base64url')
    this.putSetting.run('webhook_secret', secret)
    return secret
  }

  /** ¿Coincide el token con el secreto guardado? (comparación de tiempo constante) */
  checkSecret(token: string): boolean {
    const secret = this.read('webhook_secret')
    if (!secret || !token) return false
    const a = Buffer.from(token)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /* ---------- canales de cada usuario ---------- */

  channelsOf(userId: string): UserChannels | null {
    const r = this.db
      .prepare('SELECT phone, notify_email, notify_whatsapp, notify_digest FROM users WHERE id = ?')
      .get(userId) as
      | { phone: string; notify_email: number; notify_whatsapp: number; notify_digest: number }
      | undefined
    if (!r) return null
    return {
      phone: r.phone,
      email: r.notify_email === 1,
      whatsapp: r.notify_whatsapp === 1,
      digest: r.notify_digest === 1,
    }
  }

  setChannels(userId: string, c: UserChannels) {
    this.db
      .prepare(
        'UPDATE users SET phone = ?, notify_email = ?, notify_whatsapp = ?, notify_digest = ? WHERE id = ?',
      )
      .run(c.phone, c.email ? 1 : 0, c.whatsapp ? 1 : 0, c.digest ? 1 : 0, userId)
  }

  /** Canales efectivos: WhatsApp exige teléfono. */
  activeChannels(c: UserChannels): Channel[] {
    const out: Channel[] = []
    if (c.email) out.push('email')
    if (c.whatsapp && c.phone) out.push('whatsapp')
    return out
  }

  recipient(userId: string) {
    const u = this.db
      .prepare('SELECT id, email, alias, phone FROM users WHERE id = ?')
      .get(userId) as { id: string; email: string; alias: string; phone: string } | undefined
    return u ? { id: u.id, name: u.alias || u.email, email: u.email, phone: u.phone } : null
  }

  /* ---------- cola ---------- */

  boardUrl(boardId: string | null): string {
    const base = this.read('public_url').replace(/\/+$/, '')
    return base ? (boardId ? `${base}/b/${encodeURIComponent(boardId)}` : base) : ''
  }

  buildPayload(
    n: Alert,
    userId: string,
    event: DeliveryPayload['event'] = 'notification',
    channels?: Channel[],
  ): DeliveryPayload | null {
    const recipient = this.recipient(userId)
    const prefs = this.channelsOf(userId)
    if (!recipient || !prefs) return null
    const active = channels ?? this.activeChannels(prefs)
    return {
      event,
      version: 1,
      id: n.id,
      type: n.type,
      recipient,
      channels: active,
      actor: n.actorName,
      board: n.boardId ? { id: n.boardId, title: '' } : null,
      card: n.cardId ? { id: n.cardId, title: n.title } : null,
      excerpt: n.excerpt,
      count: n.count,
      url: this.boardUrl(n.boardId),
      createdAt: n.createdAt,
    }
  }

  /**
   * Encola el aviso si el webhook está activo y la persona eligió algún canal. Va **un envío por
   * canal** (cada uno con `channels` de un solo elemento): así, si n8n falla en uno, el reintento
   * no repite el otro. Los avisos fundidos (count > 1) ya se enviaron al crearse.
   */
  enqueue(n: Alert, userId: string, boardTitle = ''): boolean {
    if (n.count > 1 || !this.settings().enabled) return false
    const all = this.buildPayload(n, userId)
    if (!all || all.channels.length === 0) return false
    if (all.board) all.board.title = boardTitle
    const now = new Date().toISOString()
    const insert = this.db.prepare(
      'INSERT INTO outbox (id, user_id, payload, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    for (const channel of all.channels)
      insert.run(randomUUID(), userId, JSON.stringify({ ...all, channels: [channel] }), now, now)
    return true
  }

  /** Un envío HTTP al webhook. Devuelve null si salió bien, o el motivo del fallo. */
  async post(payload: object): Promise<string | null> {
    const url = this.read('webhook_url')
    const secret = this.read('webhook_secret')
    if (!url) return 'Falta la URL del webhook.'
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'kanban-notifications/1',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        redirect: 'error',
      })
      return res.ok ? null : `El webhook respondió ${res.status}.`
    } catch (e) {
      const name = (e as Error).name
      return name === 'TimeoutError' || name === 'AbortError'
        ? 'El webhook no respondió a tiempo.'
        : `No se pudo conectar con el webhook: ${(e as Error).message}`.slice(0, 200)
    }
  }

  /** Envía lo que ya toca. Devuelve cuántos salieron bien. */
  async flush(now = new Date()): Promise<number> {
    if (this.running || !this.settings().enabled) return 0
    this.running = true
    let sent = 0
    try {
      const due = this.db
        .prepare(
          `SELECT id, payload, attempts FROM outbox
           WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 20`,
        )
        .all(now.toISOString()) as { id: string; payload: string; attempts: number }[]
      for (const row of due) {
        const error = await this.post(JSON.parse(row.payload))
        const attempts = row.attempts + 1
        if (!error) {
          this.db
            .prepare(
              "UPDATE outbox SET status = 'sent', attempts = ?, sent_at = ?, last_error = '' WHERE id = ?",
            )
            .run(attempts, new Date().toISOString(), row.id)
          sent++
        } else if (attempts >= MAX_ATTEMPTS) {
          this.db
            .prepare(
              "UPDATE outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?",
            )
            .run(attempts, error, row.id)
        } else {
          const next = new Date(Date.now() + BACKOFF_MS[attempts - 1]).toISOString()
          this.db
            .prepare(
              'UPDATE outbox SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?',
            )
            .run(attempts, error, next, row.id)
        }
      }
    } finally {
      this.running = false
    }
    return sent
  }

  stats(): { pending: number; sent: number; failed: number; lastError: string } {
    const count = (status: string) =>
      (
        this.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE status = ?').get(status) as {
          n: number
        }
      ).n
    const last = this.db
      .prepare(
        "SELECT last_error FROM outbox WHERE last_error <> '' ORDER BY created_at DESC LIMIT 1",
      )
      .get() as { last_error: string } | undefined
    return {
      pending: count('pending'),
      sent: count('sent'),
      failed: count('failed'),
      lastError: last?.last_error ?? '',
    }
  }

  /** Vuelve a intentar lo que falló del todo (botón del admin). */
  retryFailed(): number {
    return Number(
      this.db
        .prepare(
          "UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = ? WHERE status = 'failed'",
        )
        .run(new Date().toISOString()).changes,
    )
  }

  purge(now = new Date()): number {
    const limit = new Date(now.getTime() - KEEP_SENT_DAYS * 86_400_000).toISOString()
    return Number(
      this.db.prepare("DELETE FROM outbox WHERE status <> 'pending' AND created_at < ?").run(limit)
        .changes,
    )
  }

  start(intervalMs = 10_000) {
    this.timer = setInterval(() => void this.flush(), intervalMs)
    this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
