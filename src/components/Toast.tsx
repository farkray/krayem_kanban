import { useEffect } from 'react'
import { useStore } from '../store/store'
import styles from './Toast.module.css'

const DURATION_MS = 10_000

export function Toast() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismiss, DURATION_MS)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  if (!toast) return null
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className={styles.undo}
          onClick={() => {
            toast.undo?.()
            dismiss()
          }}
        >
          Deshacer
        </button>
      )}
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Cerrar aviso">
        ×
      </button>
    </div>
  )
}
