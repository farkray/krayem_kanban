import { create } from 'zustand'

/** Evento no estándar de Chrome/Edge para instalar la PWA. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null
  installed: boolean
  /** Hay una versión nueva descargada, esperando a que el usuario recargue. */
  needRefresh: boolean
  /** Primera instalación del service worker completa: ya funciona sin conexión. */
  offlineReady: boolean
}

export const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true)

export const usePwa = create<PwaState>(() => ({
  installEvent: null,
  installed: isStandalone(),
  needRefresh: false,
  offlineReady: false,
}))

let updater: ((reloadPage?: boolean) => Promise<void>) | null = null
export const setUpdater = (fn: typeof updater) => {
  updater = fn
}

/** Escucha el evento de instalación del navegador. Devuelve la función para dejar de escuchar. */
export function listenInstall(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault() // se ofrece desde nuestro botón, no desde la mini-barra del navegador
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent })
  }
  const onInstalled = () => usePwa.setState({ installed: true, installEvent: null })
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export async function promptInstall(): Promise<void> {
  const ev = usePwa.getState().installEvent
  if (!ev) return
  await ev.prompt()
  const { outcome } = await ev.userChoice
  // El evento solo se puede usar una vez.
  usePwa.setState({ installEvent: null, installed: outcome === 'accepted' })
}

/** Activa la versión nueva y recarga. Lo local y el outbox están en IndexedDB: no se pierde nada. */
export function applyUpdate(): void {
  void updater?.(true)
}

export const dismissUpdate = () => usePwa.setState({ needRefresh: false })
export const dismissOfflineReady = () => usePwa.setState({ offlineReady: false })
