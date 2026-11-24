import { registerSW } from 'virtual:pwa-register'
import { listenInstall, setUpdater, usePwa } from './store'

const HOUR_MS = 60 * 60 * 1000
const RECHECK_MS = 10 * 60 * 1000

let registration: ServiceWorkerRegistration | undefined
let lastCheck = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Busca una versión nueva de la app. true si hay una descargada y lista para activar. Una app instalada rara vez recarga
 * sola, por eso también se busca al volver a ella y desde el botón «Sincronizar».
 */
export async function checkForUpdate(timeoutMs = 8000): Promise<boolean> {
  const reg = registration
  if (!reg) return false
  lastCheck = Date.now()
  try {
    await reg.update()
  } catch {
    return false // sin red o servidor caído: se vuelve a intentar más tarde
  }
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (usePwa.getState().needRefresh || reg.waiting) return true
    if (!reg.installing) break // nada se está descargando: ya está al día
    await sleep(250)
  }
  return usePwa.getState().needRefresh || !!reg.waiting
}

/** Registra el service worker y los avisos de instalación/actualización. Solo en producción. */
export function registerPwa(): void {
  listenInstall()
  const update = registerSW({
    onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
    onOfflineReady: () => usePwa.setState({ offlineReady: true }),
    onRegisteredSW: (_url, reg) => {
      registration = reg
      // Busca versiones nuevas cada hora mientras la app está abierta.
      if (reg) setInterval(() => void reg.update(), HOUR_MS)
    },
  })
  setUpdater(update)
  // Al volver a la app (instalada o en una pestaña dormida) se busca de nuevo, como máximo cada 10 minutos.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > RECHECK_MS) void checkForUpdate(0)
  })
}
