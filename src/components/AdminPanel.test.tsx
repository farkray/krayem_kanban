import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AdminPanel } from './AdminPanel'

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
    isGuest: false,
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

describe('AdminPanel', () => {
  it('lista usuarios y no deja eliminar la propia cuenta', async () => {
    mockApi()
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    const list = await screen.findByRole('table', { name: 'Usuarios' })
    expect(within(list).getByText('Ana López')).toBeInTheDocument()
    expect(within(list).getByText(/Administrador/)).toBeInTheDocument()
    const user = userEvent.setup()
    // la cuenta propia no ofrece "eliminar"; la ajena sí
    await user.click(within(list).getByRole('button', { name: 'Más acciones de admin@correo.com' }))
    expect(within(list).queryByRole('menuitem', { name: /^Eliminar/ })).not.toBeInTheDocument()
    expect(
      within(list).getByRole('menuitem', { name: /Restablecer contraseña/ }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(within(list).getByRole('button', { name: 'Más acciones de ana@correo.com' }))
    expect(
      within(list).getByRole('menuitem', { name: /Eliminar a ana@correo.com/ }),
    ).toBeInTheDocument()
  })

  it('si no carga la lista ofrece Reintentar y recupera al volver el servidor', async () => {
    let down = true
    mockApi({
      'GET /admin/users': () =>
        down ? Response.json({ error: 'error' }, { status: 500 }) : Response.json({ users }),
    })
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    const retry = await screen.findByRole('button', { name: 'Reintentar' })
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo completar/)
    down = false
    await userEvent.setup().click(retry)
    expect(await screen.findByRole('table', { name: 'Usuarios' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
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
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    await screen.findByRole('table', { name: 'Usuarios' })
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
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
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    const list = await screen.findByRole('table', { name: 'Usuarios' })
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
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    await screen.findByRole('table', { name: 'Usuarios' })
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
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
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    await screen.findByRole('table', { name: 'Usuarios' })
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    await user.type(screen.getByLabelText('Correo'), 'ana@correo.com')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un usuario')
  })

  it('eliminar pide confirmación y llama al servidor', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Más acciones de ana@correo.com' }))
    await user.click(screen.getByRole('menuitem', { name: /Eliminar a ana@correo.com/ }))
    expect(calls).not.toContain('DELETE /admin/users/u2')
    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))
    expect(calls).toContain('DELETE /admin/users/u2')
  })
})

describe('AdminPanel: pantalla propia', () => {
  it('tiene botón para volver a los tableros y resumen de cuentas', async () => {
    mockApi()
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={onBack} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Usuarios' })
    expect(screen.getByText('2 usuarios · 1 administrador')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Volver a los tableros/ }))
    expect(onBack).toHaveBeenCalled()
  })

  it('filtra usuarios por nombre o correo', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    const table = await screen.findByRole('table', { name: 'Usuarios' })
    await user.type(screen.getByRole('searchbox', { name: 'Buscar usuario' }), 'lópez')
    expect(within(table).queryByText('admin@correo.com')).not.toBeInTheDocument()
    expect(within(table).getByText('Ana López')).toBeInTheDocument()
  })

  it('sin permisos no carga nada y solo permite volver', () => {
    const calls = mockApi()
    render(<AdminPanel me="ana@correo.com" isAdmin={false} onBack={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('no tiene permiso')
    expect(calls).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Volver a los tableros/ })).toBeInTheDocument()
  })
})

describe('AdminPanel: rol de invitado', () => {
  it('muestra el rol y permite cambiarlo a un usuario existente (el admin no tiene selector)', async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
        if (init?.body) bodies.push(`${key} ${init.body}`)
        if (key === 'GET /admin/users') return Response.json({ users })
        return Response.json({ user: users[1] })
      }),
    )
    const user = userEvent.setup()
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    const table = await screen.findByRole('table', { name: 'Usuarios' })
    expect(within(table).queryByRole('combobox', { name: 'Rol de admin@correo.com' })).toBeNull()
    const select = within(table).getByRole('combobox', { name: 'Rol de ana@correo.com' })
    expect(select).toHaveValue('user')
    await user.selectOptions(select, 'guest')
    expect(bodies).toContain('PATCH /admin/users/u2 {"guest":true}')
  })

  it('al crear se elige el rol y se explica qué implica', async () => {
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
    render(<AdminPanel me="admin@correo.com" isAdmin onBack={() => {}} />)
    await screen.findByRole('table', { name: 'Usuarios' })
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    await user.type(screen.getByLabelText('Correo'), 'inv@correo.com')
    const form = screen.getByRole('region', { name: 'Nuevo usuario' })
    await user.selectOptions(within(form).getByRole('combobox'), 'guest')
    expect(screen.getByText(/no crea tableros/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))
    await screen.findByText('Temporal-123xyz')
    expect(
      bodies.some((b) => b.startsWith('POST /admin/users') && b.includes('"guest":true')),
    ).toBe(true)
  })
})
