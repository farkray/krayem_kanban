import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { toISODate } from '../lib/format'
import type { Card } from '../lib/types'
import { useStore } from '../store/store'
import { useAuth } from '../sync/auth'
import {
  receiveNotification,
  resetNotifications,
  useNotifications,
  type AppNotification,
} from '../sync/notifications'
import { NotificationsBell } from './NotificationsBell'

const n = (id: string, extra: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: 'mention',
  boardId: 'b1',
  cardId: 'k1',
  title: 'Banner importador',
  excerpt: '@Ana revisa el banner',
  count: 1,
  actorName: 'Jorge',
  createdAt: new Date().toISOString(),
  readAt: null,
  ...extra,
})

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return toISODate(d)
}
const stamp = { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }
const dated = (id: string, extra: Partial<Card>): Card => ({
  id,
  boardId: 'b1',
  columnId: 'c1',
  title: id,
  position: 'a0',
  ...stamp,
  ...extra,
})
function setBoard(cards: Card[]) {
  useStore.setState({
    boards: [{ id: 'b1', title: 'B', position: 'a0', ...stamp }],
    columns: [{ id: 'c1', boardId: 'b1', title: 'Por hacer', position: 'a0', ...stamp }],
    cards,
  })
}

beforeEach(() => {
  localStorage.clear()
  useAuth.setState({ userId: 'yo' })
  setBoard([])
  resetNotifications()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/read')
        ? Response.json({ unread: 0 })
        : Response.json({
            notifications: useNotifications.getState().items,
            unread: useNotifications.getState().unread,
          }),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('NotificationsBell', () => {
  it('muestra el contador y lo anuncia en la etiqueta', () => {
    receiveNotification(n('a'), 3)
    render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Notificaciones, 3 sin leer' })).toBeInTheDocument()
  })

  it('sin avisos no muestra contador y el panel lo dice', async () => {
    render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    expect(screen.getByText('Todavía no tienes avisos.')).toBeInTheDocument()
  })

  it('lista los avisos con quién, qué, tarjeta y extracto', async () => {
    receiveNotification(n('a', { count: 2 }), 1)
    receiveNotification(
      n('b', { type: 'assignment', cardId: 'k2', title: 'Mandar recibo', excerpt: '' }),
      2,
    )
    render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    expect(screen.getByText('Jorge te mencionó 2 veces')).toBeInTheDocument()
    expect(screen.getByText('Banner importador')).toBeInTheDocument()
    expect(screen.getByText('@Ana revisa el banner')).toBeInTheDocument()
    expect(screen.getByText('Jorge te asignó una tarjeta')).toBeInTheDocument()
  })

  it('filtra por menciones y asignaciones', async () => {
    receiveNotification(n('a'), 1)
    receiveNotification(n('b', { type: 'assignment', title: 'Mandar recibo' }), 2)
    render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Asignaciones' }))
    expect(screen.queryByText('Jorge te mencionó')).not.toBeInTheDocument()
    expect(screen.getByText('Jorge te asignó una tarjeta')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Menciones' }))
    expect(screen.getByText('Jorge te mencionó')).toBeInTheDocument()
  })

  it('al pulsar un aviso lo marca como leído, cierra el panel y lo abre', async () => {
    const onOpen = vi.fn()
    receiveNotification(n('a'), 1)
    render(<NotificationsBell onOpen={onOpen} onOpenCard={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    await userEvent.click(screen.getByRole('button', { name: /Jorge te mencionó/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', cardId: 'k1' }))
    expect(useNotifications.getState().unread).toBe(0)
    expect(screen.queryByRole('group', { name: 'Notificaciones' })).not.toBeInTheDocument()
  })

  it('"Marcar todo como leído" está desactivado sin pendientes y limpia el contador si los hay', async () => {
    receiveNotification(n('a'), 1)
    render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    const panel = screen.getByRole('group', { name: 'Notificaciones' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Marcar todo como leído' }))
    expect(useNotifications.getState().unread).toBe(0)
    expect(within(panel).getByRole('button', { name: 'Marcar todo como leído' })).toBeDisabled()
  })

  it('Escape cierra el panel', async () => {
    render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Notificaciones' })).not.toBeInTheDocument()
  })

  describe('resumen "Hoy"', () => {
    it('lista vencidas, de hoy y de mañana, solo las mías', async () => {
      setBoard([
        dated('Vieja', { endDate: day(-2) }),
        dated('Entrega', { endDate: day(0) }),
        dated('Mañana', { endDate: day(1) }),
        dated('Lejana', { endDate: day(10) }),
        dated('De otra persona', { endDate: day(0), assigneeId: 'ana' }),
      ])
      render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
      const hoy = screen.getByRole('region', { name: 'Hoy' })
      expect(within(hoy).getByText('Vencidas · 1')).toBeInTheDocument()
      expect(within(hoy).getByText('Vencen hoy · 1')).toBeInTheDocument()
      expect(within(hoy).getByText('Vencen mañana · 1')).toBeInTheDocument()
      expect(within(hoy).getByText('Vieja')).toBeInTheDocument()
      expect(within(hoy).queryByText('Lejana')).not.toBeInTheDocument()
      expect(within(hoy).queryByText('De otra persona')).not.toBeInTheDocument()
    })

    it('sin tarjetas con fecha no hay bloque y el panel dice que no hay avisos', async () => {
      setBoard([dated('Sin fecha', {})])
      render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
      expect(screen.queryByRole('region', { name: 'Hoy' })).not.toBeInTheDocument()
      expect(screen.getByText('Todavía no tienes avisos.')).toBeInTheDocument()
    })

    it('al pulsar una tarjeta la abre y cierra el panel', async () => {
      const onOpenCard = vi.fn()
      setBoard([dated('Entrega', { endDate: day(0) })])
      render(<NotificationsBell onOpen={vi.fn()} onOpenCard={onOpenCard} />)
      await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
      await userEvent.click(screen.getByRole('button', { name: /Entrega/ }))
      expect(onOpenCard).toHaveBeenCalledWith(
        expect.objectContaining({ cardId: 'Entrega', boardId: 'b1', group: 'today' }),
      )
      expect(screen.queryByRole('group', { name: 'Notificaciones' })).not.toBeInTheDocument()
    })

    it('suma 1 al contador hasta abrir el panel, y ese día no vuelve a sumar', async () => {
      setBoard([dated('Entrega', { endDate: day(0) })])
      const { unmount } = render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' }))
      await userEvent.keyboard('{Escape}')
      expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument()
      unmount()
      render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />) // recarga el mismo día
      expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument()
    })

    it('el contador junta avisos sin leer y el resumen', () => {
      setBoard([dated('Entrega', { endDate: day(0) })])
      receiveNotification(n('a'), 2)
      render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Notificaciones, 3 sin leer' })).toBeInTheDocument()
    })

    it('no aparece con el filtro Menciones', async () => {
      setBoard([dated('Entrega', { endDate: day(0) })])
      render(<NotificationsBell onOpen={vi.fn()} onOpenCard={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Menciones' }))
      expect(screen.queryByRole('region', { name: 'Hoy' })).not.toBeInTheDocument()
    })
  })
})
