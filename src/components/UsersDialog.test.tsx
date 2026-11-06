import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { UsersDialog } from './UsersDialog'

const users = [
  {
    id: 'u1',
    email: 'admin@correo.com',
    alias: '',
    createdAt: '2026-11-01',
    isAdmin: true,
    rows: 12,
  },
  {
    id: 'u2',
    email: 'ana@correo.com',
    alias: 'Ana López',
    createdAt: '2026-11-02',
    isAdmin: false,
    rows: 3,
  },
]

function mockApi(overrides: Record<string, () => Response> = {}) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
      calls.push(key)
      if (overrides[key]) return overrides[key]()
      if (key === 'GET /admin/users') return Response.json({ users })
      return new Response(null, { status: 204 })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('UsersDialog', () => {
  it('lista usuarios y no deja eliminar la propia cuenta', async () => {
    mockApi()
    render(<UsersDialog me="admin@correo.com" onClose={() => {}} />)
    const list = await screen.findByRole('list', { name: 'Usuarios' })
    expect(within(list).getByText('Ana López')).toBeInTheDocument()
    expect(within(list).getByText(/Administrador/)).toBeInTheDocument()
    expect(within(list).getAllByRole('button', { name: /^Eliminar/ })).toHaveLength(1)
    expect(
      within(list).getByRole('button', { name: /Eliminar a ana@correo.com/ }),
    ).toBeInTheDocument()
  })

  it('crear sin contraseña muestra la temporal generada', async () => {
    mockApi({
      'POST /admin/users': () =>
        Response.json(
          { user: { ...users[1], email: 'nuevo@correo.com' }, password: 'Temporal-123xyz' },
          { status: 201 },
        ),
    })
    const user = userEvent.setup()
    render(<UsersDialog me="admin@correo.com" onClose={() => {}} />)
    await screen.findByRole('list', { name: 'Usuarios' })
    await user.type(screen.getByLabelText('Correo'), 'nuevo@correo.com')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByText('Temporal-123xyz')).toBeInTheDocument()
  })

  it('muestra el alias y permite editarlo', async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
        if (init?.body) bodies.push(`${key} ${init.body}`)
        if (key === 'GET /admin/users') return Response.json({ users })
        if (key.startsWith('PATCH')) return Response.json({ user: users[1] })
        return new Response(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    render(<UsersDialog me="admin@correo.com" onClose={() => {}} />)
    const list = await screen.findByRole('list', { name: 'Usuarios' })
    expect(within(list).getByText('Ana López')).toBeInTheDocument()
    expect(within(list).getByText(/ana@correo.com/)).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Editar alias de ana@correo.com' }))
    const input = screen.getByLabelText('Alias de ana@correo.com')
    await user.clear(input)
    await user.type(input, 'Ana Pérez')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(bodies).toContain('PATCH /admin/users/u2 {"alias":"Ana Pérez"}')
  })

  it('crear usuario envía el alias', async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
        if (init?.body) bodies.push(`${key} ${init.body}`)
        if (key === 'GET /admin/users') return Response.json({ users })
        return Response.json({ user: users[1], password: 'Temporal-123xyz' }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    render(<UsersDialog me="admin@correo.com" onClose={() => {}} />)
    await screen.findByRole('list', { name: 'Usuarios' })
    await user.type(screen.getByLabelText('Correo'), 'jorge@mercabits.com')
    await user.type(screen.getByLabelText(/Alias/), 'Jorge Menéndez')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))
    await screen.findByText('Temporal-123xyz')
    expect(
      bodies.some(
        (b) => b.startsWith('POST /admin/users') && b.includes('"alias":"Jorge Menéndez"'),
      ),
    ).toBe(true)
  })

  it('traduce errores del servidor', async () => {
    mockApi({ 'POST /admin/users': () => Response.json({ error: 'email_taken' }, { status: 409 }) })
    const user = userEvent.setup()
    render(<UsersDialog me="admin@correo.com" onClose={() => {}} />)
    await screen.findByRole('list', { name: 'Usuarios' })
    await user.type(screen.getByLabelText('Correo'), 'ana@correo.com')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un usuario')
  })

  it('eliminar pide confirmación y llama al servidor', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    render(<UsersDialog me="admin@correo.com" onClose={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Eliminar a ana@correo.com/ }))
    expect(calls).not.toContain('DELETE /admin/users/u2')
    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))
    expect(calls).toContain('DELETE /admin/users/u2')
  })
})
