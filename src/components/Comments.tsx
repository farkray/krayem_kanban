import { useState } from 'react'
import { relativeTime } from '../lib/format'
import type { Comment } from '../lib/types'
import { useComments } from '../store/hooks'
import { useStore } from '../store/store'
import { RichEditor } from './RichEditor'
import { Markdown } from './Markdown'
import styles from './Comments.module.css'

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
        <RichEditor
          cardId={comment.cardId}
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
  /** "composer": solo el cuadro (Detalles). "updates": cuadro arriba y feed, lo más nuevo primero. */
  variant?: 'composer' | 'updates'
}

export function Comments({ cardId, variant = 'updates' }: CommentsProps) {
  const comments = useComments(cardId)
  const addComment = useStore((s) => s.addComment)
  const updates = variant === 'updates'
  const [sent, setSent] = useState(false)

  const editor = (
    <RichEditor
      cardId={cardId}
      label="Nueva actualización"
      placeholder="Escribe una actualización…"
      submitLabel="Actualizar"
      onSubmit={(t) => {
        const ok = addComment(cardId, t) !== null
        if (ok) setSent(true)
        return ok
      }}
    />
  )

  if (!updates) {
    return (
      <div className={styles.updates}>
        {editor}
        <p className={styles.sent} role="status">
          {sent ? 'Enviada a la pestaña Actualizaciones.' : ''}
        </p>
      </div>
    )
  }

  const shown = [...comments].reverse()
  return (
    <div className={styles.updates}>
      {editor}
      {shown.length > 0 ? (
        <ul className={styles.feed} aria-label="Actualizaciones">
          {shown.map((c) => (
            <Item key={c.id} comment={c} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Aún no hay actualizaciones. Escribe la primera arriba.</p>
      )}
    </div>
  )
}
