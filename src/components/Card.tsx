import { useState, type KeyboardEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useParticipants } from '../sync/access'
import { Avatar } from './Avatar'
import { LabelChip } from './LabelChip'
import { useAttachmentIndex, useLabelIndex } from '../store/hooks'
import { useAttachmentUrl } from '../store/useAttachmentUrl'
import { useCanEdit } from '../lib/CanEdit'
import { useViewBoard } from '../lib/ViewBoard'
import { displayName } from '../lib/people'
import { createdLabel, dateRangeLabel, dueState } from '../lib/format'
import type { Card as CardModel } from '../lib/types'
import { useStore } from '../store/store'
import { CalendarIcon, CheckIcon, CheckSquareIcon, CommentIcon, GripIcon, TrashIcon } from './Icons'
import styles from './Card.module.css'

export interface CardStats {
  done: number
  total: number
  comments: number
  /** Alguien te mencionó (@) en las actualizaciones o en la lista de tareas. */
  mentioned?: boolean
}

interface ViewProps {
  card: CardModel
  stats?: CardStats
  /** La tarjeta está en la última columna (terminada): no se marca como vencida. */
  finished: boolean
  /** La tarjeta está en una columna tipo Done: se muestra apagada, con una marca de finalizada. */
  done?: boolean
  overlay?: boolean
}

export function CardView({ card, stats, finished, done, overlay }: ViewProps) {
  const range = dateRangeLabel(card.startDate, card.endDate)
  const due = dueState(card.endDate, finished)
  const labelIndex = useLabelIndex()
  const view = useViewBoard()
  // Las subetiquetas solo se ven dentro de su subtablero.
  const labels = (card.labelIds ?? [])
    .flatMap((id) => labelIndex.get(id) ?? [])
    .filter((l) =>
      view?.linkLabelId
        ? l.id === view.linkLabelId || l.boardId === view.boardId // subtablero: su etiqueta y subetiquetas
        : !l.boardId || l.boardId === card.boardId,
    )
  const attachments = useAttachmentIndex()
  const cover = card.coverAttachmentId ? attachments.get(card.coverAttachmentId) : undefined
  const coverUrl = useAttachmentUrl(cover)
  const canEdit = useCanEdit()
  const people = useParticipants(card.boardId)
  const assignee = card.assigneeId ? people.find((p) => p.userId === card.assigneeId) : undefined
  const hasMeta = range || (stats && (stats.total > 0 || stats.comments > 0 || stats.mentioned))

  return (
    <>
      {!overlay && canEdit && (
        <span className={styles.grip} aria-hidden="true" title="Arrastra para mover">
          <GripIcon width={16} height={16} />
        </span>
      )}
      {cover && (
        <div
          className={styles.cover}
          style={{ aspectRatio: `${cover.width || 16} / ${cover.height || 9}` }}
        >
          {coverUrl && <img src={coverUrl} alt="" className={styles.coverImg} />}
        </div>
      )}
      {labels.length > 0 && (
        <div className={styles.labels} aria-label="Etiquetas">
          {labels.slice(0, 3).map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
          {labels.length > 3 && <span className={styles.more}>+{labels.length - 3}</span>}
        </div>
      )}
      <h4 className={styles.title}>
        {done && (
          <CheckIcon
            className={styles.doneMark}
            width={14}
            height={14}
            aria-hidden={false}
            aria-label="Finalizada"
            role="img"
          />
        )}
        {card.title}
      </h4>
      {hasMeta && (
        <div className={styles.meta}>
          {range && (
            <span
              className={`${styles.chip} ${due === 'overdue' ? styles.overdue : due === 'soon' ? styles.soon : ''}`}
              title={due === 'overdue' ? 'Vencida' : due === 'soon' ? 'Vence pronto' : undefined}
            >
              <CalendarIcon width={12} height={12} />
              {range}
            </span>
          )}
          {stats && stats.total > 0 && (
            <span
              className={`${styles.chip} ${stats.done === stats.total ? styles.complete : ''}`}
              aria-label={`Lista de tareas: ${stats.done} de ${stats.total}`}
            >
              <CheckSquareIcon width={12} height={12} />
              {stats.done}/{stats.total}
            </span>
          )}
          {stats?.mentioned && (
            <span className={`${styles.chip} ${styles.mention}`} title="Te mencionan">
              <span aria-hidden="true">@</span>
              <span className={styles.sr}>Te mencionan</span>
            </span>
          )}
          {stats && stats.comments > 0 && (
            <span className={styles.chip} aria-label={`${stats.comments} comentarios`}>
              <CommentIcon width={12} height={12} />
              {stats.comments}
            </span>
          )}
        </div>
      )}
      <div className={styles.foot}>
        {assignee && (
          <Avatar
            size="sm"
            email={assignee.email}
            alias={assignee.alias}
            label={`Asignada a ${displayName(assignee)}`}
          />
        )}
        <time
          className={styles.date}
          dateTime={card.createdAt}
          title={new Date(card.createdAt).toLocaleString('es')}
        >
          {overlay ? '' : createdLabel(card.createdAt)}
        </time>
      </div>
    </>
  )
}

interface Props extends ViewProps {
  onOpen: (id: string) => void
}

export function SortableCard({ card, stats, finished, done, onOpen }: Props) {
  const deleteCard = useStore((s) => s.deleteCard)
  const canEdit = useCanEdit()
  // Tarjeta recién creada: entra con un pequeño movimiento (las ya existentes no se animan al cargar)
  const [fresh] = useState(() => Date.now() - Date.parse(card.createdAt) < 1500)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId: card.columnId },
    disabled: !canEdit,
  })

  const onKeyDown = (e: KeyboardEvent) => {
    listeners?.onKeyDown?.(e as never)
    if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(card.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.item} ${isDragging ? styles.dragging : ''}`}
    >
      <article
        className={`${styles.card} ${fresh ? styles.fresh : ''} ${done ? styles.cardDone : ''}`}
        {...attributes}
        aria-roledescription="tarjeta que se puede mover"
        {...listeners}
        onKeyDown={onKeyDown}
        onClick={() => onOpen(card.id)}
      >
        <CardView card={card} stats={stats} finished={finished} done={done} />
      </article>
      {/* Hermano de la tarjeta (no hijo): un botón dentro de otro control no es accesible */}
      {canEdit && (
        <button
          type="button"
          className={`${styles.trash} ${finished ? styles.trashDone : ''}`}
          aria-label={`Eliminar tarjeta ${card.title}`}
          title="Eliminar (puedes deshacer)"
          onClick={() => deleteCard(card.id)}
        >
          <TrashIcon width={15} height={15} />
        </button>
      )}
    </div>
  )
}

export function CardOverlay({ card, stats, finished, done }: ViewProps) {
  return (
    <article className={`${styles.card} ${styles.lifted}`}>
      <CardView card={card} stats={stats} finished={finished} done={done} overlay />
    </article>
  )
}
