import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AdminNotifications } from './AdminNotifications'

const base = {
  enabled: false,
  url: '',
  hasSecret: false,
  publicUrl: '',
  timezone: 'America/Mexico_City',
  stats: { pending: 0, sent: 0, failed: 0, lastError: '' },
}

function mockApi(state: Partial<typeof base> = {}, overrides: Record<string, () => Response> = {}) {
  const cfg = { ...base, ...state }
  const calls: { key: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api/, '')}`
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (overrides[key]) return overrides[key]()
      if (key === 'GET /admin/notifications') return Response.json(cfg)
      if (key === 'PUT /admin/notifications') {
        const b = JSON.parse(String(init?.body))
        return Response.json({ ...cfg, ...b, hasSecret: b.enabled || cfg.hasSecret })
      }
      if (key === 'POST /admin/notifications/secret')
        return Response.json({ ...cfg, hasSecret: true, secret: 's3cr3t-nuevo' })
      if (key === 'POST /admin/notifications/test') return Response.json({ ok: true })
      return new Response(null, { status: 204 })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminNotifications', () => {
  it('carga la configuración y guarda la URL, el interruptor y la dirección pública', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    render(<AdminNotifications />)
    const url = await screen.findByLabelText('URL del webhook de n8n')
    await user.type(url, 'https://n8n.test/webhook/kanban-avisos')
    await user.click(screen.getByLabelText('Enviar avisos al webhook'))
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))
    expect(await screen.findByText('Guardado.')).toBeInTheDocument()
    const put = calls.find((c) => c.key === 'PUT /admin/notifications')!
    expect(put.body).toMatchObject({
      url: 'https://n8n.test/webhook/kanban-avisos',
      enabled: true,
      timezone: 'America/Mexico_City',
      publicUrl: window.location.origin,
    })
  })

  it('el secreto nuevo se muestra una vez, con instrucciones para n8n', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<AdminNotifications />)
    await user.click(await screen.findByRole('button', { name: 'Generar secreto' }))
    const box = await screen.findByRole('status', { name: 'Secreto nuevo' })
    expect(box).toHaveTextContent('s3cr3t-nuevo')
    expect(box).toHaveTextContent('Header Auth')
    expect(box).toHaveTextContent('Bearer')
  })

  it('"Enviar prueba" solo está disponible con el envío activo y avisa del resultado', async () => {
    mockApi({ enabled: true, url: 'https://n8n.test/x', hasSecret: true })
    const user = userEvent.setup()
    render(<AdminNotifications />)
    await user.click(await screen.findByRole('button', { name: 'Enviar prueba' }))
    expect(await screen.findByText(/Prueba enviada/)).toBeInTheDocument()
  })

  it('si la prueba falla muestra el motivo', async () => {
    mockApi(
      { enabled: true, url: 'https://n8n.test/x', hasSecret: true },
      {
        'POST /admin/notifications/test': () =>
          Response.json(
            { error: 'webhook_failed', detail: 'El webhook respondió 404.' },
            { status: 502 },
          ),
      },
    )
    const user = userEvent.setup()
    render(<AdminNotifications />)
    await user.click(await screen.findByRole('button', { name: 'Enviar prueba' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El webhook respondió 404.')
  })

  it('ofrece descargar el flujo de n8n y muestra la cola', async () => {
    mockApi({ stats: { pending: 2, sent: 7, failed: 1, lastError: 'El webhook respondió 500.' } })
    render(<AdminNotifications />)
    const link = await screen.findByRole('link', { name: 'Descargar flujo de n8n' })
    expect(link).toHaveAttribute('href', expect.stringContaining('/admin/notifications/workflow'))
    expect(link).toHaveAttribute('download', 'kanban-avisos-n8n.json')
    expect(screen.getByText(/En cola: 2 · Enviados: 7 · Fallidos: 1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar fallidos' })).toBeInTheDocument()
  })

  it('explica los errores de validación del servidor', async () => {
    mockApi(
      {},
      {
        'PUT /admin/notifications': () => Response.json({ error: 'invalid_url' }, { status: 400 }),
      },
    )
    const user = userEvent.setup()
    render(<AdminNotifications />)
    await user.type(await screen.findByLabelText('URL del webhook de n8n'), 'https://x.test')
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La URL del webhook no es válida')
  })
})
