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
import { loadCachedAccess, refreshAccess, resetAccess } from './access'
import { createHttpRemote } from './httpRemote'
import {
  receiveNotification,
  refreshNotifications,
  resetNotifications,
  type AppNotification,
} from './notifications'

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
  alias?: string
  isAdmin?: boolean
}

const loadIdentity = async () => (await db.meta.get('identity'))?.value as Identity | undefined

function stopEngine() {
  engine?.stop()
  resetAccess()
  resetNotifications()
  engine = null
  setBlobFetcher(null)
}

/** La sesión dejó de ser válida: se detiene la sincronización y se pide iniciar sesión. */
function handleSignedOut() {
  stopEngine()
  useAuth.setState({ status: 'signedOut', userId: null, email: null, alias: '', isAdmin: false })
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
    alias: user.alias ?? '',
    isAdmin: !!user.isAdmin,
  })

  stopEngine()
  const remote = createHttpRemote(getConfig().API_URL, clientId, handleSignedOut)
  setBlobFetcher((att) => remote.downloadBlob(att))
  await loadCachedAccess()
  engine = createEngine(remote, {
    onPulled: async () => {
      await refreshAccess() // permisos y limpieza de tableros a los que ya no tengo acceso
      await useStore.getState().migrateLabels()
      await useStore.getState().seedIfEmpty()
    },
    onAccess: async () => {
      await refreshAccess()
      await engine?.pull()
    },
    onNotification: (n, unread) => receiveNotification(n as AppNotification, unread),
    onReconnect: () => void refreshNotifications(),
  })
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
      useAuth.setState({
        status: 'signedOut',
        userId: null,
        email: null,
        alias: '',
        isAdmin: false,
      })
      return
    }
    const me = await apiMe()
    if (me.kind === 'user')
      return handleUser({
        userId: me.user.id,
        email: me.user.email,
        alias: me.user.alias,
        isAdmin: me.user.isAdmin,
      })
    if (me.kind === 'offline') {
      // PWA: sin conexión se sigue con la identidad del último inicio de sesión.
      const cached = await loadIdentity()
      if (cached) return handleUser(cached)
    }
    useAuth.setState({ status: 'signedOut', userId: null, email: null, alias: '', isAdmin: false })
  })()
  return booted
}

async function finish(res: AuthResult): Promise<string | null> {
  if (!res.ok) return res.error
  localStorage.removeItem(PENDING_LOGOUT)
  await handleUser({
    userId: res.user.id,
    email: res.user.email,
    alias: res.user.alias,
    isAdmin: res.user.isAdmin,
  })
  return null
}

/** Devuelve el código de error del servidor (`invalid_credentials`, `offline`…) o null si entró. */
export const signIn = async (email: string, password: string) =>
  finish(await apiLogin(email, password))
export const signUp = async (email: string, password: string, alias?: string) =>
  finish(await apiSignup(email, password, alias))
export const authConfig = apiAuthConfig
export const changePassword = apiChangePassword

/** Cierra sesión: intenta enviar lo pendiente y borra los datos locales del dispositivo. */
export async function signOut(): Promise<void> {
  await engine?.flush()
  stopEngine()
  if (!(await apiLogout())) localStorage.setItem(PENDING_LOGOUT, '1')
  await wipeLocal()
  useAuth.setState({ status: 'signedOut', userId: null, email: null, alias: '', isAdmin: false })
}

export type { ApiUser }
