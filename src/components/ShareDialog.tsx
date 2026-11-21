import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { displayName } from '../lib/people'
import { fetchDirectory, type DirectoryUser } from '../sync/directory'
import {
  boardWorkspaceImpact,
  moveBoardToWorkspace,
  removeMember,
  shareBoard,
  useAccess,
  useBoardAccess,
  type MovedOut,
  type ShareRole,
} from '../sync/access'
import { useStore } from '../store/store'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { Select } from './Select'
import styles from './ShareDialog.module.css'

const MESSAGES: Record<string, string> = {
  user_not_found: 'Ese correo no tiene cuenta. Pídele al administrador que la cree primero.',
  cannot_share_with_self: 'Ese correo es el tuyo: ya eres el dueño.',
  bad_request: 'Revisa el correo y el permiso.',
  forbidden: 'No perteneces a ese workspace.',
  offline: 'No hay conexión con el servidor.',
}
const message = (code: string) => MESSAGES[code] ?? 'No se pudo completar la acción.'

const ROLE_LABEL: Record<ShareRole, string> = { editor: 'Editor', viewer: 'Solo lectura' }
const ROLE_OPTIONS = [
  { value: 'editor', label: ROLE_LABEL.editor },
  { value: 'viewer', label: ROLE_LABEL.viewer },
]

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
  const [directory, setDirectory] = useState<DirectoryUser[] | null | undefined>(undefined)
  const [role, setRole] = useState<ShareRole>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workspaces = useAccess((s) => s.workspaces)
  const workspaceId = useStore((s) => s.boards.find((b) => b.id === boardId)?.workspaceId)
  const [pending, setPending] = useState<{ to: string; removed: MovedOut[] } | null>(null)

  const moveTo = async (to: string) => {
    setError(null)
    const err = await moveBoardToWorkspace(boardId, to)
    setPending(null)
    if (err) setError(message(err))
  }

  // Cambiar de workspace: si alguien con acceso no pertenece al destino, se pide confirmar antes
  const askMove = async (to: string) => {
    if (to === workspaceId) return
    setError(null)
    const impact = await boardWorkspaceImpact(boardId, to)
    if ('error' in impact) return setError(message(impact.error))
    if (impact.removed.length === 0) void moveTo(to)
    else setPending({ to, removed: impact.removed })
  }

  useEffect(() => {
    void fetchDirectory().then(setDirectory)
  }, [])

  // Solo se ofrece a quienes todavía no tienen acceso.
  const available = useMemo(() => {
    const taken = new Set(members.map((m) => m.userId))
    return (directory ?? []).filter((u) => !taken.has(u.id))
  }, [directory, members])

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

      {workspaces.length > 1 && workspaceId && (
        <div className={styles.workspace}>
          <Select
            label="Workspace del tablero"
            value={workspaceId}
            options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            onChange={(v) => void askMove(v)}
          />
          <p className={styles.hint}>
            Solo las personas de este workspace pueden recibir el tablero.
          </p>
        </div>
      )}

      {members.length === 0 ? (
        <p className={styles.private}>
          Este tablero es <strong>privado</strong>: solo tú lo ves. Invita a alguien para
          compartirlo.
        </p>
      ) : (
        <ul className={styles.list} aria-label="Personas con acceso">
          {members.map((m) => (
            <li key={m.userId} className={styles.row}>
              <span className={styles.who}>
                <span className={styles.email}>{displayName(m)}</span>
                {m.alias && <span className={styles.sub2}>{m.email}</span>}
              </span>
              <Select
                variant="pill"
                className={styles.select}
                label={`Permiso de ${displayName(m)}`}
                value={m.role}
                options={ROLE_OPTIONS}
                onChange={(v) => void change(m.email, v as ShareRole)}
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Quitar a ${displayName(m)}`}
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
          <Select
            className={styles.label}
            label="Persona"
            value={email}
            required
            disabled={available.length === 0}
            onChange={setEmail}
            options={[
              {
                value: '',
                label:
                  directory === undefined
                    ? 'Cargando usuarios…'
                    : available.length === 0
                      ? 'No hay más usuarios'
                      : 'Elige una persona…',
              },
              ...available.map((u) => ({
                value: u.email,
                label: u.alias ? `${u.alias} · ${u.email}` : u.email,
              })),
            ]}
          />
          <Select
            className={styles.label}
            label="Permiso"
            value={role}
            options={ROLE_OPTIONS}
            onChange={(v) => setRole(v as ShareRole)}
          />
        </div>
        <p className={styles.hint}>
          Solo aparecen usuarios registrados. Editor: puede cambiar tarjetas, columnas y etiquetas.
          Solo lectura: únicamente ve. Solo tú puedes compartir, renombrar o eliminar el tablero.
        </p>
        {directory === null && (
          <p className={styles.error} role="alert">
            No se pudo cargar la lista de usuarios.
          </p>
        )}
        {directory && available.length === 0 && (
          <p className={styles.hint}>
            Ya compartiste el tablero con todos los usuarios registrados. El administrador puede
            crear más cuentas.
          </p>
        )}
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
      {pending && (
        <ConfirmDialog
          title="Mover el tablero de workspace"
          confirmLabel="Mover y quitar acceso"
          onCancel={() => setPending(null)}
          onConfirm={() => void moveTo(pending.to)}
        >
          <p>
            {pending.removed.length === 1 ? 'Esta persona no pertenece' : 'Estas personas no pertenecen'} al
            workspace de destino y perder{pending.removed.length === 1 ? 'á' : 'án'} el acceso al tablero:
          </p>
          <ul>
            {pending.removed.map((m) => (
              <li key={m.userId}>{m.alias ? `${m.alias} · ${m.email}` : m.email}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </Modal>
  )
}
