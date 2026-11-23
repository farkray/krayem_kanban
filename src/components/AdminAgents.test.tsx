import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AdminAgents } from './AdminAgents'

const boards = [
  { id: 'b1', title: 'Ventas', ownerEmail: 'a@c.com', ownerName: 'Ana', workspace: 'General' },
  { id: 'b2', title: 'SEO', ownerEmail: 'a@c.com', ownerName: 'Ana', workspace: 'General' },
  { id: 'b3', title: 'Coppel', ownerEmail: 'a@c.com', ownerName: 'Ana', workspace: 'General' },
]

function mockApi() {
  const posts: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
      if (key === 'GET /admin/agents') return Response.json({ agents: [] })
      if (key === 'GET /admin/boards') return Response.json({ boards })
      if (key === 'POST /admin/agents') {
        posts.push(JSON.parse(String(init?.body)))
        return Response.json(
          { agent: { id: 'a1', name: 'Hermes', boards: [], tokenPrefix: 'kbn_x', createdAt: '', expiresAt: null, revokedAt: null, lastUsedAt: null, canNotify: false, canContacts: false, description: '' }, token: 'kbn_secreto' },
          { status: 201 },
        )
      }
      return new Response(null, { status: 204 })
    }),
  )
  return posts
}

afterEach(() => vi.unstubAllGlobals())

describe('Conexiones de agentes: nivel de los tableros', () => {
  it('el nivel general se aplica a los tableros elegidos y a los que se marquen después', async () => {
    const posts = mockApi()
    render(<AdminAgents />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Nueva conexión' }))
    const form = screen.getByRole('form', { name: 'Nueva conexión' })
    await user.type(within(form).getByLabelText(/Nombre del agente/), 'Hermes')

    // por defecto los tableros nacen en «Solo leer»
    await user.click(within(form).getByRole('checkbox', { name: /Ventas/ }))
    expect(within(form).getByLabelText('Nivel en Ventas')).toHaveValue('read')

    // cambiar el nivel general pasa los ya elegidos a escritura…
    await user.selectOptions(within(form).getByLabelText('Nivel para todos los tableros'), 'write')
    expect(within(form).getByLabelText('Nivel en Ventas')).toHaveValue('write')
    // …y los que se marquen después ya nacen con escritura
    await user.click(within(form).getByRole('checkbox', { name: /SEO/ }))
    expect(within(form).getByLabelText('Nivel en SEO')).toHaveValue('write')
    // un tablero se puede ajustar por su cuenta sin tocar los demás
    await user.selectOptions(within(form).getByLabelText('Nivel en SEO'), 'read')
    expect(within(form).getByLabelText('Nivel en Ventas')).toHaveValue('write')

    await user.click(within(form).getByRole('button', { name: /Crear conexión/ }))
    expect(posts).toEqual([
      expect.objectContaining({
        name: 'Hermes',
        boards: [
          { boardId: 'b1', access: 'write' },
          { boardId: 'b2', access: 'read' },
        ],
      }),
    ])
    expect(await screen.findByText('kbn_secreto')).toBeInTheDocument()
  })
})
