import { resetStore } from '../store/store'
import { useAuth } from './auth'

const apiLogout = vi.hoisted(() => vi.fn())
const apiMe = vi.hoisted(() => vi.fn())
vi.mock('./auth', async (orig) => ({
  ...(await orig<typeof import('./auth')>()),
  apiLogout,
  apiMe,
}))
vi.mock('../lib/config', () => ({
  getConfig: () => ({ API_URL: '/api' }),
  isConfigured: () => true,
}))

beforeEach(async () => {
  await resetStore()
  localStorage.clear()
  apiLogout.mockReset()
  apiMe.mockReset()
  useAuth.setState({ status: 'loading', userId: null, email: null })
  vi.resetModules()
})

describe('cierre de sesión pendiente (sin conexión)', () => {
  it('si no se pudo avisar al servidor, se recuerda y no se vuelve a entrar con la cookie vieja', async () => {
    apiLogout.mockResolvedValue(false)
    const { signOut } = await import('./boot')
    await signOut()
    expect(localStorage.getItem('kanban_pending_logout')).toBe('1')
    expect(useAuth.getState().status).toBe('signedOut')

    // Siguiente arranque, ya con red: completa el cierre ANTES de preguntar /me.
    apiLogout.mockResolvedValue(true)
    apiMe.mockResolvedValue({ kind: 'user', user: { id: 'u1', email: 'a@b.co' } })
    const { bootSync } = await import('./boot')
    await bootSync()
    expect(apiLogout).toHaveBeenCalledTimes(2)
    expect(apiMe).not.toHaveBeenCalled()
    expect(localStorage.getItem('kanban_pending_logout')).toBeNull()
    expect(useAuth.getState().status).toBe('signedOut')
  })

  it('si el cierre sale bien no deja marca', async () => {
    apiLogout.mockResolvedValue(true)
    const { signOut } = await import('./boot')
    await signOut()
    expect(localStorage.getItem('kanban_pending_logout')).toBeNull()
  })

  it('sin sesión ni identidad guardada, pide iniciar sesión; sin red con identidad guardada, sigue', async () => {
    apiMe.mockResolvedValue({ kind: 'anonymous' })
    const { bootSync } = await import('./boot')
    await bootSync()
    expect(useAuth.getState().status).toBe('signedOut')
  })
})
