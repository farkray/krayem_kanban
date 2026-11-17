import { useEffect, useRef, useState } from 'react'
import { relativeTime } from '../lib/format'
import { LIMITS, noteIdOf } from '../lib/types'
import { useStore } from '../store/store'
import { CloseIcon } from './Icons'
import { Markdown } from './Markdown'
import styles from './NotesPanel.module.css'

interface Props {
  /** Tablero dueño de las notas (en un subtablero, el tablero de origen). */
  boardId: string
  canEdit: boolean
  onClose: () => void
}

/** Panel lateral con las notas generales del tablero: enlaces (Drive), acuerdos, lo que sirva a todos. */
export function NotesPanel({ boardId, canEdit, onClose }: Props) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteIdOf(boardId) && !n.deletedAt))
  const saveNote = useStore((s) => s.saveNote)
  const body = note?.bodyMd ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) area.current?.focus()
  }, [editing])

  const startEdit = () => {
    setDraft(body)
    setEditing(true)
  }
  const save = () => {
    if (saveNote(boardId, draft)) setEditing(false)
  }

  return (
    <aside id="board-notes" className={styles.panel} aria-label="Notas del tablero">
      <header className={styles.head}>
        <h2 className={styles.title}>Notas del tablero</h2>
        <button type="button" className={styles.close} aria-label="Cerrar notas" onClick={onClose}>
          <CloseIcon width={16} height={16} />
        </button>
      </header>

      {editing ? (
        <div className={styles.editor}>
          <textarea
            ref={area}
            className={styles.textarea}
            value={draft}
            maxLength={LIMITS.note}
            aria-label="Notas del tablero (Markdown)"
            placeholder="Pega aquí enlaces (Google Drive…), acuerdos o lo que el equipo necesite tener a la mano."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                save()
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(false)
              }
            }}
          />
          <p className={styles.hint}>
            Admite Markdown: <code>[texto](enlace)</code>, listas y <code>**negritas**</code>. Los
            enlaces sueltos se vuelven clicables.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button type="button" className={styles.primary} onClick={save}>
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          {body.trim() ? (
            <Markdown source={body} />
          ) : (
            <p className={styles.empty}>
              {canEdit
                ? 'Aún no hay notas. Guarda aquí enlaces (por ejemplo, la carpeta de Google Drive), acuerdos o lo que el equipo necesite.'
                : 'Aún no hay notas en este tablero.'}
            </p>
          )}
          {canEdit && (
            <button type="button" className={styles.secondary} onClick={startEdit}>
              {body.trim() ? 'Editar notas' : 'Escribir notas'}
            </button>
          )}
          {note && body.trim() && (
            <p className={styles.meta}>Editado {relativeTime(note.updatedAt)}</p>
          )}
        </div>
      )}
    </aside>
  )
}
