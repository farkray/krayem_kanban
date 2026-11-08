import { db, type OutboxEntry } from '../db/db'
import { TABLE_KEYS, type Attachment, type Data, type TableKey } from '../lib/types'
import { flush as flushLocalWrites, setWriteListener, useStore } from '../store/store'
import { setSync } from './status'

type Row = Data[TableKey][number]

/** Puerto hacia la nube. Las filas ya están en forma local (camelCase). */
export interface Remote {
  fetchSince(table: TableKey, cursor: string | null, limit: number): Promise<Row[]>
  upsert(table: TableKey, rows: Row[]): Promise<void>
  /** Sube el archivo de una imagen (Storage). */
  uploadBlob(attachment: Attachment, blob: Blob): Promise<void>
  /** Descarga el archivo de una imagen subida desde otro dispositivo. */
  downloadBlob(attachment: Attachment): Promise<Blob>
  /** Cambios en vivo. `onReconnect` se llama al (re)conectar para ponerse al día. */
  subscribe(
    onRow: (table: TableKey, row: Row) => void,
    onReconnect: () => void,
    /** Cambió quién ve qué (me compartieron o dejaron de compartirme un tablero). */
    onAccess?: () => void,
    /** Llegó una notificación nueva (centro de notificaciones). */
    onNotification?: (notification: unknown, unread: number) => void,
  ): () => void
}

export interface EngineOptions {
  debounceMs?: number
  retryBaseMs?: number
  retryMaxMs?: number
  pageSize?: number
  chunkSize?: number
  /** Tras la primera descarga (p. ej. sembrar el tablero inicial). */
  onPulled?: () => Promise<void> | void
  /** El servidor avisa de cambios de acceso: hay que refrescar permisos y descargar. */
  onAccess?: () => Promise<void> | void
  /** Llegó un aviso en vivo al centro de notificaciones. */
  onNotification?: (notification: unknown, unread: number) => void
  /** El canal en vivo se (re)conectó: conviene volver a pedir lo que pudo perderse. */
  onReconnect?: () => void
}

