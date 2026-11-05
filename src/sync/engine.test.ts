import { db } from '../db/db'
import type { Attachment, Data, TableKey } from '../lib/types'
import { loadBlob, setBlobFetcher } from './blobs'
import { flush as flushWrites, resetStore, useStore } from '../store/store'
import { createEngine, type Engine, type Remote } from './engine'
import { setSync, syncLabel, useSync } from './status'

type Row = Data[TableKey][number]

class FakeRemote implements Remote {
  rows: Record<TableKey, Map<string, Row>> = {
    boards: new Map(),
    labels: new Map(),
    columns: new Map(),
    cards: new Map(),
    attachments: new Map(),
    items: new Map(),
    comments: new Map(),
  }
  upserts: TableKey[] = []
  blobs = new Map<string, Blob>()
  events: string[] = []
  failUpload = false
  fetches: Array<{ table: TableKey; cursor: string | null }> = []
  fail = false
  gate: Promise<void> | null = null
  onUpsert: (() => void) | null = null
  rowCb: ((t: TableKey, r: Row) => void) | null = null
  reconnect: (() => void) | null = null
  private clock = 0

  tick() {
    return new Date(Date.UTC(2026, 10, 3, 12, 0, this.clock++)).toISOString()
  }
  seed(table: TableKey, row: Row) {
    this.rows[table].set(row.id, { ...row, updatedAt: this.tick() })
  }
  async fetchSince(table: TableKey, cursor: string | null) {
    this.fetches.push({ table, cursor })
    return [...this.rows[table].values()].filter((r) => !cursor || r.updatedAt >= cursor)
  }
  async uploadBlob(att: Attachment, blob: Blob) {
    this.events.push(`blob:${att.id}`)
    if (this.failUpload) throw new Error('storage caído')
    this.blobs.set(att.path, blob)
  }
  async downloadBlob(att: Attachment) {
    const b = this.blobs.get(att.path)
    if (!b) throw new Error('no existe')
    return b
  }
  async upsert(table: TableKey, rows: Row[]) {
    this.upserts.push(table)
    this.events.push(`row:${table}`)
    this.onUpsert?.()
    if (this.gate) await this.gate
    if (this.fail) throw new Error('boom')
    for (const r of rows) this.rows[table].set(r.id, { ...r, updatedAt: this.tick() })
  }
  subscribe(onRow: (t: TableKey, r: Row) => void, onReconnect: () => void) {
    this.rowCb = onRow
    this.reconnect = onReconnect
    return () => {
      this.rowCb = null
    }
  }
}

const S = () => useStore.getState()
let remote: FakeRemote
let engine: Engine

const make = (opts = {}) =>
  (engine = createEngine(remote, { debounceMs: 5, retryBaseMs: 60_000, ...opts }))

beforeEach(async () => {
  await resetStore()
  setSync({ enabled: false, pending: 0, syncing: false, error: null, online: true })
  remote = new FakeRemote()
})

afterEach(() => engine?.stop())

