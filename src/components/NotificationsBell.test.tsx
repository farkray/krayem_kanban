import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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

beforeEach(() => {
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
    render(<NotificationsBell onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Notificaciones, 3 sin leer' })).toBeInTheDocument()
  })

  it('sin avisos no muestra contador y el panel lo dice', async () => {
    render(<NotificationsBell onOpen={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    expect(screen.getByText('Todavía no tienes avisos.')).toBeInTheDocument()
  })

  it('lista los avisos con quién, qué, tarjeta y extracto', async () => {
    receiveNotification(n('a', { count: 2 }), 1)
    receiveNotification(
      n('b', { type: 'assignment', cardId: 'k2', title: 'Mandar recibo', excerpt: '' }),
      2,
    )
    render(<NotificationsBell onOpen={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    expect(screen.getByText('Jorge te mencionó 2 veces')).toBeInTheDocument()
    expect(screen.getByText('Banner importador')).toBeInTheDocument()
    expect(screen.getByText('@Ana revisa el banner')).toBeInTheDocument()
    expect(screen.getByText('Jorge te asignó una tarjeta')).toBeInTheDocument()
  })

  it('filtra por menciones y asignaciones', async () => {
    receiveNotification(n('a'), 1)
    receiveNotification(n('b', { type: 'assignment', title: 'Mandar recibo' }), 2)
    render(<NotificationsBell onOpen={vi.fn()} />)
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
    render(<NotificationsBell onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    await userEvent.click(screen.getByRole('button', { name: /Jorge te mencionó/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', cardId: 'k1' }))
    expect(useNotifications.getState().unread).toBe(0)
    expect(screen.queryByRole('group', { name: 'Notificaciones' })).not.toBeInTheDocument()
  })

  it('"Marcar todo como leído" está desactivado sin pendientes y limpia el contador si los hay', async () => {
    receiveNotification(n('a'), 1)
    render(<NotificationsBell onOpen={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
    const panel = screen.getByRole('group', { name: 'Notificaciones' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Marcar todo como leído' }))
    expect(useNotifications.getState().unread).toBe(0)
    expect(within(panel).getByRole('button', { name: 'Marcar todo como leído' })).toBeDisabled()
  })

  it('Escape cierra el panel', async () => {
    render(<NotificationsBell onOpen={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Notificaciones' })).not.toBeInTheDocument()
  })
})
