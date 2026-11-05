import { useState, type FormEvent } from 'react'
import { changePassword } from '../sync/boot'
import { Modal } from './Modal'
import styles from './ChangePasswordDialog.module.css'

const MIN = 10

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'La contraseña actual no es correcta.',
  weak_password: `La nueva contraseña debe tener al menos ${MIN} caracteres.`,
  same_password: 'La nueva contraseña debe ser distinta de la actual.',
  too_many_attempts: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  offline: 'No hay conexión con el servidor.',
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next.length < MIN) return setError(MESSAGES.weak_password)
    if (next !== confirm) return setError('La confirmación no coincide con la nueva contraseña.')
    setBusy(true)
    const code = await changePassword(current, next)
    setBusy(false)
    if (code) setError(MESSAGES[code] ?? 'No se pudo cambiar la contraseña. Inténtalo de nuevo.')
    else setDone(true)
  }

  return (
    <Modal label="Cambiar contraseña" onClose={onClose}>
      {done ? (
        <>
          <h2 className={styles.title}>Contraseña actualizada</h2>
          <p className={styles.text} role="status">
            Listo. Las sesiones abiertas en otros dispositivos se cerraron; esta sigue activa.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <h2 className={styles.title}>Cambiar contraseña</h2>
          <label className={styles.label}>
            Contraseña actual
            <input
              type="password"
              className={styles.input}
              value={current}
              autoComplete="current-password"
              autoFocus
              required
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <div className={styles.label}>
            <label htmlFor="pw-next">Nueva contraseña</label>
            <input
              id="pw-next"
              type="password"
              className={styles.input}
              value={next}
              autoComplete="new-password"
              minLength={MIN}
              aria-describedby="pw-hint"
              required
              onChange={(e) => setNext(e.target.value)}
            />
            <span id="pw-hint" className={styles.hint}>
              Al menos {MIN} caracteres.
            </span>
          </div>
          <label className={styles.label}>
            Repite la nueva contraseña
            <input
              type="password"
              className={styles.input}
              value={confirm}
              autoComplete="new-password"
              required
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || !current || !next || !confirm}
            >
              {busy ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
