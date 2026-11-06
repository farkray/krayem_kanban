import { useState, type FormEvent } from 'react'
import { removeMember, shareBoard, useBoardAccess, type ShareRole } from '../sync/access'
import { Modal } from './Modal'
import styles from './ShareDialog.module.css'

const MESSAGES: Record<string, string> = {
  user_not_found: 'Ese correo no tiene cuenta. Pídele al administrador que la cree primero.',
  cannot_share_with_self: 'Ese correo es el tuyo: ya eres el dueño.',
  bad_request: 'Revisa el correo y el permiso.',
  offline: 'No hay conexión con el servidor.',
}
const message = (code: string) => MESSAGES[code] ?? 'No se pudo completar la acción.'

const ROLE_LABEL: Record<ShareRole, string> = { editor: 'Editor', viewer: 'Solo lectura' }

/** El dueño comparte el tablero con otras personas (por correo) y decide qué pueden hacer. */
export function ShareDialog({
  boardId,
  title,
  onClose,
}: {
  boardId: string
  title: string
  onClose: () => void
}) {
  const { members } = useBoardAccess(boardId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ShareRole>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const err = await shareBoard(boardId, email, role)
    setBusy(false)
    if (err) setError(message(err))
    else setEmail('')
  }

  const change = async (userEmail: string, next: ShareRole) => {
    setError(null)
    const err = await shareBoard(boardId, userEmail, next)
    if (err) setError(message(err))
  }

  const remove = async (userId: string) => {
    setError(null)
    const err = await removeMember(boardId, userId)
    if (err) setError(message(err))
  }

  return (
    <Modal label={`Compartir ${title}`} onClose={onClose}>
      <h2 className={styles.title}>Compartir “{title}”</h2>

      {members.length === 0 ? (
        <p className={styles.private}>
          Este tablero es <strong>privado</strong>: solo tú lo ves. Invita a alguien para
          compartirlo.
        </p>
      ) : (
        <ul className={styles.list} aria-label="Personas con acceso">
          {members.map((m) => (
            <li key={m.userId} className={styles.row}>
              <span className={styles.email}>{m.email}</span>
              <select
                className={styles.select}
                value={m.role}
                aria-label={`Permiso de ${m.email}`}
                onChange={(e) => void change(m.email, e.target.value as ShareRole)}
              >
                <option value="editor">{ROLE_LABEL.editor}</option>
                <option value="viewer">{ROLE_LABEL.viewer}</option>
              </select>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Quitar a ${m.email}`}
                onClick={() => void remove(m.userId)}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.form} onSubmit={add}>
        <h3 className={styles.sub}>Invitar</h3>
        <div className={styles.inline}>
          <label className={styles.label}>
            Correo de la persona
            <input
              type="email"
              className={styles.input}
              value={email}
              required
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className={styles.label}>
            Permiso
            <select
              className={styles.select}
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole)}
            >
              <option value="editor">{ROLE_LABEL.editor}</option>
              <option value="viewer">{ROLE_LABEL.viewer}</option>
            </select>
          </label>
        </div>
        <p className={styles.hint}>
          Editor: puede cambiar tarjetas, columnas y etiquetas. Solo lectura: únicamente ve. Solo tú
          puedes compartir, renombrar o eliminar el tablero.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cerrar
          </button>
          <button type="submit" className={styles.primary} disabled={busy || email.trim() === ''}>
            Compartir
          </button>
        </div>
      </form>
    </Modal>
  )
}