describe('envío (outbox)', () => {
  it('envía en orden de dependencias y vacía el outbox', async () => {
    make()
    S().createBoard('X')
    await flushWrites()
    expect(await db.outbox.count()).toBe(4) // 1 tablero + 3 columnas
    await engine.flush()
    expect(await db.outbox.count()).toBe(0)
    expect(remote.rows.boards.size).toBe(1)
    expect(remote.rows.columns.size).toBe(3)
    expect(remote.upserts).toEqual(['boards', 'columns'])
    expect(useSync.getState().pending).toBe(0)
  })

  it('deduplica: varias ediciones de una fila = una entrada', async () => {
    make()
    const id = S().createBoard('A')!
    S().renameBoard(id, 'B')
    S().renameBoard(id, 'C')
    await flushWrites()
    expect(await db.outbox.where('table').equals('boards').count()).toBe(1)
    await engine.flush()
    expect((remote.rows.boards.get(id) as { title: string }).title).toBe('C')
  })

  it('si falla conserva el outbox, muestra error y se recupera', async () => {
    make()
    S().createBoard('X')
    await flushWrites()
    remote.fail = true
    await engine.flush()
    expect(await db.outbox.count()).toBe(4)
    expect(useSync.getState().error).toBe('boom')
    remote.fail = false
    await engine.flush()
    expect(await db.outbox.count()).toBe(0)
    expect(useSync.getState().error).toBeNull()
  })

  it('una edición hecha durante el envío no se pierde', async () => {
    make()
    const id = S().createBoard('A')!
    await flushWrites()
    let release!: () => void
    remote.gate = new Promise((r) => (release = r))
    const started = new Promise<void>((r) => (remote.onUpsert = r))
    const sending = engine.flush()
    await started
    S().renameBoard(id, 'Editado mientras se enviaba')
    await flushWrites()
    remote.gate = null
    release()
    await sending
    expect(await db.outbox.count()).toBe(0)
    expect((remote.rows.boards.get(id) as { title: string }).title).toBe(
      'Editado mientras se enviaba',
    )
  })

  it('un borrado lógico y su deshacer llegan a la nube', async () => {
    make()
    const id = S().createBoard('X')!
    await engine.flush()
    S().deleteBoard(id)
    await engine.flush()
    expect((remote.rows.boards.get(id) as { deletedAt?: string }).deletedAt).toBeTruthy()
    S().toast!.undo!()
    await engine.flush()
    expect((remote.rows.boards.get(id) as { deletedAt?: string }).deletedAt).toBeUndefined()
  })

  it('el debounce envía solo tras escribir', async () => {
    make()
    await engine.start()
    S().createBoard('Auto')
    await vi.waitFor(() => expect(remote.rows.boards.size).toBe(1))
    await vi.waitFor(() => expect(useSync.getState().pending).toBe(0))
  })
})

describe('descarga (pull) y tiempo real', () => {
  const remoteBoard = (id: string, title: string): Row => ({
    id,
    title,
    position: 'a0',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  })

  it('aplica filas remotas y avanza el cursor', async () => {
    make()
    remote.seed('boards', remoteBoard('r1', 'Remoto'))
    await engine.pull()
    expect(S().boards.map((b) => b.title)).toEqual(['Remoto'])
    const cursor = (await db.meta.get('cursor:boards'))!.value as string
    await engine.pull()
    expect(remote.fetches.at(-7)).toMatchObject({ table: 'boards', cursor })
  })

  it('no pisa filas con cambios locales pendientes', async () => {
    make()
    const id = S().createBoard('Local')!
    await flushWrites()
    remote.seed('boards', remoteBoard(id, 'Remoto'))
    await engine.pull()
    expect(S().boards.find((b) => b.id === id)?.title).toBe('Local')
    await engine.flush() // lo local gana al enviarse (último en escribir)
    expect((remote.rows.boards.get(id) as { title: string }).title).toBe('Local')
  })

  it('realtime: aplica cambios remotos y respeta pendientes', async () => {
    make()
    await engine.start()
    remote.rowCb!('boards', remoteBoard('live1', 'En vivo'))
    await vi.waitFor(() => expect(S().boards.some((b) => b.title === 'En vivo')).toBe(true))
    remote.rowCb!('boards', {
      ...remoteBoard('live1', 'Editado'),
      updatedAt: '2026-11-02T00:00:00.000Z',
    })
    await vi.waitFor(() => expect(S().boards.find((b) => b.id === 'live1')?.title).toBe('Editado'))
  })

  it('al reconectar se pone al día', async () => {
    make()
    await engine.start()
    remote.seed('boards', remoteBoard('late', 'Perdido'))
    remote.reconnect!()
    await vi.waitFor(() => expect(S().boards.some((b) => b.id === 'late')).toBe(true))
  })
})

describe('arranque', () => {
  it('primer inicio con nube vacía: siembra el tablero inicial y lo sube', async () => {
    make({ onPulled: () => S().seedIfEmpty() })
    await engine.start()
    expect(S().boards.map((b) => b.title)).toEqual(['Mi tablero'])
    await vi.waitFor(() => expect(remote.rows.boards.size).toBe(1))
    expect(remote.rows.columns.size).toBe(3)
  })

  it('con datos en la nube no siembra otro tablero', async () => {
    make({ onPulled: () => S().seedIfEmpty() })
    remote.seed('boards', {
      id: 'x',
      title: 'Mío',
      position: 'a0',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    })
    await engine.start()
    expect(S().boards.map((b) => b.title)).toEqual(['Mío'])
  })

  it('sube datos locales previos al iniciar sesión (migración inicial)', async () => {
    S().createBoard('Antes de entrar')
    await flushWrites()
    make()
    await engine.start()
    expect([...remote.rows.boards.values()].map((b) => (b as { title: string }).title)).toEqual([
      'Antes de entrar',
    ])
  })
})

