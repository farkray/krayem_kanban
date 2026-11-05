import { useState, type KeyboardEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LabelChip } from './LabelChip'
import { useAttachmentIndex, useLabelIndex } from '../store/hooks'
import { useAttachmentUrl } from '../store/useAttachmentUrl'
import { createdLabel, dateRangeLabel, dueState } from '../lib/format'
import type { Card as CardModel } from '../lib/types'
import { CalendarIcon, CheckSquareIcon, CommentIcon } from './Icons'
import styles from './Card.module.css'

export interface CardStats {
  done: number
  total: number
  comments: number
}

interface ViewProps {
  card: CardModel
  stats?: CardStats
  /** La tarjeta está en la última columna (terminada): no se marca como vencida. */
  finished: boolean
  overlay?: boolean
}

export function CardView({ card, stats, finished, overlay }: ViewProps) {
  const range = dateRangeLabel(card.startDate, card.endDate)
  const due = dueState(card.endDate, finished)
  const labelIndex = useLabelIndex()
  const labels = (card.labelIds ?? []).flatMap((id) => labelIndex.get(id) ?? [])
  const attachments = useAttachmentIndex()
  const cover = card.coverAttachmentId ? attachments.get(card.coverAttachmentId) : undefined
  const coverUrl = useAttachmentUrl(cover)
  const hasMeta = range || (stats && (stats.total > 0 || stats.comments > 0))

  return (
    <>
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
      <h4 className={styles.title}>{card.title}</h4>
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
          {stats && stats.comments > 0 && (
            <span className={styles.chip} aria-label={`${stats.comments} comentarios`}>
              <CommentIcon width={12} height={12} />
              {stats.comments}
            </span>
          )}
        </div>
      )}
      <time
        className={styles.date}
        dateTime={card.createdAt}
        title={new Date(card.createdAt).toLocaleString('es')}
      >
        {overlay ? '' : createdLabel(card.createdAt)}
      </time>
    </>
  )
}

interface Props extends ViewProps {
  onOpen: (id: string) => void
}

export function SortableCard({ card, stats, finished, onOpen }: Props) {
  // Tarjeta recién creada: entra con un pequeño movimiento (las ya existentes no se animan al cargar)
  const [fresh] = useState(() => Date.now() - Date.parse(card.createdAt) < 1500)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId: card.columnId },
  })

  const onKeyDown = (e: KeyboardEvent) => {
    listeners?.onKeyDown?.(e as never)
    if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(card.id)
  }

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.card} ${isDragging ? styles.dragging : ''} ${fresh ? styles.fresh : ''}`}
      {...attributes}
      aria-roledescription="tarjeta que se puede mover"
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(card.id)}
    >
      <CardView card={card} stats={stats} finished={finished} />
    </article>
  )
}

export function CardOverlay({ card, stats, finished }: ViewProps) {
  return (
    <article className={`${styles.card} ${styles.lifted}`}>
      <CardView card={card} stats={stats} finished={finished} overlay />
    </article>
  )
}
