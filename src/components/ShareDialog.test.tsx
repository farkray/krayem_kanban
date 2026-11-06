import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { useAccess } from '../sync/access'
import { ShareDialog } from './ShareDialog'

const directory = [
  { id: 'u2', email: 'ana@correo.com', alias: 'Ana López' },
  { id: 'u3', email: 'jorge@mercabits.com', alias: 'Jorge Menéndez' },
  { id: 'u4', email: 'sin-alias@correo.com', alias: '' },
]

function mockApi(calls: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
      calls.push(init?.body ? `${key} ${init.body}` : key)
      if (key === 'GET /users/directory') return Response.json({ users: directory })
      if (key === 'GET /shares') return Response.json({ shared: [], members: [], participants: [] })
      return Response.json({ member: {} }, { status: 201 })
    }),
  )
}

beforeEach(() =>
  useAccess.setState({
    shared: [],
    participants: [],
    loaded: true,
    members: [
      { boardId: 'b1', userId: 'u2', email: 'ana@correo.com', alias: 'Ana López', role: 'editor' },
    ],
  }),
)
afterEach(() => vi.unstubAllGlobals())

describe('ShareDialog', () => {
  it('ofrece un menú con los usuarios registrados (alias · correo), sin quien ya tiene acceso', async () => {
    mockApi([])
    render(<ShareDialog boardId="b1" title="Proyecto" onClose={() => {}} />)
    const select = await screen.findByRole('combobox', { name: 'Persona' })
    await screen.findByRole('option', { name: 'Jorge Menéndez · jorge@mercabits.com' })
    const names = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(names).toEqual([
      'Elige una persona…',
      'Jorge Menéndez · jorge@mercabits.com',
      'sin-alias@correo.com',
    ])
    // los miembros actuales se listan con su alias
    expect(screen.getByRole('list', { name: 'Personas con acceso' })).toHaveTextContent('Ana López')
  })

  it('al elegir a alguien y compartir se envía su correo y el permiso', async () => {
    const calls: string[] = []
    mockApi(calls)
    const user = userEvent.setup()
    render(<ShareDialog boardId="b1" title="Proyecto" onClose={() => {}} />)
    await screen.findByRole('option', { name: /Jorge/ })
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Persona' }),
      'jorge@mercabits.com',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Permiso' }), 'viewer')
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(calls).toContain(
      'POST /boards/b1/members {"email":"jorge@mercabits.com","role":"viewer"}',
    )
  })

  it('sin usuarios disponibles lo explica y no deja compartir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ users: [] })),
    )
    render(<ShareDialog boardId="b1" title="Proyecto" onClose={() => {}} />)
    expect(await screen.findByText(/Ya compartiste el tablero con todos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeDisabled()
  })
})
