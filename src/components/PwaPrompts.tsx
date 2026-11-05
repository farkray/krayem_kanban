import { useEffect } from 'react'
import {
  applyUpdate,
  dismissOfflineReady,
  dismissUpdate,
  promptInstall,
  usePwa,
} from '../pwa/store'
import styles from './PwaPrompts.module.css'

/** Botón "Instalar app": solo si el navegador la ofrece y aún no está instalada. */
export function InstallButton() {
  const canInstall = usePwa((s) => s.installEvent !== null && !s.installed)
  if (!canInstall) return null
  return (
    <button type="button" className={styles.install} onClick={() => void promptInstall()}>
      Instalar app
    </button>
  )
}

/** Avisos de "nueva versión" y "ya funciona sin conexión". */
export function PwaPrompts() {
  const needRefresh = usePwa((s) => s.needRefresh)
  const offlineReady = usePwa((s) => s.offlineReady)

  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(dismissOfflineReady, 6000)
    return () => clearTimeout(t)
  }, [offlineReady])

  if (needRefresh) {
    return (
      <div className={styles.banner} role="alert">
        <span>Hay una nueva versión disponible.</span>
        <button type="button" className={styles.primary} onClick={applyUpdate}>
          Recargar
        </button>
        <button type="button" className={styles.secondary} onClick={dismissUpdate}>
          Ahora no
        </button>
      </div>
    )
  }
  if (offlineReady) {
    return (
      <div className={styles.banner} role="status">
        <span>La app ya funciona sin conexión.</span>
        <button type="button" className={styles.secondary} onClick={dismissOfflineReady}>
          Entendido
        </button>
      </div>
    )
  }
  return null
}
