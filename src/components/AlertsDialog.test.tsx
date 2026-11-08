import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AlertsDialog } from './AlertsDialog'

function mockApi(prefs: object, put?: () => Response) {
  const calls: { key: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (key === 'GET /notifications/channels') return Response.json(prefs)
      if (key === 'PUT /me/notifications')
        return put ? put() : Response.json({ ...prefs, ...JSON.parse(String(init?.body)) })
      return new Response(null, { status: 204 })
    }),
  )
  return calls
}

const on = { available: true, phone: '', email: false, whatsapp: false, digest: false }
afterEach(() => vi.unstubAllGlobals())

describe('AlertsDialog', () => {
  it('si el admin no activó los avisos lo explica y no ofrece guardar', async () => {
    mockApi({ ...on, available: false })
    render(<AlertsDialog onClose={() => {}} />)
    expect(await screen.findByText(/todavía no activó los avisos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('carga lo guardado y guarda correo, WhatsApp, teléfono y resumen', async () => {
    const calls = mockApi({ ...on, email: true })
    const user = userEvent.setup()
    render(<AlertsDialog onClose={() => {}} />)
    expect(await screen.findByLabelText('Por correo')).toBeChecked()
    await user.click(screen.getByLabelText('Por WhatsApp'))
    await user.type(screen.getByLabelText(/Teléfono/), '+52 55 1234 5678')
    await user.click(screen.getByLabelText(/Resumen cada mañana/))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Guardado.')).toBeInTheDocument()
    expect(calls.find((c) => c.key === 'PUT /me/notifications')!.body).toEqual({
      phone: '+52 55 1234 5678',
      email: true,
      whatsapp: true,
      digest: true,
    })
  })

  it('muestra por qué el servidor rechazó el teléfono', async () => {
    mockApi(on, () => Response.json({ error: 'invalid_phone' }, { status: 400 }))
    const user = userEvent.setup()
    render(<AlertsDialog onClose={() => {}} />)
    await user.type(await screen.findByLabelText(/Teléfono/), '123')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('código de país')
  })
})