describe('imágenes (archivos)', () => {
  const meta = {
    name: 'a.png',
    mime: 'image/webp',
    sizeOriginal: 1000,
    sizeCompressed: 100,
    width: 10,
    height: 10,
  }
  const setup = async () => {
    const b = S().createBoard('X')!
    const col = S().columns.find((c) => c.boardId === b)!.id
    const card = S().addCard(col, 'T')!
    const id = S().addAttachment(card, meta, new Blob(['pixels'], { type: 'image/webp' }))!
    await flushWrites()
    return id
  }

  it('sube el archivo antes que su fila y lo marca como subido', async () => {
    make()
    const id = await setup()
    await engine.flush()
    expect(remote.events.indexOf(`blob:${id}`)).toBeLessThan(
      remote.events.indexOf('row:attachments'),
    )
    expect(remote.blobs.has(`${id}.webp`)).toBe(true)
    expect((await db.blobs.get(id))?.uploaded).toBe(true)
    expect(await db.outbox.count()).toBe(0)
  })

  it('si falla la subida, conserva fila y archivo pendientes y reintenta', async () => {
    make()
    const id = await setup()
    remote.failUpload = true
    await engine.flush()
    expect(remote.rows.attachments.size).toBe(0)
    expect((await db.blobs.get(id))?.uploaded).toBe(false)
    expect(await db.outbox.where('table').equals('attachments').count()).toBe(1)
    remote.failUpload = false
    await engine.flush()
    expect(remote.rows.attachments.size).toBe(1)
    expect((await db.blobs.get(id))?.uploaded).toBe(true)
  })

  it('no sube dos veces un archivo ya subido', async () => {
    make()
    const id = await setup()
    await engine.flush()
    remote.events.length = 0
    S().deleteAttachment(id)
    S().toast!.undo!()
    await engine.flush()
    expect(remote.events).not.toContain(`blob:${id}`)
  })

  it('loadBlob: usa el local; si falta, lo baja de la nube y lo guarda', async () => {
    const att = {
      id: 'z1',
      cardId: 'c',
      name: 'n',
      path: 'z1.webp',
      mime: 'image/webp',
      sizeOriginal: 1,
      sizeCompressed: 1,
      width: 1,
      height: 1,
      createdAt: 't',
      updatedAt: 't',
    }
    expect(await loadBlob(att)).toBeNull() // sin local ni fetcher
    const remoteBlob = new Blob(['r'])
    setBlobFetcher(async () => remoteBlob)
    expect(await loadBlob(att)).toBe(remoteBlob)
    setBlobFetcher(async () => {
      throw new Error('no debería llamarse')
    })
    expect(await loadBlob(att)).not.toBeNull() // ya guardado: no llama al fetcher (lanzaría)
    expect((await db.blobs.get('z1'))?.uploaded).toBe(true)
    setBlobFetcher(null)
  })
})

describe('syncLabel', () => {
  const base = { enabled: true, online: true, pending: 0, syncing: false, error: null }
  it('estados', () => {
    expect(syncLabel({ ...base, enabled: false })).toBeNull()
    expect(syncLabel(base)).toBe('Guardado')
    expect(syncLabel({ ...base, pending: 2 })).toBe('Guardando…')
    expect(syncLabel({ ...base, syncing: true })).toBe('Guardando…')
    expect(syncLabel({ ...base, online: false })).toBe('Sin conexión')
    expect(syncLabel({ ...base, online: false, pending: 1 })).toBe(
      'Sin conexión · 1 cambio pendiente',
    )
    expect(syncLabel({ ...base, online: false, pending: 3 })).toBe(
      'Sin conexión · 3 cambios pendientes',
    )
    expect(syncLabel({ ...base, error: 'x' })).toBe('Error al guardar · reintentando')
  })
})