export interface Engine {
  start(): Promise<void>
  stop(): void
  /** Envía todo el outbox ahora. Resuelve cuando termina (o falla; el error queda en el estado). */
  flush(): Promise<void>
  /** Programa un envío con debounce. */
  schedule(): void
  pull(): Promise<void>
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function createEngine(remote: Remote, opts: EngineOptions = {}): Engine {
  const debounceMs = opts.debounceMs ?? 800
  const retryBase = opts.retryBaseMs ?? 2000
  const retryMax = opts.retryMaxMs ?? 60_000
  const pageSize = opts.pageSize ?? 1000
  const chunkSize = opts.chunkSize ?? 200

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = retryBase
  let flushing: Promise<void> | null = null
  let again = false
  let unsubscribe: (() => void) | null = null
  let stopped = false
  const cleanups: Array<() => void> = []

  const refreshPending = async () => setSync({ pending: await db.outbox.count() })

  /* ---------- descarga ---------- */

  /** Aplica filas remotas salvo las que tienen cambios locales pendientes (lo local gana hasta enviarse). */
  async function applyRows(table: TableKey, rows: Row[]) {
    if (rows.length === 0) return
    const pending = new Set(
      (await db.outbox.where('table').equals(table).toArray()).map((e) => e.id),
    )
    const fresh = rows.filter((r) => !pending.has(r.id))
    if (fresh.length) useStore.getState().applyRemote(table, fresh as never)
  }

  async function pullTable(table: TableKey) {
    const metaKey = `cursor:${table}`
    let cursor = ((await db.meta.get(metaKey))?.value as string | undefined) ?? null
    for (;;) {
      const rows = await remote.fetchSince(table, cursor, pageSize)
      await applyRows(table, rows)
      const last = rows.reduce<string | null>(
        (max, r) => (max === null || r.updatedAt > max ? r.updatedAt : max),
        null,
      )
      if (last) {
        const advanced = last !== cursor
        cursor = last
        await db.meta.put({ key: metaKey, value: cursor })
        // gte repite la última fila: si la página no avanzó, se terminó.
        if (rows.length >= pageSize && advanced) continue
      }
      break
    }
  }

  async function pull() {
    for (const table of TABLE_KEYS) await pullTable(table)
    await flushLocalWrites()
  }

  /* ---------- envío ---------- */

  /** Los archivos suben antes que su fila: así nunca existe un adjunto sin archivo en la nube. */
  async function uploadPendingBlobs(rows: Attachment[]) {
    for (const att of rows) {
      if (att.deletedAt) continue
      const row = await db.blobs.get(att.id)
      if (!row || row.uploaded) continue
      await remote.uploadBlob(att, row.blob)
      await db.blobs.update(att.id, { uploaded: true })
    }
  }

  async function runFlush(): Promise<void> {
    await flushLocalWrites() // las escrituras locales ya deben estar en IndexedDB
    for (;;) {
      if (!navigator.onLine) {
        setSync({ online: false })
        await refreshPending()
        return
      }
      const entries = await db.outbox.toArray()
      setSync({ pending: entries.length })
      if (entries.length === 0) {
        retryDelay = retryBase
        setSync({ error: null })
        return
      }
      setSync({ syncing: true })

      const byTable = new Map<TableKey, OutboxEntry[]>()
      for (const e of entries) byTable.set(e.table, [...(byTable.get(e.table) ?? []), e])

      // En orden de dependencias (tableros → columnas → tarjetas → ítems/comentarios).
      for (const table of TABLE_KEYS) {
        const group = byTable.get(table) ?? []
        for (let i = 0; i < group.length; i += chunkSize) {
          const chunk = group.slice(i, i + chunkSize)
          const rows = (await db.table(table).bulkGet(chunk.map((e) => e.id))).filter(Boolean)
          if (table === 'attachments') await uploadPendingBlobs(rows as Attachment[])
          if (rows.length) await remote.upsert(table, rows as Row[])
          // Solo se quita la entrada si nadie la reescribió mientras se enviaba.
          await db.transaction('rw', db.outbox, async () => {
            for (const e of chunk) {
              if ((await db.outbox.get(e.key))?.v === e.v) await db.outbox.delete(e.key)
            }
          })
        }
      }
    }
  }

  function flush(): Promise<void> {
    if (flushing) {
      again = true
      return flushing
    }
    flushing = runFlush()
      .catch(async (e) => {
        setSync({ error: errMsg(e) })
        await refreshPending()
        scheduleRetry()
      })
      .finally(() => {
        flushing = null
        setSync({ syncing: false })
        if (again && !stopped) {
          again = false
          void flush()
        }
      })
    return flushing
  }

  function scheduleRetry() {
    if (stopped || retryTimer) return
    const delay = retryDelay
    retryDelay = Math.min(retryDelay * 2, retryMax)
    retryTimer = setTimeout(() => {
      retryTimer = null
      void pull()
        .catch((e) => setSync({ error: errMsg(e) }))
        .then(() => flush())
    }, delay)
  }

  function schedule() {
    if (stopped) return
    void refreshPending()
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void flush()
    }, debounceMs)
  }

  /* ---------- ciclo de vida ---------- */

  async function start() {
    stopped = false
    setSync({ enabled: true, online: navigator.onLine })
    await refreshPending()

    try {
      await pull()
      await opts.onPulled?.()
    } catch (e) {
      setSync({ error: errMsg(e) })
      scheduleRetry()
    }
    await flush()

    setWriteListener(schedule)
    unsubscribe = remote.subscribe(
      (table, row) => {
        void applyRows(table, [row])
      },
      () => {
        void pull().catch((e) => setSync({ error: errMsg(e) }))
        opts.onReconnect?.()
      },
      () => {
        void Promise.resolve(opts.onAccess?.()).catch((e) => setSync({ error: errMsg(e) }))
      },
      (notification, unread) => opts.onNotification?.(notification, unread),
    )

    const onOnline = () => {
      setSync({ online: true })
      void flush()
    }
    const onOffline = () => setSync({ online: false })
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onHidden)
    cleanups.push(
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onHidden),
    )
  }

  function stop() {
    stopped = true
    setWriteListener(null)
    if (debounceTimer) clearTimeout(debounceTimer)
    if (retryTimer) clearTimeout(retryTimer)
    debounceTimer = retryTimer = null
    unsubscribe?.()
    unsubscribe = null
    for (const c of cleanups.splice(0)) c()
    setSync({ enabled: false, syncing: false, error: null })
  }

  return { start, stop, flush, schedule, pull }
}
