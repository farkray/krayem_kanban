import { AuthError, createHttpRemote } from './httpRemote'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
const onUnauthorized = vi.fn()
const remote = () => createHttpRemote('/api', 'client-1', onUnauthorized)

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  onUnauthorized.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('createHttpRemote', () => {
  it('fetchSince: pide desde el cursor con límite y devuelve las filas', async () => {
    fetchMock.mockResolvedValue(json({ rows: [{ id: 'a' }] }))
    const rows = await remote().fetchSince('boards', '2026-11-01T00:00:00.000Z', 500)
    expect(rows).toEqual([{ id: 'a' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sync/boards?limit=500&since=2026-11-01T00%3A00%3A00.000Z')
    expect(init.credentials).toBe('same-origin')
  })

  it('fetchSince sin cursor no manda since', async () => {
    fetchMock.mockResolvedValue(json({ rows: [] }))
    await remote().fetchSince('cards', null, 10)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sync/cards?limit=10')
  })

  it('upsert: POST JSON con el id de cliente (para no recibir su propio eco)', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }))
    await remote().upsert('cards', [{ id: 'c1' } as never])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sync/cards')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Client-Id']).toBe('client-1')
    expect(JSON.parse(init.body)).toEqual({ rows: [{ id: 'c1' }] })
  })

  it('401 avisa a la app y lanza AuthError', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401))
    await expect(remote().upsert('boards', [{ id: 'x' } as never])).rejects.toBeInstanceOf(
      AuthError,
    )
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('otros errores HTTP lanzan Error sin cerrar la sesión', async () => {
    fetchMock.mockResolvedValue(json({ error: 'internal' }, 500))
    await expect(remote().fetchSince('boards', null, 1)).rejects.toThrow('500')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('uploadBlob: PUT con el contenido y su tipo', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const blob = new Blob(['x'], { type: 'image/webp' })
    await remote().uploadBlob({ id: 'a/1', mime: 'image/webp' } as never, blob)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/blobs/a%2F1')
    expect(init.method).toBe('PUT')
    expect(init.headers['Content-Type']).toBe('image/webp')
    expect(init.body).toBe(blob)
  })

  it('downloadBlob devuelve el Blob', async () => {
    fetchMock.mockResolvedValue(new Response('pix', { headers: { 'Content-Type': 'image/png' } }))
    const blob = await remote().downloadBlob({ id: 'a1' } as never)
    expect(blob.size).toBe(3)
  })

  it('subscribe: reenvía eventos, avisa al conectar y se cierra', () => {
    type Handler = (e: unknown) => void
    const listeners: Record<string, Handler> = {}
    const close = vi.fn()
    vi.stubGlobal(
      'EventSource',
      vi.fn(function (this: unknown, url: string) {
        expect(url).toBe('/api/events?client=client-1')
        Object.assign(this as object, {
          addEventListener: (n: string, h: Handler) => (listeners[n] = h),
          close,
        })
      }),
    )
    const onRow = vi.fn()
    const onReconnect = vi.fn()
    const unsub = remote().subscribe(onRow, onReconnect)
    listeners.ready({})
    expect(onReconnect).toHaveBeenCalledOnce()
    listeners.row({ data: JSON.stringify({ table: 'boards', row: { id: 'b1' } }) })
    expect(onRow).toHaveBeenCalledWith('boards', { id: 'b1' })
    unsub()
    expect(close).toHaveBeenCalled()
  })
})
