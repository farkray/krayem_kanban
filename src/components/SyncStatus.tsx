import { syncLabel, useSync } from '../sync/status'
import styles from './SyncStatus.module.css'

export function SyncStatus() {
  const state = useSync()
  const label = syncLabel(state)
  if (!label) return null
  const tone = !state.online ? styles.offline : state.error ? styles.error : styles.ok
  return (
    <span className={`${styles.status} ${tone}`} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </span>
  )
}
