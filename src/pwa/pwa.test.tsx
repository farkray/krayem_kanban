import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallButton, PwaPrompts } from '../components/PwaPrompts'
import { listenInstall, setUpdater, usePwa, type BeforeInstallPromptEvent } from './store'

const fakeInstallEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
  const ev = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  ev.prompt = vi.fn().mockResolvedValue(undefined)
  ev.userChoice = Promise.resolve({ outcome })
  return ev
}

beforeEach(() => {
  usePwa.setState({ installEvent: null, installed: false, needRefresh: false, offlineReady: false })
})

describe('instalación', () => {
  it('captura beforeinstallprompt, lo ofrece y lo usa una sola vez', async () => {
    const stop = listenInstall()
    const user = userEvent.setup()
    render(<InstallButton />)
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()

    const ev = fakeInstallEvent()
    act(() => {
      window.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true) // evita la mini-barra automática
    await user.click(await screen.findByRole('button', { name: 'Instalar app' }))
    expect(ev.prompt).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(usePwa.getState().installed).toBe(true))
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
    stop()
  })

  it('si el usuario rechaza, el botón desaparece pero no queda "instalada"', async () => {
    const user = userEvent.setup()
    render(<InstallButton />)
    act(() => usePwa.setState({ installEvent: fakeInstallEvent('dismissed') }))
    await user.click(screen.getByRole('button', { name: 'Instalar app' }))
    await vi.waitFor(() => expect(usePwa.getState().installEvent).toBeNull())
    expect(usePwa.getState().installed).toBe(false)
  })

  it('appinstalled oculta el botón', () => {
    const stop = listenInstall()
    render(<InstallButton />)
    act(() => usePwa.setState({ installEvent: fakeInstallEvent() }))
    expect(screen.getByRole('button', { name: 'Instalar app' })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
    stop()
  })

  it('no se ofrece si ya está instalada (modo standalone)', () => {
    usePwa.setState({ installed: true, installEvent: fakeInstallEvent() })
    render(<InstallButton />)
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
  })
})

describe('avisos', () => {
  it('nueva versión: Recargar aplica la actualización; Ahora no la oculta', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    setUpdater(update)
    const user = userEvent.setup()
    render(<PwaPrompts />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    act(() => usePwa.setState({ needRefresh: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('Hay una nueva versión disponible.')
    await user.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(update).toHaveBeenCalledWith(true)

    await user.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('listo sin conexión: aviso con cierre manual', async () => {
    const user = userEvent.setup()
    render(<PwaPrompts />)
    act(() => usePwa.setState({ offlineReady: true }))
    expect(screen.getByRole('status')).toHaveTextContent('funciona sin conexión')
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
