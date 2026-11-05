import { useState, type KeyboardEvent } from 'react'
import { relativeTime } from '../lib/format'
import { LIMITS, type Comment } from '../lib/types'
import { useComments } from '../store/hooks'
import { useStore } from '../store/store'
import { Markdown } from './Markdown'
import styles from './Comments.module.css'

interface EditorProps {
  initial?: string
  submitLabel: string
  label?: string
  onSubmit: (text: string) => boolean
  onCancel?: () => void
}

function CommentEditor({
  initial = '',
  submitLabel,
  label = 'Comentario',
  onSubmit,
  onCancel,
}: EditorProps) {
  const [text, setText] = useState(initial)
  const [preview, setPreview] = useState(false)
  const empty = text.trim().length === 0

  const submit = () => {
    if (empty) return
    if (onSubmit(text)) {
      setText('')
      setPreview(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!preview}
          className={!preview ? styles.tabOn : styles.tab}
          onClick={() => setPreview(false)}
        >
          Escribir
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={preview}
          className={preview ? styles.tabOn : styles.tab}
          onClick={() => setPreview(true)}
        >
          Vista previa
        </button>
      </div>
      {preview ? (
        <div className={styles.preview}>
          {empty ? (
            <em className={styles.muted}>Nada que previsualizar</em>
          ) : (
            <Markdown source={text} />
          )}
        </div>
      ) : (
        <textarea
          className={styles.textarea}
          value={text}
          maxLength={LIMITS.comment}
          rows={3}
          placeholder="Escribe un comentario… (admite Markdown)"
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="button" className={styles.primary} disabled={empty} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
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

export function Comments({ cardId }: { cardId: string }) {
  const comments = useComments(cardId)
  const addComment = useStore((s) => s.addComment)

  return (
    <div>
      {comments.length > 0 && (
        <ul className={styles.feed} aria-label="Comentarios">
          {comments.map((c) => (
            <Item key={c.id} comment={c} />
          ))}
        </ul>
      )}
      <CommentEditor submitLabel="Comentar" onSubmit={(t) => addComment(cardId, t) !== null} />
    </div>
  )
}
