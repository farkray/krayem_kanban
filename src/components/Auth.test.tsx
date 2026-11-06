import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { resetStore } from '../store/store'
import { useAuth } from '../sync/auth'
import { setSync } from '../sync/status'
import { LoginScreen } from './LoginScreen'
import { SyncStatus } from './SyncStatus'

const signIn = vi.hoisted(() => vi.fn())
const signUp = vi.hoisted(() => vi.fn())
const authConfig = vi.hoisted(() => vi.fn())
vi.mock('../sync/boot', () => ({
  bootSync: async () => {},
  signOut: async () => {},
  changePassword: vi.fn(),
  signIn,
  signUp,
  authConfig,
}))

beforeEach(() => {
  signIn.mockReset()
  signUp.mockReset()
  authConfig.mockReset().mockResolvedValue({ allowSignup: false })
  useAuth.setState({ status: 'disabled', userId: null, email: null })
  setSync({ enabled: false, pending: 0, syncing: false, error: null, online: true })
})

describe('LoginScreen', () => {
  it('inicia sesión con correo y contraseña', async () => {
    signIn.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<LoginScreen />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-largo-1')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(signIn).toHaveBeenCalledWith('ana@correo.com', 'secreto-largo-1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['invalid_credentials', 'Correo o contraseña incorrectos.'],
    ['too_many_attempts', 'Demasiados intentos'],
    ['offline', 'No hay conexión con el servidor.'],
  ])('muestra el error %s', async (code, text) => {
    signIn.mockResolvedValue(code)
    const user = userEvent.setup()
    render(<LoginScreen />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com')
    await user.type(screen.getByLabelText('Contraseña'), 'x')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('el registro solo aparece si el servidor lo permite', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<LoginScreen />)
    expect(screen.queryByRole('button', { name: 'Crear una cuenta' })).not.toBeInTheDocument()
    unmount()

    authConfig.mockResolvedValue({ allowSignup: true })
    signUp.mockResolvedValue(null)
    render(<LoginScreen />)
    await user.click(await screen.findByRole('button', { name: 'Crear una cuenta' }))
    await user.type(screen.getByLabelText('Correo electrónico'), 'nuevo@correo.com')
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(signUp).toHaveBeenCalledWith('nuevo@correo.com', 'contraseña-larga', undefined)
  })

  it('el registro admite un nombre (alias) opcional', async () => {
    const user = userEvent.setup()
    authConfig.mockResolvedValue({ allowSignup: true })
    signUp.mockResolvedValue(null)
    render(<LoginScreen />)
    await user.click(await screen.findByRole('button', { name: 'Crear una cuenta' }))
    await user.type(screen.getByLabelText('Correo electrónico'), 'jorge@mercabits.com')
    await user.type(screen.getByLabelText(/Nombre/), 'Jorge Menéndez')
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(signUp).toHaveBeenCalledWith('jorge@mercabits.com', 'contraseña-larga', 'Jorge Menéndez')
  })
})

describe('SyncStatus', () => {
  it('no se muestra en modo solo local', () => {
    const { container } = render(<SyncStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('refleja guardado, pendiente y sin conexión', () => {
    setSync({ enabled: true })
    render(<SyncStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
    act(() => setSync({ pending: 2, online: false }))
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión · 2 cambios pendientes')
  })
})

describe('App con cuenta', () => {
  async function renderApp() {
    window.history.replaceState(null, '', '/')
    await resetStore()
    render(<App />)
  }

  it('sin sesión muestra el acceso', async () => {
    useAuth.setState({ status: 'signedOut' })
    await renderApp()
    expect(await screen.findByRole('heading', { name: 'Kanban' })).toBeInTheDocument()
    expect(screen.queryByText('Mis Tableros')).not.toBeInTheDocument()
  })

  it('con sesión muestra correo y pide confirmar al cerrar sesión', async () => {
    useAuth.setState({ status: 'signedIn', userId: 'u1', email: 'ana@correo.com' })
    setSync({ enabled: true, pending: 2 })
    const user = userEvent.setup()
    await renderApp()
    expect(await screen.findByText('ana@correo.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    expect(screen.getByRole('dialog', { name: 'Cambiar contraseña' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/2 cambios sin enviar/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
