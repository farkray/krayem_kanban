import { vi } from 'vitest'
import {
  markAllRead,
  markCardRead,
  markRead,
  receiveNotification,
  refreshNotifications,
  resetNotifications,
  useNotifications,
  type AppNotification,
} from './notifications'

const n = (id: string, extra: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: 'mention',
  boardId: 'b1',
  cardId: 'k1',
  title: 'Banner importador',
  excerpt: '@Ana revisa',
  count: 1,
  actorName: 'Jorge',
  createdAt: '2026-11-01T10:00:00.000Z',
  readAt: null,
  ...extra,
})

let fetchMock: ReturnType<typeof vi.fn>
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`)

beforeEach(() => {
  resetNotifications()
  fetchMock = vi.fn(async () => Response.json({ unread: 0 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('centro de notificaciones (cliente)', () => {
  it('descarga la bandeja y el contador', async () => {
    fetchMock.mockResolvedValue(Response.json({ notifications: [n('a'), n('b')], unread: 2 }))
    await refreshNotifications()
    const s = useNotifications.getState()
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(s.unread).toBe(2)
    expect(s.loaded).toBe(true)
    expect(calls()[0]).toMatch(/GET .*\/notifications\?limit=50/)
  })

  it('sin red se queda con lo último que sabía', async () => {
    receiveNotification(n('a'), 1)
    fetchMock.mockRejectedValue(new Error('offline'))
    await refreshNotifications()
    expect(useNotifications.getState().items).toHaveLength(1)
  })

  it('un aviso en vivo se pone arriba; si ya existía (fundido) se reemplaza sin duplicar', () => {
    receiveNotification(n('a'), 1)
    receiveNotification(n('b'), 2)
    receiveNotification(n('a', { count: 2 }), 2)
    const { items, unread } = useNotifications.getState()
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(items[0].count).toBe(2)
    expect(unread).toBe(2)
  })

  it('marcar como leída actualiza al instante y avisa al servidor', () => {
    receiveNotification(n('a'), 1)
    receiveNotification(n('b'), 2)
    markRead(['a'])
    const s = useNotifications.getState()
    expect(s.items.find((i) => i.id === 'a')?.readAt).toBeTruthy()
    expect(s.items.find((i) => i.id === 'b')?.readAt).toBeNull()
    expect(s.unread).toBe(1)
    expect(calls()[0]).toMatch(/POST .*\/notifications\/read/)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ids: ['a'] })
  })

  it('marcar todo como leído deja el contador en cero', () => {
    receiveNotification(n('a'), 1)
    receiveNotification(n('b'), 2)
    markAllRead()
    expect(useNotifications.getState().unread).toBe(0)
    expect(useNotifications.getState().items.every((i) => i.readAt)).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ all: true })
  })

  it('al abrir una tarjeta se leen solo sus avisos y no hay petición si no había pendientes', () => {
    receiveNotification(n('a', { cardId: 'k1' }), 1)
    receiveNotification(n('b', { cardId: 'k2' }), 2)
    markCardRead('k1')
    const s = useNotifications.getState()
    expect(s.items.find((i) => i.id === 'a')?.readAt).toBeTruthy()
    expect(s.items.find((i) => i.id === 'b')?.readAt).toBeNull()
    expect(s.unread).toBe(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'k1' })
    fetchMock.mockClear()
    markCardRead('k1') // ya leídos
    markCardRead('sin-avisos')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
