import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useCanEdit } from '../lib/CanEdit'
import { relativeTime } from '../lib/format'
import { displayName } from '../lib/people'
import type { Comment } from '../lib/types'
import { useLikes, useUpdateThreads, type LikeInfo } from '../store/hooks'
import { useStore } from '../store/store'
import { useBoardAccess, useParticipants } from '../sync/access'
import { useAuth } from '../sync/auth'
import { Avatar } from './Avatar'
import { MoreIcon, ReplyIcon, ThumbsUpIcon } from './Icons'
import { Markdown } from './Markdown'
import { RichEditor } from './RichEditor'
import styles from './Comments.module.css'

/** Alto a partir del cual una actualización se recorta con "Ver más". */
const CLAMP_PX = 224

interface Author {
  name: string
  email: string
  alias?: string
}

/** Quién escribió cada actualización: se busca entre los participantes del tablero. */
function useAuthors(cardId: string) {
  const boardId = useStore((s) => s.cards.find((c) => c.id === cardId)?.boardId)
  const people = useParticipants(boardId)
  const access = useBoardAccess(boardId)
  const me = useAuth((s) => s.userId)
  const myEmail = useAuth((s) => s.email)
  const myAlias = useAuth((s) => s.alias)

  const mine: Author | null = myEmail
    ? { name: displayName({ email: myEmail, alias: myAlias }), email: myEmail, alias: myAlias }
    : null
  return (authorId?: string): Author => {
    if (authorId) {
      if (authorId === me && mine) return mine
      const p = people.find((x) => x.userId === authorId)
      if (p) return { name: displayName(p), email: p.email, alias: p.alias }
    }
    // Sin autor conocido (las antiguas, o el modo solo-local): la persona dueña del tablero.
    if (access.ownerEmail) {
      return {
        name: access.ownerName ?? access.ownerEmail,
        email: access.ownerEmail,
      }
    }
    return mine ?? { name: 'Tú', email: 'tu@local' }
  }
}

/** Recorta lo muy largo y ofrece "Ver más" / "Ver menos". */
function Clamp({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const measure = () => setOverflowing(el.scrollHeight > CLAMP_PX + 8)
    measure()
    // Las imágenes y el formato cambian el alto después: se vuelve a medir.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  const clipped = overflowing && !open
  return (
    <div className={styles.clampWrap}>
      <div
        ref={inner}
        className={clipped ? `${styles.clamp} ${styles.clipped}` : styles.clamp}
        style={clipped ? { maxHeight: CLAMP_PX } : undefined}
      >
        {children}
      </div>
      {overflowing && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Ver menos' : '… Ver más'}
        </button>
      )}
    </div>
  )
}

