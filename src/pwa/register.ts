import { registerSW } from 'virtual:pwa-register'
import { listenInstall, setUpdater, usePwa } from './store'

const HOUR_MS = 60 * 60 * 1000

/** Registra el service worker y los avisos de instalación/actualización. Solo en producción. */
export function registerPwa(): void {
  listenInstall()
  const update = registerSW({
    onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
    onOfflineReady: () => usePwa.setState({ offlineReady: true }),
    onRegisteredSW: (_url, registration) => {
      // Busca versiones nuevas cada hora mientras la app está abierta.
      if (registration) setInterval(() => void registration.update(), HOUR_MS)
    },
  })
  setUpdater(update)
}
