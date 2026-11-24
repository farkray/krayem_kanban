import { syncAndUpdate, useSyncAction } from '../sync/syncAndUpdate'
import { syncLabel, useSync } from '../sync/status'
import { RefreshIcon } from './Icons'
import styles from './SyncStatus.module.css'

/** Estado de sincronización y botón «Sincronizar»: envía y descarga ahora, y busca una versión nueva de la app. */
export function SyncStatus() {
  const state = useSync()
  const busy = useSyncAction((s) => s.busy)
  const label = syncLabel(state)
  if (!label) return null
  const tone = !state.online ? styles.offline : state.error ? styles.error : styles.ok
  return (
    <>
      <span className={`${styles.status} ${tone}`} role="status" aria-live="polite">
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
      </span>
      <button
        type="button"
        className={`${styles.sync} ${busy ? styles.busy : ''}`}
        aria-label="Sincronizar ahora"
        title="Sincronizar ahora y buscar actualizaciones"
        aria-busy={busy}
        disabled={busy}
        onClick={() => void syncAndUpdate()}
      >
        <RefreshIcon width={18} height={18} />
      </button>
    </>
  )
}