/** Menú "⋯" de una actualización: Editar y Eliminar. */
function ItemMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className={styles.menuBtn}
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon width={16} height={16} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.danger}`}
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  )
}

interface PostProps {
  comment: Comment
  author: Author
  likes: LikeInfo | undefined
  canManage: boolean
  canReply: boolean
  /** Es una respuesta (más compacta, sin "Responder" propio). */
  reply?: boolean
  onReply?: () => void
}

/** Una actualización o una respuesta: autor, texto con "Ver más", "Me gusta" y acciones. */
function Post({ comment, author, likes, canManage, canReply, reply = false, onReply }: PostProps) {
  const editComment = useStore((s) => s.editComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const toggleLike = useStore((s) => s.toggleLike)
  const names = useParticipants(
    useStore((s) => s.cards.find((c) => c.id === comment.cardId)?.boardId),
  )
  const [editing, setEditing] = useState(false)
  const count = likes?.count ?? 0
  const mine = likes?.mine ?? false
  const who = (likes?.by ?? [])
    .map((id) => {
      const p = names.find((x) => x.userId === id)
      return p ? displayName(p) : null
    })
    .filter(Boolean)
    .join(', ')

  return (
    <div className={reply ? `${styles.post} ${styles.replyPost}` : styles.post}>
      <div className={styles.head}>
        <Avatar email={author.email} alias={author.alias} size="sm" decorative />
        <div className={styles.who}>
          <strong className={styles.name}>{author.name}</strong>
          <time
            dateTime={comment.createdAt}
            title={new Date(comment.createdAt).toLocaleString('es')}
            className={styles.time}
          >
            {relativeTime(comment.createdAt)}
          </time>
          {comment.editedAt && <span className={styles.time}>(editada)</span>}
        </div>
        {canManage && !editing && (
          <ItemMenu onEdit={() => setEditing(true)} onDelete={() => deleteComment(comment.id)} />
        )}
      </div>

      <div className={styles.body}>
        {editing ? (
          <RichEditor
            cardId={comment.cardId}
            initial={comment.bodyMd}
            submitLabel="Guardar"
            label="Editar comentario"
            autoFocus
            onSubmit={(t) => {
              const ok = editComment(comment.id, t)
              if (ok) setEditing(false)
              return ok
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Clamp>
            <Markdown source={comment.bodyMd} />
          </Clamp>
        )}
      </div>

      {!editing && (
        <div className={styles.bar}>
          <button
            type="button"
            className={mine ? `${styles.barBtn} ${styles.liked}` : styles.barBtn}
            aria-pressed={mine}
            aria-label={count > 0 ? `Me gusta, ${count}` : 'Me gusta'}
            title={who || undefined}
            onClick={() => toggleLike(comment.id)}
          >
            <ThumbsUpIcon width={16} height={16} />
            <span>Me gusta</span>
            {count > 0 && (
              <span className={styles.count} aria-hidden="true">
                {count}
              </span>
            )}
          </button>
          {canReply && !reply && (
            <button type="button" className={styles.barBtn} onClick={onReply}>
              <ReplyIcon width={16} height={16} />
              <span>Responder</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Cuadro cerrado "Escribe…": al pulsarlo se abre el editor completo. */
function Composer({
  cardId,
  label,
  placeholder,
  submitLabel,
  avatar,
  open,
  onOpen,
  onClose,
  onSubmit,
}: {
  cardId: string
  label: string
  placeholder: string
  submitLabel: string
  avatar?: Author
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSubmit: (md: string) => boolean
}) {
  if (open) {
    return (
      <div className={styles.composerOpen}>
        <RichEditor
          cardId={cardId}
          label={label}
          placeholder={placeholder}
          submitLabel={submitLabel}
          autoFocus
          onSubmit={(t) => {
            const ok = onSubmit(t)
            if (ok) onClose()
            return ok
          }}
          onCancel={onClose}
        />
      </div>
    )
  }
  return (
    <div className={styles.stubRow}>
      {avatar && <Avatar email={avatar.email} alias={avatar.alias} size="sm" decorative />}
      <button type="button" className={styles.stub} aria-label={label} onClick={onOpen}>
        {placeholder}
      </button>
    </div>
  )
}

interface CommentsProps {
  cardId: string
  /** "composer": solo el cuadro (Detalles). "updates": cuadro arriba y feed, lo más nuevo primero. */
  variant?: 'composer' | 'updates'
}

export function Comments({ cardId, variant = 'updates' }: CommentsProps) {
  const threads = useUpdateThreads(cardId)
  const likes = useLikes(cardId)
  const addComment = useStore((s) => s.addComment)
  const addReply = useStore((s) => s.addReply)
  const canEdit = useCanEdit()
  const access = useBoardAccess(useStore((s) => s.cards.find((c) => c.id === cardId)?.boardId))
  const me = useAuth((s) => s.userId)
  const authorOf = useAuthors(cardId)
  const [sent, setSent] = useState(false)
  const [composing, setComposing] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  // Editar o borrar: lo propio; quien es dueño del tablero también puede borrar lo de los demás.
  const canManage = (c: Comment) => canEdit && (!c.authorId || c.authorId === me || access.isOwner)

  if (variant === 'composer') {
    return (
      <div className={styles.updates}>
        {canEdit && (
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
        )}
        <p className={styles.sent} role="status">
          {sent ? 'Enviada a la pestaña Actualizaciones.' : ''}
        </p>
      </div>
    )
  }

  const you = authorOf(me ?? undefined)
  return (
    <div className={styles.updates}>
      {canEdit && (
        <Composer
          cardId={cardId}
          label="Nueva actualización"
          placeholder="Escribe una actualización y menciona a otros con @"
          submitLabel="Actualizar"
          open={composing}
          onOpen={() => setComposing(true)}
          onClose={() => setComposing(false)}
          onSubmit={(t) => addComment(cardId, t) !== null}
        />
      )}
      {threads.length > 0 ? (
        <ul className={styles.feed} aria-label="Actualizaciones">
          {threads.map(({ update, replies }) => (
            <li key={update.id} className={styles.card}>
              <Post
                comment={update}
                author={authorOf(update.authorId)}
                likes={likes.get(update.id)}
                canManage={canManage(update)}
                canReply={canEdit}
                onReply={() => setReplyingTo(update.id)}
              />
              {(replies.length > 0 || canEdit) && (
                <div className={styles.thread}>
                  {replies.length > 0 && (
                    <ul className={styles.replies} aria-label="Respuestas">
                      {replies.map((r) => (
                        <li key={r.id}>
                          <Post
                            comment={r}
                            author={authorOf(r.authorId)}
                            likes={likes.get(r.id)}
                            canManage={canManage(r)}
                            canReply={false}
                            reply
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && (
                    <Composer
                      cardId={cardId}
                      label={`Responder a ${authorOf(update.authorId).name}`}
                      placeholder="Escribe una respuesta y menciona a otros con @"
                      submitLabel="Responder"
                      avatar={you}
                      open={replyingTo === update.id}
                      onOpen={() => setReplyingTo(update.id)}
                      onClose={() => setReplyingTo(null)}
                      onSubmit={(t) => addReply(update.id, t) !== null}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Aún no hay actualizaciones. Escribe la primera arriba.</p>
      )}
    </div>
  )
}
