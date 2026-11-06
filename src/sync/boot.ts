import { db } from '../db/db'
import { getConfig, isConfigured } from '../lib/config'
import { useStore, wipeLocal } from '../store/store'
import {
  apiAuthConfig,
  apiChangePassword,
  apiLogin,
  apiLogout,
  apiMe,
  apiSignup,
  useAuth,
  type ApiUser,
  type AuthResult,
} from './auth'
import { setBlobFetcher } from './blobs'
import { createEngine, type Engine } from './engine'
import { createHttpRemote } from './httpRemote'

const clientId = crypto.randomUUID() // una conexión en vivo por pestaña
let engine: Engine | null = null
let booted: Promise<void> | null = null

/**
 * Si cerraste sesión sin conexión, el servidor aún no invalidó la cookie. Se recuerda en este
 * navegador para completar el cierre en cuanto haya red y no volver a entrar solo con esa cookie.
 */
const PENDING_LOGOUT = 'kanban_pending_logout'

interface Identity {
  userId: string
  email: string
  isAdmin?: boolean
}

const loadIdentity = async () => (await db.meta.get('identity'))?.value as Identity | undefined

function stopEngine() {
  engine?.stop()
  engine = null
  setBlobFetcher(null)
}

/** La sesión dejó de ser válida: se detiene la sincronización y se pide iniciar sesión. */
function handleSignedOut() {
  stopEngine()
  useAuth.setState({ status: 'signedOut', userId: null, email: null, isAdmin: false })
}

/** Entra un usuario: si es distinto del que dejó datos en este navegador, se descartan; luego sincroniza. */
async function handleUser(user: Identity): Promise<void> {
  const previous = await loadIdentity()
  if (previous && previous.userId !== user.userId) await wipeLocal()
  await db.meta.put({ key: 'identity', value: user })
  useAuth.setState({
    status: 'signedIn',
    userId: user.userId,
    email: user.email,
    isAdmin: !!user.isAdmin,
  })

  stopEngine()
  const remote = createHttpRemote(getConfig().API_URL, clientId, handleSignedOut)
  setBlobFetcher((att) => remote.downloadBlob(att))
  engine = createEngine(remote, { onPulled: () => useStore.getState().seedIfEmpty() })
  await engine.start()
}

/** Arranca autenticación + sincronización. Idempotente (StrictMode monta dos veces). */
export function bootSync(): Promise<void> {
  booted ??= (async () => {
    if (!isConfigured()) {
      useAuth.setState({ status: 'disabled' })
      return
    }
    if (localStorage.getItem(PENDING_LOGOUT)) {
      if (await apiLogout()) localStorage.removeItem(PENDING_LOGOUT)
      useAuth.setState({ status: 'signedOut', userId: null, email: null, isAdmin: false })
      return
    }
    const me = await apiMe()
    if (me.kind === 'user')
      return handleUser({ userId: me.user.id, email: me.user.email, isAdmin: me.user.isAdmin })
    if (me.kind === 'offline') {
      // PWA: sin conexión se sigue con la identidad del último inicio de sesión.
      const cached = await loadIdentity()
      if (cached) return handleUser(cached)
    }
    useAuth.setState({ status: 'signedOut', userId: null, email: null, isAdmin: false })
  })()
  return booted
}

async function finish(res: AuthResult): Promise<string | null> {
  if (!res.ok) return res.error
  localStorage.removeItem(PENDING_LOGOUT)
  await handleUser({ userId: res.user.id, email: res.user.email, isAdmin: res.user.isAdmin })
  return null
}

/** Devuelve el código de error del servidor (`invalid_credentials`, `offline`…) o null si entró. */
export const signIn = async (email: string, password: string) =>
  finish(await apiLogin(email, password))
export const signUp = async (email: string, password: string) =>
  finish(await apiSignup(email, password))
export const authConfig = apiAuthConfig
export const changePassword = apiChangePassword

/** Cierra sesión: intenta enviar lo pendiente y borra los datos locales del dispositivo. */
export async function signOut(): Promise<void> {
  await engine?.flush()
  stopEngine()
  if (!(await apiLogout())) localStorage.setItem(PENDING_LOGOUT, '1')
  await wipeLocal()
  useAuth.setState({ status: 'signedOut', userId: null, email: null, isAdmin: false })
}

export type { ApiUser }
