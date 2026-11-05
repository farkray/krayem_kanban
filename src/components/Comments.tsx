import { useState, type KeyboardEvent } from 'react'
import { relativeTime } from '../lib/format'
import { LIMITS, type Comment } from '../lib/types'
import { useComments } from '../store/hooks'
import { useStore } from '../store/store'
import { FormatEditor } from './FormatEditor'
import { Markdown } from './Markdown'
import styles from './Comments.module.css'

interface EditorProps {
  initial?: string
  submitLabel: string
  label?: string
  placeholder?: string
  rows?: number
  onSubmit: (text: string) => boolean
  onCancel?: () => void
}

function CommentEditor({
  initial = '',
  submitLabel,
  label = 'Comentario',
  placeholder = 'Escribe un comentario… (admite Markdown)',
  rows = 3,
  onSubmit,
  onCancel,
}: EditorProps) {
  const [text, setText] = useState(initial)
  const empty = text.trim().length === 0

  const submit = () => {
    if (empty) return
    if (onSubmit(text)) setText('')
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <FormatEditor
      value={text}
      onChange={setText}
      label={label}
      placeholder={placeholder}
      rows={rows}
      maxLength={LIMITS.comment}
      onKeyDown={onKeyDown}
      footer={
        <>
          {onCancel && (
            <button type="button" className={styles.secondary} onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button type="button" className={styles.primary} disabled={empty} onClick={submit}>
            {submitLabel}
          </button>
        </>
      }
    />
  )
}

function Item({ comment }: { comment: Comment }) {
  const editComment = useStore((s) => s.editComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const [editing, setEditing] = useState(false)

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <strong>Tú</strong>
        <time
          dateTime={comment.createdAt}
          title={new Date(comment.createdAt).toLocaleString('es')}
          className={styles.muted}
        >
          {relativeTime(comment.createdAt)}
        </time>
        {comment.editedAt && <span className={styles.muted}>(editado)</span>}
        {!editing && (
          <span className={styles.itemActions}>
            <button type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button type="button" onClick={() => deleteComment(comment.id)}>
              Eliminar
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <CommentEditor
          initial={comment.bodyMd}
          submitLabel="Guardar"
          label="Editar comentario"
          onSubmit={(t) => {
            const ok = editComment(comment.id, t)
            if (ok) setEditing(false)
            return ok
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Markdown source={comment.bodyMd} />
      )}
    </li>
  )
}

interface CommentsProps {
  cardId: string
  /** "comments": lista y cuadro al final. "updates": cuadro arriba y lo más nuevo primero. */
  variant?: 'comments' | 'updates'
}

export function Comments({ cardId, variant = 'comments' }: CommentsProps) {
  const comments = useComments(cardId)
  const addComment = useStore((s) => s.addComment)
  const updates = variant === 'updates'
  const shown = updates ? [...comments].reverse() : comments

  const feed =
    shown.length > 0 ? (
      <ul className={styles.feed} aria-label={updates ? 'Actualizaciones' : 'Comentarios'}>
        {shown.map((c) => (
          <Item key={c.id} comment={c} />
        ))}
      </ul>
    ) : updates ? (
      <p className={styles.empty}>Aún no hay actualizaciones. Escribe la primera arriba.</p>
    ) : null

  const editor = updates ? (
    <CommentEditor
      label="Nueva actualización"
      placeholder="Escribe una actualización…"
      rows={5}
      submitLabel="Actualizar"
      onSubmit={(t) => addComment(cardId, t) !== null}
    />
  ) : (
    <CommentEditor submitLabel="Comentar" onSubmit={(t) => addComment(cardId, t) !== null} />
  )

  return updates ? (
    <div className={styles.updates}>
      {editor}
      {feed}
    </div>
  ) : (
    <div>
      {feed}
      {editor}
    </div>
  )
}
